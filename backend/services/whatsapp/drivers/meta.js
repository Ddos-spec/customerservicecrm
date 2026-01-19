const WhatsAppProvider = require('../provider');
const axios = require('axios');

class MetaCloudDriver extends WhatsAppProvider {
    constructor(config) {
        super(config);
        // Config: { phoneId, token, version }
        this.phoneId = config.phoneId;
        this.token = config.token;
        this.version = config.version || 'v18.0';
        this.baseUrl = `https://graph.facebook.com/${this.version}/${this.phoneId}`;
        
        if (!this.phoneId || !this.token) {
            throw new Error('MetaCloudDriver requires phoneId and token');
        }
    }

    async _request(method, endpoint, data = null) {
        try {
            const url = `${this.baseUrl}${endpoint}`;
            const response = await axios({
                method,
                url,
                data,
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            const metaError = error.response?.data?.error || error.message;
            throw new Error(`Meta API Error: ${JSON.stringify(metaError)}`);
        }
    }

    async sendText(to, text) {
        // Meta requires 'to' without '+' but with country code.
        // Assuming 'to' is '6281...' (standardized in our app)
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: { body: text }
        };

        const result = await this._request('POST', '/messages', payload);
        return {
            messageId: result.messages?.[0]?.id,
            raw: result
        };
    }

    async sendImage(to, image, caption) {
        // For Meta, image must be a URL (link) or ID (uploaded media).
        // Sending raw buffer is complex (requires upload session).
        // For now, we assume 'image' is a public URL.
        
        if (typeof image !== 'string' || !image.startsWith('http')) {
            throw new Error('MetaCloudDriver only supports Image URLs currently');
        }

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'image',
            image: { 
                link: image,
                caption: caption
            }
        };

        const result = await this._request('POST', '/messages', payload);
        return {
            messageId: result.messages?.[0]?.id,
            raw: result
        };
    }

    async checkNumber(phone) {
        // Meta API for checking contacts is limited and costs money per conversation.
        // Usually we skip this or assume valid if user opted in.
        // There is no direct free 'checkRegistered' like Whatsmeow.
        return { exists: true, jid: phone }; 
    }

    async getProfilePicture(jid) {
        // Not straightforward in Meta API (privacy).
        return null;
    }
}

module.exports = MetaCloudDriver;
