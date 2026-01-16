const axios = require('axios');

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const ALERT_WEBHOOK_TIMEOUT_MS = 5000;

async function sendAlertWebhook(type, payload = {}) {
    if (!ALERT_WEBHOOK_URL) return false;
    try {
        await axios.post(ALERT_WEBHOOK_URL, {
            type,
            timestamp: new Date().toISOString(),
            ...payload
        }, {
            timeout: ALERT_WEBHOOK_TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json',
                'X-Alert-Source': 'customerservice-crm'
            }
        });
        return true;
    } catch (error) {
        console.warn(`[AlertWebhook] Failed to post ${type}: ${error.message}`);
        return false;
    }
}

module.exports = { sendAlertWebhook };
