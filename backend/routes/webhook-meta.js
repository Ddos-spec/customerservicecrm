const express = require('express');
const crypto = require('crypto');
const { transformMetaMessage } = require('../services/whatsapp/transformer');
const db = require('../db');
const { toWhatsAppFormat } = require('../phone-utils');

const router = express.Router();
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET; // REQUIRED for Production Security

// Middleware: Validate HMAC Signature
function validateSignature(req, res, next) {
    if (!META_APP_SECRET) {
        // console.warn('[Meta Webhook] META_APP_SECRET not set. Skipping signature validation (UNSAFE).');
        return next();
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        return res.status(401).send('Missing Signature');
    }

    const elements = signature.split('=');
    const signatureHash = elements[1];
    
    if (!req.rawBody) {
        console.error('[Meta Webhook] rawBody missing. Check bodyParser config.');
        return res.status(500).send('Internal Server Error');
    }

    const expectedHash = crypto
        .createHmac('sha256', META_APP_SECRET)
        .update(req.rawBody)
        .digest('hex');

    // Timing-safe comparison
    if (signatureHash.length !== expectedHash.length || 
        !crypto.timingSafeEqual(Buffer.from(signatureHash), Buffer.from(expectedHash))) {
        console.warn('[Meta Webhook] Signature Mismatch!');
        return res.status(401).send('Invalid Signature');
    }

    next(); 
}

// 1. Verification Endpoint (Required by Meta)
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
            console.log('[Meta Webhook] Verified!');
            return res.status(200).send(challenge);
        } else {
            return res.status(403).send('Forbidden');
        }
    }
    res.status(400).send('Bad Request');
});

// 2. Incoming Message Endpoint
router.post('/', validateSignature, async (req, res) => {
    try {
        const messages = transformMetaMessage(req.body);
        
        if (messages.length === 0) {
            return res.status(200).send('EVENT_RECEIVED');
        }

        // Processing Batch
        const results = await Promise.allSettled(messages.map(async (msg) => {
            const phoneId = msg.metadata.phoneNumberId;
            if (!phoneId) return; // Skip invalid

            // 1. Tenant Lookup
            const tenantRes = await db.query('SELECT id, status FROM tenants WHERE meta_phone_id = $1 LIMIT 1', [phoneId]);
            const tenant = tenantRes.rows[0];

            if (!tenant) {
                console.warn(`[Meta Webhook] Unknown Tenant ID: ${phoneId}`);
                return;
            }
            if (tenant.status !== 'active') {
                console.warn(`[Meta Webhook] Tenant ${tenant.id} is inactive. Ignored.`);
                return;
            }

            // 2. Idempotency Check
            const existCheck = await db.query('SELECT id FROM messages WHERE wa_message_id = $1 LIMIT 1', [msg.messageId]);
            if (existCheck.rows.length > 0) {
                // console.debug(`[Meta Webhook] Duplicate message ${msg.messageId}. Ignored.`);
                return;
            }

            // 3. Chat & Contact
            const destination = toWhatsAppFormat(msg.from);
            const chat = await db.getOrCreateChat(tenant.id, destination, msg.pushName, false);

            // 4. Save Message
            await db.logMessage({
                chatId: chat.id,
                senderType: 'customer',
                senderName: msg.pushName,
                messageType: msg.type,
                body: msg.body,
                waMessageId: msg.messageId,
                isFromMe: false,
                mediaUrl: msg.media?.id // Logic download media nanti
            });
        }));

        res.status(200).send('EVENT_RECEIVED');

    } catch (error) {
        console.error('[Meta Webhook] Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;