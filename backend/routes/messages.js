const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit'); // Security Fix High #12

// Security Fix High #12: Per-user rate limiter for sending messages
const sendMessageLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 1000, // Limit each IP to 1000 messages per hour (adjust as needed)
    message: { status: 'error', message: 'Too many messages sent, please try again later.' },
    keyGenerator: (req) => req.session?.user?.id ? `msg_limit_${req.session.user.id}` : req.ip // Limit by User ID if logged in
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
    } = deps;
    const unsupportedTypes = new Set(['button', 'list', 'template', 'contacts']);

    router.post('/internal/messages', sendMessageLimiter, async (req, res) => {
        const user = req.session?.user;
        if (!user) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        if (!['admin_agent', 'agent'].includes(user.role)) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }

        const rawPhone = (req.body?.phone || req.body?.to || '').toString().trim();
        const messageText = (req.body?.message_text || req.body?.text || '').toString().trim();
        const ticketId = (req.body?.ticket_id || req.body?.ticketId || '').toString().trim();

        if (!rawPhone) return res.status(400).json({ status: 'error', message: 'Nomor tujuan wajib diisi' });
        if (!messageText) return res.status(400).json({ status: 'error', message: 'Pesan tidak boleh kosong' });
        if (!ticketId) return res.status(400).json({ status: 'error', message: 'ticket_id wajib diisi' });
        if (!isValidPhoneNumber(rawPhone)) return res.status(400).json({ status: 'error', message: 'Format nomor tidak valid' });
        if (messageText.length > 4096) return res.status(400).json({ status: 'error', message: 'Pesan terlalu panjang' });

        try {
            const formattedPhone = formatPhoneNumber(rawPhone);
            const destination = toWhatsAppFormat(formattedPhone);

            // 1. Get or Create Chat Room
            let sessionId = user.tenant_session_id || null;
            if (user.tenant_id && !sessionId) {
                const tenant = await db.getTenantById(user.tenant_id);
                sessionId = tenant?.session_id;
            }

            if (!sessionId) return res.status(400).json({ status: 'error', message: 'Session WA belum diatur' });

            const chat = await db.getOrCreateChat(user.tenant_id, destination);

            // Internal Rate Limit (Tenant level)
            // (Optional: can be re-implemented for Chats if needed)

            const session = sessions.get(sessionId);
            if (!session || !session.sock || session.status !== 'CONNECTED') {
                return res.status(409).json({ status: 'error', message: 'WhatsApp Offline' });
            }

            // Send to WhatsApp
            const result = await scheduleMessageSend(sessionId, async () => {
                const activeSession = sessions.get(sessionId);
                if (!activeSession?.sock) throw new Error('Session disconnected');
                
                await activeSession.sock.sendPresenceUpdate('composing', destination);
                await new Promise(r => setTimeout(r, 500)); // Humanize
                
                const sendResult = await activeSession.sock.sendMessage(destination, { text: messageText });
                
                await activeSession.sock.sendPresenceUpdate('paused', destination);
                return { status: 'success', messageId: sendResult?.key?.id };
            });

            if (!result || result.status !== 'success') {
                throw new Error(result?.message || 'Gagal mengirim pesan ke gateway');
            }

            // AUTO-SAVE to Database (V2)
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
                db_message: savedMsg
            });

        } catch (error) {
            console.error('[Internal Message Error]', error);
            // Security Fix High #11: Sanitize error message
            const clientMessage = error.message.includes('Session') ? error.message : 'Terjadi kesalahan sistem saat mengirim pesan';
            return res.status(503).json({ status: 'error', message: clientMessage });
        }
    });

    router.use(validateToken);

    const sendMessage = async (sock, to, message) => {
        try {
            const targetJid = to;
            const result = await sock.sendMessage(targetJid, message);
            return { status: 'success', message: `Message sent to ${to}`, messageId: result.key.id };
        } catch (error) {
            return { status: 'error', message: `Failed to send message to ${to}. Reason: ${error.message}` };
        }
    };

    const handleSendMessage = async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, query: req.query });

        if (DISABLE_PUBLIC_MESSAGES) {
            return res.status(403).json({
                status: 'error',
                message: 'Endpoint /api/v1/messages dinonaktifkan. Gunakan /internal/messages via dashboard.'
            });
        }

        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        if (!sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId could not be determined', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId is required (in query, body, or implied by token)' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            log('API error', 'SYSTEM', { event: 'api-error', error: `Session ${sessionId} not found or not connected.`, endpoint: req.originalUrl });
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        const messages = sanitizeBatchMessages(req.body).filter((msg) => msg && typeof msg === 'object');

        if (messages.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No message payload provided.' });
        }
        if (messages.length > MAX_MESSAGES_PER_BATCH) {
            return res.status(400).json({
                status: 'error',
                message: `Batch limit exceeded. Max ${MAX_MESSAGES_PER_BATCH} messages per request.`
            });
        }

        const responseSlots = [];
        const phoneNumbers = [];
        const messageContents = [];

        for (const rawMessage of messages) {
            const msg = { ...rawMessage };
            const envelopeErrors = validateMessageEnvelope(msg);
            if (envelopeErrors.length) {
                responseSlots.push(Promise.resolve({ status: 'error', message: envelopeErrors[0] }));
                continue;
            }

            const { recipient_type, to, type } = msg;
            if (unsupportedTypes.has(type)) {
                responseSlots.push(Promise.resolve({
                    status: 'error',
                    message: `Tipe pesan "${type}" belum didukung di gateway Go.`
                }));
                continue;
            }
            let destinationMeta;
            try {
                destinationMeta = normalizeDestination(to, recipient_type);
            } catch (error) {
                responseSlots.push(Promise.resolve({ status: 'error', message: error.message }));
                continue;
            }
            const { isGroup, destination } = destinationMeta;

            if (type === 'image' && msg.image) {
                try {
                    validateMediaIdOrLink(msg.image);
                } catch (err) {
                    responseSlots.push(Promise.resolve({ status: 'error', message: err.message }));
                    continue;
                }
            }
            if (type === 'document' && msg.document) {
                try {
                    validateMediaIdOrLink(msg.document);
                } catch (err) {
                    responseSlots.push(Promise.resolve({ status: 'error', message: err.message }));
                    continue;
                }
            }

            let messagePayload;
            try {
                messagePayload = mapMessagePayload({ ...msg, to: destination });
            } catch (error) {
                responseSlots.push(Promise.resolve({ status: 'error', message: `Failed to prepare message for ${to}: ${error.message}` }));
                continue;
            }

            if (!isGroup) {
                try {
                    await validateWhatsAppRecipient(sessionId, destination);
                } catch (error) {
                    responseSlots.push(Promise.resolve({
                        status: 'error',
                        message: `Nomor ${to} tidak terdaftar di WhatsApp.`
                    }));
                    continue;
                }
            }

            phoneNumbers.push(to);
            messageContents.push({ type, to });

            const sendPromise = scheduleMessageSend(sessionId, async () => {
                const targetSession = sessions.get(sessionId);
                if (!targetSession || !targetSession.sock || targetSession.status !== 'CONNECTED') {
                    throw new Error('Session tidak tersedia saat pengiriman berlangsung.');
                }
                await targetSession.sock.sendPresenceUpdate('composing', destination);
                const typingDelay = Math.floor(Math.random() * 1000) + 500;
                await new Promise((resolve) => setTimeout(resolve, typingDelay));
                const result = await sendMessage(targetSession.sock, destination, messagePayload);
                await targetSession.sock.sendPresenceUpdate('paused', destination);
                return result;
            }).catch((error) => ({
                status: 'error',
                message: `Failed to process message for ${to}: ${error.message}`
            }));

            responseSlots.push(sendPromise);
        }

        const resolvedResults = await Promise.all(responseSlots);
        log('Messages sent', sessionId, {
            event: 'messages-sent',
            sessionId,
            count: resolvedResults.length,
            phoneNumbers,
            messages: messageContents
        });
        res.status(200).json(resolvedResults);
    };

    router.post('/messages', handleSendMessage);
    router.post('/', handleSendMessage);

    router.delete('/message', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { sessionId, messageId, remoteJid } = req.body;

        if (!sessionId || !messageId || !remoteJid) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId, messageId, and remoteJid are required.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId, messageId, and remoteJid are required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            log('API error', 'SYSTEM', { event: 'api-error', error: `Session ${sessionId} not found or not connected.`, endpoint: req.originalUrl });
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            await session.sock.sendMessage(remoteJid, { delete: { id: messageId } });

            log('Message deleted', sessionId, { event: 'message-deleted', messageId, remoteJid });
            res.status(200).json({ status: 'success', message: `Message ${messageId} deleted.` });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to delete message: ${error.message}` });
        }
    });

    router.post('/reply', async (req, res) => {
        return res.status(501).json({
            status: 'error',
            message: 'Fitur reply belum didukung di gateway Go.'
        });
    });

    router.post('/mention', async (req, res) => {
        return res.status(501).json({
            status: 'error',
            message: 'Fitur mention belum didukung di gateway Go.'
        });
    });

    router.post('/link-preview', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { to, text, title, description, thumbnailUrl } = req.body;

        if (!to || !text) {
            return res.status(400).json({
                status: 'error',
                message: 'to and text are required.'
            });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            const destination = to.includes('@') ? to : `${formatPhoneNumber(to)}@s.whatsapp.net`;
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            const matchedUrl = urlMatch ? urlMatch[0] : null;

            const messagePayload = {
                text,
                linkPreview: title && matchedUrl ? {
                    title: title,
                    description: description || '',
                    canonicalUrl: matchedUrl,
                    matchedText: matchedUrl,
                    thumbnailUrl: thumbnailUrl
                } : undefined
            };

            const result = await session.sock.sendMessage(destination, messagePayload);

            res.status(200).json({
                status: 'success',
                message: 'Message sent',
                messageId: result.key.id
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    const unsupportedMessageFeature = (message) => (req, res) => {
        res.status(501).json({ status: 'error', message });
    };

    router.post('/broadcast', unsupportedMessageFeature('Broadcast belum didukung di gateway Go. Gunakan /messages batch.'));
    router.post('/forward', unsupportedMessageFeature('Forward pesan belum didukung di gateway Go.'));
    router.post('/star', unsupportedMessageFeature('Star pesan belum didukung di gateway Go.'));

    return router;
}

module.exports = { buildMessagesRouter };
