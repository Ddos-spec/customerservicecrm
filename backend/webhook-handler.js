/**
 * Webhook Handler for Go WhatsApp Gateway
 *
 * This module handles incoming webhooks from the Go WhatsApp Gateway.
 * It processes messages, receipts, presence updates, and other events.
 */

const express = require('express');
const router = express.Router();
const db = require('./db');
const waGateway = require('./wa-gateway-client');
const ProviderFactory = require('./services/whatsapp/factory');
const { normalizeJid, getJidUser } = require('./utils/jid');
const { sendAlertWebhook } = require('./utils/alert-webhook');
const { buildSignedEphemeralMediaUrl } = require('./utils/ephemeral-media');
const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;

// Event handlers map (can be extended by other modules)
const eventHandlers = new Map();

// WebSocket server reference (will be set by index.js)
let wss = null;

const RAJA_BOT_WEBHOOK_URL = process.env.RAJA_BOT_WEBHOOK_URL || 'https://filter-bot-crmcutting.qk6yxt.easypanel.host/api/bot/raja-metal/incoming';
const DEFAULT_RAJA_GROUP_JIDS = [
    '120363039888626641@g.us', // WS Raja Metal Cutting
    '120363421578507033@g.us', // Tim service
];
const DEFAULT_RAJA_GROUP_NAMES = [
    'WS Raja Metal Cutting',
    'Tim service',
];
const parseRajaList = (value) => String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
const RAJA_GROUP_JIDS = Array.from(new Set([
    ...DEFAULT_RAJA_GROUP_JIDS.map((item) => item.toLowerCase()),
    ...parseRajaList(process.env.RAJA_BOT_GROUP_JIDS),
]));
const RAJA_GROUP_NAMES = Array.from(new Set([
    ...DEFAULT_RAJA_GROUP_NAMES.map((item) => item.toLowerCase()),
    ...parseRajaList(process.env.RAJA_BOT_GROUP_NAMES),
]));

function isRajaBotPayload(payload) {
    const chatJid = String(payload?.chatJid || '').toLowerCase();
    const chatName = String(payload?.chatName || '').trim().toLowerCase();
    const text = String(payload?.messageText || payload?.message?.body || payload?.message?.caption || '').trim();
    const isRajaGroup = RAJA_GROUP_JIDS.includes(chatJid) || RAJA_GROUP_NAMES.includes(chatName);
    if (!payload?.isGroup || !isRajaGroup) return false;
    if (/^#?RajaManager\b/i.test(text)) return false;

    // Let every real Raja group message reach the operations bot. Natural
    // language commands are handled/ignored by the CRM bot itself, while this
    // explicit bypass prevents generic tenant webhook filters from hiding group
    // messages and media from the manager/purchasing agent.
    return true;
}

async function forwardRajaBotMessage(payload) {
    if (!RAJA_BOT_WEBHOOK_URL || !isRajaBotPayload(payload)) return;
    const axios = require('axios');
    try {
        await axios.post(RAJA_BOT_WEBHOOK_URL, payload, {
            timeout: 8000,
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Source': 'customerservice-crm-raja-direct',
            },
        });
    } catch (error) {
        console.error('[Webhook] Failed forwarding Raja bot message:', error.message);
    }
}

const DEFAULT_WEBHOOK_EVENTS = {
    groups: true,
    private: true,
    self: false,
    image: true,
    video: true,
    audio: true,
    document: true
};
const UNKNOWN_SESSION_ALERT_TTL_MS = parseInt(process.env.UNKNOWN_SESSION_ALERT_TTL_MS || `${10 * 60 * 1000}`, 10);
const unknownSessionAlertCache = new Map();

