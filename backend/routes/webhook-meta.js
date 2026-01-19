const express = require('express');
const { transformMetaMessage } = require('../services/whatsapp/transformer');
const db = require('../db');
const { toWhatsAppFormat } = require('../phone-utils');

const router = express.Router();
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

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
router.post('/', async (req, res) => {
    // console.log('[Meta Webhook] RAW:', JSON.stringify(req.body, null, 2));

    try {
        const message = transformMetaMessage(req.body);
        
        if (!message) {
            // Not a message event (status update, etc)
            // Just return 200 to acknowledge receipt
            return res.status(200).send('EVENT_RECEIVED');
        }

        const phoneId = message.metadata.phoneNumberId;
        if (!phoneId) {
            console.warn('[Meta Webhook] Missing phone_number_id');
            return res.status(400).send('Missing metadata');
        }

        // 1. Find Tenant by Phone ID
        // Note: We need a method to find tenant by meta_phone_id
        // db.getTenantByMetaPhoneId is needed.
        // For now, let's query directly or add helper.
        const tenantRes = await db.query('SELECT * FROM tenants WHERE meta_phone_id = $1', [phoneId]);
        const tenant = tenantRes.rows[0];

        if (!tenant) {
            console.warn(`[Meta Webhook] Unknown Tenant for Phone ID: ${phoneId}`);
            return res.status(404).send('Tenant not found');
        }

        // 2. Create/Get Chat
        const from = message.from; // e.g. 6281...
        const destination = toWhatsAppFormat(from); // 6281...@s.whatsapp.net
        
        // Ensure contact & chat exist
        const chat = await db.getOrCreateChat(tenant.id, destination, message.pushName, false);

        // 3. Log Message
        await db.logMessage({
            chatId: chat.id,
            senderType: 'customer', // Inbound from customer
            senderId: null,
            senderName: message.pushName,
            messageType: message.type,
            body: message.body,
            waMessageId: message.messageId,
            isFromMe: false
        });

        // 4. (Optional) Broadcast to UI via WebSocket
        // Handled by logMessage usually? Or we need to trigger it manually?
        // Existing webhook-handler.js handles this via `postToWebhook`.
        // We might need to unify this later. For now, DB save is enough for polling UI.

        res.status(200).send('EVENT_RECEIVED');

    } catch (error) {
        console.error('[Meta Webhook] Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
