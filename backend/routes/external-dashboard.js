const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { formatPhoneNumber } = require('../phone-utils');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const RECENT_LIMIT = 10;
const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;
const MEDIA_TTL_MS = 24 * 60 * 60 * 1000;

const mediaDir = path.join(__dirname, '..', 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, mediaDir),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '');
            cb(null, `${randomUUID()}${ext}`);
        }
    }),
    limits: { fileSize: MAX_MEDIA_SIZE_BYTES }
});

const mediaStore = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [id, meta] of mediaStore.entries()) {
        if (meta.expiresAt <= now) {
            mediaStore.delete(id);
            if (meta.path && fs.existsSync(meta.path)) {
                try {
                    fs.unlinkSync(meta.path);
                } catch (_error) {
                    // noop cleanup best effort
                }
            }
        }
    }
}, 5 * 60 * 1000).unref();

let supportTablesReady = null;

async function ensureSupportTables(db) {
    if (supportTablesReady) {
        await supportTablesReady;
        return;
    }

    supportTablesReady = (async () => {
        await db.query(`
            CREATE TABLE IF NOT EXISTS integration_business_overrides (
                tenant_id UUID NOT NULL,
                contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
                status VARCHAR(32) NOT NULL DEFAULT 'new',
                message_sent BOOLEAN NOT NULL DEFAULT false,
                assignee TEXT NULL,
                follow_up_status VARCHAR(32) NOT NULL DEFAULT 'none',
                lead_score INTEGER NULL,
                campaign_batch TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (tenant_id, contact_id)
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS notification_reads (
                tenant_id UUID NOT NULL,
                notification_id TEXT NOT NULL,
                is_read BOOLEAN NOT NULL DEFAULT true,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (tenant_id, notification_id)
            )
        `);
    })();

    try {
        await supportTablesReady;
    } catch (error) {
        supportTablesReady = null;
        throw error;
    }
}

function getTenantKey(req) {
    const header = req.headers['x-tenant-key'];
    const value = Array.isArray(header) ? header[0] : header;
    return typeof value === 'string' ? value.trim() : '';
}

function toPositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.min(parsed, max);
}

function asNumber(value) {
    return Number.parseInt(value || '0', 10) || 0;
}

function normalizeStatus(value) {
    if (typeof value !== 'string') return null;
    const status = value.trim().toLowerCase();
    return status && status !== 'all' ? status : null;
}

function normalizeLeadStatus(value) {
    if (typeof value !== 'string') return null;
    const status = value.trim().toLowerCase();
    const allowed = new Set(['new', 'contacted', 'qualified', 'invalid_whatsapp', 'invalid']);
    if (!allowed.has(status)) return null;
    return status === 'invalid' ? 'invalid_whatsapp' : status;
}

function normalizeFollowUpStatus(value) {
    if (typeof value !== 'string') return null;
    const status = value.trim().toLowerCase();
    const allowed = new Set(['none', 'pending', 'in_progress', 'done']);
    return allowed.has(status) ? status : null;
}

function normalizeSearch(value) {
    if (typeof value !== 'string') return null;
    const search = value.trim();
    return search ? search.slice(0, 100) : null;
}

function normalizeAssignee(value) {
    if (value === null) return null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 80) : null;
}

function normalizeCustomerStatus(chatStatus) {
    switch ((chatStatus || '').toLowerCase()) {
        case 'open':
            return 'active';
        case 'pending':
            return 'pending';
        case 'escalated':
            return 'escalation';
        case 'closed':
            return 'inactive';
        default:
            return 'pending';
    }
}

function toChatStatusFilter(status) {
    switch (status) {
        case 'active':
            return 'open';
        case 'escalation':
            return 'escalated';
        case 'inactive':
            return 'closed';
        case 'pending':
            return 'pending';
        default:
            return status;
    }
}

function mapChatToCustomer(chat) {
    const name = chat.display_name || chat.push_name || chat.phone_number || chat.jid || 'Tanpa nama';
    return {
        id: chat.contact_id,
        contact_id: chat.contact_id,
        chat_id: chat.is_contact_only ? null : chat.id,
        name,
        phone: chat.phone_number || chat.jid || '',
        jid: chat.jid,
        status: normalizeCustomerStatus(chat.status),
        unread_count: asNumber(chat.unread_count),
        last_message: chat.last_message_preview || '',
        last_message_at: chat.last_message_time || chat.updated_at || chat.created_at || null,
        profile_pic_url: chat.profile_pic_url || null,
        assigned_agent: chat.agent_name || null,
        is_group: Boolean(chat.is_group),
        is_contact_only: Boolean(chat.is_contact_only),
        created_at: chat.created_at,
        updated_at: chat.updated_at,
    };
}

