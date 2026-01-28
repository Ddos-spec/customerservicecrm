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
const { normalizeJid, getJidUser } = require('./utils/jid');
const { sendAlertWebhook } = require('./utils/alert-webhook');
const { getWebhookUrl } = require('./api_v1');

// Event handlers map (can be extended by other modules)
const eventHandlers = new Map();

// WebSocket server reference (will be set by index.js)
let wss = null;

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
                await handleMessage(sessionId, data);
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
async function handleMessage(sessionId, data) {
    const { message } = data;
    if (!message) return;

    try {
        // 1. Identify Tenant
        let tenant = await db.getTenantBySessionId(sessionId);
        if (!tenant) {
            console.warn(`[Webhook] Received message for unknown session: ${sessionId}`);
            return;
        }

        // 2. Identify Target Chat
        // For groups: message.to = group JID, message.from = sender in group
        // For private: message.to = recipient, message.from = sender
        const isGroup = message.isGroup || message.to?.endsWith('@g.us');
        const rawTargetJid = message.to || message.from;
        const targetJid = await resolveCanonicalJid(rawTargetJid, { isGroup });

        // Ensure we have a valid JID
        if (!targetJid) return;

        // --- FILTER: Ignore Status Updates ---
        if (targetJid === 'status@broadcast' || targetJid.includes('@broadcast')) {
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
        }

        const senderType = message.isFromMe ? 'agent' : 'customer';
        const senderJid = await resolveCanonicalJid(message.from, { isGroup: false });
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
            isFromMe: message.isFromMe
        });

        console.log(`[Webhook] Saved ${senderType} message ID ${savedMessage.id} for Chat ${chat.id} (${targetJid})`);

        // 4. Broadcast to WebSocket (UI Update)
        broadcast({
            type: 'message',
            sessionId,
            data: {
                ...message,
                db_id: savedMessage.id,
                chat_id: chat.id,
                tenant_id: tenant.id,
                sender_type: senderType,
                sender_name: senderName,
                is_group: isGroup
            },
        });

        // 5. Forward to external webhooks
        if (!message.isFromMe) {
            const payload = {
                event: 'message',
                sessionId,
                tenantId: tenant.id,
                tenantName: tenant.company_name,
                message,
                chatId: chat.id
            };

            const webhooks = await db.getTenantWebhooks(tenant.id);
            if (webhooks && webhooks.length > 0) {
                await forwardToTenantWebhooks(webhooks, payload);
            }
            await forwardToSessionWebhook(sessionId, payload);
        }

    } catch (error) {
        console.error('[Webhook] Error handling message persistence:', error);
    }
}

/**
 * Handle message receipt (read, delivered, etc.)
 */
async function handleReceipt(sessionId, data) {
    const { type, messageId, from, timestamp } = data;

    // Broadcast to WebSocket clients
    broadcast({
        type: 'receipt',
        sessionId,
        data: {
            receiptType: type,
            messageId,
            from,
            timestamp,
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

async function forwardToSessionWebhook(sessionId, payload) {
    try {
        const url = await getWebhookUrl(sessionId);
        if (!url) return;
        const axios = require('axios');
        await axios.post(url, payload, {
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Source': 'customerservice-crm',
                'X-Webhook-Target': 'session',
            },
        });
    } catch (error) {
        console.warn('[Webhook] Failed to forward to session webhook:', error?.message || error);
    }
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
