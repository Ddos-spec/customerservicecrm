const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
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
require('dotenv').config();
const session = require('express-session');
const PhonePairing = require('./phone-pairing');
const RedisStore = require('connect-redis').default;
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const logger = pino({ level: 'info' });
const phonePairing = new PhonePairing((msg) => console.log(`[Pairing] ${msg}`));

// --- SECURITY ---
const requiredEnvVars = ['SESSION_SECRET', 'ENCRYPTION_KEY'];
if (requiredEnvVars.some(k => !process.env[k])) {
    console.error('❌ Missing Env Vars');
    process.exit(1);
}

// --- CORS ---
app.use(cors({ origin: true, credentials: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const redisSessionClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379', legacyMode: true });

(async () => {
    await Promise.all([redisClient.connect(), redisSessionClient.connect()]);
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
app.use(helmet());
app.use(session({ store: new RedisStore({ client: redisSessionClient }), secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));

app.get('/', (req, res) => res.json({ status: 'online', message: 'WA Gateway Engine is running', version: '1.0.0' }));

async function saveSessionSettings(sessionId, settings) {
    await redisClient.set(`wa:settings:${sessionId}`, JSON.stringify(settings));
}

async function postToWebhook(data) {
    const url = await getWebhookUrl(data.sessionId);
    if (url) axios.post(url, data).catch(() => {});
}

function getSessionsDetails() {
    return Array.from(sessions.values()).map(s => ({ sessionId: s.sessionId, status: s.status, qr: s.qr }));
}

async function connectToWhatsApp(sessionId) {
    const { state, saveCreds } = await useRedisAuthState(redisClient, sessionId);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, logger, browser: Browsers.macOS('Chrome') });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (up) => {
        const { connection, qr } = up;
        const session = sessions.get(sessionId) || {};
        if (qr) session.qr = qr;
        if (connection === 'open') session.status = 'CONNECTED';
        if (connection === 'close') {
            session.status = 'DISCONNECTED';
            setTimeout(() => connectToWhatsApp(sessionId), 5000);
        }
        sessions.set(sessionId, session);
        wss.clients.forEach(c => c.send(JSON.stringify({ type: 'session-update', data: getSessionsDetails() })));
    });
    sessions.set(sessionId, { ...(sessions.get(sessionId) || {}), sessionId, sock });
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
    const s = sessions.get(sessionId);
    if (s?.sock) await s.sock.logout();
    sessions.delete(sessionId);
    sessionTokens.delete(sessionId);
    saveTokens();
    await releaseSessionLock(sessionId);
}

async function regenerateSessionToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    sessionTokens.set(sessionId, token);
    saveTokens();
    return token;
}

app.use('/api/v1', initializeApi(sessions, sessionTokens, createSession, getSessionsDetails, deleteSession, console.log, phonePairing, saveSessionSettings, regenerateSessionToken, redisClient, scheduleMessageSend, validateWhatsAppRecipient, getSessionContacts, upsertSessionContact, removeSessionContact, postToWebhook));

server.listen(process.env.PORT || 3000, () => {
    loadTokens();
    console.log('🚀 Gateway Engine Headless running');
});