function mapMessage(message) {
    return {
        id: message.id,
        chat_id: message.chat_id,
        sender_type: message.sender_type,
        sender_id: message.sender_id,
        sender_name: message.sender_name,
        message_type: message.message_type || 'text',
        body: message.body || '',
        media_url: message.media_url || null,
        wa_message_id: message.wa_message_id || null,
        is_from_me: Boolean(message.is_from_me),
        status: message.status || null,
        created_at: message.created_at,
    };
}

async function getCustomerRows(db, tenantId, limit, offset, status, search) {
    const normalizedChatStatus = status ? toChatStatusFilter(status) : null;
    if (!search) {
        const [rows, total] = await Promise.all([
            db.getChatsByTenant(tenantId, limit, offset, normalizedChatStatus),
            db.getContactCountByTenant(tenantId),
        ]);
        return { rows, total: asNumber(total) };
    }

    const rowParams = [tenantId, limit, offset, `%${search}%`];
    const countParams = [tenantId, `%${search}%`];
    const rowWhereClauses = [
        'con.tenant_id = $1',
        "con.jid NOT LIKE '%@broadcast'",
        "con.jid NOT LIKE '%@newsletter'",
        '(con.full_name ILIKE $4 OR con.phone_number ILIKE $4 OR con.jid ILIKE $4)',
    ];
    const countWhereClauses = [
        'con.tenant_id = $1',
        "con.jid NOT LIKE '%@broadcast'",
        "con.jid NOT LIKE '%@newsletter'",
        '(con.full_name ILIKE $2 OR con.phone_number ILIKE $2 OR con.jid ILIKE $2)',
    ];

    if (normalizedChatStatus) {
        rowParams.push(normalizedChatStatus);
        countParams.push(normalizedChatStatus);
        rowWhereClauses.push(`COALESCE(c.status, 'open') = $${rowParams.length}`);
        countWhereClauses.push(`COALESCE(c.status, 'open') = $${countParams.length}`);
    }

    const rowWhereSql = rowWhereClauses.join(' AND ');
    const countWhereSql = countWhereClauses.join(' AND ');

    const [rowsResult, countResult] = await Promise.all([
        db.query(`
            SELECT
                COALESCE(c.id, gen_random_uuid()) as id,
                con.id as contact_id,
                $1::uuid as tenant_id,
                c.assigned_to,
                COALESCE(c.status, 'open') as status,
                COALESCE(c.is_group, con.jid LIKE '%@g.us') as is_group,
                COALESCE(c.unread_count, 0) as unread_count,
                c.last_message_preview,
                c.last_message_time,
                COALESCE(c.last_message_type, 'text') as last_message_type,
                COALESCE(c.created_at, con.created_at) as created_at,
                COALESCE(c.updated_at, con.updated_at) as updated_at,
                con.full_name as display_name,
                con.full_name as push_name,
                con.phone_number,
                con.jid,
                con.profile_pic_url,
                u.name as agent_name,
                (c.id IS NULL) as is_contact_only
            FROM contacts con
            LEFT JOIN chats c ON c.contact_id = con.id AND c.tenant_id = $1
            LEFT JOIN users u ON c.assigned_to = u.id
            WHERE ${rowWhereSql}
            ORDER BY
                c.updated_at DESC NULLS LAST,
                con.updated_at DESC
            LIMIT $2 OFFSET $3
        `, rowParams),
        db.query(`
            SELECT COUNT(*) as total
            FROM contacts con
            LEFT JOIN chats c ON c.contact_id = con.id AND c.tenant_id = $1
            WHERE ${countWhereSql}
        `, countParams),
    ]);

    return {
        rows: rowsResult.rows,
        total: asNumber(countResult.rows[0]?.total),
    };
}

function buildNotificationId(chatId, kind) {
    return `chat:${chatId}:${kind}`;
}

async function getNotificationReadMap(db, tenantId, notificationIds) {
    if (!notificationIds.length) return new Map();
    const result = await db.query(`
        SELECT notification_id, is_read
        FROM notification_reads
        WHERE tenant_id = $1
          AND notification_id = ANY($2::text[])
    `, [tenantId, notificationIds]);
    return new Map(result.rows.map((row) => [row.notification_id, Boolean(row.is_read)]));
}

async function upsertNotificationRead(db, tenantId, notificationId, isRead) {
    await db.query(`
        INSERT INTO notification_reads (tenant_id, notification_id, is_read, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (tenant_id, notification_id)
        DO UPDATE SET is_read = EXCLUDED.is_read, updated_at = now()
    `, [tenantId, notificationId, Boolean(isRead)]);
}

async function markNotificationsRead(db, tenantId, ids) {
    const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
    if (!uniqueIds.length) return 0;

    await db.query(`
        INSERT INTO notification_reads (tenant_id, notification_id, is_read, updated_at)
        SELECT $1, unnest($2::text[]), true, now()
        ON CONFLICT (tenant_id, notification_id)
        DO UPDATE SET is_read = true, updated_at = now()
    `, [tenantId, uniqueIds]);

    return uniqueIds.length;
}