function normalizeWebhookEvents(rawConfig) {
    const source = (rawConfig && typeof rawConfig === 'object') ? rawConfig : {};
    return {
        groups: typeof source.groups === 'boolean' ? source.groups : DEFAULT_WEBHOOK_EVENTS.groups,
        private: typeof source.private === 'boolean' ? source.private : DEFAULT_WEBHOOK_EVENTS.private,
        self: typeof source.self === 'boolean' ? source.self : DEFAULT_WEBHOOK_EVENTS.self,
        image: typeof source.image === 'boolean' ? source.image : DEFAULT_WEBHOOK_EVENTS.image,
        video: typeof source.video === 'boolean' ? source.video : DEFAULT_WEBHOOK_EVENTS.video,
        audio: typeof source.audio === 'boolean' ? source.audio : DEFAULT_WEBHOOK_EVENTS.audio,
        document: typeof source.document === 'boolean' ? source.document : DEFAULT_WEBHOOK_EVENTS.document,
    };
}

function isMessageTypeAllowed(messageType, webhookEvents) {
    const normalizedType = (messageType || '').toString().toLowerCase();
    if (normalizedType === 'image') return webhookEvents.image;
    if (normalizedType === 'video') return webhookEvents.video;
    if (normalizedType === 'audio') return webhookEvents.audio;
    if (normalizedType === 'document') return webhookEvents.document;
    return true;
}

function shouldAlertUnknownSession(sessionId) {
    const key = String(sessionId || '').trim();
    if (!key) return false;

    const now = Date.now();
    const lastAt = unknownSessionAlertCache.get(key) || 0;
    if (lastAt && now - lastAt < UNKNOWN_SESSION_ALERT_TTL_MS) return false;

    unknownSessionAlertCache.set(key, now);
    for (const [cachedKey, cachedAt] of unknownSessionAlertCache.entries()) {
        if (now - cachedAt > UNKNOWN_SESSION_ALERT_TTL_MS * 2) {
            unknownSessionAlertCache.delete(cachedKey);
        }
    }
    return true;
}

async function alertUnknownSessionMessage(sessionId, message) {
    if (!shouldAlertUnknownSession(sessionId)) return;

    await sendAlertWebhook('unknown_session_message', {
        session_id: sessionId,
        message_id: message?.id || null,
        message_type: message?.type || null,
        from: message?.from || null,
        to: message?.to || null,
        is_group: Boolean(message?.isGroup || message?.to?.endsWith?.('@g.us')),
        is_from_me: Boolean(message?.isFromMe),
        received_at: new Date().toISOString(),
        action: 'ignored_no_tenant_owner'
    });
}

function buildForwardableMedia(req, sessionId, message) {
    if (!req || !message || typeof message !== 'object') {
        return {
            forwardedMessage: message,
            publicMediaUrl: null,
        };
    }

    const mediaToken = typeof message.ephemeralMediaToken === 'string'
        ? message.ephemeralMediaToken.trim()
        : '';
    const expiresAt = message.ephemeralMediaExpiresAt || null;
    const publicMediaUrl = mediaToken
        ? buildSignedEphemeralMediaUrl(req, {
            sessionId,
            token: mediaToken,
            expiresAt,
        })
        : null;

    return {
        publicMediaUrl,
        forwardedMessage: {
            ...message,
            gatewayMediaUrl: message.mediaUrl || null,
            mediaUrl: publicMediaUrl || message.mediaUrl || null,
            ephemeralMediaUrl: publicMediaUrl || null,
            mediaAvailable: Boolean(publicMediaUrl),
        },
    };
}

/**
 * Set the WebSocket server for broadcasting
 */
function setWebSocketServer(websocketServer) {
    wss = websocketServer;
}

/**
 * Register an event handler
 * @param {string} event - Event type
 * @param {Function} handler - Handler function(sessionId, data)
 */
function on(event, handler) {
    if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
    }
    eventHandlers.get(event).push(handler);
}

/**
 * Emit an event to all registered handlers
 */
async function emit(event, sessionId, data) {
    const handlers = eventHandlers.get(event) || [];
    for (const handler of handlers) {
        try {
            await handler(sessionId, data);
        } catch (error) {
            console.error(`Error in ${event} handler:`, error);
        }
    }
}

