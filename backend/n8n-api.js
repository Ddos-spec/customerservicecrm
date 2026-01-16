/**
 * n8n Integration API
 * Endpoints for n8n workflows to log messages, handle escalations, and send messages
 *
 * Workflow 1 (Passive): Log incoming/outgoing messages
 * Workflow 2 (Active): Check escalation, log AI responses
 * Workflow 3 (Outbound): Send messages via WhatsApp Gateway
 */
const express = require('express');
const db = require('./db');
const { formatPhoneNumber } = require('./phone-utils');

function normalizeRecipient(phoneNumber) {
    const raw = phoneNumber ? phoneNumber.toString().trim() : '';
    if (!raw) {
        return { raw: '', normalizedPhone: '', jid: '', isGroup: false };
    }

    const isGroup = raw.includes('@g.us');
    if (raw.includes('@')) {
        const user = raw.split('@')[0] || '';
        return { raw, normalizedPhone: user, jid: raw, isGroup };
    }

    const normalizedPhone = formatPhoneNumber(raw);
    return {
        raw,
        normalizedPhone,
        jid: `${normalizedPhone}@s.whatsapp.net`,
        isGroup: false
    };
}

async function resolveChatByPhone({ tenantId, phoneNumber, customerName, createIfMissing = true }) {
    const recipient = normalizeRecipient(phoneNumber);
    if (!recipient.jid || !tenantId) {
        return { chat: null, recipient };
    }

    if (createIfMissing) {
        const chat = await db.getOrCreateChat(
            tenantId,
            recipient.jid,
            customerName || recipient.normalizedPhone || null,
            recipient.isGroup
        );
        return { chat, recipient };
    }

    const contact = await db.getContactByJid(tenantId, recipient.jid);
    if (!contact) return { chat: null, recipient };

    const chatRes = await db.query(
        'SELECT * FROM chats WHERE tenant_id = $1 AND contact_id = $2 ORDER BY created_at DESC LIMIT 1',
        [tenantId, contact.id]
    );

    return { chat: chatRes.rows[0] || null, recipient };
}

// ===== WEBHOOK AUTH (Simple API Key) =====

/**
 * Validate n8n webhook API key
 * Set N8N_API_KEY in ENV
 */
function validateN8nAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const expectedKey = process.env.N8N_API_KEY;

    // If N8N_API_KEY is set, validate it
    if (expectedKey && apiKey !== expectedKey) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    // If no API key configured, allow (for development)
    if (!expectedKey) {
        // console.warn('⚠️  N8N_API_KEY not set - n8n endpoints are open');
    }

    next();
}

/**
 * Initialize n8n API with dependencies
 * @param {Object} deps - Dependencies { scheduleMessageSend, waGateway }
 */