function computeLeadScore(row) {
    const unread = asNumber(row.unread_count);
    let score = 35;
    if (unread > 0) score += Math.min(unread * 8, 24);
    if (row.last_message_time) {
        const ageMs = Date.now() - new Date(row.last_message_time).getTime();
        if (Number.isFinite(ageMs)) {
            if (ageMs <= 24 * 60 * 60 * 1000) score += 24;
            else if (ageMs <= 7 * 24 * 60 * 60 * 1000) score += 14;
            else score += 4;
        }
    }
    if (row.message_sent) score += 8;
    if ((row.lead_status || '').toLowerCase() === 'qualified') score += 12;
    return Math.max(0, Math.min(100, score));
}

function normalizeReceiver(receiver) {
    const raw = (receiver || '').toString().trim();
    if (!raw) {
        return { destination: '', chatJid: '', isGroup: false, displayName: '' };
    }

    if (raw.includes('@')) {
        const isGroup = raw.endsWith('@g.us');
        const idPart = raw.split('@')[0] || raw;
        return { destination: raw, chatJid: raw, isGroup, displayName: idPart };
    }

    const normalized = formatPhoneNumber(raw);
    return {
        destination: normalized,
        chatJid: `${normalized}@s.whatsapp.net`,
        isGroup: false,
        displayName: normalized
    };
}

function parseBooleanFlag(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

function mapBusinessRow(row) {
    const fallbackPhone = row.phone_number || ((row.jid || '').split('@')[0] || '');
    const leadStatus = normalizeLeadStatus(row.lead_status) || 'new';
    const followUpStatus = normalizeFollowUpStatus(row.follow_up_status) || 'none';

    return {
        id: row.contact_id,
        name: row.full_name || fallbackPhone || 'Tanpa nama',
        phone: fallbackPhone,
        status: leadStatus,
        campaign_batch: row.campaign_batch || row.campaign_name || null,
        lead_score: Number.isFinite(Number(row.lead_score)) ? Number(row.lead_score) : computeLeadScore(row),
        location: null,
        market_segment: null,
        has_phone: Boolean(fallbackPhone),
        message_sent: Boolean(row.message_sent),
        assignee: row.assignee || null,
        follow_up_status: followUpStatus,
        created_at: row.created_at || row.last_message_time || null,
        updated_at: row.override_updated_at || row.chat_updated_at || row.updated_at || null,
    };
}

async function sendExternalMessage({
    tenant,
    payload,
    db,
    scheduleMessageSend,
    waGateway,
}) {
    if (!scheduleMessageSend || !waGateway) {
        throw new Error('Gateway service not initialized');
    }
    if (!tenant?.session_id) {
        throw new Error('Tenant has no active WhatsApp session');
    }

    const mtype = (payload?.mtype || 'text').toString().trim().toLowerCase();
    const receiver = normalizeReceiver(payload?.receiver || payload?.phone || payload?.to);
    const text = (payload?.text || payload?.message || '').toString();
    const mediaUrl = (payload?.url || payload?.image_url || payload?.media_url || '').toString().trim();
    const filename = (payload?.filename || payload?.file_name || 'document').toString().trim() || 'document';
    const viewOnce = parseBooleanFlag(payload?.view_once, false);

    if (!receiver.destination || !receiver.chatJid) {
        throw new Error('receiver is required');
    }
    if (mtype === 'text' && !text.trim()) {
        throw new Error('text is required for mtype=text');
    }
    if (mtype !== 'text' && !mediaUrl) {
        throw new Error('url is required for media message');
    }

    const chat = await db.getOrCreateChat(
        tenant.id,
        receiver.chatJid,
        receiver.displayName || null,
        receiver.isGroup
    );

    const result = await scheduleMessageSend(tenant.session_id, async () => {
        if (mtype === 'text') {
            return waGateway.sendText(tenant.session_id, receiver.destination, text.trim());
        }
        if (mtype === 'image') {
            return waGateway.sendImage(tenant.session_id, receiver.destination, mediaUrl, text || '', viewOnce);
        }
        if (mtype === 'video') {
            return waGateway.sendVideo(tenant.session_id, receiver.destination, mediaUrl, text || '', viewOnce);
        }
        if (mtype === 'audio') {
            return waGateway.sendAudio(tenant.session_id, receiver.destination, mediaUrl);
        }
        if (mtype === 'document') {
            return waGateway.sendDocument(tenant.session_id, receiver.destination, mediaUrl, filename);
        }
        throw new Error(`Unsupported mtype: ${mtype}`);
    });

    if (!(result?.status === true || result?.status === 'success')) {
        throw new Error(result?.message || 'Failed to send message');
    }

    const logBody = text.trim() || `[${mtype.toUpperCase()}]`;
    const message = await db.logMessage({
        chatId: chat.id,
        senderType: 'agent',
        messageType: mtype,
        body: logBody,
        mediaUrl: mtype === 'text' ? null : mediaUrl,
        waMessageId: result?.data?.msgid || null,
        isFromMe: true
    });

    return { chat, message, result };
}

function buildPublicMediaUrl(req, mediaId) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto)
        ? (forwardedProto[0] || req.protocol || 'https')
        : (typeof forwardedProto === 'string' && forwardedProto.trim() ? forwardedProto.split(',')[0].trim() : (req.protocol || 'https'));
    const host = req.get('host');
    return `${proto}://${host}${req.baseUrl}/media/${mediaId}`;
}

