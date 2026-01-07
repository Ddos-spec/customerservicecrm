const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason,
    useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { createClient } = require('redis');
const useRedisAuthState = require('./redis-auth');
const { initializeApi, getWebhookUrl } = require('./api_v1');
const { router: authRouter, ensureSuperAdmin } = require('./auth');
const db = require('./db');
const n8nRouter = require('./n8n-api');
require('dotenv').config();
const session = require('express-session');
const PhonePairing = require('./phone-pairing');
const { RedisStore } = require('connect-redis');
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const logger = pino({
    level: isProd ? 'warn' : 'info',
    transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } }
});
const phonePairing = new PhonePairing((msg) => logger.info(`[Pairing] ${msg}`));

// Memory management - schedule GC if available
const scheduleGC = () => {
    if (global.gc) {
        setInterval(() => {
            global.gc();
            logger.debug('Manual GC executed');
        }, 60000); // Every minute
    }
};
scheduleGC();

// Trust proxy is required for express-rate-limit to work behind Easypanel/Nginx
app.set('trust proxy', 1);

// --- SECURITY ---
const requiredEnvVars = ['SESSION_SECRET', 'ENCRYPTION_KEY'];
if (requiredEnvVars.some(k => !process.env[k])) {
    console.error('❌ Missing Env Vars');
    process.exit(1);
}

// --- CORS (untuk cross-domain frontend) ---
const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000']
    : true; // Allow all in dev

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const redisSessionClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

// Connect Redis clients
(async () => {
    try {
        await redisClient.connect();
        await redisSessionClient.connect();
        console.log('✅ Redis connected');
    } catch (err) {
        console.error('❌ Redis connection error:', err.message);
    }
})();

const sessions = new Map();
const sessionTokens = new Map();