/**
 * Broadcast to WebSocket clients
 */
function broadcast(data) {
    if (!wss) return;

    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
            client.send(message);
        }
    });
}

function isLidJid(jid) {
    if (!jid) return false;
    const value = String(jid).toLowerCase();
    return value.endsWith('@lid') || value.endsWith('@lid.whatsapp.net');
}

async function resolveCanonicalJid(rawJid, options = {}) {
    const normalized = normalizeJid(rawJid, options);
    if (!normalized || !isLidJid(normalized)) return normalized;

    const lid = getJidUser(normalized);
    if (!lid) return normalized;

    const pn = await db.getPnByLid(lid);
    if (!pn) return normalized;

    return `${pn}@s.whatsapp.net`;
}

async function ensureGatewayToken(sessionId) {
    if (waGateway.getSessionToken(sessionId)) return true;
    if (!gatewayPassword) {
        throw new Error('Gateway password tidak dikonfigurasi');
    }

    const authResp = await waGateway.authenticate(sessionId, gatewayPassword);
    if (authResp?.data?.token) {
        waGateway.setSessionToken(sessionId, authResp.data.token);
        return true;
    }

    throw new Error(`Gagal autentikasi gateway untuk session ${sessionId}`);
}

async function sendChatbotAutoReply(tenant, chat, targetJid, replyText) {
    const provider = ProviderFactory.getProvider(tenant);
    let destination = targetJid;

    if ((tenant.wa_provider || 'whatsmeow') === 'meta') {
        destination = getJidUser(targetJid);
    } else {
        await ensureGatewayToken(tenant.session_id);
    }

    const response = await provider.sendText(destination, replyText);
    const savedReply = await db.logMessage({
        chatId: chat.id,
        senderType: 'system',
        senderId: null,
        senderName: 'AI Chatbot',
        messageType: 'text',
        body: replyText,
        mediaUrl: null,
        waMessageId: response?.messageId || null,
        isFromMe: true,
    });

    broadcast({
        type: 'message',
        sessionId: tenant.session_id,
        data: {
            id: response?.messageId || null,
            body: replyText,
            type: 'text',
            from: tenant.session_id,
            to: targetJid,
            pushName: 'AI Chatbot',
            isFromMe: true,
            db_id: savedReply.id,
            chat_id: chat.id,
            tenant_id: tenant.id,
            sender_type: 'system',
            sender_name: 'AI Chatbot',
            is_group: false,
        },
    });
}

/**
 * Main webhook endpoint
 * Receives events from Go WhatsApp Gateway
 */
router.post('/incoming', async (req, res) => {
    try {
        const { event, sessionId, timestamp, data } = req.body;

        if (!event || !sessionId) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing event or sessionId',
            });
        }

        console.log(`[Webhook] Received ${event} for session ${sessionId}`);

        // Guard: Check if tenant has migrated to Meta
        const tenantGuard = await db.getTenantBySessionId(sessionId);
        if (tenantGuard && tenantGuard.wa_provider === 'meta') {
            // console.debug(`[Webhook] Ignored Whatsmeow event for Meta tenant ${tenantGuard.id}`);
            return res.status(200).json({ status: 'ignored', message: 'Tenant uses Meta provider' });
        }

        // Process based on event type
        switch (event) {
            case 'message':
                await handleMessage(req, sessionId, data);
                break;
            case 'receipt':
                await handleReceipt(sessionId, data);
                break;
            case 'typing':
                await handleTyping(sessionId, data);
                break;
            case 'presence':
                await handlePresence(sessionId, data);
                break;
            case 'connection':
                await handleConnection(sessionId, data);
                break;
            case 'history_sync':
                await handleHistorySync(sessionId, data);
                break;
            case 'push_name':
                await handlePushName(sessionId, data);
                break;
            default:
                console.log(`[Webhook] Unknown event type: ${event}`);
        }

        // Emit to registered handlers
        await emit(event, sessionId, data);

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('[Webhook] Error processing webhook:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
        });
    }
});

