const WhatsAppProvider = require('../provider');
const axios = require('axios');

// Simple Semaphore for Rate Limiting
class Semaphore {
    constructor(max) {
        this.max = max;
        this.counter = 0;
        this.waiting = [];
    }
    
    async acquire() {
        if (this.counter < this.max) {
            this.counter++;
            return;
        }
        return new Promise(resolve => this.waiting.push(resolve));
    }
    
    release() {
        this.counter--;
        if (this.waiting.length > 0) {
            this.counter++;
            const resolve = this.waiting.shift();
            resolve();
        }
    }
}

// Limiter per Tenant (10 concurrent requests per tenant)
const tenantLimiters = new Map();

function getLimiter(tenantId) {
    if (!tenantId) return new Semaphore(5); // Fallback safe limit
    if (!tenantLimiters.has(tenantId)) {
        tenantLimiters.set(tenantId, new Semaphore(10));
    }
    return tenantLimiters.get(tenantId);
}

class MetaCloudDriver extends WhatsAppProvider {
    constructor(config) {
        super(config);
        this.tenantId = config.tenantId;
        this.phoneId = config.phoneId;
        this.token = config.token;
        this.version = config.version || 'v18.0';
        this.baseUrl = `https://graph.facebook.com/${this.version}/${this.phoneId}`;
        
        if (!this.phoneId || !this.token) {
            throw new Error('MetaCloudDriver requires phoneId and token');
        }
    }

    async _request(method, endpoint, data = null) {
        const limiter = getLimiter(this.tenantId);
        await limiter.acquire();
        
        try {
            const url = `${this.baseUrl}${endpoint}`;
            
            // Retry Logic (Manual Backoff)
            let lastError;
            for (let i = 0; i < 3; i++) {
                try {
                    const response = await axios({
                        method,
                        url,
                        data,
                        headers: {
                            'Authorization': `Bearer ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000 
                    });
                    return response.data;
                } catch (error) {
                    lastError = error;
                    const status = error.response?.status;
                    // Only retry on 5xx or Network Error
                    if (status && status < 500 && status !== 429) {
                        throw error;
                    }
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
                }
            }
            throw lastError;

        } catch (error) {
            const metaError = error.response?.data?.error || error.message;
            throw new Error(`Meta API Error: ${JSON.stringify(metaError)}`);
        } finally {
            limiter.release();
        }
    }

    async sendText(to, text) {
        // Group check is moved to route, but double check here
        if (to.includes('@g.us')) {
             throw new Error('Meta Cloud API does not support Group Messaging.');
        }

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
        return { exists: true, jid: phone }; 
    }

    async getProfilePicture(jid) {
        return null;
    }
}

module.exports = MetaCloudDriver;
