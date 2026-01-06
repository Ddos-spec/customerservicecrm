/**
 * n8n Integration API
 * Endpoints for n8n workflows to log messages and handle escalations
 *
 * Workflow 1 (Passive): Log incoming/outgoing messages
 * Workflow 2 (Active): Check escalation, log AI responses
 */
const express = require('express');
const db = require('./db');

const router = express.Router();

// ===== WEBHOOK AUTH (Simple API Key) =====

/**
 * Validate n8n webhook API key
 * Set N8N_API_KEY in ENV, or use session token
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
        console.warn('⚠️  N8N_API_KEY not set - n8n endpoints are open');
    }

    next();
}

// ===== WORKFLOW 1: MESSAGE LOGGING =====

/**
 * POST /api/v1/n8n/log-message
 * Log a WhatsApp message (incoming or outgoing)
 *
 * Body:
 * {
 *   "phone_number": "628123456789",      // Customer phone (without @s.whatsapp.net)
 *   "message_text": "Hello!",            // Message content
 *   "sender_type": "individual",         // "me" (bot/agent) or "individual" (customer)
 *   "customer_name": "John Doe",         // Optional: customer name
 *   "tenant_id": 1,                      // Tenant ID
 *   "session_id": "default"              // WhatsApp session ID (optional)
 * }
 */
router.post('/log-message', validateN8nAuth, async (req, res) => {
    try {
        const {
            phone_number,
            message_text,
            sender_type,
            customer_name,
            tenant_id,
            session_id
        } = req.body;

        // Validation
        if (!phone_number || !message_text || !sender_type || !tenant_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: phone_number, message_text, sender_type, tenant_id'
            });
        }

        // Normalize sender_type
        // "me" = message from bot/agent to customer
        // "individual" = message from customer to bot/agent
        const normalizedSenderType = sender_type === 'me' ? 'agent' : 'customer';

        // Get or create ticket for this conversation
        const ticket = await db.getOrCreateTicket({
            tenant_id: parseInt(tenant_id),
            customer_name: customer_name || phone_number,
            customer_contact: phone_number
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
router.post('/log-message-bulk', validateN8nAuth, async (req, res) => {
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
                    tenant_id: parseInt(msg.tenant_id),
                    customer_name: msg.customer_name || msg.phone_number,
                    customer_contact: msg.phone_number
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
 *
 * Body:
 * {
 *   "phone_number": "628123456789",
 *   "tenant_id": 1,
 *   "reason": "Customer requested human agent",
 *   "ai_summary": "Customer asking about refund policy..."
 * }
 */
router.post('/escalate', validateN8nAuth, async (req, res) => {
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
            [tenant_id, phone_number]
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
 *
 * Query:
 * ?phone_number=628123456789&tenant_id=1&message=I want to speak to human
 */
router.get('/check-escalation', validateN8nAuth, async (req, res) => {
    try {
        const { phone_number, tenant_id, message } = req.query;

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
 *
 * Query:
 * ?tenant_id=1&limit=10
 */
router.get('/escalation-queue', validateN8nAuth, async (req, res) => {
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
            [tenant_id, parseInt(limit)]
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

// ===== CONVERSATION HISTORY =====

/**
 * GET /api/v1/n8n/conversation
 * Get conversation history for a phone number
 *
 * Query:
 * ?phone_number=628123456789&tenant_id=1&limit=50
 */
router.get('/conversation', validateN8nAuth, async (req, res) => {
    try {
        const { phone_number, tenant_id, limit = 50 } = req.query;

        if (!phone_number || !tenant_id) {
            return res.status(400).json({
                success: false,
                error: 'phone_number and tenant_id are required'
            });
        }

        // Find ticket
        const ticketResult = await db.query(
            `SELECT * FROM tickets
             WHERE tenant_id = $1 AND customer_contact = $2
             ORDER BY created_at DESC LIMIT 1`,
            [tenant_id, phone_number]
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
            messages: messages.slice(-parseInt(limit))
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
router.post('/close-ticket', validateN8nAuth, async (req, res) => {
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

module.exports = router;
