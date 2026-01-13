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
            const normalizedSenderType = sender_type === 'me' ? 'agent' : 'customer';

            // Get or create ticket for this conversation
            const ticket = await db.getOrCreateTicket({
                tenant_id: tenant_id,
                customer_name: customer_name || phone_number,
                customer_contact: phone_number ? formatPhoneNumber(phone_number) : phone_number
            });

            // Log the message
            const message = await db.logMessage({
                ticket_id: ticket.id,
                sender_type: normalizedSenderType,
                message_text: message_text
            });

            res.json({
                success: true,
                data: {
                    message_id: message.id,
                    ticket_id: ticket.id,
                    ticket_status: ticket.status,
                    sender_type: normalizedSenderType
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
                    const ticket = await db.getOrCreateTicket({
                        tenant_id: msg.tenant_id,
                        customer_name: msg.customer_name || msg.phone_number,
                        customer_contact: msg.phone_number ? formatPhoneNumber(msg.phone_number) : msg.phone_number
                    });

                    const message = await db.logMessage({
                        ticket_id: ticket.id,
                        sender_type: msg.sender_type === 'me' ? 'agent' : 'customer',
                        message_text: msg.message_text
                    });

                    results.push({ success: true, message_id: message.id, ticket_id: ticket.id });
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
     * Mark a ticket as escalated (needs human attention)
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

            // Find existing ticket
            const result = await db.query(
                `SELECT * FROM tickets
                 WHERE tenant_id = $1 AND customer_contact = $2 AND status NOT IN ('closed')
                 ORDER BY created_at DESC LIMIT 1`,
                [tenant_id, phone_number ? formatPhoneNumber(phone_number) : phone_number]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No active ticket found for this phone number'
                });
            }

            const ticket = result.rows[0];

            // Build escalation note
            let note = reason || 'Escalated by AI';
            if (ai_summary) {
                note += `\nAI Summary: ${ai_summary}`;
            }

            // Escalate the ticket
            const updated = await db.escalateTicket(ticket.id, note);

            res.json({
                success: true,
                data: {
                    ticket_id: updated.id,
                    status: updated.status,
                    escalated: true
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
     * Get list of escalated tickets (for human agents)
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
                `SELECT t.*,
                        (SELECT COUNT(*) FROM messages WHERE ticket_id = t.id) as message_count,
                        (SELECT message_text FROM messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
                 FROM tickets t
                 WHERE t.tenant_id = $1 AND t.status = 'escalated'
                 ORDER BY t.updated_at DESC
                 LIMIT $2`,
                [tenant_id, Number.parseInt(limit, 10)]
            );

            res.json({
                success: true,
                tickets: result.rows,
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

            // 2. Normalize Phone Number (Go Gateway handles this but good to ensure)
            const normalizedPhone = formatPhoneNumber(phone_number);
            const destination = normalizedPhone.includes('@') ? normalizedPhone : `${normalizedPhone}@s.whatsapp.net`;

            // 3. Send via Gateway (Queue)
            // Using scheduleMessageSend to ensure it respects the queue
            if (!scheduleMessageSend || !waGateway) {
                return res.status(503).json({ success: false, error: 'Gateway service not initialized' });
            }

            const result = await scheduleMessageSend(sessionId, () => 
                waGateway.sendMessage(sessionId, destination, message_text)
            );

            if (!result.status) {
                return res.status(500).json({ success: false, error: result.message || 'Gateway failed to send' });
            }

            // 4. Log to Database
            const ticket = await db.getOrCreateTicket({
                tenant_id: tenant_id,
                customer_name: phone_number,
                customer_contact: normalizedPhone
            });

            const message = await db.logMessage({
                ticket_id: ticket.id,
                sender_type: 'agent', // AI/Bot is considered an agent
                message_text: message_text,
                external_message_id: result.data?.id || null
            });

            res.json({
                success: true,
                message_id: message.id,
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

            // Find ticket
            const normalizedPhone = formatPhoneNumber(phone_number);
            const ticketResult = await db.query(
                `SELECT * FROM tickets
                 WHERE tenant_id = $1 AND customer_contact = $2
                 ORDER BY created_at DESC LIMIT 1`,
                [tenant_id, normalizedPhone]
            );

            if (ticketResult.rows.length === 0) {
                return res.json({
                    success: true,
                    ticket: null,
                    messages: []
                });
            }

            const ticket = ticketResult.rows[0];
            const messages = await db.getMessagesByTicket(ticket.id);

            res.json({
                success: true,
                ticket: {
                    id: ticket.id,
                    status: ticket.status,
                    customer_name: ticket.customer_name,
                    customer_contact: ticket.customer_contact,
                    created_at: ticket.created_at
                },
                messages: messages.slice(-Number.parseInt(limit, 10))
            });

        } catch (error) {
            console.error('n8n conversation error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * POST /api/v1/n8n/close-ticket
     * Close a ticket (conversation ended)
     */
    router.post('/close-ticket', async (req, res) => {
        try {
            const { phone_number, tenant_id, ticket_id } = req.body;

            let ticketToClose;

            if (ticket_id) {
                ticketToClose = { id: ticket_id };
            } else if (phone_number && tenant_id) {
                const result = await db.query(
                    `SELECT id FROM tickets
                     WHERE tenant_id = $1 AND customer_contact = $2 AND status != 'closed'
                     ORDER BY created_at DESC LIMIT 1`,
                    [tenant_id, phone_number]
                );
                if (result.rows.length === 0) {
                    return res.status(404).json({ success: false, error: 'No active ticket found' });
                }
                ticketToClose = result.rows[0];
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'ticket_id or (phone_number + tenant_id) required'
                });
            }

            const updated = await db.updateTicketStatus(ticketToClose.id, 'closed');

            res.json({
                success: true,
                ticket_id: updated.id,
                status: 'closed'
            });

        } catch (error) {
            console.error('n8n close-ticket error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = { initializeN8nApi };