function initializeN8nApi(deps) {
    const { scheduleMessageSend, waGateway } = deps;
    const router = express.Router();

    // Apply Auth Middleware
    router.use(validateN8nAuth);

    // ===== WORKFLOW 1: MESSAGE LOGGING =====

    /**
     * POST /api/v1/n8n/log-message
     * Log a WhatsApp message (incoming or outgoing) without sending it
     */
    router.post('/log-message', async (req, res) => {
        try {
            const {
                phone_number,
                message_text,
                sender_type,
                customer_name,
                tenant_id
            } = req.body;

            // Validation
            if (!phone_number || !message_text || !sender_type || !tenant_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: phone_number, message_text, sender_type, tenant_id'
                });
            }

            // Normalize sender_type
            const normalizedSenderType = sender_type === 'me' ? 'agent' : sender_type;
            const senderType = ['agent', 'customer', 'system'].includes(normalizedSenderType)
                ? normalizedSenderType
                : 'customer';

            const { chat } = await resolveChatByPhone({
                tenantId: tenant_id,
                phoneNumber: phone_number,
                customerName: customer_name,
                createIfMissing: true
            });

            if (!chat) {
                return res.status(404).json({ success: false, error: 'Chat tidak ditemukan' });
            }

            // Log the message
            const message = await db.logMessage({
                chatId: chat.id,
                senderType,
                senderName: senderType === 'customer' ? customer_name : null,
                messageType: 'text',
                body: message_text,
                isFromMe: senderType !== 'customer'
            });

            res.json({
                success: true,
                data: {
                    message_id: message.id,
                    chat_id: chat.id,
                    chat_status: chat.status,
                    sender_type: senderType
                }
            });

        } catch (error) {
            console.error('n8n log-message error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/v1/n8n/log-message-bulk
     * Log multiple messages at once (for batch processing)
     */
    router.post('/log-message-bulk', async (req, res) => {
        try {
            const { messages } = req.body;

            if (!Array.isArray(messages) || messages.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'messages array is required'
                });
            }

            const results = [];
            for (const msg of messages) {
                try {
                    const normalizedSenderType = msg.sender_type === 'me' ? 'agent' : msg.sender_type;
                    const senderType = ['agent', 'customer', 'system'].includes(normalizedSenderType)
                        ? normalizedSenderType
                        : 'customer';

                    const { chat } = await resolveChatByPhone({
                        tenantId: msg.tenant_id,
                        phoneNumber: msg.phone_number,
                        customerName: msg.customer_name,
                        createIfMissing: true
                    });

                    if (!chat) {
                        throw new Error('Chat tidak ditemukan');
                    }

                    const message = await db.logMessage({
                        chatId: chat.id,
                        senderType,
                        senderName: senderType === 'customer' ? msg.customer_name : null,
                        messageType: 'text',
                        body: msg.message_text,
                        isFromMe: senderType !== 'customer'
                    });

                    results.push({ success: true, message_id: message.id, chat_id: chat.id });
                } catch (err) {
                    results.push({ success: false, error: err.message, phone: msg.phone_number });
                }
            }

            res.json({ success: true, results });

        } catch (error) {
            console.error('n8n log-message-bulk error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ===== WORKFLOW 2: ESCALATION =====

    /**
     * POST /api/v1/n8n/escalate
     * Mark a chat as escalated (needs human attention)
     */
    router.post('/escalate', async (req, res) => {
        try {
            const { phone_number, tenant_id, reason, ai_summary } = req.body;

            if (!phone_number || !tenant_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: phone_number, tenant_id'
                });
            }

            const { chat } = await resolveChatByPhone({
                tenantId: tenant_id,
                phoneNumber: phone_number,
                createIfMissing: false
            });

            if (!chat || chat.status === 'closed') {
                return res.status(404).json({
                    success: false,
                    error: 'No active chat found for this phone number'
                });
            }

            const updatedRes = await db.query(
                'UPDATE chats SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
                ['escalated', chat.id]
            );
            const updated = updatedRes.rows[0];

            res.json({
                success: true,
                data: {
                    chat_id: updated?.id || chat.id,
                    status: updated?.status || 'escalated',
                    escalated: true,
                    note: reason || null,
                    ai_summary: ai_summary || null
                }
            });

        } catch (error) {
            console.error('n8n escalate error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v1/n8n/check-escalation
     * Check if a conversation needs escalation based on keywords or rules
     */
    router.get('/check-escalation', async (req, res) => {
        try {
            const { message } = req.query;

            if (!message) {
                return res.json({
                    success: true,
                    needs_escalation: false,
                    reason: null
                });
            }

            // Simple keyword-based escalation detection
            const escalationKeywords = [
                'human', 'manusia', 'agent', 'agen', 'cs', 'customer service',
                'komplain', 'complaint', 'marah', 'angry', 'kesal',
                'refund', 'pengembalian', 'cancel', 'batal',
                'bicara dengan', 'speak to', 'talk to',
                'tidak puas', 'not satisfied', 'kecewa'
            ];

            const lowerMessage = message.toLowerCase();
            const matchedKeyword = escalationKeywords.find(kw => lowerMessage.includes(kw));

            if (matchedKeyword) {
                res.json({
                    success: true,
                    needs_escalation: true,
                    reason: `Keyword detected: "${matchedKeyword}"`, 
                    matched_keyword: matchedKeyword
                });
            } else {
                res.json({
                    success: true,
                    needs_escalation: false,
                    reason: null
                });
            }

        } catch (error) {
            console.error('n8n check-escalation error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v1/n8n/escalation-queue
     * Get list of escalated chats (for human agents)
     */
    router.get('/escalation-queue', async (req, res) => {
        try {
            const { tenant_id, limit = 20 } = req.query;

            if (!tenant_id) {
                return res.status(400).json({
                    success: false,
                    error: 'tenant_id is required'
                });
            }

            const result = await db.query(
                `SELECT c.*,
                        con.full_name as customer_name,
                        con.phone_number as customer_contact,
                        (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count,
                        (SELECT body FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
                 FROM chats c
                 JOIN contacts con ON con.id = c.contact_id
                 WHERE c.tenant_id = $1 AND COALESCE(c.status, 'open') = 'escalated'
                 ORDER BY c.updated_at DESC
                 LIMIT $2`,
                [tenant_id, Number.parseInt(limit, 10)]
            );

            res.json({
                success: true,
                chats: result.rows,
                count: result.rows.length
            });

        } catch (error) {
            console.error('n8n escalation-queue error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ===== WORKFLOW 3: SENDING & HISTORY =====

    /**
     * POST /api/v1/n8n/send-message
     * Send a WhatsApp message via Gateway and log it
     *
     * Body:
     * {
     *   "tenant_id": 1,
     *   "phone_number": "628123456789",
     *   "message_text": "Hello world"
     * }
     */
    router.post('/send-message', async (req, res) => {
        try {
            const { tenant_id, phone_number, message_text } = req.body;   

            if (!tenant_id || !phone_number || !message_text) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing fields: tenant_id, phone_number, message_text'
                });
            }

            // 1. Get Tenant Session ID
            const tenant = await db.getTenantById(tenant_id);
            if (!tenant || !tenant.session_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Tenant not found or has no active WhatsApp session'
                });
            }

            const sessionId = tenant.session_id;

            const { chat, recipient } = await resolveChatByPhone({
                tenantId: tenant_id,
                phoneNumber: phone_number,
                customerName: phone_number,
                createIfMissing: true
            });

            if (!chat) {
                return res.status(404).json({ success: false, error: 'Chat tidak ditemukan' });
            }

            const destination = recipient.raw.includes('@') ? recipient.raw : recipient.normalizedPhone;

            // 3. Send via Gateway (Queue)
            // Using scheduleMessageSend to ensure it respects the queue
            if (!scheduleMessageSend || !waGateway) {
                return res.status(503).json({ success: false, error: 'Gateway service not initialized' });
            }

            const result = await scheduleMessageSend(sessionId, async () => {
                const response = await waGateway.sendText(sessionId, destination, message_text);
                if (!(response?.status === true || response?.status === 'success')) {
                    throw new Error(response?.message || 'Gateway failed to send');
                }
                return response;
            });

            // 4. Log to Database
            const message = await db.logMessage({
                chatId: chat.id,
                senderType: 'agent',
                messageType: 'text',
                body: message_text,
                waMessageId: result.data?.msgid || null,
                isFromMe: true
            });

            res.json({
                success: true,
                message_id: message.id,
                chat_id: chat.id,
                gateway_response: result.data
            });

        } catch (error) {
            console.error('n8n send-message error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v1/n8n/conversation
     * Get conversation history for a phone number
     */
    router.get('/conversation', async (req, res) => {
        try {
            const { phone_number, tenant_id, limit = 50 } = req.query;    

            if (!phone_number || !tenant_id) {
                return res.status(400).json({
                    success: false,
                    error: 'phone_number and tenant_id are required'
                });
            }

            const { chat, recipient } = await resolveChatByPhone({
                tenantId: tenant_id,
                phoneNumber: phone_number,
                createIfMissing: false
            });

            if (!chat) {
                return res.json({
                    success: true,
                    chat: null,
                    messages: []
                });
            }

            const contactRes = await db.query(
                'SELECT full_name, phone_number FROM contacts WHERE id = $1',
                [chat.contact_id]
            );
            const contact = contactRes.rows[0] || {};

            const messages = await db.getMessagesByChat(chat.id, Number.parseInt(limit, 10));

            res.json({
                success: true,
                chat: {
                    id: chat.id,
                    status: chat.status,
                    customer_name: contact.full_name || null,
                    customer_contact: contact.phone_number || recipient.normalizedPhone,
                    created_at: chat.created_at
                },
                messages
            });

        } catch (error) {
            console.error('n8n conversation error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/v1/n8n/close-chat
     * Close a chat (conversation ended)
     */
    const closeChatHandler = async (req, res) => {
        try {
            const { phone_number, tenant_id } = req.body;
            const chatId = (req.body?.chat_id || req.body?.chatId || '').toString().trim();

            let chatToClose = null;

            if (chatId) {
                const params = [chatId];
                let sql = 'SELECT * FROM chats WHERE id = $1';
                if (tenant_id) {
                    sql += ' AND tenant_id = $2';
                    params.push(tenant_id);
                }
                const chatRes = await db.query(sql, params);
                chatToClose = chatRes.rows[0];
                if (!chatToClose) {
                    return res.status(404).json({ success: false, error: 'Chat tidak ditemukan' });
                }
            } else if (phone_number && tenant_id) {
                const { chat } = await resolveChatByPhone({
                    tenantId: tenant_id,
                    phoneNumber: phone_number,
                    createIfMissing: false
                });
                if (!chat || chat.status === 'closed') {
                    return res.status(404).json({ success: false, error: 'No active chat found' });
                }
                chatToClose = chat;
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'chat_id or (phone_number + tenant_id) required'
                });
            }

            const updatedRes = await db.query(
                'UPDATE chats SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
                ['closed', chatToClose.id]
            );
            const updated = updatedRes.rows[0];

            res.json({
                success: true,
                chat_id: updated?.id || chatToClose.id,
                status: 'closed'
            });

        } catch (error) {
            console.error('n8n close-chat error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    router.post('/close-chat', closeChatHandler);

    return router;
}

module.exports = { initializeN8nApi };