/**
 * Handle incoming message
 */
async function handleMessage(req, sessionId, data) {
    const { message } = data;
    if (!message) return;

    try {
        // 1. Identify Tenant
        let tenant = await db.getTenantBySessionId(sessionId);
        if (!tenant) {
            console.warn(`[Webhook] Received message for unknown session: ${sessionId}`);
            await alertUnknownSessionMessage(sessionId, message);
            return;
        }
        console.log(`[Webhook] Processing message ${message.id || 'no-id'} for tenant ${tenant.company_name || tenant.id} (${tenant.id}) session ${sessionId}`);

        const rawChat = typeof message?.raw?.chat === 'string' ? message.raw.chat : '';
        const isBroadcast = Boolean(message?.raw?.isBroadcast)
            || rawChat === 'status@broadcast'
            || rawChat.endsWith('@broadcast')
            || message.from === 'status@broadcast'
            || message.to === 'status@broadcast';
        if (isBroadcast) {
            console.log(`[Webhook] Ignored broadcast/status message ${message.id || 'no-id'} for session ${sessionId} rawChat ${rawChat || '-'}`);
            return;
        }

        // 2. Identify Target Chat
        // For groups: message.to = group JID, message.from = sender in group
        // For private: message.to = recipient, message.from = sender
        const isGroup = message.isGroup || message.to?.endsWith('@g.us');
        const rawTargetJid = isGroup
            ? (message.to || message.from)
            : message.isFromMe
                ? (message.to || message.from)
                : (message.from || message.to);
        const targetJid = await resolveCanonicalJid(rawTargetJid, { isGroup });

        // Ensure we have a valid JID
        if (!targetJid) {
            console.warn(`[Webhook] Ignored message ${message.id || 'no-id'} for session ${sessionId}: no target JID`, {
                from: message.from || null,
                to: message.to || null,
                isGroup,
                isFromMe: Boolean(message.isFromMe),
            });
            return;
        }

        // --- FILTER: Ignore Status Updates ---
        if (targetJid === 'status@broadcast' || targetJid.includes('@broadcast')) {
            console.log(`[Webhook] Ignored status/broadcast message ${message.id || 'no-id'} for session ${sessionId} target ${targetJid}`);
            return;
        }

        // Get group name for display (from pushName or extract from JID)
        const displayName = isGroup
            ? (message.groupName || getJidUser(targetJid))
            : (message.pushName || getJidUser(targetJid));

        const chat = await db.getOrCreateChat(tenant.id, targetJid, displayName, isGroup);

        // 3. Persist Message
        let messageText = message.body || '';
        let mediaUrl = null;

        // Simplify media types
        if (message.type === 'image' || message.type === 'video' || message.type === 'document' || message.type === 'audio') {
             messageText = message.caption || `[${message.type.toUpperCase()}]`;
             // mediaUrl = message.url; // Optional: if provided by gateway
        } else if (message.type === 'sticker') {
            messageText = '[STICKER]';
        } else if (!messageText.trim()) {
            messageText = message.type === 'unknown'
                ? '[Pesan tidak didukung atau belum bisa ditampilkan]'
                : '[Pesan kosong]';
        }

        const senderType = message.isFromMe ? 'agent' : 'customer';
        const senderJid = await resolveCanonicalJid(message.from, { isGroup: false });
        const messageAlreadyExists = await db.messageExistsByWaId(message.id);
        if (messageAlreadyExists) {
            console.log(`[Webhook] Message ${message.id} already exists; refreshing/broadcasting existing chat path`);
        }
        let senderName = message.pushName;
        if (!senderName && senderJid) {
            const contact = await db.getContactByJid(tenant.id, senderJid);
            senderName = contact?.full_name || contact?.display_name || contact?.push_name || null;
        }
        if (!senderName) {
            senderName = isGroup ? getJidUser(senderJid || targetJid) : 'Customer';
        }

        const savedMessage = await db.logMessage({
            chatId: chat.id,
            senderType: senderType,
            senderId: senderJid || message.from,
            senderName: senderName,
            messageType: message.type,
            body: messageText,
            mediaUrl: mediaUrl,
            waMessageId: message.id,
            status: message.isFromMe ? 'sent' : 'received',
            isFromMe: message.isFromMe
        });

        console.log(`[Webhook] Saved ${senderType} message ID ${savedMessage.id} for Chat ${chat.id} (${targetJid}) body="${messageText.slice(0, 120)}"`);

        const { publicMediaUrl, forwardedMessage } = buildForwardableMedia(req, sessionId, message);

        // 4. Broadcast to WebSocket (UI Update)
        broadcast({
            type: 'message',
            sessionId,
            data: {
                ...forwardedMessage,
                db_id: savedMessage.id,
                chat_id: chat.id,
                tenant_id: tenant.id,
                sender_type: senderType,
                sender_name: senderName,
                is_group: isGroup
            },
        });

        // 5. Forward to external webhooks
        const webhookEvents = normalizeWebhookEvents(tenant.webhook_events);
        const shouldForward = (() => {
            const scopeAllowed = (() => {
                if (message.isFromMe) return webhookEvents.self;
                if (isGroup) return webhookEvents.groups;
                return webhookEvents.private;
            })();
            if (!scopeAllowed) return false;

            return isMessageTypeAllowed(message.type, webhookEvents);
        })();

        if (shouldForward) {
            const toJid = message.to ? await resolveCanonicalJid(message.to, { isGroup }) : null;
            const fromCanonical = senderJid || null;
            const fromPhone = fromCanonical ? getJidUser(fromCanonical) : null;
            const toCanonical = toJid || null;
            const toPhone = !isGroup && toCanonical ? getJidUser(toCanonical) : null;
            const chatPhone = !isGroup && targetJid ? getJidUser(targetJid) : null;
            const payload = {
                event: 'message',
                sessionId,
                tenantId: tenant.id,
                tenantName: tenant.company_name,
                provider: 'whatsmeow',
                chatId: chat.id,
                chatJid: targetJid,
                chatPhone,
                chatName: displayName,
                messageId: message.id,
                dbMessageId: savedMessage.id,
                messageType: message.type,
                messageText: messageText,
                mediaUrl: publicMediaUrl,
                ephemeralMediaUrl: publicMediaUrl,
                ephemeralMediaToken: message.ephemeralMediaToken || null,
                ephemeralMediaExpiresAt: message.ephemeralMediaExpiresAt || null,
                mediaMimeType: message.mediaMimeType || null,
                messageTimestamp: message.timestamp || null,
                receivedAt: new Date().toISOString(),
                isFromMe: message.isFromMe,
                isGroup,
                senderName,
                from: message.from,
                fromCanonical,
                fromPhone,
                to: message.to || null,
                toCanonical,
                toPhone,
                message: forwardedMessage
            };

            const webhooks = await db.getTenantWebhooks(tenant.id);
            if (webhooks && webhooks.length > 0) {
                await forwardToTenantWebhooks(webhooks, payload);
            }
        }

        // Raja Metal Cutting messages must reach the sheet/manager bot even when
        // generic tenant webhook filters are not enabled for self/group messages.
        await forwardRajaBotMessage({
            event: 'message',
            sessionId,
            tenantId: tenant.id,
            tenantName: tenant.company_name,
            provider: 'whatsmeow',
            chatId: chat.id,
            chatJid: targetJid,
            chatName: displayName,
            messageId: message.id,
            dbMessageId: savedMessage.id,
            messageType: message.type,
            messageText: messageText || message.body || message.caption || '',
            mediaUrl: publicMediaUrl,
            ephemeralMediaUrl: publicMediaUrl,
            ephemeralMediaToken: message.ephemeralMediaToken || null,
            ephemeralMediaExpiresAt: message.ephemeralMediaExpiresAt || null,
            mediaMimeType: message.mediaMimeType || null,
            fileName: message.fileName || message.filename || forwardedMessage?.fileName || forwardedMessage?.filename || null,
            receivedAt: new Date().toISOString(),
            isFromMe: Boolean(message.isFromMe),
            isGroup,
            senderName,
            from: message.from,
            fromCanonical: senderJid || null,
            fromPhone: senderJid ? getJidUser(senderJid) : null,
            to: message.to || null,
            message: forwardedMessage,
        });

        const isChatbotTenant = (tenant.ai_mode || 'agent') === 'chatbot';
        const canAutoReply = !message.isFromMe && !isGroup && !messageAlreadyExists && message.type === 'text';
        if (isChatbotTenant && canAutoReply) {
            const matchedPair = await db.findTenantChatbotReply(tenant.id, messageText);
            if (matchedPair?.answer) {
                try {
                    await sendChatbotAutoReply(tenant, chat, targetJid, matchedPair.answer);
                } catch (replyError) {
                    console.error(`[Webhook] Failed chatbot auto-reply for tenant ${tenant.id}:`, replyError.message);
                }
            }
        }

    } catch (error) {
        console.error('[Webhook] Error handling message persistence:', error);
        throw error;
    }
}

