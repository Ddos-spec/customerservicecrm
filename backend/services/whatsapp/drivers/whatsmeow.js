const WhatsAppProvider = require('../provider');
const legacyClient = require('../../../wa-gateway-client');

class WhatsmeowDriver extends WhatsAppProvider {
    constructor(config) {
        super(config);
        // Config must contain sessionId (the tenant's WA number)
        this.sessionId = config.sessionId;
        
        if (!this.sessionId) {
            throw new Error('WhatsmeowDriver requires sessionId');
        }
    }

    async sendText(to, text) {
        try {
            const result = await legacyClient.sendText(this.sessionId, to, text);
            return {
                messageId: result.data?.id || result.id,
                raw: result
            };
        } catch (error) {
            throw new Error(`Whatsmeow SendText Error: ${error.message}`);
        }
    }

    async sendImage(to, image, caption) {
        try {
            const result = await legacyClient.sendImage(this.sessionId, to, image, caption);
            return {
                messageId: result.data?.id || result.id,
                raw: result
            };
        } catch (error) {
            throw new Error(`Whatsmeow SendImage Error: ${error.message}`);
        }
    }

    async checkNumber(phone) {
        try {
            const result = await legacyClient.checkRegistered(this.sessionId, phone);
            return {
                exists: result.data?.status === 'valid',
                jid: result.data?.jid
            };
        } catch (error) {
            // Whatsmeow gateway might throw 404/400 if invalid
            return { exists: false, jid: null };
        }
    }

    // TODO: Implement getProfilePicture in legacy client first if needed
    async getProfilePicture(jid) {
        // Legacy client doesn't export profile picture fetching yet, 
        // need to add it there or handle here.
        return null; 
    }
}

module.exports = WhatsmeowDriver;
