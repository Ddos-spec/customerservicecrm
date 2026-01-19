/**
 * Customer Service CRM - Backend Server
 *
 * This is the main entry point for the Node.js backend.
 * WhatsApp operations are delegated to the Go WhatsApp Gateway.
 */

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

const pino = require('pino');
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const { createClient } = require('redis');
const { initializeApi, getWebhookUrl } = require('./api_v1');
const { router: authRouter, ensureSuperAdmin, syncContactsForTenant } = require('./auth');
const db = require('./db');
const { initializeN8nApi } = require('./n8n-api');
require('dotenv').config();
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

// Go WhatsApp Gateway Client
const waGateway = require('./wa-gateway-client');
const { createCompatSocket, enhanceSession } = require('./wa-socket-compat');
const { getGatewayHealthSummary } = require('./utils/gateway-health');
const { sendAlertWebhook, initAlertSystem } = require('./utils/alert-webhook');
const marketingProcessor = require('./services/marketing/processor');

const SESSION_STATUS_TTL_SEC = parseInt(process.env.SESSION_STATUS_TTL_SEC || `${7 * 24 * 60 * 60}`, 10);
const CONTACT_SYNC_INTERVAL_MINUTES = parseInt(process.env.CONTACT_SYNC_INTERVAL_MINUTES || '360', 10);
const CONTACT_SYNC_BACKOFF_BASE_MINUTES = parseInt(process.env.CONTACT_SYNC_BACKOFF_BASE_MINUTES || '5', 10);
const CONTACT_SYNC_BACKOFF_MAX_MINUTES = parseInt(process.env.CONTACT_SYNC_BACKOFF_MAX_MINUTES || '120', 10);
const MESSAGE_SEND_RETRIES = parseInt(process.env.MESSAGE_SEND_RETRIES || '2', 10);
const MESSAGE_SEND_RETRY_DELAY_MS = parseInt(process.env.MESSAGE_SEND_RETRY_DELAY_MS || '2000', 10);
const MESSAGE_SEND_RETRY_BACKOFF = parseFloat(process.env.MESSAGE_SEND_RETRY_BACKOFF || '2');
const MESSAGE_SEND_QUEUE_DELAY_MS = parseInt(process.env.MESSAGE_SEND_QUEUE_DELAY_MS || '2000', 10);
const HEALTH_CHECK_TOKEN = process.env.HEALTH_CHECK_TOKEN || '';

const app = express();
// Detect production if NODE_ENV is set OR if FRONTEND_URL is https (common in deployments)
// On Easypanel, NODE_ENV is usually 'production'.
const isProd = process.env.NODE_ENV === 'production' || (process.env.FRONTEND_URL && process.env.FRONTEND_URL.startsWith('https'));

console.log(`[System] Environment: NODE_ENV=${process.env.NODE_ENV}, isProd=${isProd}`);

// Test environment defaults
if (isTest) {
    if (!process.env.SESSION_SECRET) {
        process.env.SESSION_SECRET = 'test-session-secret';
    }
    if (!process.env.ENCRYPTION_KEY) {
        process.env.ENCRYPTION_KEY = '0'.repeat(64);
    }
}

const logger = pino({
    level: isProd ? 'warn' : 'info',
    transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } }
});

// Memory management - schedule GC if available
const scheduleGC = () => {
    if (global.gc) {
        setInterval(() => {
            global.gc();
            logger.debug('Manual GC executed');
        }, 60000);
    }
};
scheduleGC();

// Trust proxy for rate limiting behind reverse proxy
// Setting to true is safer for PaaS like Easypanel/Heroku/Railway
// Security: Trust only the first proxy (Easypanel/Traefik Load Balancer)
// Setting this to 'true' causes express-rate-limit to crash due to IP spoofing risks.
// '1' means we trust the immediate reverse proxy, which is correct for Docker/Easypanel.
app.set('trust proxy', 1);

// Debugging configuration (moved after trust proxy set)

// --- SECURITY ---
const requiredEnvVars = ['SESSION_SECRET', 'ENCRYPTION_KEY', 'WA_GATEWAY_PASSWORD'];
if (!isTest && requiredEnvVars.some(k => !process.env[k])) {
    console.error('CRITICAL: Missing required environment variables: ' + requiredEnvVars.filter(k => !process.env[k]).join(', '));
    process.exit(1);
}

if (!isTest && process.env.ENCRYPTION_KEY.length < 32) {
    console.error('CRITICAL: ENCRYPTION_KEY must be at least 32 characters long');
    process.exit(1);
}

// --- CORS ---
// Dynamic origin handler to allow any frontend domain to connect with credentials
// This is critical for Vercel + Easypanel setups where domains might vary
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Trust any origin (Reflection) - Solves the "Cookie Blocked" issue
        // Since we have strict session security, this is acceptable for this use case
        return callback(null, true);
    },
    credentials: true, // Required for cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Cookie']
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Redis clients
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const redisSessionClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

// Connect Redis
if (!isTest) {
    (async () => {
        try {
            await redisClient.connect();
            await redisSessionClient.connect();
            console.log('Redis connected');
            await hydrateSessionsFromRedis();
        } catch (err) {
            console.error('Redis connection error:', err.message);
        }
    })();
}

// --- Session Management ---
const sessions = new Map();
// Store JWT tokens: sessionId -> token
const sessionTokens = new Map();

// Initialize Alert System with internal dependencies
initAlertSystem(db, scheduleMessageSend, sessions);

// --- Session Status Persistence (Redis) ---
async function persistSessionStatus(sessionId, status) {
    if (!redisClient?.isOpen) return;
    try {
        const payload = {
            status: status?.status || 'UNKNOWN',
            qr: status?.qr || null,
            connectedNumber: status?.connectedNumber || null,
            updatedAt: new Date().toISOString()
        };
        await redisClient.set(`wa:session_status:${sessionId}`, JSON.stringify(payload), { EX: SESSION_STATUS_TTL_SEC });
    } catch (err) {
        logger.warn(`Failed to persist session status for ${sessionId}: ${err.message}`);
    }
}

