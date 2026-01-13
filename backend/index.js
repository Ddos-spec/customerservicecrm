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
const { router: authRouter, ensureSuperAdmin } = require('./auth');
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
const isProd = process.env.NODE_ENV === 'production';

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
app.set('trust proxy', 1);

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
const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000']
    : true;

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

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
const ENCRYPTED_TOKENS_FILE = path.join(__dirname, 'session_tokens.enc');

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

function loadTokens() {
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

            // Re-authenticate gateway JWTs in background
            const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;
            // Don't await this, let it run in background
            Promise.allSettled(Array.from(sessionTokens.keys()).map(async (sessionId) => {
                try {
                    const auth = await waGateway.authenticate(sessionId, gatewayPassword);
                    if (auth.status && auth.data?.token) {
                        waGateway.setSessionToken(sessionId, auth.data.token);
                    }
                } catch (err) {
                    // Silent fail or low-level warn is fine here, will be retried by refresh logic
                }
            }));
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
    
    return allSessionIds.map(id => {
        const session = sessions.get(id);
        return {
            sessionId: id,
            status: session?.status || 'UNKNOWN',
            qr: session?.qr || null
        };
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
        const token = sessionTokens.get(sessionId);
        waGateway.setSessionToken(sessionId, token);
        
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
    cookie: {
        secure: isProd,
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000
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
    session.status = data.status === 'connected' ? 'CONNECTED' :
        data.status === 'disconnected' ? 'DISCONNECTED' :
        data.status === 'logged_out' ? 'LOGGED_OUT' : 'UNKNOWN';
    session.qr = null;
    // Ensure sock exists
    if (!session.sock) {
        session.sock = createCompatSocket(sessionId);
    }
    sessions.set(sessionId, session);
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
            await db.ensureUserInvitesTable();
            await db.ensureSystemSettingsTable();
            await db.ensureUserPhoneColumn();
            await db.ensureInvitePhoneColumn();
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
                for (const [sessionId, token] of sessionTokens.entries()) {
                    try {
                        // Ensure token is set
                        waGateway.setSessionToken(sessionId, token);
                        
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
                        } else if (response.message?.includes('Reconnected')) {
                            session.status = 'CONNECTED';
                            session.qr = null;
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
