/**
 * Webhook Handler for Go WhatsApp Gateway
 *
 * This module handles incoming webhooks from the Go WhatsApp Gateway.
 * It processes messages, receipts, presence updates, and other events.
 */

const express = require('express');
const router = express.Router();
const db = require('./db');

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

    // Skip messages from self unless specifically needed
    if (message.isFromMe) {
        console.log(`[Webhook] Skipping self message: ${message.id}`);
        return;
    }

    // Broadcast to WebSocket clients
    broadcast({
        type: 'message',
        sessionId,
        data: message,
    });

    // Try to get tenant info for this session
    try {
        const tenant = await db.getTenantBySessionId(sessionId);
        if (tenant) {
            // Forward to tenant webhooks if configured
            const webhooks = await db.getTenantWebhooks(tenant.id);
            if (webhooks && webhooks.length > 0) {
                await forwardToTenantWebhooks(webhooks, {
                    event: 'message',
                    sessionId,
                    tenantId: tenant.id,
                    tenantName: tenant.company_name,
                    message,
                });
            }
        }
    } catch (error) {
        console.error('[Webhook] Error forwarding to tenant:', error);
    }

    console.log(`[Webhook] Message from ${message.from}: ${message.type} - ${message.body?.substring(0, 50) || '(media)'}`);
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
    const { status, reason } = data;

    // Broadcast to WebSocket clients
    broadcast({
        type: 'session-update',
        data: [{
            sessionId,
            status: status === 'connected' ? 'CONNECTED' :
                status === 'disconnected' ? 'DISCONNECTED' :
                    status === 'logged_out' ? 'LOGGED_OUT' : 'UNKNOWN',
            reason,
        }],
    });

    console.log(`[Webhook] Connection status: ${status} for session ${sessionId}`);
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