async function loadSessionStatus(sessionId) {
    if (!redisClient?.isOpen) return null;
    try {
        const raw = await redisClient.get(`wa:session_status:${sessionId}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        logger.warn(`Failed to load session status for ${sessionId}: ${err.message}`);
        return null;
    }
}

async function hydrateSessionsFromRedis() {
    if (!redisClient?.isOpen || sessionTokens.size === 0) return;
    for (const sessionId of sessionTokens.keys()) {
        const cached = await loadSessionStatus(sessionId);
        if (!cached) continue;
        const existing = sessions.get(sessionId);
        const base = existing || { sessionId, sock: createCompatSocket(sessionId) };
        sessions.set(sessionId, {
            ...base,
            status: cached.status || base.status || 'UNKNOWN',
            qr: cached.qr || null,
            connectedNumber: cached.connectedNumber || null
        });
    }
}

async function hydrateGatewayMappingsFromTenants() {
    try {
        const tenants = await db.getAllTenants();
        waGateway.resetSessionGatewayUrls();
        tenants.forEach((tenant) => {
            if (tenant?.session_id && tenant?.gateway_url) {
                waGateway.setSessionGatewayUrl(tenant.session_id, tenant.gateway_url);
            }
        });
    } catch (err) {
        logger.warn(`[Gateway] Failed to hydrate gateway mappings: ${err.message}`);
    }
}

async function syncGatewayMappingForSession(sessionId) {
    try {
        const tenant = await db.getTenantBySessionId(sessionId);
        if (tenant?.gateway_url) {
            waGateway.setSessionGatewayUrl(sessionId, tenant.gateway_url);
            return;
        }
        waGateway.setSessionGatewayUrl(sessionId, null);
    } catch (err) {
        logger.warn(`[Gateway] Failed to sync gateway mapping for ${sessionId}: ${err.message}`);
    }
}

// Register session error callback to auto-disconnect on Gateway errors
waGateway.setSessionErrorCallback((sessionId, error) => {
    console.warn(`[Auto-Disconnect] Session ${sessionId} error detected: ${error?.message || 'Unknown error'}`);

    // Get session from memory
    let session = sessions.get(sessionId);
    if (session) {
        // Only update if currently showing as CONNECTED (to prevent looping)
        if (session.status === 'CONNECTED') {
            session.status = 'DISCONNECTED';
            session.qr = null;
            sessions.set(sessionId, session);

            console.log(`[Auto-Disconnect] Session ${sessionId} marked as DISCONNECTED due to Gateway error`);

            // Broadcast status update to all WebSocket clients
            const data = JSON.stringify({
                type: 'session-update',
                data: [{
                    sessionId,
                    status: 'DISCONNECTED',
                    reason: error?.message || 'Gateway error',
                    connectedNumber: session.connectedNumber || null
                }]
            });
            wss.clients.forEach(client => {
                if (client.readyState === 1) {
                    client.send(data);
                }
            });
        }
    }
});

// --- Encryption ---
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const STORAGE_DIR = path.join(__dirname, 'storage');
const ENCRYPTED_TOKENS_FILE = path.join(STORAGE_DIR, 'session_tokens.enc');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), iv);
    return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function decrypt(text) {
    const [iv, content] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), Buffer.from(iv, 'hex'));
    return decipher.update(content, 'hex', 'utf8') + decipher.final('utf8');
}

function saveTokens() {
    try {
        fs.writeFileSync(ENCRYPTED_TOKENS_FILE, encrypt(JSON.stringify(Object.fromEntries(sessionTokens))), { encoding: 'utf-8', mode: 0o600 });
    } catch (error) {
        logger.error(`Failed to save session tokens: ${error.message}`);
    }
}

async function loadTokens() {
    console.log('[System] Loading session tokens from disk...');
    if (fs.existsSync(ENCRYPTED_TOKENS_FILE)) {
        try {
            const fileContent = fs.readFileSync(ENCRYPTED_TOKENS_FILE, 'utf-8');
            const tokens = JSON.parse(decrypt(fileContent));

            let loadedCount = 0;
            for (const [k, v] of Object.entries(tokens)) {
                sessionTokens.set(k, v);
                loadedCount++;
            }
            console.log(`[System] Successfully loaded ${loadedCount} tokens into memory.`);
            await hydrateSessionsFromRedis();

            // Re-authenticate gateway JWTs - AWAIT this to ensure JWTs are ready before sync
            const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;
            if (gatewayPassword) {
                console.log('[System] Authenticating sessions with gateway...');
                const results = await Promise.allSettled(Array.from(sessionTokens.keys()).map(async (sessionId) => {
                    try {
                        const auth = await waGateway.authenticate(sessionId, gatewayPassword);
                        if (auth.status && auth.data?.token) {
                            waGateway.setSessionToken(sessionId, auth.data.token);
                            console.log(`[System] JWT obtained for session: ${sessionId}`);
                            return { sessionId, success: true };
                        }
                        return { sessionId, success: false, reason: 'No token in response' };
                    } catch (err) {
                        console.warn(`[System] Auth failed for ${sessionId}: ${err.message}`);
                        return { sessionId, success: false, reason: err.message };
                    }
                }));

                const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
                console.log(`[System] Gateway auth complete: ${successCount}/${sessionTokens.size} sessions authenticated`);
            }
        } catch (err) {
            console.error('[System] Failed to load/decrypt tokens:', err.message);
        }
    } else {
        console.log('[System] No token file found.');
    }
}

// --- Session Lock (Redis) ---
async function acquireSessionLock(sessionId) {
    await redisClient.set(`wa:lock:${sessionId}`, 'locked', { EX: 60 });
    return true;
}

async function releaseSessionLock(sessionId) {
    await redisClient.del(`wa:lock:${sessionId}`);
}

// --- Contact Management (Redis) ---
async function getSessionContacts(sessionId) {
    const raw = await redisClient.get(`wa:contacts:${sessionId}`);
    return raw ? JSON.parse(raw) : [];
}

async function saveSessionContacts(sessionId, contacts) {
    await redisClient.set(`wa:contacts:${sessionId}`, JSON.stringify(contacts));
}

async function upsertSessionContact(sessionId, contact) {
    const contacts = await getSessionContacts(sessionId);
    const idx = contacts.findIndex(c => c.contactId === contact.contactId);
    if (idx >= 0) contacts[idx] = { ...contacts[idx], ...contact };
    else contacts.push(contact);
    await saveSessionContacts(sessionId, contacts);
}

async function removeSessionContact(sessionId, contactId) {
    const contacts = await getSessionContacts(sessionId);
    const filtered = contacts.filter(c => c.contactId !== contactId);
    await saveSessionContacts(sessionId, filtered);
}

// --- Session Settings (Redis) ---
async function saveSessionSettings(sessionId, settings) {
    await redisClient.set(`wa:settings:${sessionId}`, JSON.stringify(settings));
}

// --- Scheduled Contact Sync ---
const CONTACT_SYNC_INTERVAL_MS = CONTACT_SYNC_INTERVAL_MINUTES * 60 * 1000;
const CONTACT_SYNC_BACKOFF_BASE_MS = CONTACT_SYNC_BACKOFF_BASE_MINUTES * 60 * 1000;
const CONTACT_SYNC_BACKOFF_MAX_MS = CONTACT_SYNC_BACKOFF_MAX_MINUTES * 60 * 1000;
const CONTACT_SYNC_TICK_MS = parseInt(process.env.CONTACT_SYNC_TICK_SECONDS || '120', 10) * 1000;
const CONTACT_SYNC_BATCH_SIZE = parseInt(process.env.CONTACT_SYNC_BATCH_SIZE || '10', 10);
const CONTACT_SYNC_QUEUE_NAME = 'wa:sync:queue';
let contactSyncRunning = false;
let contactSyncSeededAt = 0;
const GATEWAY_ALERT_TICK_MS = 60 * 1000;
const ALERT_THROTTLE_MS = 30 * 60 * 1000;

async function shouldSyncContacts(sessionId) {
    if (!redisClient?.isOpen) return false;
    const now = Date.now();
    const nextAtRaw = await redisClient.get(`wa:sync:next:${sessionId}`);
    const nextAt = nextAtRaw ? Number(nextAtRaw) : 0;
    if (nextAt && now < nextAt) return false;
    const lastRaw = await redisClient.get(`wa:sync:last:${sessionId}`);
    const lastAt = lastRaw ? Number(lastRaw) : 0;
    if (!lastAt) return true;
    return now - lastAt >= CONTACT_SYNC_INTERVAL_MS;
}

function normalizeSyncSessionId(sessionId) {
    const normalized = String(sessionId || '').trim();
    return normalized;
}

async function scheduleNextContactSync(sessionId, nextAt) {
    if (!redisClient?.isOpen) return;
    const normalized = normalizeSyncSessionId(sessionId);
    if (!normalized) return;
    await redisClient.set(`wa:sync:next:${normalized}`, String(nextAt));
    await redisClient.zAdd(CONTACT_SYNC_QUEUE_NAME, [{ score: nextAt, value: normalized }]);
}

async function clearContactSyncState(sessionId) {
    if (!redisClient?.isOpen) return;
    const normalized = normalizeSyncSessionId(sessionId);
    if (!normalized) return;
    await redisClient.del(`wa:sync:fail:${normalized}`);
    await redisClient.del(`wa:sync:next:${normalized}`);
    await redisClient.zRem(CONTACT_SYNC_QUEUE_NAME, normalized);
}

async function seedContactSyncQueue(force = false) {
    if (!redisClient?.isOpen) return;
    const now = Date.now();
    if (!force && now - contactSyncSeededAt < CONTACT_SYNC_INTERVAL_MS) return;
    contactSyncSeededAt = now;

    const tenants = await db.getAllTenants();
    const entries = [];
    tenants.forEach((tenant) => {
        if (!tenant?.session_id) return;
        const normalized = normalizeSyncSessionId(tenant.session_id);
        if (!normalized) return;
        const jitter = Math.floor(Math.random() * CONTACT_SYNC_INTERVAL_MS);
        entries.push({ score: now + jitter, value: normalized });
    });

    if (entries.length > 0) {
        await redisClient.zAdd(CONTACT_SYNC_QUEUE_NAME, entries, { NX: true });
    }
}

async function getDueContactSyncSessions(limit) {
    if (!redisClient?.isOpen) return [];
    const now = Date.now();
    const sessionsDue = await redisClient.zRangeByScore(
        CONTACT_SYNC_QUEUE_NAME,
        0,
        now,
        { LIMIT: { offset: 0, count: limit } }
    );
    if (!sessionsDue.length) return [];
    await redisClient.zRem(CONTACT_SYNC_QUEUE_NAME, sessionsDue);
    return sessionsDue;
}

async function markSyncSuccess(sessionId) {
    if (!redisClient?.isOpen) return;
    const now = Date.now();
    await redisClient.set(`wa:sync:last:${sessionId}`, String(now));
    await redisClient.del(`wa:sync:fail:${sessionId}`);
    await scheduleNextContactSync(sessionId, now + CONTACT_SYNC_INTERVAL_MS);
}

async function markSyncFailure(sessionId, error) {
    if (!redisClient?.isOpen) return;
    const key = `wa:sync:fail:${sessionId}`;
    let failCount = 0;
    try {
        const raw = await redisClient.get(key);
        if (raw) {
            const parsed = JSON.parse(raw);
            failCount = Number(parsed?.count) || 0;
        }
    } catch (err) {
        failCount = 0;
    }
    failCount += 1;
    const delay = Math.min(CONTACT_SYNC_BACKOFF_MAX_MS, CONTACT_SYNC_BACKOFF_BASE_MS * Math.pow(2, failCount - 1));
    const nextAt = Date.now() + delay;
    await redisClient.set(key, JSON.stringify({
        count: failCount,
        lastError: error?.message || 'unknown',
        lastAt: new Date().toISOString()
    }));
    await scheduleNextContactSync(sessionId, nextAt);
}

async function runScheduledContactSync() {
    if (contactSyncRunning || isTest) return;
    contactSyncRunning = true;
    try {
        if (redisClient?.isOpen) {
            await seedContactSyncQueue();
            const dueSessions = await getDueContactSyncSessions(CONTACT_SYNC_BATCH_SIZE);

            for (const sessionId of dueSessions) {
                const session = sessions.get(sessionId);
                if (!session || session.status !== 'CONNECTED') {
                    await markSyncFailure(sessionId, new Error('Session not connected'));
                    continue;
                }

                const tenant = await db.getTenantBySessionId(sessionId);
                if (!tenant) {
                    logger.warn(`[Sync] Tenant not found for session ${sessionId}, removing from queue.`);
                    await clearContactSyncState(sessionId);
                    continue;
                }

                try {
                    const result = await syncContactsForTenant(tenant.id, sessionId);
                    if (result?.synced > 0) {
                        logger.info(`[Sync] Scheduled sync: ${result.synced} contacts for ${tenant.company_name}`);
                    }
                    await markSyncSuccess(sessionId);
                } catch (err) {
                    logger.warn(`[Sync] Scheduled sync failed for ${sessionId}: ${err.message}`);
                    await markSyncFailure(sessionId, err);
                }
            }
        } else {
            const sessionsSnapshot = getSessionsDetails().filter((s) => s.status === 'CONNECTED');
            const candidates = sessionsSnapshot.slice(0, CONTACT_SYNC_BATCH_SIZE);
            for (const session of candidates) {
                if (!(await shouldSyncContacts(session.sessionId))) continue;
                try {
                    const tenant = await db.getTenantBySessionId(session.sessionId);
                    if (!tenant) continue;
                    const result = await syncContactsForTenant(tenant.id, session.sessionId);
                    if (result?.synced > 0) {
                        logger.info(`[Sync] Scheduled sync: ${result.synced} contacts for ${tenant.company_name}`);
                    }
                    await markSyncSuccess(session.sessionId);
                } catch (err) {
                    logger.warn(`[Sync] Scheduled sync failed for ${session.sessionId}: ${err.message}`);
                    await markSyncFailure(session.sessionId, err);
                }
            }
        }
    } catch (err) {
        logger.warn(`[Sync] Scheduled sync loop failed: ${err.message}`);
    } finally {
        contactSyncRunning = false;
    }
}

// --- Gateway Alerts ---
let gatewayAlertRunning = false;

function buildGatewayAlertKey(type, url) {
    const safeUrl = encodeURIComponent(String(url || 'unknown'));
    return `wa:alert:${type}:${safeUrl}`;
}

async function shouldSendAlert(key) {
    if (!redisClient?.isOpen) return true;
    const exists = await redisClient.get(key);
    if (exists) return false;
    await redisClient.set(key, '1', { EX: Math.ceil(ALERT_THROTTLE_MS / 1000) });
    return true;
}

async function sendGatewayNotifierMessage(message) {
    const notifierSessionId = await db.getSystemSetting('notifier_session_id');
    const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;

    if (!notifierSessionId || !gatewayPassword) return false;

    const supers = await db.getSuperAdminsWithPhone();
    const uniquePhones = Array.from(new Set(supers
        .map((u) => (u.phone_number || '').trim())
        .filter(Boolean)));

    if (!uniquePhones.length) return false;

    const auth = await waGateway.authenticate(notifierSessionId, gatewayPassword);
    if (auth?.status && auth.data?.token) {
        waGateway.setSessionToken(notifierSessionId, auth.data.token);
    } else {
        throw new Error('Auth ke gateway (notifier) gagal');
    }

    await Promise.allSettled(
        uniquePhones.map(async (phone) => {
            try {
                await waGateway.sendText(notifierSessionId, phone, message);
            } catch (err) {
                logger.warn(`[Notifier] Gagal kirim ke ${phone}: ${err.message}`);
            }
        })
    );

    return true;
}

async function notifyGatewayAlert(type, gateway, payload) {
    const key = buildGatewayAlertKey(type, gateway.url);
    const allowed = await shouldSendAlert(key);
    if (!allowed) return;

    const label = gateway.is_default ? 'Default Gateway' : gateway.url;
    let message = '';

    if (type === 'gateway_over_capacity') {
        message = `Gateway OVER CAPACITY: ${label} (${gateway.session_count}/${gateway.max_sessions}). Tenants: ${gateway.tenant_count}.`;
    } else {
        const status = gateway.health?.status || 'error';
        const detail = gateway.health?.message ? ` (${gateway.health.message})` : '';
        message = `Gateway DOWN: ${label}. Status: ${status}${detail}. Tenants: ${gateway.tenant_count}, Sessions: ${gateway.session_count}.`;
    }

    try {
        await sendGatewayNotifierMessage(message);
    } catch (err) {
        logger.warn(`[Alert] Notifier failed for ${gateway.url}: ${err.message}`);
    }

    await sendAlertWebhook(type, {
        gateway_url: gateway.url,
        gateway_is_default: gateway.is_default,
        tenant_count: gateway.tenant_count,
        session_count: gateway.session_count,
        max_sessions: gateway.max_sessions || null,
        health: gateway.health || null,
        ...payload
    });
}

async function runGatewayAlerts() {
    if (gatewayAlertRunning || isTest) return;
    gatewayAlertRunning = true;
    try {
        const tenants = await db.getAllTenants();
        const gateways = await getGatewayHealthSummary(tenants);

        for (const gateway of gateways) {
            if (!gateway?.url) continue;
            const shouldReport = gateway.is_default || gateway.tenant_count > 0;
            if (!shouldReport) continue;

            if (!isHealthyStatus(gateway.health?.status)) {
                await notifyGatewayAlert('gateway_down', gateway, {
                    reason: gateway.health?.message || null
                });
            }

            if (gateway.max_sessions && gateway.over_capacity) {
                await notifyGatewayAlert('gateway_over_capacity', gateway, {});
            }
        }
    } catch (err) {
        logger.warn(`[Alert] Gateway alert loop failed: ${err.message}`);
    } finally {
        gatewayAlertRunning = false;
    }
}

// --- Message Queue ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isTransientSendError = (error) => {
    const message = (error?.message || '').toLowerCase();
    const patterns = [
        'timeout',
        'timed out',
        'connection closed',
        'not connected',
        'session disconnected',
        'session tidak tersedia',
        'session not available',
        'gateway',
        'server error',
        'econnreset',
        'econnrefused',
        'socket'
    ];
    return patterns.some((pattern) => message.includes(pattern));
};

function ensureSessionQueueState(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            sessionId,
            queue: [],
            processing: false,
            status: 'UNKNOWN',
            sock: createCompatSocket(sessionId)
        });
    }
    const session = sessions.get(sessionId);
    if (!Array.isArray(session.queue)) {
        session.queue = [];
    }
    if (typeof session.processing !== 'boolean') {
        session.processing = false;
    }
    // Ensure sock exists
    if (!session.sock) {
        session.sock = createCompatSocket(sessionId);
    }
    return session;
}

async function processSessionQueue(sessionId) {
    const state = ensureSessionQueueState(sessionId);
    if (state.processing) return;
    state.processing = true;
    while (state.queue && state.queue.length > 0) {
        const job = state.queue.shift();
        if (!job) continue;
        try {
            const res = await job.operation();
            job.resolve(res);
        } catch (e) {
            job.attempts += 1;
            const shouldRetry = job.attempts <= job.maxRetries && job.shouldRetry(e);
            if (shouldRetry) {
                const delay = Math.floor(job.retryDelayMs * Math.pow(job.retryBackoff, job.attempts - 1));
                await sleep(delay);
                state.queue.unshift(job);
                continue;
            }
            job.reject(e);
        }
        await sleep(MESSAGE_SEND_QUEUE_DELAY_MS);
    }
    state.processing = false;
}

function scheduleMessageSend(sessionId, operation, options = {}) {
    const state = ensureSessionQueueState(sessionId);
    return new Promise((resolve, reject) => {
        state.queue.push({
            operation,
            resolve,
            reject,
            attempts: 0,
            maxRetries: typeof options.maxRetries === 'number' ? options.maxRetries : MESSAGE_SEND_RETRIES,
            retryDelayMs: typeof options.retryDelayMs === 'number' ? options.retryDelayMs : MESSAGE_SEND_RETRY_DELAY_MS,
            retryBackoff: typeof options.retryBackoff === 'number' ? options.retryBackoff : MESSAGE_SEND_RETRY_BACKOFF,
            shouldRetry: typeof options.shouldRetry === 'function' ? options.shouldRetry : isTransientSendError
        });
        processSessionQueue(sessionId);
    });
}

// --- Webhook ---
async function postToWebhook(data) {
    const url = await getWebhookUrl(data.sessionId);
    if (url) axios.post(url, data).catch(() => {});
}

// --- Session Management (via Go Gateway) ---
function getSessionsDetails() {
    // Self-healing: If memory is empty, try to load from disk immediately
    if (sessionTokens.size === 0) {
        loadTokens();
    }

    // Source of truth is sessionTokens (persisted sessions)
    const allSessionIds = Array.from(sessionTokens.keys());

    return allSessionIds
        .map(id => {
            const session = sessions.get(id);
            return {
                sessionId: id,
                status: session?.status || 'UNKNOWN',
                qr: session?.qr || null,
                connectedNumber: session?.connectedNumber || null
            };
        })
        .filter(s => {
            // Only return active sessions (CONNECTED, CONNECTING, or has QR)
            // Filter out DISCONNECTED, LOGGED_OUT, and UNKNOWN without QR
            const isActive = s.status === 'CONNECTED' ||
                           s.status === 'CONNECTING' ||
                           s.status === 'SCAN_QR_CODE' ||
                           (s.qr && s.qr.length > 0);
            return isActive;
        });
}

async function refreshSession(sessionId) {
    // Only refresh if we have a token (known session)
    if (!sessionTokens.has(sessionId)) {
        console.log(`[Refresh] Skip ${sessionId}: No token found`);
        return;
    }

    // Debug Log: Start
    console.log(`[Refresh] Starting check for session: ${sessionId}`);

    try {
        // Check if we have a valid JWT, if not authenticate first
        let hasJwt = !!waGateway.getSessionToken(sessionId);
        if (!hasJwt) {
            const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;
            if (gatewayPassword) {
                console.log(`[Refresh] No JWT for ${sessionId}, authenticating...`);
                try {
                    const auth = await waGateway.authenticate(sessionId, gatewayPassword);
                    if (auth.status && auth.data?.token) {
                        waGateway.setSessionToken(sessionId, auth.data.token);
                        hasJwt = true;
                        console.log(`[Refresh] JWT obtained for ${sessionId}`);
                    }
                } catch (authErr) {
                    console.warn(`[Refresh] Auth failed for ${sessionId}: ${authErr.message}`);
                }
            }
        }

        if (!hasJwt) {
            console.warn(`[Refresh] Cannot refresh ${sessionId}: No valid JWT`);
            return;
        }

        // STRATEGY 1: Lightweight "Ping" via getGroups
        try {
            console.log(`[Refresh] Attempting Strategy 1 (Groups) for ${sessionId}...`);
            const groupResp = await waGateway.getGroups(sessionId);
            console.log(`[Refresh] Strategy 1 Result for ${sessionId}:`, JSON.stringify(groupResp));
            
            if (groupResp && (groupResp.status === true || groupResp.status === 'success')) {
                console.log(`[Refresh] Strategy 1 Success! Marking ${sessionId} as CONNECTED`);
                updateSessionStatus(sessionId, 'CONNECTED');
                return;
            }
        } catch (pingErr) {
            console.log(`[Refresh] Strategy 1 Failed for ${sessionId}: ${pingErr.message}`);
        }

        // STRATEGY 2: Login (Heavy Check / QR Gen)
        console.log(`[Refresh] Attempting Strategy 2 (Login) for ${sessionId}...`);
        const response = await waGateway.login(sessionId);
        console.log(`[Refresh] Strategy 2 Result for ${sessionId}:`, JSON.stringify(response));
        
        const msg = (response.message || '').toLowerCase();
        
        if (response.status && response.data?.qr) {
            console.log(`[Refresh] Session ${sessionId} needs QR scan.`);
            updateSessionStatus(sessionId, 'DISCONNECTED', response.data.qr);
        } else if (msg.includes('reconnected') || msg.includes('already') || msg.includes('login')) {
            console.log(`[Refresh] Session ${sessionId} is ALREADY CONNECTED.`);
            updateSessionStatus(sessionId, 'CONNECTED');
        } else if (response.code === 200 && !response.data?.qr) {
             console.log(`[Refresh] Session ${sessionId} HTTP 200 OK.`);
             updateSessionStatus(sessionId, 'CONNECTED');
        } else {
             console.log(`[Refresh] Session ${sessionId} Unknown State.`);
        }
        
    } catch (error) {
        console.error(`[Refresh] CRITICAL ERROR for ${sessionId}: ${error.message}`);
    }
}

function updateSessionStatus(sessionId, status, qr = null) {
    let current = sessions.get(sessionId);
    if (!current) {
        current = { sessionId, sock: createCompatSocket(sessionId), status: 'UNKNOWN' };
    }
    
    // Only broadcast if changed
    if (current.status !== status || current.qr !== qr) {
        current.status = status;
        current.qr = qr;
        sessions.set(sessionId, current);
        persistSessionStatus(sessionId, {
            status: current.status,
            qr: current.qr,
            connectedNumber: current.connectedNumber || null
        });
        broadcastSessionUpdate();
    }
}

function broadcastSessionUpdate() {
    const data = JSON.stringify({ type: 'session-update', data: getSessionsDetails() });
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(data);
        }
    });
}

/**
 * Create a new WhatsApp session
 * Authenticates with Go gateway and initiates login
 */
async function createSession(sessionId) {
    try {
        // Generate local token for API auth
        const token = crypto.randomBytes(32).toString('hex');
        sessionTokens.set(sessionId, token);
        saveTokens();

        // Acquire lock
        await acquireSessionLock(sessionId);

        await syncGatewayMappingForSession(sessionId);

        // Authenticate with Go gateway
        const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;
        const authResponse = await waGateway.authenticate(sessionId, gatewayPassword);

        if (authResponse.status && authResponse.data?.token) {
            // Store gateway JWT token
            waGateway.setSessionToken(sessionId, authResponse.data.token);
        }

        // Initialize session state with compatible socket
        const sessionState = {
            sessionId,
            status: 'CONNECTING',
            qr: null,
            sock: createCompatSocket(sessionId)
        };
        sessions.set(sessionId, sessionState);

        // Request QR code from gateway
        const loginResponse = await waGateway.login(sessionId);

        const session = sessions.get(sessionId);
        if (loginResponse.status && loginResponse.data?.qrcode) {
            session.qr = loginResponse.data.qrcode;
            session.status = 'CONNECTING';
            sessions.set(sessionId, session);
        } else if (loginResponse.message?.includes('Reconnected')) {
            session.status = 'CONNECTED';
            session.qr = null;
            sessions.set(sessionId, session);
        }

        await persistSessionStatus(sessionId, {
            status: session.status,
            qr: session.qr,
            connectedNumber: session.connectedNumber || null
        });

        broadcastSessionUpdate();

        return { token };
    } catch (error) {
        logger.error(`Failed to create session ${sessionId}: ${error.message}`);
        await releaseSessionLock(sessionId);
        throw error;
    }
}

/**
 * Delete a WhatsApp session
 * Logs out from Go gateway and cleans up local state
 */
async function deleteSession(sessionId) {
    try {
        // Try to logout via Go gateway
        try {
            await waGateway.logout(sessionId);
        } catch (error) {
            logger.warn(`Gateway logout error for ${sessionId}: ${error.message}`);
        }

        // Clean up local state
        sessions.delete(sessionId);
        sessionTokens.delete(sessionId);
        waGateway.removeSessionToken(sessionId);
        waGateway.setSessionGatewayUrl(sessionId, null);
        saveTokens();

        await releaseSessionLock(sessionId);

        // Clear session data from Redis
        await redisClient.del(`wa:contacts:${sessionId}`);
        await redisClient.del(`wa:settings:${sessionId}`);
        await redisClient.del(`wa:session_status:${sessionId}`);

        logger.info(`Session ${sessionId} deleted and cleaned up`);
        broadcastSessionUpdate();
    } catch (error) {
        logger.error(`Error deleting session ${sessionId}: ${error.message}`);
        throw error;
    }
}

/**
 * Regenerate session token
 */
async function regenerateSessionToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    sessionTokens.set(sessionId, token);
    saveTokens();
    return token;
}

/**
 * Validate WhatsApp recipient via Go gateway
 */
async function validateWhatsAppRecipient(sessionId, destination) {
    try {
        const target = (destination || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
        const result = await waGateway.checkRegistered(sessionId, target);
        if (result.status !== true) {
            throw new Error(result.message || 'Number not registered on WhatsApp');
        }
        return result;
    } catch (error) {
        throw new Error(`Recipient validation failed: ${error.message}`);
    }
}

// --- Middleware ---
app.use(bodyParser.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
}));

app.use(session({
    store: new RedisStore({ client: redisSessionClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true, // Essential for secure cookies behind a proxy
    cookie: {
        secure: isProd, // Must be true in production (HTTPS)
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax', // Must be 'none' for cross-site (Vercel -> Backend)
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

function isHealthyStatus(value) {
    return value === true || value === 'ok' || value === 'success';
}

async function checkPostgresHealth() {
    try {
        await db.query('SELECT 1');
        return { status: 'ok' };
    } catch (error) {
        return { status: 'error', message: error.message };
    }
}

async function checkRedisHealth(client) {
    if (!client?.isOpen) {
        return { status: 'error', message: 'Redis not connected' };
    }
    try {
        await client.ping();
        return { status: 'ok' };
    } catch (error) {
        return { status: 'error', message: error.message };
    }
}

function ensureHealthToken(req, res) {
    if (!HEALTH_CHECK_TOKEN) return true;
    const token = req.headers['x-health-token'];
    if (token !== HEALTH_CHECK_TOKEN) {
        res.status(401).json({ status: 'error', message: 'Unauthorized' });
        return false;
    }
    return true;
}

// --- Health Check Endpoints ---
app.get('/', (req, res) => res.json({
    status: 'online',
    message: 'Customer Service CRM Backend',
    version: '2.0.0',
    gateway: 'go-whatsapp-gateway'
}));
app.get('/ping', (req, res) => res.send('pong'));
app.get('/sessions', (req, res) => res.status(200).json(getSessionsDetails()));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Gateway health check
app.get('/api/v1/gateway/health', async (req, res) => {
    try {
        const health = await waGateway.checkHealth();
        res.json(health);
    } catch (error) {
        res.status(503).json({ status: 'error', message: error.message });
    }
});

app.get('/api/v1/health/infra', async (req, res) => {
    if (!ensureHealthToken(req, res)) return;

    const [postgres, redis, gatewayDefault] = await Promise.all([
        checkPostgresHealth(),
        checkRedisHealth(redisClient),
        waGateway.checkHealth()
    ]);

    let gateways = [];
    let gatewayError = null;
    if (postgres.status === 'ok') {
        try {
            const tenants = await db.getAllTenants();
            gateways = await getGatewayHealthSummary(tenants);
        } catch (error) {
            gatewayError = error.message;
        }
    } else {
        gatewayError = 'Postgres unavailable';
    }

    const gatewayIssues = gateways.length > 0
        ? gateways.filter(g => !isHealthyStatus(g.health?.status)).length
        : (isHealthyStatus(gatewayDefault?.status) ? 0 : 1);

    const status = (postgres.status !== 'ok' || redis.status !== 'ok')
        ? 'error'
        : gatewayIssues > 0
            ? 'degraded'
            : 'ok';

    res.json({
        status,
        timestamp: new Date().toISOString(),
        postgres,
        redis,
        gateway_default: gatewayDefault,
        gateways,
        gateway_error: gatewayError
    });
});

// DEBUG: Check Session/Proxy Config
app.get('/api/v1/debug/config', (req, res) => {
    res.json({
        env: process.env.NODE_ENV,
        isProd: isProd,
        protocol: req.protocol,
        secure: req.secure,
        trustProxy: app.get('trust proxy'),
        headers: {
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
            'host': req.headers['host']
        },
        cookieConfig: {
            secure: isProd,
            sameSite: isProd ? 'none' : 'lax'
        }
    });
});

// --- Routes ---

// Admin authentication
app.use('/api/v1/admin', authRouter);

// n8n integration
app.use('/api/v1/n8n', initializeN8nApi({ scheduleMessageSend, waGateway }));

// Webhook handler for Go WhatsApp Gateway
const webhookHandler = require('./webhook-handler');
webhookHandler.setWebSocketServer(wss);

// Listen for connection events to update local session state
webhookHandler.on('connection', (sessionId, data) => {
    let session = sessions.get(sessionId);
    if (!session) {
        session = {
            sessionId,
            sock: createCompatSocket(sessionId)
        };
    }

    const newStatus = data.status === 'connected' ? 'CONNECTED' :
        data.status === 'disconnected' ? 'DISCONNECTED' :
        data.status === 'logged_out' ? 'LOGGED_OUT' : 'UNKNOWN';

    session.status = newStatus;
    session.qr = null;

    // Store connected WhatsApp number
    if (data.connectedNumber) {
        session.connectedNumber = data.connectedNumber;
    } else if (newStatus !== 'CONNECTED') {
        // Clear connected number when disconnected
        session.connectedNumber = null;
    }

    // Ensure sock exists
    if (!session.sock) {
        session.sock = createCompatSocket(sessionId);
    }
    sessions.set(sessionId, session);
    persistSessionStatus(sessionId, {
        status: session.status,
        qr: session.qr,
        connectedNumber: session.connectedNumber || null
    });
    
    // CRITICAL FIX: Persistence
    // If Gateway says "Connected" but we don't have it in file, SAVE IT!
    if (newStatus === 'CONNECTED') {
        if (!sessionTokens.has(sessionId)) {
            console.log(`[Auto-Recovery] Session ${sessionId} detected from Webhook. Saving to disk...`);
            // Generate a token so it can be managed via API later
            const recoveryToken = crypto.randomBytes(32).toString('hex');
            sessionTokens.set(sessionId, recoveryToken);
            saveTokens(); // Write to session_tokens.enc
        }

        // AUTO-SYNC: When session becomes CONNECTED, sync contacts immediately
        // Find tenant by session_id and trigger sync
        setImmediate(async () => {
            try {
                const tenant = await db.getTenantBySessionId(sessionId);
                if (tenant) {
                    console.log(`[Auto-Sync] Session ${sessionId} connected. Syncing contacts for ${tenant.company_name}...`);
                    const result = await syncContactsForTenant(tenant.id, sessionId);
                    if (result.synced > 0) {
                        console.log(`[Auto-Sync] Synced ${result.synced} contacts for ${tenant.company_name}`);
                    }
                    await markSyncSuccess(sessionId);
                } else {
                    await clearContactSyncState(sessionId);
                }
            } catch (err) {
                console.warn(`[Auto-Sync] Failed for session ${sessionId}: ${err.message}`);
                await markSyncFailure(sessionId, err);
            }
        });
    } else if (newStatus === 'LOGGED_OUT' || newStatus === 'DISCONNECTED') {
        // If logged out or disconnected, remove from disk after delay
        // Wait 5 minutes before cleanup (in case of temporary disconnect)
        setTimeout(() => {
            const currentSession = sessions.get(sessionId);
            // Only cleanup if still DISCONNECTED/LOGGED_OUT after delay
            if (currentSession?.status === 'DISCONNECTED' || currentSession?.status === 'LOGGED_OUT') {
                if (sessionTokens.has(sessionId)) {
                    console.log(`[Auto-Cleanup] Session ${sessionId} disconnected/logged out. Removing from disk...`);
                    sessionTokens.delete(sessionId);
                    saveTokens();
                    broadcastSessionUpdate();
                }
            }
        }, 5 * 60 * 1000); // 5 minutes delay
    }

    broadcastSessionUpdate();
});

app.use('/api/v1/webhook', webhookHandler.router);

// WhatsApp API routes
app.use('/api/v1', initializeApi(
    sessions,
    sessionTokens,
    createSession,
    getSessionsDetails,
    deleteSession,
    console.log,
    null, // phonePairing - not used with Go gateway
    saveSessionSettings,
    regenerateSessionToken,
    redisClient,
    scheduleMessageSend,
    validateWhatsAppRecipient,
    getSessionContacts,
    upsertSessionContact,
    removeSessionContact,
    postToWebhook,
    refreshSession
));

// --- Server Start ---
const PORT = process.env.PORT || 3000;
if (!isTest) {
    server.listen(PORT, async () => {
        try {
            await db.ensureTenantWebhooksTable();
            await db.ensureTenantSessionColumn();
            await db.ensureTenantGatewayColumn();
            await db.ensureTenantApiKeyColumn();
            await db.ensureUserInvitesTable();
            await db.ensureInviteErrorColumn();
            await db.ensureSystemSettingsTable();
            await db.ensureUserPhoneColumn();
            await db.ensureInvitePhoneColumn();
            await db.ensureContactSyncTrigger(); // Update Trigger Logic (Force Sync)
        } catch (err) {
            console.error('Database setup error:', err.message);
        }

        try {
            await ensureSuperAdmin();
        } catch (err) {
            console.error('Super admin check failed:', err.message);
        }

        await hydrateGatewayMappingsFromTenants();
        await loadTokens();
        await seedContactSyncQueue(true);

        // Check Go gateway health
        try {
            const gatewayHealth = await waGateway.checkHealth();
            const isHealthy = gatewayHealth?.status === true || gatewayHealth?.status === 'ok';
            console.log('Go Gateway:', isHealthy ? 'Connected' : 'Not available');
            
            // Sync sessions with Gateway
            if (isHealthy) {
                console.log('Syncing sessions with Gateway...');
                const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;

                for (const sessionId of sessionTokens.keys()) {
                    try {
                        // Check if we have a valid JWT from loadTokens auth
                        let hasJwt = !!waGateway.getSessionToken(sessionId);

                        // If no JWT, try to authenticate now
                        if (!hasJwt && gatewayPassword) {
                            console.log(`[Sync] No JWT for ${sessionId}, authenticating...`);
                            try {
                                const auth = await waGateway.authenticate(sessionId, gatewayPassword);
                                if (auth.status && auth.data?.token) {
                                    waGateway.setSessionToken(sessionId, auth.data.token);
                                    hasJwt = true;
                                    console.log(`[Sync] JWT obtained for ${sessionId}`);
                                }
                            } catch (authErr) {
                                console.warn(`[Sync] Auth failed for ${sessionId}: ${authErr.message}`);
                            }
                        }

                        // Skip sync if we still don't have JWT
                        if (!hasJwt) {
                            console.warn(`[Sync] Skipping ${sessionId}: No valid JWT`);
                            continue;
                        }

                        // Check login status
                        // Calling login on an active session returns "Reconnected" message
                        // Calling on inactive returns QR
                        const response = await waGateway.login(sessionId);

                        let session = sessions.get(sessionId);
                        if (!session) {
                            session = {
                                sessionId,
                                sock: createCompatSocket(sessionId),
                                status: 'UNKNOWN'
                            };
                        }

                        if (response.status && response.data?.qr) {
                            session.status = 'DISCONNECTED';
                            session.qr = response.data.qr;
                            console.log(`[Sync] Session ${sessionId}: DISCONNECTED (needs QR)`);
                        } else if (response.message?.includes('Reconnected')) {
                            session.status = 'CONNECTED';
                            session.qr = null;
                            console.log(`[Sync] Session ${sessionId}: CONNECTED`);
                        } else {
                            // Default to CONNECTED if no QR and response is OK
                            session.status = response.status ? 'CONNECTED' : 'UNKNOWN';
                            session.qr = null;
                            console.log(`[Sync] Session ${sessionId}: ${session.status}`);
                        }

                        sessions.set(sessionId, session);
                        await persistSessionStatus(sessionId, {
                            status: session.status,
                            qr: session.qr,
                            connectedNumber: session.connectedNumber || null
                        });
                    } catch (err) {
                        console.warn(`Failed to sync session ${sessionId}: ${err.message}`);
                    }
                }
                broadcastSessionUpdate();
            }
        } catch (err) {
            console.warn('Go Gateway not available:', err.message);
        }

        console.log(`CRM Backend running on port ${PORT}`);
        setInterval(() => {
            void runScheduledContactSync();
        }, CONTACT_SYNC_TICK_MS);
        console.log(`[Cron] Scheduled contact sync enabled (tick ${CONTACT_SYNC_TICK_MS / 1000}s, interval ${CONTACT_SYNC_INTERVAL_MINUTES}m)`);
        setInterval(() => {
            void runGatewayAlerts();
        }, GATEWAY_ALERT_TICK_MS);
        console.log(`[Cron] Gateway alert checks enabled (tick ${GATEWAY_ALERT_TICK_MS / 1000}s)`);
        setInterval(() => {
            void marketingProcessor.processBatch();
        }, 60 * 1000);
        console.log('[Cron] Marketing processor enabled (tick 60s)');
    });
}

// --- Graceful Shutdown ---
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);

    // Close WebSocket connections
    wss.clients.forEach(client => client.close());

    // Clear local session state
    sessions.clear();

    // Close Redis connections
    try {
        await redisClient.quit();
        await redisSessionClient.quit();
    } catch (err) {
        logger.warn('Redis disconnect error:', err.message);
    }

    // Close HTTP server
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server, redisClient, redisSessionClient };