// --- Controls ---
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTED_TOKENS_FILE = path.join(__dirname, 'session_tokens.enc');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function ensureSessionQueueState(sessionId) {
    if (!sessions.has(sessionId)) sessions.set(sessionId, { queue: [], processing: false });
    return sessions.get(sessionId);
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

async function validateWhatsAppRecipient(sock, destination) {
    const lookup = await sock.onWhatsApp(destination);
    if (!lookup || !lookup[0]?.exists) throw new Error('Not found');
    return lookup[0];
}

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

async function acquireSessionLock(sessionId) {
    await redisClient.set(`wa:lock:${sessionId}`, 'locked', { EX: 60 });
    return true;
}

async function releaseSessionLock(sessionId) {
    await redisClient.del(`wa:lock:${sessionId}`);
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
    fs.writeFileSync(ENCRYPTED_TOKENS_FILE, encrypt(JSON.stringify(Object.fromEntries(sessionTokens))), 'utf-8');
}

function loadTokens() {
    if (fs.existsSync(ENCRYPTED_TOKENS_FILE)) {
        const tokens = JSON.parse(decrypt(fs.readFileSync(ENCRYPTED_TOKENS_FILE, 'utf-8')));
        for (const [k, v] of Object.entries(tokens)) sessionTokens.set(k, v);
    }
}

app.use(bodyParser.json());

// Helmet dengan config untuk CORS
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
}));
// Session config untuk cross-domain (Vercel frontend + Easypanel backend)
app.use(session({
    store: new RedisStore({ client: redisSessionClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProd, // HTTPS only in production
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax', // 'none' untuk cross-domain
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Health check endpoints (no auth required)
app.get('/', (req, res) => res.json({ status: 'online', message: 'WA Gateway Engine is running', version: '1.0.0' }));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

async function saveSessionSettings(sessionId, settings) {
    await redisClient.set(`wa:settings:${sessionId}`, JSON.stringify(settings));
}

async function postToWebhook(data) {
    const url = await getWebhookUrl(data.sessionId);
    if (url) axios.post(url, data).catch(() => {});
}

async function postToTenantWebhooks(data) {
    try {
        if (!data || !data.sessionId) return;
        const tenant = await db.getTenantBySessionId(data.sessionId);
        if (!tenant) return;
        const webhooks = await db.getTenantWebhooks(tenant.id);
        if (!webhooks.length) return;

        const payload = { ...data, tenant_id: tenant.id, tenant_name: tenant.company_name };
        await Promise.allSettled(
            webhooks.map((wh) => axios.post(wh.url, payload, { timeout: 5000 }))
        );
    } catch (error) {
        logger.warn(`Webhook dispatch failed: ${error.message}`);
    }
}

function getSessionsDetails() {
    return Array.from(sessions.values()).map(s => ({ sessionId: s.sessionId, status: s.status, qr: s.qr }));
}

async function connectToWhatsApp(sessionId, retryCount = 0) {
    const maxRetries = 5;
    const retryDelay = Math.min(5000 * Math.pow(2, retryCount), 60000); // Exponential backoff, max 60s

    try {
        // Cleanup existing session if any
        const existingSession = sessions.get(sessionId);
        if (existingSession?.sock) {
            try {
                existingSession.sock.ev.removeAllListeners();
                existingSession.sock.ws?.close();
            } catch (e) {
                logger.warn(`Cleanup error for ${sessionId}: ${e.message}`);
            }
        }

        const { state, saveCreds } = await useRedisAuthState(redisClient, sessionId);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            logger,
            browser: Browsers.macOS('Chrome'),
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            retryRequestDelayMs: 250,
            connectTimeoutMs: 60000,
            qrTimeout: 60000,
            defaultQueryTimeoutMs: 60000,
            emitOwnEvents: false,
            fireInitQueries: true,
        });

        // Event handlers
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update;
            const session = sessions.get(sessionId) || { sessionId };

            if (qr) {
                session.qr = qr;
                session.status = 'CONNECTING';
                logger.info(`QR generated for session: ${sessionId}`);
            }

            if (connection === 'open') {
                session.status = 'CONNECTED';
                session.qr = null;
                session.retryCount = 0;
                logger.info(`Session connected: ${sessionId}`);
            }

            if (connection === 'close') {
                session.status = 'DISCONNECTED';
                session.qr = null;

                const statusCode = (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output?.statusCode
                    : 500;

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                logger.warn(`Session ${sessionId} disconnected. StatusCode: ${statusCode}, Reconnect: ${shouldReconnect}`);

                if (shouldReconnect && retryCount < maxRetries) {
                    logger.info(`Reconnecting ${sessionId} in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                    setTimeout(() => connectToWhatsApp(sessionId, retryCount + 1), retryDelay);
                } else if (!shouldReconnect) {
                    logger.info(`Session ${sessionId} logged out, clearing auth state`);
                    await releaseSessionLock(sessionId);
                    sessions.delete(sessionId);
                }
            }

            sessions.set(sessionId, { ...session, sock });
            broadcastSessionUpdate();
        });

        // Memory cleanup: limit message store
        sock.ev.on('messages.upsert', (upsert) => {
            // No-op, just prevent default buffering
            void postToTenantWebhooks({
                event: 'messages.upsert',
                sessionId,
                data: upsert
            });
        });

        sessions.set(sessionId, { sessionId, sock, status: 'CONNECTING', qr: null });

    } catch (error) {
        logger.error(`Error connecting session ${sessionId}: ${error.message}`);
        if (retryCount < maxRetries) {
            setTimeout(() => connectToWhatsApp(sessionId, retryCount + 1), retryDelay);
        }
    }
}

function broadcastSessionUpdate() {
    const data = JSON.stringify({ type: 'session-update', data: getSessionsDetails() });
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
            client.send(data);
        }
    });
}

async function createSession(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    sessionTokens.set(sessionId, token);
    saveTokens();
    await acquireSessionLock(sessionId);
    connectToWhatsApp(sessionId);
    return { token };
}

async function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session?.sock) {
        try {
            // Remove all event listeners first
            session.sock.ev.removeAllListeners();
            // Then logout
            await session.sock.logout();
        } catch (error) {
            logger.warn(`Error during session ${sessionId} logout: ${error.message}`);
        }
    }
    sessions.delete(sessionId);
    sessionTokens.delete(sessionId);
    saveTokens();
    await releaseSessionLock(sessionId);
    // Clear session data from Redis
    await redisClient.del(`wa:contacts:${sessionId}`);
    await redisClient.del(`wa:settings:${sessionId}`);
    logger.info(`Session ${sessionId} deleted and cleaned up`);
}

async function regenerateSessionToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    sessionTokens.set(sessionId, token);
    saveTokens();
    return token;
}

// Admin authentication routes (MUST be before WhatsApp API to avoid token validation)
app.use('/api/v1/admin', authRouter);

// n8n integration routes
app.use('/api/v1/n8n', n8nRouter);

// WhatsApp API routes (has validateToken middleware)
app.use('/api/v1', initializeApi(sessions, sessionTokens, createSession, getSessionsDetails, deleteSession, console.log, phonePairing, saveSessionSettings, regenerateSessionToken, redisClient, scheduleMessageSend, validateWhatsAppRecipient, getSessionContacts, upsertSessionContact, removeSessionContact, postToWebhook));

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    loadTokens();

    try {
        await db.ensureTenantWebhooksTable();
        await db.ensureTenantSessionColumn();
    } catch (err) {
        console.error('Webhook table check failed:', err.message);
    }

    // Ensure super admin exists (from ENV)
    try {
        await ensureSuperAdmin();
    } catch (err) {
        console.error('❌ Super admin check failed:', err.message);
    }

    console.log(`🚀 Gateway Engine running on port ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);

    // Close all WebSocket connections
    wss.clients.forEach(client => client.close());

    // Cleanup all WhatsApp sessions
    for (const [sessionId, session] of sessions) {
        if (session?.sock) {
            try {
                session.sock.ev.removeAllListeners();
                await session.sock.ws?.close();
            } catch (e) {
                logger.warn(`Error closing session ${sessionId}: ${e.message}`);
            }
        }
    }
    sessions.clear();

    // Close Redis connections
    await redisClient.quit();
    await redisSessionClient.quit();

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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
