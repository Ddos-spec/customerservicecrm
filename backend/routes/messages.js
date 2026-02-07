const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const ProviderFactory = require('../services/whatsapp/factory');
const WhatsmeowDriver = require('../services/whatsapp/drivers/whatsmeow');

// Security Fix High #12: Per-user rate limiter for sending messages
const sendMessageLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000,
    message: { status: 'error', message: 'Too many messages sent, please try again later.' },
    keyGenerator: (req) => req.session?.user?.id ? `msg_limit_${req.session.user.id}` : req.ip
});

const externalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute per API Key
    message: { status: 'error', message: 'Rate limit exceeded. Max 60 RPM.' },
    keyGenerator: (req) => {
        const header = req.headers['x-tenant-key'];
        return Array.isArray(header) ? header[0] : (header || req.ip);
    }
});

function buildMessagesRouter(deps) {
    const router = express.Router();
    const {
        sessions,
        log,
        db,
        scheduleMessageSend,
        validateWhatsAppRecipient,
        MAX_MESSAGES_PER_BATCH,
        DISABLE_PUBLIC_MESSAGES,
        formatPhoneNumber,
        toWhatsAppFormat,
        isValidPhoneNumber,
        mapMessagePayload,
        sanitizeBatchMessages,
        validateMessageEnvelope,
        normalizeDestination,
        validateMediaIdOrLink,
    } = deps;
    const unsupportedTypes = new Set(['button', 'list', 'template', 'contacts']);

    // Helper to send message using provider logic
    async function sendMessageViaProvider(tenant, to, text, isGroup = false) {
        // 1. Get Provider
        const provider = ProviderFactory.getProvider(tenant);
        
        console.log(`[Messages] Sending via ${tenant.wa_provider || 'whatsmeow'} for Tenant ${tenant.company_name} (Session: ${tenant.session_id}) to ${to}`);
        
        // 2. Determine Destination Format
        // Whatsmeow needs JID (6281...@s.whatsapp.net), Meta needs Phone (6281...)
        let destination = to;
        if (provider instanceof WhatsmeowDriver) {
             // For Whatsmeow (Go Gateway):
             // 1. If 'to' already has '@' (e.g. valid JID like ...@s.whatsapp.net or ...@g.us), use it AS-IS.
             // 2. If 'to' is just numbers, format it (628...) and let Gateway handle suffix.
             if (to.includes('@')) {
                 destination = to;
             } else {
                 destination = formatPhoneNumber(to);
             }
        } else {
             // Meta Cloud API: usually expects country code + phone without +
             if (isGroup || to.includes('@g.us')) {
                 throw new Error('Meta Provider does not support Group Messages');
             }
             destination = formatPhoneNumber(to);
        }

        // 3. Send
        let result;
        if (provider instanceof WhatsmeowDriver) {
            // Use legacy queue for Whatsmeow
            const sessionId = tenant.session_id;
            const session = sessions.get(sessionId);
            
            if (!session || session.status !== 'CONNECTED') {
                throw new Error('WhatsApp Offline');
            }

            result = await scheduleMessageSend(sessionId, async () => {
                // Ensure session is still valid inside queue
                const activeSession = sessions.get(sessionId);
                if (!activeSession?.sock) throw new Error('WhatsApp disconnected');
                
                // Use provider (which wraps legacy logic)
                // Note: Provider methods might need updating to accept raw socket if we want full decouple,
                // but currently WhatsmeowDriver uses legacyClient global.
                // To keep 'composing' status, we might need to do it here manually for now 
                // or move it into driver. 
                // For this phase, let's keep it simple: 
                // The driver calls legacyClient which handles axios call to Go Gateway.
                // Go Gateway handles socket.
                
                await activeSession.sock.sendPresenceUpdate('composing', destination);
                await new Promise(r => setTimeout(r, 500));
                
                const response = await provider.sendText(destination, text);
                
                await activeSession.sock.sendPresenceUpdate('paused', destination);
                return response; 
            });
            
            // Result from scheduleMessageSend is the return value of callback
            // Provider returns { messageId, raw }
            return { messageId: result.messageId, provider: 'whatsmeow' };

        } else {
            // Direct send for Meta (Official API handles high concurrency)
            result = await provider.sendText(destination, text);
            return { messageId: result.messageId, provider: 'meta' };
        }
    }

    async function handleExternalSend(req, res) {
        const apiKeyHeader = req.headers['x-tenant-key'];
        const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
        const sanitizedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
        if (!sanitizedKey) {
            return res.status(401).json({ status: 'error', message: 'Missing X-Tenant-Key header' });
        }

        try {
            const tenant = await db.getTenantByApiKey(sanitizedKey);
            if (!tenant) return res.status(401).json({ status: 'error', message: 'Invalid API Key' });
            if (tenant.status !== 'active') return res.status(403).json({ status: 'error', message: 'Tenant is not active' });

            const rawPhone = (req.body.phone || req.body.to || '').toString().trim();
            const messageText = (req.body.message || req.body.text || '').toString().trim();

            if (!rawPhone || !messageText) {
                return res.status(400).json({ status: 'error', message: 'phone and message are required' });
            }

            // DEBUG TRACE
            console.log(`[DEBUG-TRACE] External Send:
              - API Key: ${sanitizedKey.substring(0, 10)}...
              - Tenant: ${tenant.company_name} (Session: ${tenant.session_id})
              - Target Phone: ${rawPhone}
              - Msg: ${messageText.substring(0, 15)}...
            `);

            // Send via Provider
            const result = await sendMessageViaProvider(tenant, rawPhone, messageText, false);

            // Log to DB
            const destination = toWhatsAppFormat(formatPhoneNumber(rawPhone)); // Standardize for DB
            const chat = await db.getOrCreateChat(tenant.id, destination, rawPhone, false);
            const savedMsg = await db.logMessage({
                chatId: chat.id,
                senderType: 'system',
                senderId: null, 
                senderName: 'API System',
                messageType: 'text',
                body: messageText,
                waMessageId: result.messageId,
                isFromMe: true
            });

            res.json({ 
                status: 'success', 
                messageId: result.messageId,
                provider: result.provider,
                data: savedMsg
            });

        } catch (error) {
            console.error('[External Message API]', error);
            let message = error.message;
            if (message.includes('status code 500')) {
                message += '. Check if the WhatsApp session is connected and the Gateway is healthy.';
            }
            res.status(500).json({ status: 'error', message });
        }
    }

    /**
     * POST /api/v1/messages/external
     * Public endpoint to send message using Tenant API Key
     * Header: X-Tenant-Key: sk_...
     */
    router.post('/messages/external', externalApiLimiter, handleExternalSend);

    // Backward-compatible alias (if any clients used /external)
    router.post('/external', externalApiLimiter, handleExternalSend);

    /**
     * POST /internal/messages
     * Internal endpoint for Agent Dashboard
     */
    router.post('/internal/messages', sendMessageLimiter, async (req, res) => {
        const user = req.session?.user;
        if (!user) {
            return res.status(401).json({ status: 'error', code: 'SESSION_MISSING', message: 'Authentication required' });
        }
        if (!['admin_agent', 'agent'].includes(user.role)) {
            return res.status(403).json({ status: 'error', code: 'ROLE_DENIED', message: 'Access denied' });
        }

        const rawPhone = (req.body?.phone || req.body?.to || '').toString().trim();
        const messageText = (req.body?.message_text || req.body?.text || '').toString().trim();
        const chatId = (req.body?.chat_id || req.body?.chatId || '').toString().trim();
        const isGroup = req.body?.is_group === true || rawPhone.endsWith('@g.us');

        if (!rawPhone) return res.status(400).json({ status: 'error', message: 'Nomor tujuan wajib diisi' });
        if (!messageText) return res.status(400).json({ status: 'error', message: 'Pesan tidak boleh kosong' });
        
        try {
            // Get Tenant
            const tenant = await db.getTenantById(user.tenant_id);
            if (!tenant) return res.status(404).json({ status: 'error', message: 'Tenant not found' });

            // Send via Provider
            const result = await sendMessageViaProvider(tenant, rawPhone, messageText, isGroup);

            // DB Logging
            let chat = null;
            if (chatId) {
                const chatRes = await db.query('SELECT * FROM chats WHERE id = $1', [chatId]);
                chat = chatRes.rows[0];
            }
            if (!chat) {
                const destination = isGroup ? rawPhone : toWhatsAppFormat(formatPhoneNumber(rawPhone));
                chat = await db.getOrCreateChat(tenant.id, destination, null, isGroup);
            }

            const savedMsg = await db.logMessage({
                chatId: chat.id,
                senderType: 'agent',
                senderId: user.id,
                senderName: user.name,
                messageType: 'text',
                body: messageText,
                waMessageId: result.messageId,
                isFromMe: true
            });

            return res.status(200).json({ 
                status: 'success', 
                messageId: result.messageId,
                provider: result.provider,
                db_message: savedMsg
            });

        } catch (error) {
            console.error('[Internal Message Error]', error);
            const clientMessage = error.message.includes('Session') || error.message.includes('Offline') 
                ? error.message 
                : 'Terjadi kesalahan sistem saat mengirim pesan';
            return res.status(503).json({ status: 'error', message: clientMessage });
        }
    });

    return router;
}

module.exports = { buildMessagesRouter };
