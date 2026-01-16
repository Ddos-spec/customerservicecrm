/**
 * PostgreSQL Database Connection - V2 (Simplified Schema)
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('connect', () => { console.log('✅ PostgreSQL connected'); });
pool.on('error', (err) => { console.error('❌ PostgreSQL pool error:', err.message); });

async function query(text, params) {
    const result = await pool.query(text, params);
    return result;
}

async function getClient() { return pool.connect(); }

// =============================================
// 1. USER & TENANT QUERIES (Tetap Sama)
// =============================================

async function findUserByEmail(email) {
    const result = await query(
        `SELECT u.*, t.company_name as tenant_name, t.session_id as tenant_session_id
         FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.email = $1`,
        [email]
    );
    return result.rows[0] || null;
}

async function findUserById(id) {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function getTenantById(id) {
    const result = await query('SELECT * FROM tenants WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function getTenantBySessionId(sessionId) {
    const result = await query('SELECT * FROM tenants WHERE session_id = $1', [sessionId]);
    return result.rows[0] || null;
}

// =============================================
// 2. CONTACTS (V2)
// =============================================

async function syncContacts(tenantId, contacts) {
    if (!contacts || contacts.length === 0) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const c of contacts) {
            const jid = c.jid || c.JID;
            if (!jid) continue;
            const phone = c.phone || jid.split('@')[0];

            // Priority for full_name: fullName > firstName > pushName > phone
            const fullName = c.fullName || c.firstName || c.pushName || c.displayName || phone;

            await client.query(`
                INSERT INTO contacts (tenant_id, jid, phone_number, full_name, is_business)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (tenant_id, jid) DO UPDATE SET
                    phone_number = COALESCE(EXCLUDED.phone_number, contacts.phone_number),
                    full_name = COALESCE(EXCLUDED.full_name, contacts.full_name),
                    is_business = EXCLUDED.is_business,
                    updated_at = now()
            `, [tenantId, jid, phone, fullName, c.isBusiness || false]);
        }
        await client.query('COMMIT');
        console.log(`[DB] Synced ${contacts.length} contacts for tenant ${tenantId}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB] Sync Contacts Error:', error.message);
        throw error;
    } finally { client.release(); }
}

async function getContactsByTenant(tenantId) {
    // Select full_name as display_name for frontend compatibility
    const result = await query('SELECT *, full_name as display_name FROM contacts WHERE tenant_id = $1 ORDER BY updated_at DESC', [tenantId]);
    return result.rows;
}

async function getContactByJid(tenantId, jid) {
    const result = await query('SELECT * FROM contacts WHERE tenant_id = $1 AND jid = $2', [tenantId, jid]);
    return result.rows[0] || null;
}

// =============================================
// 3. CHATS & MESSAGES (V2 - Pengganti Tiket)
// =============================================

async function getOrCreateChat(tenantId, jid, pushName = null, isGroup = false) {
    // 1. Pastikan kontak ada
    let contactRes = await query('SELECT id, full_name, phone_number FROM contacts WHERE tenant_id = $1 AND jid = $2', [tenantId, jid]);
    let contactId;

    if (contactRes.rows.length === 0) {
        const phone = isGroup ? null : jid.split('@')[0];
        // Use pushName or phone as initial full_name (for groups, this is group name)
        const initialName = pushName || (isGroup ? 'Group Chat' : phone);
        const res = await query(
            'INSERT INTO contacts (tenant_id, jid, phone_number, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
            [tenantId, jid, phone, initialName]
        );
        contactId = res.rows[0].id;
    } else {
        const existing = contactRes.rows[0];
        contactId = existing.id;
        const newName = typeof pushName === 'string' ? pushName.trim() : '';
        if (newName) {
            const existingName = (existing.full_name || '').trim();
            const jidUser = jid.split('@')[0];
            const fallbackNames = new Set(['Group Chat', 'Unknown Group', jidUser]);
            if (existing.phone_number) {
                fallbackNames.add(existing.phone_number);
            }

            let shouldUpdate = false;
            if (isGroup) {
                shouldUpdate = !fallbackNames.has(newName) && newName !== existingName;
            } else if (!existingName || fallbackNames.has(existingName)) {
                shouldUpdate = newName !== existingName;
            }

            if (shouldUpdate) {
                await query(
                    'UPDATE contacts SET full_name = $1, updated_at = now() WHERE id = $2',
                    [newName, contactId]
                );
            }
        }
    }

    // 2. Dapatkan atau buat chat room
    let chatRes = await query('SELECT * FROM chats WHERE tenant_id = $1 AND contact_id = $2', [tenantId, contactId]);
    if (chatRes.rows.length > 0) {
        const chat = chatRes.rows[0];
        if (isGroup && !chat.is_group) {
            const updated = await query(
                'UPDATE chats SET is_group = true, updated_at = now() WHERE id = $1 RETURNING *',
                [chat.id]
            );
            return updated.rows[0] || chat;
        }
        return chat;
    }

    const newChat = await query(
        'INSERT INTO chats (tenant_id, contact_id, is_group) VALUES ($1, $2, $3) RETURNING *',
        [tenantId, contactId, isGroup]
    );
    return newChat.rows[0];
}

async function logMessage({ chatId, senderType, senderId, senderName, messageType, body, mediaUrl, waMessageId, isFromMe }) {
    const res = await query(`
        INSERT INTO messages (chat_id, sender_type, sender_id, sender_name, message_type, body, media_url, wa_message_id, is_from_me)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [chatId, senderType, senderId, senderName, messageType || 'text', body, mediaUrl, waMessageId, isFromMe || false]);

    // Update Chat Preview
    await query(`
        UPDATE chats SET 
            last_message_preview = $1, 
            last_message_time = now(), 
            last_message_type = $2,
            unread_count = CASE WHEN $3 = false THEN unread_count + 1 ELSE unread_count END,
            updated_at = now()
        WHERE id = $4
    `, [body?.substring(0, 100), messageType || 'text', isFromMe || false, chatId]);

    return res.rows[0];
}

async function getChatsByTenant(tenantId, limit = 50, offset = 0, status = null) {
    const params = [tenantId, limit, offset];
    const normalizedStatus = typeof status === 'string' && status.trim() !== '' ? status.trim() : null;
    const statusFilter = normalizedStatus
        ? `AND COALESCE(c.status, 'open') = $${params.push(normalizedStatus)}`
        : '';

    const result = await query(`
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
        WHERE con.tenant_id = $1
          AND con.jid NOT LIKE '%@broadcast'
          AND con.jid NOT LIKE '%@lid'
          AND con.jid NOT LIKE '%@newsletter'
          ${statusFilter}
        ORDER BY
            c.updated_at DESC NULLS LAST,
            con.updated_at DESC
        LIMIT $2 OFFSET $3
    `, params);
    return result.rows;
}

async function getMessagesByChat(chatId, limit = 50, beforeId = null) {
    let queryText = 'SELECT * FROM messages WHERE chat_id = $1';
    let params = [chatId, limit];
    
    if (beforeId) {
        queryText += ' AND created_at < (SELECT created_at FROM messages WHERE id = $3)';
        params.push(beforeId);
    }
    
    // Ambil data secara DESC (Mundur ke masa lalu) untuk mendapatkan "X pesan sebelum ini"
    queryText += ' ORDER BY created_at DESC LIMIT $2';

    const result = await query(queryText, params);
    
    // Kembalikan urutannya menjadi ASC (Kronologis) agar Frontend mudah merender
    return result.rows.reverse();
}

// =============================================
// 4. STATS (V2)
// =============================================

async function markChatAsRead(chatId) {
    const result = await query(`
        UPDATE chats SET unread_count = 0, updated_at = now() WHERE id = $1 RETURNING *
    `, [chatId]);
    return result.rows[0];
}

async function getDashboardStats(tenantId) {
    const [chatStats, userStats] = await Promise.all([
        query(`
            SELECT
                COUNT(*) as total_chats,
                COALESCE(SUM(unread_count), 0) as total_unread,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'open') as open_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'pending') as pending_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'closed') as closed_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'escalated') as escalated_chats,
                COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today_chats
            FROM chats
            WHERE tenant_id = $1
        `, [tenantId]),
        query(`
            SELECT
                COUNT(*) as total_users,
                COUNT(*) FILTER (WHERE role = 'admin_agent') as admin_count,
                COUNT(*) FILTER (WHERE role = 'agent') as agent_count
            FROM users
            WHERE tenant_id = $1
        `, [tenantId])
    ]);
    return {
        chats: chatStats.rows[0],
        users: userStats.rows[0]
    };
}

async function getSuperAdminStats() {
    const [tenantStats, userStats, chatStats] = await Promise.all([
        query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM tenants"),
        query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE role = 'admin_agent') as admin_count,
                COUNT(*) FILTER (WHERE role = 'agent') as agent_count
            FROM users
        `),
        query(`
            SELECT
                COUNT(*) as total,
                COALESCE(SUM(unread_count), 0) as total_unread,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'open') as open_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'pending') as pending_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'closed') as closed_chats,
                COUNT(*) FILTER (WHERE COALESCE(status, 'open') = 'escalated') as escalated_chats,
                COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today_chats
            FROM chats
        `)
    ]);
    return {
        tenants: tenantStats.rows[0],
        users: userStats.rows[0],
        chats: chatStats.rows[0]
    };
}

module.exports = {
    query, getClient, pool,
    // Users & Tenants
    findUserByEmail, findUserById, getTenantById, getTenantBySessionId, getAllTenants: async () => (await query('SELECT * FROM tenants ORDER BY created_at DESC')).rows,
    createUser: async (u) => (await query('INSERT INTO users (tenant_id, name, email, password_hash, role, phone_number) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [u.tenant_id, u.name, u.email, u.password_hash, u.role, u.phone_number])).rows[0],
    updateUser: async (id, u) => {
        const fields = Object.keys(u).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const vals = Object.values(u);
        return (await query(`UPDATE users SET ${fields} WHERE id = $1 RETURNING *`, [id, ...vals])).rows[0];
    },
    deleteUser: async (id) => (await query('DELETE FROM users WHERE id = $1 RETURNING id', [id])).rows[0],
    getUsersByTenant: async (tid) => (await query('SELECT * FROM users WHERE tenant_id = $1', [tid])).rows,
    getUsersByTenantWithPhone: async (tid, roles) => (await query('SELECT * FROM users WHERE tenant_id = $1 AND role = ANY($2::text[]) AND phone_number IS NOT NULL', [tid, roles])).rows,
    getSuperAdminsWithPhone: async () => (await query("SELECT * FROM users WHERE role = 'super_admin' AND phone_number IS NOT NULL")).rows,
    getTenantSeatLimit: async () => 100, // Hardcoded for now
    countPendingInvites: async (tid) => (await query("SELECT COUNT(*) FROM user_invites WHERE tenant_id = $1 AND status = 'pending'", [tid])).rows[0].count,
    createTenantWebhook: async (tid, url) => (await query('INSERT INTO tenant_webhooks (tenant_id, url) VALUES ($1, $2) RETURNING *', [tid, url])).rows[0],
    getTenantWebhooks: async (tid) => (await query('SELECT * FROM tenant_webhooks WHERE tenant_id = $1', [tid])).rows,
    deleteTenantWebhook: async (tid, wid) => (await query('DELETE FROM tenant_webhooks WHERE tenant_id = $1 AND id = $2 RETURNING id', [tid, wid])).rows[0],
    updateTenantStatus: async (id, status) => (await query('UPDATE tenants SET status = $1 WHERE id = $2 RETURNING *', [status, id])).rows[0],
    setTenantSessionId: async (id, sid) => (await query('UPDATE tenants SET session_id = $1 WHERE id = $2 RETURNING *', [sid, id])).rows[0],
    deleteTenant: async (id) => (await query('DELETE FROM tenants WHERE id = $1 RETURNING id', [id])).rows[0],
    setUserSessionId: async (id, sid) => (await query('UPDATE users SET session_id = $1 WHERE id = $2 RETURNING *', [sid, id])).rows[0],
    getTenantAdmin: async (tid) => (await query("SELECT * FROM users WHERE tenant_id = $1 AND role = 'admin_agent' LIMIT 1", [tid])).rows[0],
    ensureTenantWebhooksTable: async () => query('CREATE TABLE IF NOT EXISTS tenant_webhooks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, url TEXT NOT NULL, created_at TIMESTAMP DEFAULT now(), UNIQUE(tenant_id, url))'),
    ensureTenantSessionColumn: async () => query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS session_id TEXT UNIQUE'),
    ensureUserSessionColumn: async () => query('ALTER TABLE users ADD COLUMN IF NOT EXISTS session_id TEXT, ADD COLUMN IF NOT EXISTS user_session_id TEXT, ADD COLUMN IF NOT EXISTS tenant_session_id TEXT'),
    ensureUserInvitesTable: async () => query('CREATE TABLE IF NOT EXISTS user_invites (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, email TEXT NOT NULL, token TEXT UNIQUE NOT NULL, role VARCHAR(50), status VARCHAR(20) DEFAULT \'pending\', created_by UUID, expires_at TIMESTAMP, phone_number TEXT, created_at TIMESTAMP DEFAULT now())'),
    ensureSystemSettingsTable: async () => query('CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    ensureUserPhoneColumn: async () => query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT'),
    ensureInvitePhoneColumn: async () => query('ALTER TABLE user_invites ADD COLUMN IF NOT EXISTS phone_number TEXT'),
    ensureContactSyncTrigger: async () => {
        const funcSQL = `
            CREATE OR REPLACE FUNCTION "public"."sync_whatsmeow_to_crm_contact"() RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
            DECLARE
              v_tenant_id UUID;
              v_our_phone TEXT;
              v_phone TEXT;
              v_full_name TEXT;
            BEGIN
              -- Extract phone number from our_jid (e.g., 6289xxx@s.whatsapp.net → 6289xxx)
              v_our_phone := split_part(NEW.our_jid, '@', 1);

              -- Match our_jid with tenant's session_id for proper tenant isolation
              SELECT id INTO v_tenant_id FROM tenants
              WHERE session_id = v_our_phone AND status = 'active'
              LIMIT 1;

              IF v_tenant_id IS NOT NULL THEN
                v_phone := split_part(NEW.their_jid, '@', 1);
                -- Priority: FullName > FirstName > PushName > Phone
                v_full_name := COALESCE(NEW.full_name, NEW.first_name, NEW.push_name);

                IF v_full_name IS NULL OR v_full_name = '' THEN
                    v_full_name := v_phone;
                END IF;

                INSERT INTO contacts (tenant_id, jid, phone_number, full_name, updated_at)
                VALUES (v_tenant_id, NEW.their_jid, v_phone, v_full_name, now())
                ON CONFLICT (tenant_id, jid)
                DO UPDATE SET
                  phone_number = EXCLUDED.phone_number,
                  full_name = EXCLUDED.full_name,
                  updated_at = now();
              END IF;

              RETURN NEW;
            END;
            $$;
        `;
        await query(funcSQL);
        
        // Ensure Trigger Exists
        await query(`
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_wm_contacts') THEN
                CREATE TRIGGER trg_sync_wm_contacts
                AFTER INSERT OR UPDATE ON "public"."whatsmeow_contacts"
                FOR EACH ROW EXECUTE FUNCTION sync_whatsmeow_to_crm_contact();
              END IF;
            END
            $$;
        `);
    },
    createUserInvite: async (i) => (await query('INSERT INTO user_invites (tenant_id, email, token, role, created_by, expires_at, phone_number, name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [i.tenant_id, i.email, i.token, i.role, i.created_by, i.expires_at, i.phone_number, i.name])).rows[0],
    getInviteByToken: async (t) => (await query('SELECT i.*, t.company_name as tenant_name FROM user_invites i JOIN tenants t ON i.tenant_id = t.id WHERE i.token = $1', [t])).rows[0],
    acceptInvite: async (t) => await query("UPDATE user_invites SET status = 'accepted' WHERE token = $1", [t]),
    // Contacts
    syncContacts, getContactsByTenant, getContactByJid,
    // Chats & Messages
    getOrCreateChat, logMessage, getChatsByTenant, getMessagesByChat, markChatAsRead,
    // System
    getSystemSetting: async (key) => {
        const res = await query('SELECT value FROM system_settings WHERE key = $1', [key]);
        return res.rows[0]?.value || null;
    },
    setSystemSetting: async (key, val) => {
        await query('INSERT INTO system_settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, val]);
    },
    getDashboardStats, getSuperAdminStats
};
