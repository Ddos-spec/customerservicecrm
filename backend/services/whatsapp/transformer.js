/**
 * WhatsApp Meta Webhook Transformer
 * Converts incoming Meta Cloud API payload to internal standard message format.
 */

function normalizePhoneNumber(phone) {
    if (!phone) return '';
    // Meta sends without +, but if it exists remove it.
    // e.g. 628123456789
    return phone.replace(/\D/g, '');
}

function transformMetaMessage(payload) {
    // Basic validation
    if (!payload || !payload.entry || !payload.entry[0]) {
        return null; // Not a valid event
    }

    const entry = payload.entry[0];
    const change = entry.changes && entry.changes[0];
    
    if (!change || !change.value || !change.value.messages) {
        return null; // Not a message event (could be status update)
    }

    const value = change.value;
    const message = value.messages[0];
    const contact = value.contacts && value.contacts[0];

    // Extract basic fields
    const from = normalizePhoneNumber(message.from);
    const messageId = message.id;
    const timestamp = parseInt(message.timestamp, 10); // Unix timestamp
    const type = message.type;
    
    // Extract Metadata (To identify tenant)
    const phoneNumberId = value.metadata?.phone_number_id;

    let body = '';
    let mediaUrl = null;
    let mimeType = null;

    // Handle Message Types
    switch (type) {
        case 'text':
            body = message.text?.body || '';
            break;
        case 'image':
            body = message.image?.caption || '';
            mediaUrl = message.image?.id; // Meta passes ID, needs fetch. URL not directly provided usually.
            mimeType = message.image?.mime_type;
            break;
        case 'document':
            body = message.document?.caption || message.document?.filename || '';
            mediaUrl = message.document?.id;
            mimeType = message.document?.mime_type;
            break;
        // Add other types as needed
        default:
            body = `[Unsupported message type: ${type}]`;
    }

    return {
        // Internal Format
        from,
        pushName: contact?.profile?.name || null,
        messageId,
        timestamp,
        type,
        body,
        media: mediaUrl ? { id: mediaUrl, mimeType } : null,
        
        // Context for routing
        metadata: {
            phoneNumberId
        }
    };
}

module.exports = {
    transformMetaMessage
};