/**
 * Handle message receipt (read, delivered, etc.)
 */
async function handleReceipt(sessionId, data) {
    const { type, messageId, from, timestamp } = data;
    let updatedMessages = [];
    try {
        updatedMessages = await db.updateMessageReceiptByWaId(messageId, type, timestamp);
    } catch (error) {
        console.warn(`[Webhook] Failed to persist receipt ${type} for ${messageId}: ${error.message}`);
    }

    // Broadcast to WebSocket clients
    broadcast({
        type: 'receipt',
        sessionId,
        data: {
            receiptType: type,
            messageId,
            from,
            timestamp,
            messages: updatedMessages.map((message) => ({
                db_id: message.id,
                chat_id: message.chat_id,
                wa_message_id: message.wa_message_id,
                status: message.delivery_status || message.status,
                delivered_at: message.delivered_at,
                read_at: message.read_at,
                failed_at: message.failed_at
            })),
        },
    });

    console.log(`[Webhook] Receipt ${type} for message ${messageId}`);
}

/**
 * Handle typing indicator
 */
async function handleTyping(sessionId, data) {
    const { chat, sender, state, media } = data;

    // Broadcast to WebSocket clients
    broadcast({
        type: 'typing',
        sessionId,
        data: {
            chat,
            sender,
            isTyping: state === 'composing',
            isRecording: media === 'audio',
        },
    });
}

