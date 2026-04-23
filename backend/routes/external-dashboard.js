const express = require('express');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const RECENT_LIMIT = 10;

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

function normalizeSearch(value) {
    if (typeof value !== 'string') return null;
    const search = value.trim();
    return search ? search.slice(0, 100) : null;
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
        status: chat.status || 'open',
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

async function getCustomerRows(db, tenantId, limit, offset, status, search) {
    if (!search) {
        const [rows, total] = await Promise.all([
            db.getChatsByTenant(tenantId, limit, offset, status),
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

    if (status) {
        rowParams.push(status);
        countParams.push(status);
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

function buildExternalDashboardRouter({ db }) {
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
                    trends: {
                        customers: '0%',
                        chats: '0%',
                        escalations: '0%',
                        leads: '0%',
                    },
                },
            });
        } catch (error) {
            console.error('[External Dashboard API] Stats error:', error.message);
            return res.status(500).json({ status: 'error', message: 'Failed to load dashboard stats' });
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
            return res.status(500).json({ status: 'error', message: 'Failed to load customers' });
        }
    });

    router.get('/chats', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const offset = toPositiveInteger(req.query.offset, 0);
        const status = normalizeStatus(req.query.status);

        try {
            const [chats, totalContacts] = await Promise.all([
                db.getChatsByTenant(tenantId, limit, offset, status),
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
            return res.status(500).json({ status: 'error', message: 'Failed to load chats' });
        }
    });

    router.get('/chats/:chatId/messages', async (req, res) => {
        const tenantId = req.externalTenant.id;
        const limit = toPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const beforeId = typeof req.query.before === 'string' ? req.query.before.trim() : null;

        try {
            const chatCheck = await db.query('SELECT id FROM chats WHERE id = $1 AND tenant_id = $2', [req.params.chatId, tenantId]);
            if (chatCheck.rowCount === 0) {
                return res.status(404).json({ status: 'error', message: 'Chat not found for this tenant' });
            }

            const messages = await db.getMessagesByChat(req.params.chatId, limit, beforeId);
            return res.json({
                status: 'success',
                data: messages.map(mapMessage),
                meta: { limit, before: beforeId },
            });
        } catch (error) {
            console.error('[External Dashboard API] Messages error:', error.message);
            return res.status(500).json({ status: 'error', message: 'Failed to load chat messages' });
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

            return res.json({
                status: 'success',
                data: result.rows.map((row) => ({
                    id: row.chat_id,
                    chat_id: row.chat_id,
                    type: row.status === 'escalated' ? 'escalation' : 'unread_message',
                    title: row.status === 'escalated' ? 'Chat perlu eskalasi' : 'Pesan belum dibaca',
                    message: row.last_message_preview || 'Ada aktivitas chat terbaru',
                    contact_name: row.contact_name || row.phone_number || row.jid || 'Tanpa nama',
                    phone: row.phone_number || '',
                    unread_count: asNumber(row.unread_count),
                    created_at: row.last_message_time,
                })),
                meta: { limit },
            });
        } catch (error) {
            console.error('[External Dashboard API] Notifications error:', error.message);
            return res.status(500).json({ status: 'error', message: 'Failed to load notifications' });
        }
    });

    return router;
}

module.exports = { buildExternalDashboardRouter };
