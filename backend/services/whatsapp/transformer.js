/**
 * WhatsApp Meta Webhook Transformer
 * Converts incoming Meta Cloud API payload to internal standard message format.
 */

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
}

/**
 * Transform Meta Payload into Array of Standard Messages
 * Supports batch messages.
 */
function transformMetaMessage(payload) {
    const resultMessages = [];

    // Basic validation
    if (!payload || !payload.entry) {
        return resultMessages; 
    }

    for (const entry of payload.entry) {
        for (const change of entry.changes || []) {
            // Only process message events
            if (change.field !== 'messages' || !change.value || !change.value.messages) {
                continue; 
            }

            const value = change.value;
            const phoneNumberId = value.metadata?.phone_number_id;
            
            // Build Contact Map for PushNames
            const contactMap = new Map();
            if (value.contacts) {
                value.contacts.forEach(c => {
                    if (c.wa_id) {
                        const cleanId = normalizePhoneNumber(c.wa_id);
                        contactMap.set(cleanId, c.profile?.name);
                    }
                });
            }

            for (const message of value.messages) {
                const from = normalizePhoneNumber(message.from);
                const messageId = message.id;
                const timestamp = parseInt(message.timestamp, 10);
                const type = message.type;
                const pushName = contactMap.get(message.from) || null;

                let body = '';
                let mediaUrl = null;
                let mimeType = null;

                switch (type) {
                    case 'text':
                        body = message.text?.body || '';
                        break;
                    case 'image':
                        body = message.image?.caption || '[Image]';
                        mediaUrl = message.image?.id; 
                        mimeType = message.image?.mime_type;
                        break;
                    case 'document':
                        body = message.document?.caption || message.document?.filename || '[Document]';
                        mediaUrl = message.document?.id;
                        mimeType = message.document?.mime_type;
                        break;
                    // Add unsupported types as placeholder
                    default:
                        body = `[Unsupported message type: ${type}]`;
                }

                resultMessages.push({
                    from,
                    pushName,
                    messageId,
                    timestamp,
                    type,
                    body,
                    media: mediaUrl ? { id: mediaUrl, mimeType } : null,
                    metadata: {
                        phoneNumberId
                    }
                });
            }
        }
    }

    return resultMessages;
}

module.exports = {
    transformMetaMessage
};