/**
 * Handle presence update
 */
async function handlePresence(sessionId, data) {
    const { from, available, lastSeen } = data;

    // Broadcast to WebSocket clients
    broadcast({
        type: 'presence',
        sessionId,
        data: {
            jid: from,
            available,
            lastSeen,
        },
    });
}

/**
 * Handle connection status change
 */
async function handleConnection(sessionId, data) {
    const { status, reason, jid } = data;

    // Extract phone number from JID (format: 628123456789@s.whatsapp.net)
    const connectedNumber = jid ? jid.split('@')[0] : null;

    // Broadcast to WebSocket clients
    broadcast({
        type: 'session-update',
        data: [{
            sessionId,
            status: status === 'connected' ? 'CONNECTED' :
                status === 'disconnected' ? 'DISCONNECTED' :
                    status === 'logged_out' ? 'LOGGED_OUT' : 'UNKNOWN',
            reason,
            connectedNumber,
        }],
    });

    console.log(`[Webhook] Connection status: ${status} for session ${sessionId}${connectedNumber ? ` (${connectedNumber})` : ''}`);

    // Emit 'connection' event (handled by index.js listener)
    module.exports.emit('connection', sessionId, { status, reason, connectedNumber });

    // Notify admins when a session disconnects/logs out
    if (status === 'disconnected' || status === 'logged_out') {
        try {
            await notifySessionDisconnected(sessionId, status, reason);
        } catch (error) {
            console.error('[Webhook] Failed to send disconnect notification:', error.message);
        }
    }
}

