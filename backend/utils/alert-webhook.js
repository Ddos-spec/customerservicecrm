const { formatPhoneNumber, toWhatsAppFormat } = require('../phone-utils');

let _db = null;
let _scheduleMessageSend = null;
let _sessions = null; // Need access to session objects to check status

/**
 * Initialize Alert System with dependencies
 */
function initAlertSystem(db, scheduleMessageSend, sessions) {
    _db = db;
    _scheduleMessageSend = scheduleMessageSend;
    _sessions = sessions;
    console.log('[AlertSystem] Initialized with internal WhatsApp sender');
}

/**
 * Send Alert to Super Admins via WhatsApp
 * Replaces external webhook alert
 */
async function sendAlert(type, payload = {}) {
    if (!_db || !_scheduleMessageSend) {
        console.warn('[AlertSystem] Dependencies not initialized. Skipping alert:', type);
        return false;
    }

    try {
        // 1. Get Super Admin Phone Numbers
        const superAdmins = await _db.getSuperAdminsWithPhone();
        if (superAdmins.length === 0) {
            // console.debug('[AlertSystem] No super admins with phone numbers found.');
            return false;
        }

        // 2. Determine Notifier Session
        // Priority: System Setting "notifier_session_id" > First Active Tenant Session
        let notifierSessionId = await _db.getSystemSetting('notifier_session_id');
        
        // Validate notifier session
        if (notifierSessionId) {
            const session = _sessions?.get(notifierSessionId);
            if (!session || session.status !== 'CONNECTED') {
                notifierSessionId = null; // Fallback if preferred session is offline
            }
        }

        // Fallback: Find ANY connected session
        if (!notifierSessionId && _sessions) {
            for (const [sid, sess] of _sessions.entries()) {
                if (sess.status === 'CONNECTED') {
                    notifierSessionId = sid;
                    break;
                }
            }
        }

        if (!notifierSessionId) {
            console.warn('[AlertSystem] No active WhatsApp session available to send alert.');
            return false;
        }

        // 3. Construct Message
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const icon = type === 'session_disconnected' ? '⚠️' : 'ℹ️';
        const title = type.replace(/_/g, ' ').toUpperCase();
        
        let details = '';
        for (const [key, val] of Object.entries(payload)) {
            if (key === 'timestamp' || key === 'type') continue;
            details += `\n- *${key}:* ${val}`;
        }

        const message = `*${icon} SYSTEM ALERT: ${title}*
📅 ${timestamp}
${details}

_Dikirim otomatis oleh CRM System_`;

        // 4. Send to all Super Admins
        const results = await Promise.allSettled(superAdmins.map(async (admin) => {
            const phone = admin.phone_number;
            if (!phone) return;
            
            const dest = toWhatsAppFormat(formatPhoneNumber(phone));
            
            await _scheduleMessageSend(notifierSessionId, async () => {
                const session = _sessions.get(notifierSessionId);
                if (!session?.sock) throw new Error('Session disconnected');
                return await session.sock.sendMessage(dest, { text: message });
            });
        }));

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[AlertSystem] Sent alert "${type}" to ${successCount}/${superAdmins.length} super admins using session ${notifierSessionId}`);
        
        return successCount > 0;

    } catch (error) {
        console.error(`[AlertSystem] Failed to send alert ${type}: ${error.message}`);
        return false;
    }
}

module.exports = { 
    initAlertSystem, 
    sendAlertWebhook: sendAlert // Alias for backward compatibility
};