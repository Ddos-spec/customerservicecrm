const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { formatPhoneNumber, toWhatsAppFormat, isValidPhoneNumber } = require('./phone-utils');
const db = require('./db');
const { buildTokenValidator } = require('./utils/auth');
const { mapMessagePayload } = require('./utils/payload-map');
const {
    sanitizeBatchMessages,
    validateMessageEnvelope,
    normalizeDestination,
    validateMediaIdOrLink,
} = require('./utils/validation');
const { buildSessionsRouter } = require('./routes/sessions');
const { buildMediaRouter } = require('./routes/media');
const { buildMessagesRouter } = require('./routes/messages');
const { buildGroupsRouter } = require('./routes/groups');
const { buildChatRouter } = require('./routes/chat');
const { buildProfileRouter } = require('./routes/profile');
const { buildPresenceRouter } = require('./routes/presence');
const { buildChannelsRouter } = require('./routes/channels');
const { buildContactsRouter } = require('./routes/contacts');
const { buildSearchRouter } = require('./routes/search');

const router = express.Router();
const MAX_MESSAGES_PER_BATCH = parseInt(process.env.MAX_MESSAGES_PER_BATCH || '50', 10);
const INTERNAL_RATE_LIMIT_PER_HOUR = parseInt(process.env.INTERNAL_RATE_LIMIT_PER_HOUR || '100', 10);
const INTERNAL_REPLY_WINDOW_HOURS = parseInt(process.env.INTERNAL_REPLY_WINDOW_HOURS || '24', 10);
const DISABLE_PUBLIC_MESSAGES = process.env.DISABLE_PUBLIC_MESSAGES === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.ALLOW_PUBLIC_MESSAGES !== 'true');

let redisClient = null;
const webhookUrls = new Map();

function setRedisClient(client) {
    redisClient = client;
}

async function getWebhookUrl(sessionId) {
    if (redisClient) {
        try {
            const url = await redisClient.get(`webhook:url:${sessionId}`);
            if (url) return url;
        } catch (error) {
            console.error('Redis error in getWebhookUrl, falling back to in-memory:', error.message);
        }
    }
    return webhookUrls.get(sessionId) || process.env.WEBHOOK_URL || '';
}

async function setWebhookUrl(sessionId, url) {
    if (redisClient) {
        try {
            if (url) {
                await redisClient.setEx(`webhook:url:${sessionId}`, 86400 * 30, url);
            } else {
                await redisClient.del(`webhook:url:${sessionId}`);
            }
            return true;
        } catch (error) {
            console.error('Redis error in setWebhookUrl, falling back to in-memory:', error.message);
        }
    }
    if (url) {
        webhookUrls.set(sessionId, url);
    } else {
        webhookUrls.delete(sessionId);
    }
    return false;
}

async function deleteWebhookUrl(sessionId) {
    if (redisClient) {
        try {
            await redisClient.del(`webhook:url:${sessionId}`);
            return true;
        } catch (error) {
            console.error('Redis error in deleteWebhookUrl, falling back to in-memory:', error.message);
        }
    }
    webhookUrls.delete(sessionId);
    return false;
}

function initializeApi(
    sessions,
    sessionTokens,
    createSession,
    getSessionsDetails,
    deleteSession,
    log,
    phonePairing,
    saveSessionSettings,
    regenerateSessionToken,
    redisClientInstance,
    scheduleMessageSend,
    validateWhatsAppRecipient,
    getSessionContacts,
    refreshSession // New parameter
) {
    if (redisClientInstance) {
        setRedisClient(redisClientInstance);
    }

    const validateToken = buildTokenValidator(sessionTokens);

    const sharedDeps = {
        sessions,
        sessionTokens,
        createSession,
        getSessionsDetails,
        deleteSession,
        log,
        phonePairing,
        saveSessionSettings,
        regenerateSessionToken,
        setWebhookUrl,
        getWebhookUrl,
        deleteWebhookUrl,
        scheduleMessageSend,
        validateWhatsAppRecipient,
        validateToken,
        refreshSession // Add to deps
    };

    router.use(helmet());

    const apiLimiter = rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 100,
        message: { status: 'error', message: 'Too many requests, please try again later.' },
        skip: (req) => {
            return req.session && req.session.adminAuthed;
        },
        trustProxy: true,
        standardHeaders: true,
        legacyHeaders: false
    });

    router.use(apiLimiter);

    router.use(buildSessionsRouter(sharedDeps));

    router.use(buildMediaRouter({ log, validateToken }));
    router.use(buildMessagesRouter({
        sessions,
        log,
        db,
        scheduleMessageSend,
        validateWhatsAppRecipient,
        MAX_MESSAGES_PER_BATCH,
        INTERNAL_RATE_LIMIT_PER_HOUR,
        INTERNAL_REPLY_WINDOW_HOURS,
        DISABLE_PUBLIC_MESSAGES,
        formatPhoneNumber,
        toWhatsAppFormat,
        isValidPhoneNumber,
        mapMessagePayload,
        sanitizeBatchMessages,
        validateMessageEnvelope,
        normalizeDestination,
        validateMediaIdOrLink,
        validateToken,
    }));
    router.use(buildGroupsRouter({ sessions, validateToken }));
    router.use(buildChatRouter({ sessions, formatPhoneNumber, validateToken }));
    router.use(buildProfileRouter({ validateToken }));
    router.use(buildPresenceRouter({ validateToken }));
    router.use(buildChannelsRouter({ validateToken }));
    router.use(buildContactsRouter({ sessions, formatPhoneNumber, validateToken }));
    router.use(buildSearchRouter({ validateToken }));

    return router;
}

module.exports = { initializeApi, getWebhookUrl };