/**
 * Handle history sync
 */
async function handleHistorySync(sessionId, data) {
    const { type, progress } = data;

    // Broadcast to WebSocket clients
    broadcast({
        type: 'history-sync',
        sessionId,
        data: {
            syncType: type,
            progress,
        },
    });

    console.log(`[Webhook] History sync ${type}: ${progress}%`);
}

/**
 * Handle push name update
 */
async function handlePushName(sessionId, data) {
    const { jid, pushName, oldName } = data;

    // Broadcast to WebSocket clients
    broadcast({
        type: 'push-name',
        sessionId,
        data: {
            jid,
            pushName,
            oldName,
        },
    });
}

/**
 * Forward event to tenant webhooks
 */
async function forwardToTenantWebhooks(webhooks, payload) {
    const axios = require('axios');

    await Promise.allSettled(
        webhooks.map(wh =>
            axios.post(wh.url, payload, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Source': 'customerservice-crm',
                },
            })
        )
    );
}


async function notifySessionDisconnected(sessionId, status, reason) {
    const notifierSessionId = await db.getSystemSetting('notifier_session_id');
    const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;

    if (!notifierSessionId || !gatewayPassword) {
        return;
    }

    // Jangan kirim jika session yang putus adalah notifier
    if (notifierSessionId === sessionId) return;

    // Cari tenant atau user terkait
    let tenant = await db.getTenantBySessionId(sessionId);
    let sessionOwner = null;

    // If not a tenant session, check if it's a user (super admin) session
    if (!tenant) {
        sessionOwner = await db.getUserBySessionId(sessionId);
    }

    // Kumpulkan penerima: admin_agent (tenant terkait) + super_admin
    const recipients = [];
    if (tenant) {
        const tenantAdmins = await db.getUsersByTenantWithPhone(tenant.id, ['admin_agent', 'agent']);
        recipients.push(...tenantAdmins);
    }
    const supers = await db.getSuperAdminsWithPhone();
    recipients.push(...supers);

    // Dedup berdasarkan phone_number
    const uniquePhones = Array.from(new Set(recipients
        .map(u => (u.phone_number || '').trim())
        .filter(Boolean)));

    if (!uniquePhones.length) return;

    // Authenticate notifier session ke gateway
    const auth = await waGateway.authenticate(notifierSessionId, gatewayPassword);
    if (auth?.status && auth.data?.token) {
        waGateway.setSessionToken(notifierSessionId, auth.data.token);
    } else {
        throw new Error('Auth ke gateway (notifier) gagal');
    }

    const ownerName = tenant?.company_name || sessionOwner?.name || 'Unknown';
    const ownerType = tenant ? 'Tenant' : sessionOwner ? 'User' : 'Unknown';
    const message = `Session WA (${ownerType}: ${ownerName}) ${sessionId} status: ${status}${reason ? ` (reason: ${reason})` : ''}. Mohon cek dan login ulang jika perlu.`;

    await Promise.allSettled(
        uniquePhones.map(async (phone) => {
            try {
                await waGateway.sendText(notifierSessionId, phone, message);
            } catch (err) {
                console.warn(`[Notifier] Gagal kirim ke ${phone}: ${err.message}`);
            }
        })
    );

    await sendAlertWebhook('session_disconnected', {
        session_id: sessionId,
        status,
        reason: reason || null,
        owner_type: ownerType,
        owner_name: ownerName,
        tenant_id: tenant?.id || null,
        tenant_name: tenant?.company_name || null
    });
}

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});

/**
 * Get webhook stats
 */
router.get('/stats', async (req, res) => {
    // This could be extended to track webhook statistics
    res.json({
        status: 'ok',
        handlers: Array.from(eventHandlers.keys()),
    });
});

module.exports = {
    router,
    setWebSocketServer,
    on,
    emit,
    broadcast,
};
