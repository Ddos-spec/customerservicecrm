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
const { buildSyncRouter } = require('./routes/sync'); // Import Sync Router
const { buildMarketingRouter } = require('./routes/marketing');
const metaWebhookRouter = require('./routes/webhook-meta'); // Import Meta Webhook
const waGateway = require('./wa-gateway-client');

const router = express.Router();
const MAX_MESSAGES_PER_BATCH = parseInt(process.env.MAX_MESSAGES_PER_BATCH || '50', 10);
const INTERNAL_RATE_LIMIT_PER_HOUR = parseInt(process.env.INTERNAL_RATE_LIMIT_PER_HOUR || '100', 10);
const INTERNAL_REPLY_WINDOW_HOURS = parseInt(process.env.INTERNAL_REPLY_WINDOW_HOURS || '24', 10);
const DISABLE_PUBLIC_MESSAGES = process.env.DISABLE_PUBLIC_MESSAGES === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.ALLOW_PUBLIC_MESSAGES !== 'true');

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
    scheduleMessageSend,
    validateWhatsAppRecipient,
    getSessionContacts,
    refreshSession // New parameter
) {
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
        // trustProxy: true, // REMOVED: Managed globally via app.set('trust proxy', 1)
        standardHeaders: true,
        legacyHeaders: false
    });

    router.use(apiLimiter);

    // --- DATABASE V2 MIGRATION (NUKE & REBUILD SIMPLIFIED SCHEMA) ---
    router.get('/migrate-v2', async (req, res) => {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const logs = [];

            logs.push('🚀 Starting Migration to V2...');

            // 1. Drop Old Tables (In order of dependency)
            logs.push('Dropping old tables...');
            await client.query('DROP TABLE IF EXISTS public.conversation_events CASCADE');
            await client.query('DROP TABLE IF EXISTS public.conversations CASCADE');
            await client.query('DROP TABLE IF EXISTS public.contact_identifiers CASCADE');
            await client.query('DROP TABLE IF EXISTS public.messages CASCADE');
            await client.query('DROP TABLE IF EXISTS public.tickets CASCADE');
            await client.query('DROP TABLE IF EXISTS public.contacts CASCADE');
            await client.query('DROP TABLE IF EXISTS public.tenant_integrations CASCADE');
            await client.query('DROP TABLE IF EXISTS public.tenant_members CASCADE');

            // 2. Create New Tables (V2)
            logs.push('Creating new V2 tables...');

            // CONTACTS
            await client.query(`
                CREATE TABLE IF NOT EXISTS public.contacts (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
                    jid             TEXT NOT NULL,
                    phone_number    TEXT,
                    display_name    TEXT,
                    push_name       TEXT,
                    full_name       TEXT,
                    profile_pic_url TEXT,
                    is_business     BOOLEAN DEFAULT false,
                    about_status    TEXT,
                    created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
                    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
                    UNIQUE (tenant_id, jid)
                )
            `);
            await client.query('CREATE INDEX IF NOT EXISTS idx_contacts_tenant_jid ON public.contacts (tenant_id, jid)');

            // CHATS
            await client.query(`
                CREATE TABLE IF NOT EXISTS public.chats (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
                    contact_id      UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
                    assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
                    status          VARCHAR(20) DEFAULT 'open',
                    unread_count    INT DEFAULT 0,
                    last_message_preview TEXT,
                    last_message_time    TIMESTAMP WITH TIME ZONE DEFAULT now(),
                    last_message_type    VARCHAR(20) DEFAULT 'text',
                    created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
                    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
                    UNIQUE (tenant_id, contact_id)
                )
            `);
            await client.query('CREATE INDEX IF NOT EXISTS idx_chats_tenant_updated ON public.chats (tenant_id, updated_at DESC)');

            // MESSAGES
            await client.query(`
                CREATE TABLE IF NOT EXISTS public.messages (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    chat_id         UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
                    sender_type     VARCHAR(20) NOT NULL,
                    sender_id       TEXT,
                    sender_name     TEXT,
                    message_type    VARCHAR(20) DEFAULT 'text',
                    body            TEXT,
                    media_url       TEXT,
                    wa_message_id   TEXT,
                    is_from_me      BOOLEAN DEFAULT false,
                    status          VARCHAR(20) DEFAULT 'sent',
                    created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
                )
            `);
            await client.query('CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON public.messages (chat_id, created_at ASC)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON public.messages (wa_message_id)');

            // 3. Normalize Session IDs in existing Tenants/Users (Just in case)
            logs.push('Normalizing session IDs...');
            await client.query(`
                UPDATE tenants 
                SET session_id = '62' || SUBSTRING(REPLACE(session_id, ' ', '') FROM 2)
                WHERE session_id LIKE '0%'
            `);
            await client.query(`
                UPDATE users 
                SET session_id = '62' || SUBSTRING(REPLACE(session_id, ' ', '') FROM 2)
                WHERE session_id LIKE '0%'
            `);

            await client.query('COMMIT');
            logs.push('✅ Migration V2 Successful!');
            res.json({ status: 'success', logs });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ status: 'error', message: error.message });
        } finally {
            client.release();
        }
    });

    router.use(buildSessionsRouter(sharedDeps));

    // Move Chat Router UP to verify isolation
    router.use(buildChatRouter({ sessions, formatPhoneNumber, validateToken, db }));

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
    // router.use(buildChatRouter({ sessions, formatPhoneNumber, validateToken, db })); // Moved up
    router.use(buildProfileRouter({ validateToken }));
    router.use(buildPresenceRouter({ validateToken }));
    router.use(buildChannelsRouter({ validateToken }));
    router.use(buildContactsRouter({ sessions, formatPhoneNumber, validateToken, waGateway, db }));
    router.use('/sync', buildSyncRouter({ waGateway, db, validateToken })); // Mount Sync Router
    router.use('/webhook/meta', metaWebhookRouter); // Mount Meta Webhook
    router.use('/marketing', buildMarketingRouter({ db, validateToken }));
    router.use(buildSearchRouter({ validateToken }));

    return router;
}

module.exports = { initializeApi };
