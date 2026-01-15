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

const app = express();
// Detect production if NODE_ENV is set OR if FRONTEND_URL is https (common in deployments)
const isProd = process.env.NODE_ENV === 'production' || (process.env.FRONTEND_URL && process.env.FRONTEND_URL.startsWith('https'));

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
        } catch (err) {
            console.error('Redis connection error:', err.message);
        }
    })();
}

// Session state (synced from Go gateway via webhooks)
const sessions = new Map();
const sessionTokens = new Map();

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

// --- Message Queue ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        try {
            const res = await job.operation();
            job.resolve(res);
        } catch (e) { job.reject(e); }
        await sleep(2000);
    }
    state.processing = false;
}

function scheduleMessageSend(sessionId, operation) {
    const state = ensureSessionQueueState(sessionId);
    return new Promise((resolve, reject) => {
        state.queue.push({ operation, resolve, reject });
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
        saveTokens();

        await releaseSessionLock(sessionId);

        // Clear session data from Redis
        await redisClient.del(`wa:contacts:${sessionId}`);
        await redisClient.del(`wa:settings:${sessionId}`);

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
app.use(bodyParser.json());

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
        await loadTokens();

        try {
            await db.ensureTenantWebhooksTable();
            await db.ensureTenantSessionColumn();
            await db.ensureUserSessionColumn();
            await db.ensureUserInvitesTable();
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

        // --- Periodic Contact Sync (every 5 minutes) ---
        const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
        setInterval(async () => {
            try {
                // Get all active tenants with session_id
                const tenantsResult = await db.query(`
                    SELECT id, company_name, session_id
                    FROM tenants
                    WHERE status = 'active' AND session_id IS NOT NULL
                `);
                const tenants = tenantsResult.rows;

                if (tenants.length === 0) return;

                console.log(`[Cron] Starting periodic sync for ${tenants.length} tenants...`);

                for (const tenant of tenants) {
                    try {
                        const result = await syncContactsForTenant(tenant.id, tenant.session_id);
                        if (result.synced > 0) {
                            console.log(`[Cron] Synced ${result.synced} contacts for ${tenant.company_name}`);
                        }
                    } catch (err) {
                        console.warn(`[Cron] Sync failed for ${tenant.company_name}: ${err.message}`);
                    }
                    // Small delay between tenants to avoid overwhelming gateway
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (err) {
                console.error('[Cron] Periodic sync error:', err.message);
            }
        }, SYNC_INTERVAL);

        console.log(`[Cron] Periodic contact sync enabled (every ${SYNC_INTERVAL / 60000} minutes)`);
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

module.exports = { app, server };