function buildExternalDashboardRouter({ db, scheduleMessageSend, waGateway }) {
    const router = express.Router();

    router.use(async (req, res, next) => {
        const apiKey = getTenantKey(req);
        if (!apiKey) {
            return res.status(401).json({ status: 'error', message: 'Missing X-Tenant-Key header' });
        }

        try {
            const tenant = await db.getTenantByApiKey(apiKey);
            if (!tenant) return res.status(401).json({ status: 'error', message: 'Invalid tenant API key' });
            if (tenant.status !== 'active') return res.status(403).json({ status: 'error', message: 'Tenant is not active' });

            await ensureSupportTables(db);

            req.externalTenant = tenant;
            return next();
        } catch (error) {
            console.error('[External Dashboard API] Tenant auth failed:', error.message);
            return res.status(500).json({ status: 'error', message: 'Failed to validate tenant key' });
        }
    });

    router.get('/stats', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const range = typeof req.query.range === 'string' ? req.query.range : null;

        try {
            const [stats, totalContacts, messageStats] = await Promise.all([
                db.getDashboardStats(tenantId, range),
                db.getContactCountByTenant(tenantId),
                db.query(`
                    SELECT
                        COUNT(*) as total_messages,
                        COUNT(*) FILTER (WHERE m.created_at::date = CURRENT_DATE) as today_messages,
                        COUNT(*) FILTER (WHERE m.created_at >= date_trunc('month', now())) as messages_this_month,
                        COUNT(*) FILTER (WHERE m.sender_type = 'customer' AND m.created_at >= date_trunc('month', now())) as leads_this_month
                    FROM messages m
                    JOIN chats c ON c.id = m.chat_id
                    WHERE c.tenant_id = $1
                `, [tenantId]),
            ]);

            const chatStats = stats.chats || {};
            const userStats = stats.users || {};
            const msgStats = messageStats.rows[0] || {};

            return res.json({
                status: 'success',
                data: {
                    tenant: {
                        id: req.externalTenant.id,
                        company_name: req.externalTenant.company_name,
                        session_id: req.externalTenant.session_id,
                    },
                    totalCustomers: asNumber(totalContacts),
                    totalChats: asNumber(chatStats.total_chats),
                    openChats: asNumber(chatStats.open_chats),
                    pendingChats: asNumber(chatStats.pending_chats),
                    closedChats: asNumber(chatStats.closed_chats),
                    openEscalations: asNumber(chatStats.escalated_chats),
                    totalUnread: asNumber(chatStats.total_unread),
                    todayChats: asNumber(chatStats.today_chats),
                    totalMessages: asNumber(msgStats.total_messages),
                    todayMessages: asNumber(msgStats.today_messages),
                    messagesThisMonth: asNumber(msgStats.messages_this_month),
                    leadsThisMonth: asNumber(msgStats.leads_this_month),
                    totalUsers: asNumber(userStats.total_users),
                    adminCount: asNumber(userStats.admin_count),
                    agentCount: asNumber(userStats.agent_count),
                    customerTrend: '0%',
                    customerTrendStatus: 'up',
                    chatTrend: '0%',
                    chatTrendStatus: 'up',
                    escTrend: '0%',
                    escTrendStatus: 'down',
                    escTrendInverted: true,
                    leadsTrend: '0%',
                    leadsTrendStatus: 'up',
                },
            });
        } catch (error) {
            console.error('[External Dashboard API] Stats error:', error.message);
            return res.status(500).json({ error: 'Failed to load dashboard stats' });
        }
    });

    router.get('/customers', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const offset = toPositiveInteger(req.query.offset, 0);
        const status = normalizeStatus(req.query.status);
        const search = normalizeSearch(req.query.search);

        try {
            const { rows, total } = await getCustomerRows(db, tenantId, limit, offset, status, search);

            return res.json({
                status: 'success',
                data: rows.map(mapChatToCustomer),
                meta: {
                    limit,
                    offset,
                    total,
                },
            });
        } catch (error) {
            console.error('[External Dashboard API] Customers error:', error.message);
            return res.status(500).json({ error: 'Failed to load customers' });
        }
    });

    router.get('/escalations', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, RECENT_LIMIT, MAX_LIMIT);

        try {
            const result = await db.query(`
                SELECT
                    c.id,
                    c.unread_count,
                    c.last_message_preview,
                    c.last_message_time,
                    con.full_name as contact_name,
                    con.phone_number,
                    con.jid
                FROM chats c
                JOIN contacts con ON con.id = c.contact_id
                WHERE c.tenant_id = $1
                  AND COALESCE(c.status, 'open') = 'escalated'
                ORDER BY c.updated_at DESC
                LIMIT $2
            `, [tenantId, limit]);

            return res.json({
                status: 'success',
                data: result.rows.map((row) => ({
                    id: row.id,
                    name: row.contact_name || row.phone_number || row.jid || 'Tanpa nama',
                    phone: row.phone_number || row.jid || '',
                    issue: row.last_message_preview || 'Perlu penanganan lanjutan',
                    priority: asNumber(row.unread_count) >= 5 ? 'high' : 'medium',
                    status: 'open',
                })),
            });
        } catch (error) {
            console.error('[External Dashboard API] Escalations error:', error.message);
            return res.status(500).json({ error: 'Failed to load escalations' });
        }
    });

    router.get('/chat-history', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const chatId = typeof req.query.chatId === 'string' ? req.query.chatId.trim() : '';
        const limit = toPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const beforeId = typeof req.query.before === 'string' ? req.query.before.trim() : null;

        if (!chatId) {
            return res.status(400).json({ error: 'chatId is required' });
        }

        try {
            const chatCheck = await db.query(
                'SELECT id, contact_id FROM chats WHERE id = $1 AND tenant_id = $2',
                [chatId, tenantId]
            );
            if (chatCheck.rowCount === 0) {
                return res.status(404).json({ error: 'Chat not found for this tenant' });
            }
            const contactId = chatCheck.rows[0].contact_id;

            const messages = await db.getMessagesByChat(chatId, limit, beforeId);
            return res.json({
                status: 'success',
                data: messages.map((message) => ({
                    id: message.id,
                    customer_id: contactId,
                    chat_id: message.chat_id,
                    message_type: message.message_type || 'text',
                    content: message.body || message.media_url || '',
                    source_type: message.message_type || 'text',
                    sender_type: message.sender_type,
                    sender_name: message.sender_name,
                    from_me: Boolean(message.is_from_me),
                    created_at: message.created_at,
                    escalated: false,
                })),
                meta: {
                    hasMore: messages.length >= limit,
                    limit,
                    before: beforeId,
                }
            });
        } catch (error) {
            console.error('[External Dashboard API] Chat history error:', error.message);
            return res.status(500).json({ error: 'Failed to load chat history' });
        }
    });

    router.get('/marketing', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, 50, MAX_LIMIT);

        try {
            const result = await db.query(`
                SELECT
                    c.id,
                    c.name,
                    c.scheduled_at,
                    c.created_at,
                    COALESCE(c.total_targets, COUNT(cm.id)::int) as total_leads,
                    COALESCE(c.success_count, COUNT(*) FILTER (WHERE cm.status = 'sent')::int) as contacted,
                    COALESCE(c.failed_count, COUNT(*) FILTER (WHERE cm.status = 'failed')::int) as invalid,
                    COALESCE(ROUND(AVG(NULLIF(ibo.lead_score, 0))), 0)::int as avg_lead_score
                FROM campaigns c
                LEFT JOIN campaign_messages cm ON cm.campaign_id = c.id
                LEFT JOIN integration_business_overrides ibo
                    ON ibo.tenant_id = c.tenant_id
                   AND ibo.contact_id = cm.contact_id
                WHERE c.tenant_id = $1
                GROUP BY c.id
                ORDER BY COALESCE(c.scheduled_at, c.created_at) DESC
                LIMIT $2
            `, [tenantId, limit]);

            return res.json({
                status: 'success',
                data: result.rows.map((row) => ({
                    name: row.name,
                    total_leads: asNumber(row.total_leads),
                    contacted: asNumber(row.contacted),
                    invalid: asNumber(row.invalid),
                    avg_lead_score: asNumber(row.avg_lead_score),
                    batch_date: row.scheduled_at || row.created_at || null,
                })),
            });
        } catch (error) {
            console.error('[External Dashboard API] Marketing error:', error.message);
            return res.status(500).json({ error: 'Failed to load campaigns' });
        }
    });

    router.get('/businesses', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const offset = toPositiveInteger(req.query.offset, 0);
        const status = normalizeLeadStatus(req.query.status);
        const search = normalizeSearch(req.query.search);
        const assignee = normalizeAssignee(req.query.assignee);
        const followUpStatus = normalizeFollowUpStatus(req.query.follow_up_status);
        const requestId = randomUUID();

        try {
            const baseParams = [tenantId];
            const whereClauses = [
                'con.tenant_id = $1',
                "con.jid NOT LIKE '%@broadcast'",
                "con.jid NOT LIKE '%@newsletter'",
            ];

            if (search) {
                const idx = baseParams.push(`%${search}%`);
                whereClauses.push(`(con.full_name ILIKE $${idx} OR con.phone_number ILIKE $${idx} OR con.jid ILIKE $${idx})`);
            }
            if (status) {
                const idx = baseParams.push(status);
                whereClauses.push(`COALESCE(ibo.status, 'new') = $${idx}`);
            }
            if (assignee) {
                const idx = baseParams.push(assignee.toLowerCase());
                whereClauses.push(`LOWER(COALESCE(ibo.assignee, '')) = $${idx}`);
            }
            if (followUpStatus) {
                const idx = baseParams.push(followUpStatus);
                whereClauses.push(`COALESCE(ibo.follow_up_status, 'none') = $${idx}`);
            }

            const whereSql = whereClauses.join(' AND ');

            const countQuery = `
                SELECT COUNT(*) as total
                FROM contacts con
                LEFT JOIN integration_business_overrides ibo
                    ON ibo.tenant_id = $1
                   AND ibo.contact_id = con.id
                WHERE ${whereSql}
            `;
            const countResult = await db.query(countQuery, baseParams);
            const total = asNumber(countResult.rows[0]?.total);

            const rowParams = [...baseParams, limit, offset];
            const rowsQuery = `
                SELECT
                    con.id as contact_id,
                    con.full_name,
                    con.phone_number,
                    con.jid,
                    con.created_at,
                    con.updated_at,
                    c.id as chat_id,
                    c.status as chat_status,
                    c.unread_count,
                    c.last_message_preview,
                    c.last_message_time,
                    c.updated_at as chat_updated_at,
                    ibo.status as lead_status,
                    ibo.message_sent,
                    ibo.assignee,
                    ibo.follow_up_status,
                    ibo.lead_score,
                    ibo.campaign_batch,
                    ibo.updated_at as override_updated_at,
                    camp.campaign_name
                FROM contacts con
                LEFT JOIN chats c
                    ON c.contact_id = con.id
                   AND c.tenant_id = $1
                LEFT JOIN integration_business_overrides ibo
                    ON ibo.tenant_id = $1
                   AND ibo.contact_id = con.id
                LEFT JOIN LATERAL (
                    SELECT cp.name as campaign_name
                    FROM campaign_messages cm
                    JOIN campaigns cp ON cp.id = cm.campaign_id
                    WHERE cm.contact_id = con.id
                      AND cp.tenant_id = $1
                    ORDER BY COALESCE(cm.sent_at, cm.created_at) DESC
                    LIMIT 1
                ) camp ON true
                WHERE ${whereSql}
                ORDER BY COALESCE(ibo.updated_at, c.updated_at, con.updated_at) DESC
                LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}
            `;
            const rowResult = await db.query(rowsQuery, rowParams);

            return res.json({
                status: 'success',
                data: rowResult.rows.map(mapBusinessRow),
                meta: {
                    total,
                    limit,
                    offset,
                    requestId,
                }
            });
        } catch (error) {
            console.error('[External Dashboard API] Businesses error:', error.message);
            return res.status(500).json({ error: 'Failed to load businesses' });
        }
    });

    router.patch('/businesses/:id', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const contactId = (req.params.id || '').toString().trim();

        if (!contactId) {
            return res.status(400).json({ error: 'Business id is required' });
        }

        try {
            const exists = await db.query(
                'SELECT id FROM contacts WHERE tenant_id = $1 AND id = $2',
                [tenantId, contactId]
            );
            if (exists.rowCount === 0) {
                return res.status(404).json({ error: 'Business not found' });
            }

            const existingOverrideRes = await db.query(`
                SELECT *
                FROM integration_business_overrides
                WHERE tenant_id = $1 AND contact_id = $2
            `, [tenantId, contactId]);
            const existingOverride = existingOverrideRes.rows[0] || {};

            const nextStatus = Object.prototype.hasOwnProperty.call(req.body || {}, 'status')
                ? normalizeLeadStatus(req.body.status)
                : (normalizeLeadStatus(existingOverride.status) || 'new');
            if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status') && !nextStatus) {
                return res.status(400).json({ error: 'Invalid status value' });
            }

            const nextMessageSent = Object.prototype.hasOwnProperty.call(req.body || {}, 'message_sent')
                ? Boolean(req.body.message_sent)
                : Boolean(existingOverride.message_sent);

            const nextAssignee = Object.prototype.hasOwnProperty.call(req.body || {}, 'assignee')
                ? normalizeAssignee(req.body.assignee)
                : (existingOverride.assignee || null);

            const nextFollowUp = Object.prototype.hasOwnProperty.call(req.body || {}, 'follow_up_status')
                ? normalizeFollowUpStatus(req.body.follow_up_status)
                : (normalizeFollowUpStatus(existingOverride.follow_up_status) || 'none');
            if (Object.prototype.hasOwnProperty.call(req.body || {}, 'follow_up_status') && !nextFollowUp) {
                return res.status(400).json({ error: 'Invalid follow_up_status value' });
            }

            const nextLeadScore = Object.prototype.hasOwnProperty.call(req.body || {}, 'lead_score')
                ? (Number.isFinite(Number(req.body.lead_score)) ? Number(req.body.lead_score) : null)
                : (Number.isFinite(Number(existingOverride.lead_score)) ? Number(existingOverride.lead_score) : null);

            const nextCampaignBatch = Object.prototype.hasOwnProperty.call(req.body || {}, 'campaign_batch')
                ? ((req.body.campaign_batch || '').toString().trim() || null)
                : (existingOverride.campaign_batch || null);

            await db.query(`
                INSERT INTO integration_business_overrides (
                    tenant_id,
                    contact_id,
                    status,
                    message_sent,
                    assignee,
                    follow_up_status,
                    lead_score,
                    campaign_batch,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
                ON CONFLICT (tenant_id, contact_id)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    message_sent = EXCLUDED.message_sent,
                    assignee = EXCLUDED.assignee,
                    follow_up_status = EXCLUDED.follow_up_status,
                    lead_score = EXCLUDED.lead_score,
                    campaign_batch = EXCLUDED.campaign_batch,
                    updated_at = now()
            `, [
                tenantId,
                contactId,
                nextStatus || 'new',
                nextMessageSent,
                nextAssignee,
                nextFollowUp || 'none',
                nextLeadScore,
                nextCampaignBatch
            ]);

            const updatedRow = await db.query(`
                SELECT
                    con.id as contact_id,
                    con.full_name,
                    con.phone_number,
                    con.jid,
                    con.created_at,
                    con.updated_at,
                    c.id as chat_id,
                    c.status as chat_status,
                    c.unread_count,
                    c.last_message_preview,
                    c.last_message_time,
                    c.updated_at as chat_updated_at,
                    ibo.status as lead_status,
                    ibo.message_sent,
                    ibo.assignee,
                    ibo.follow_up_status,
                    ibo.lead_score,
                    ibo.campaign_batch,
                    ibo.updated_at as override_updated_at,
                    null::text as campaign_name
                FROM contacts con
                LEFT JOIN chats c
                    ON c.contact_id = con.id
                   AND c.tenant_id = $1
                LEFT JOIN integration_business_overrides ibo
                    ON ibo.tenant_id = $1
                   AND ibo.contact_id = con.id
                WHERE con.tenant_id = $1
                  AND con.id = $2
                LIMIT 1
            `, [tenantId, contactId]);

            return res.json({
                status: 'success',
                data: mapBusinessRow(updatedRow.rows[0]),
            });
        } catch (error) {
            console.error('[External Dashboard API] Update business error:', error.message);
            return res.status(500).json({ error: 'Failed to update business' });
        }
    });

    router.get('/notifications', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, RECENT_LIMIT, MAX_LIMIT);

        try {
            const result = await db.query(`
                SELECT
                    c.id as chat_id,
                    c.status,
                    c.unread_count,
                    c.last_message_preview,
                    c.last_message_time,
                    c.updated_at,
                    con.full_name as contact_name,
                    con.phone_number,
                    con.jid
                FROM chats c
                JOIN contacts con ON con.id = c.contact_id
                WHERE c.tenant_id = $1
                  AND (COALESCE(c.unread_count, 0) > 0 OR COALESCE(c.status, 'open') = 'escalated')
                ORDER BY c.last_message_time DESC NULLS LAST, c.updated_at DESC
                LIMIT $2
            `, [tenantId, limit]);

            const rawNotifications = result.rows.map((row) => {
                const kind = row.status === 'escalated' ? 'escalation' : 'chat';
                const id = buildNotificationId(row.chat_id, kind);
                return {
                    id,
                    type: kind,
                    title: kind === 'escalation' ? 'Chat perlu eskalasi' : 'Pesan belum dibaca',
                    message: row.last_message_preview || 'Ada aktivitas chat terbaru',
                    time: row.last_message_time || row.updated_at || new Date().toISOString(),
                    link: '/customer-service',
                    customerId: row.chat_id,
                    contactName: row.contact_name || row.phone_number || row.jid || 'Tanpa nama',
                    phone: row.phone_number || row.jid || '',
                    unreadCount: asNumber(row.unread_count),
                };
            });

            const readMap = await getNotificationReadMap(
                db,
                tenantId,
                rawNotifications.map((item) => item.id)
            );

            return res.json({
                status: 'success',
                data: rawNotifications.map((item) => ({
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    message: item.message,
                    time: item.time,
                    read: readMap.has(item.id) ? Boolean(readMap.get(item.id)) : false,
                    link: item.link,
                    customerId: item.customerId,
                    contactName: item.contactName,
                    phone: item.phone,
                })),
                meta: { limit },
            });
        } catch (error) {
            console.error('[External Dashboard API] Notifications error:', error.message);
            return res.status(500).json({ error: 'Failed to load notifications' });
        }
    });

    router.patch('/notifications/:id/read', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const notificationId = (req.params.id || '').toString().trim();
        const read = parseBooleanFlag(req.body?.read, true);

        if (!notificationId) {
            return res.status(400).json({ error: 'Notification id is required' });
        }

        try {
            await upsertNotificationRead(db, tenantId, notificationId, read);
            return res.json({
                status: 'success',
                data: { id: notificationId, read }
            });
        } catch (error) {
            console.error('[External Dashboard API] Notification read update error:', error.message);
            return res.status(500).json({ error: 'Failed to update notification' });
        }
    });

    router.post('/notifications/read-all', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

        try {
            const updated = await markNotificationsRead(db, tenantId, ids);
            return res.json({
                status: 'success',
                data: { updated }
            });
        } catch (error) {
            console.error('[External Dashboard API] Notification read-all error:', error.message);
            return res.status(500).json({ error: 'Failed to update notifications' });
        }
    });

    router.post('/send-message', async (req, res) => {
        try {
            const output = await sendExternalMessage({
                tenant: req.externalTenant,
                payload: req.body,
                db,
                scheduleMessageSend,
                waGateway,
            });

            return res.json({
                status: 'success',
                data: {
                    messageId: output.message?.id || null,
                    chatId: output.chat?.id || null,
                    gatewayMessageId: output.result?.data?.msgid || null,
                    sentAt: output.message?.created_at || new Date().toISOString(),
                }
            });
        } catch (error) {
            console.error('[External Dashboard API] Send message error:', error.message);
            return res.status(500).json({ error: error.message || 'Failed to send message' });
        }
    });

    router.post('/media/upload', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const mediaId = req.file.filename;
            const now = Date.now();
            const expiresAt = now + MEDIA_TTL_MS;
            mediaStore.set(mediaId, {
                id: mediaId,
                path: req.file.path,
                filename: req.file.originalname || req.file.filename,
                mimeType: req.file.mimetype,
                size: req.file.size,
                createdAt: now,
                expiresAt,
            });

            const publicUrl = buildPublicMediaUrl(req, mediaId);
            return res.status(201).json({
                status: 'success',
                data: {
                    id: mediaId,
                    filename: req.file.originalname || req.file.filename,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    expiresAt: new Date(expiresAt).toISOString(),
                    url: publicUrl,
                }
            });
        } catch (error) {
            console.error('[External Dashboard API] Media upload error:', error.message);
            return res.status(500).json({ error: 'Failed to upload media' });
        }
    });

    router.get('/media/:id', async (req, res) => {
        const mediaId = (req.params.id || '').toString().trim();
        const meta = mediaStore.get(mediaId);

        if (!meta || !meta.path || !fs.existsSync(meta.path)) {
            return res.status(404).json({ error: 'Media not found' });
        }
        if (meta.expiresAt <= Date.now()) {
            mediaStore.delete(mediaId);
            try {
                fs.unlinkSync(meta.path);
            } catch (_error) {
                // noop cleanup
            }
            return res.status(410).json({ error: 'Media expired' });
        }

        if (meta.mimeType) {
            res.setHeader('Content-Type', meta.mimeType);
        }
        return res.sendFile(path.resolve(meta.path));
    });

    // Legacy endpoint set (keep compatibility with prior clients)
    router.get('/chats', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const offset = toPositiveInteger(req.query.offset, 0);
        const status = normalizeStatus(req.query.status);
        const chatStatus = status ? toChatStatusFilter(status) : null;

        try {
            const [chats, totalContacts] = await Promise.all([
                db.getChatsByTenant(tenantId, limit, offset, chatStatus),
                db.getContactCountByTenant(tenantId),
            ]);

            return res.json({
                status: 'success',
                data: chats,
                meta: {
                    limit,
                    offset,
                    total: asNumber(totalContacts),
                },
            });
        } catch (error) {
            console.error('[External Dashboard API] Chats error:', error.message);
            return res.status(500).json({ error: 'Failed to load chats' });
        }
    });

    router.get('/chats/:chatId/messages', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const beforeId = typeof req.query.before === 'string' ? req.query.before.trim() : null;

        try {
            const chatCheck = await db.query('SELECT id FROM chats WHERE id = $1 AND tenant_id = $2', [req.params.chatId, tenantId]);
            if (chatCheck.rowCount === 0) {
                return res.status(404).json({ error: 'Chat not found for this tenant' });
            }

            const messages = await db.getMessagesByChat(req.params.chatId, limit, beforeId);
            return res.json({
                status: 'success',
                data: messages.map(mapMessage),
                meta: { limit, before: beforeId },
            });
        } catch (error) {
            console.error('[External Dashboard API] Messages error:', error.message);
            return res.status(500).json({ error: 'Failed to load chat messages' });
        }
    });

    return router;
}

module.exports = { buildExternalDashboardRouter };
