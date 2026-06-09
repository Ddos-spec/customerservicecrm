const db = require('../../db');
const ProviderFactory = require('../whatsapp/factory');
const WhatsmeowDriver = require('../whatsapp/drivers/whatsmeow');
const { formatPhoneNumber, toWhatsAppFormat } = require('../../phone-utils');

let isProcessing = false;
const MESSAGES_PER_MINUTE = Math.max(1, parseInt(process.env.MARKETING_MESSAGES_PER_MINUTE || '50', 10));
const BATCH_LIMIT = Math.max(1, parseInt(process.env.MARKETING_BATCH_LIMIT || `${MESSAGES_PER_MINUTE}`, 10));
const THROTTLE_MS = Math.ceil(60_000 / MESSAGES_PER_MINUTE);

function renderTemplate(template, contact) {
    const fullName = (contact.full_name || '').toString().trim();
    const phoneNumber = (contact.phone_number || '').toString().trim();
    const fallbackName = fullName || phoneNumber || 'Pelanggan';

    return (template || '').toString()
        .replace(/\{\{\s*full_name\s*\}\}/gi, fallbackName)
        .replace(/\{\{\s*name\s*\}\}/gi, fallbackName)
        .replace(/\{\{\s*phone_number\s*\}\}/gi, phoneNumber)
        .replace(/\{\{\s*phone\s*\}\}/gi, phoneNumber);
}

async function processBatch() {
    if (isProcessing) return;
    isProcessing = true;

    const client = await db.getClient();
    let rows = [];

    try {
        await client.query('BEGIN');

        const pickRes = await client.query(`
            WITH picked AS (
                SELECT cm.id
                FROM campaign_messages cm
                JOIN campaigns c ON c.id = cm.campaign_id
                WHERE cm.status = 'pending'
                  AND c.scheduled_at <= NOW()
                  AND c.status IN ('scheduled', 'processing')
                ORDER BY cm.created_at ASC
                LIMIT ${BATCH_LIMIT}
                FOR UPDATE SKIP LOCKED
            ),
            updated AS (
                UPDATE campaign_messages cm
                SET status = 'processing'
                FROM picked
                WHERE cm.id = picked.id
                RETURNING cm.id, cm.campaign_id, cm.contact_id, cm.phone_number
            )
            SELECT
                u.id,
                u.campaign_id,
                u.contact_id,
                u.phone_number,
                c.tenant_id,
                c.message_template,
                c.name AS campaign_name,
                con.full_name,
                con.jid,
                t.wa_provider,
                t.session_id,
                t.meta_phone_id,
                t.meta_token,
                t.company_name
            FROM updated u
            JOIN campaigns c ON c.id = u.campaign_id
            LEFT JOIN contacts con ON con.id = u.contact_id
            JOIN tenants t ON t.id = c.tenant_id
        `);

        rows = pickRes.rows;
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.warn('[Marketing] Failed to pick batch:', error.message);
    } finally {
        client.release();
    }

    if (!rows.length) {
        isProcessing = false;
        return;
    }

    try {
        for (const row of rows) {
            const tenant = {
                id: row.tenant_id,
                wa_provider: row.wa_provider,
                session_id: row.session_id,
                meta_phone_id: row.meta_phone_id,
                meta_token: row.meta_token,
                company_name: row.company_name
            };

            let destination = formatPhoneNumber(row.phone_number || '');
            if (!destination) {
                await markFailed(row.id, row.campaign_id, 'Phone number kosong');
                continue;
            }

            try {
                const provider = ProviderFactory.getProvider(tenant);
                if (provider instanceof WhatsmeowDriver) {
                    destination = toWhatsAppFormat(destination);
                }
                const renderedMessage = renderTemplate(row.message_template, {
                    full_name: row.full_name,
                    phone_number: row.phone_number,
                    jid: row.jid
                });
                const result = await provider.sendText(destination, renderedMessage);
                await markSent(row.id, row.campaign_id, result?.messageId || null);
            } catch (error) {
                await markFailed(row.id, row.campaign_id, error.message);
            }

            // Respect rate limit: max 50 msgs/min.
            await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
        }
    } finally {
        const campaignIds = Array.from(new Set(rows.map((row) => row.campaign_id).filter(Boolean)));
        await Promise.all(campaignIds.map(finalizeCampaignIfDone));
        isProcessing = false;
    }
}

async function markSent(messageId, campaignId, waMessageId) {
    await db.query(`
        UPDATE campaign_messages
        SET status = 'sent',
            sent_at = now(),
            wa_message_id = $2,
            error_message = NULL
        WHERE id = $1
    `, [messageId, waMessageId]);

    await db.query(`
        UPDATE campaigns
        SET success_count = success_count + 1
        WHERE id = $1
    `, [campaignId]);
}

async function markFailed(messageId, campaignId, errorMessage) {
    const trimmed = (errorMessage || '').toString().slice(0, 500);
    await db.query(`
        UPDATE campaign_messages
        SET status = 'failed',
            error_message = $2
        WHERE id = $1
    `, [messageId, trimmed]);

    await db.query(`
        UPDATE campaigns
        SET failed_count = failed_count + 1
        WHERE id = $1
    `, [campaignId]);
}

async function finalizeCampaignIfDone(campaignId) {
    const result = await db.query(`
        WITH stats AS (
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS active
            FROM campaign_messages
            WHERE campaign_id = $1
        )
        UPDATE campaigns c
        SET
            status = CASE
                WHEN stats.total = 0 THEN 'failed'
                WHEN stats.active = 0 AND stats.failed > 0 AND stats.sent = 0 THEN 'failed'
                WHEN stats.active = 0 THEN 'completed'
                ELSE 'processing'
            END,
            completed_at = CASE WHEN stats.active = 0 THEN now() ELSE c.completed_at END,
            total_targets = stats.total,
            success_count = stats.sent,
            failed_count = stats.failed,
            updated_at = now()
        FROM stats
        WHERE c.id = $1
          AND c.status IN ('scheduled', 'processing')
        RETURNING c.id
    `, [campaignId]);

    return result.rowCount > 0;
}

module.exports = {
    processBatch,
    renderTemplate,
    finalizeCampaignIfDone
};
