/**
 * PostgreSQL Database Connection
 * Connects to the database using DATABASE_URL from environment
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Test connection on startup
pool.on('connect', () => {
    console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL pool error:', err.message);
});

/**
 * Execute a query with parameters
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[DB] Query executed in ${duration}ms:`, { text: text.slice(0, 100), rows: result.rowCount });
    }
    return result;
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Client>} PostgreSQL client
 */
async function getClient() {
    return pool.connect();
}

/**
 * Ensure tenant webhooks table exists
 * This keeps setup minimal without a migration tool.
 * NOTE: Table should be created with UUID from strukturdatabase.txt schema
 */
async function ensureTenantWebhooksTable() {
    // Check if table exists, if not create with UUID
    await query(
        `CREATE TABLE IF NOT EXISTS tenant_webhooks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            url TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )`
    );
    await query(
        `CREATE INDEX IF NOT EXISTS tenant_webhooks_tenant_id_idx
         ON tenant_webhooks (tenant_id)`
    );
    await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS tenant_webhooks_tenant_url_idx
         ON tenant_webhooks (tenant_id, url)`
    );
}

/**
 * Ensure tenants.session_id exists for tenant -> session mapping
 */
async function ensureTenantSessionColumn() {
    await query(
        `ALTER TABLE tenants
         ADD COLUMN IF NOT EXISTS session_id TEXT`
    );
    await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS tenants_session_id_idx
         ON tenants (session_id)`
    );
}

async function ensureSystemSettingsTable() {
    await query(
        `CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`
    );
}

async function ensureUserPhoneColumn() {
    await query(
        `ALTER TABLE users
         ADD COLUMN IF NOT EXISTS phone_number TEXT`
    );
}

async function ensureInvitePhoneColumn() {
    await query(
        `ALTER TABLE user_invites
         ADD COLUMN IF NOT EXISTS phone_number TEXT`
    );
}

/**
 * Ensure users.session_id exists for super admin -> session mapping
 * This allows super admin to have their own WhatsApp session separate from tenants
 */
async function ensureUserSessionColumn() {
    await query(
        `ALTER TABLE users
         ADD COLUMN IF NOT EXISTS session_id TEXT`
    );
    await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_session_id_idx
         ON users (session_id) WHERE session_id IS NOT NULL`
    );
}

/**
 * Ensure user invites table exists
 * NOTE: Table should be created with UUID from strukturdatabase.txt schema
 */
async function ensureUserInvitesTable() {
    await query(
        `CREATE TABLE IF NOT EXISTS user_invites (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'agent',
            token TEXT NOT NULL UNIQUE,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            expires_at TIMESTAMP WITH TIME ZONE
        )`
    );
    await query(
        `CREATE INDEX IF NOT EXISTS user_invites_tenant_id_idx
         ON user_invites (tenant_id)`
    );
    await query(
        `CREATE INDEX IF NOT EXISTS user_invites_email_idx
         ON user_invites (email)`
    );
    await query(
        `CREATE INDEX IF NOT EXISTS user_invites_status_idx
         ON user_invites (status)`
    );
}

// ===== USER QUERIES =====

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null
 */
async function findUserByEmail(email) {
    const result = await query(
        `SELECT u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role, u.status, u.created_at, u.phone_number,
                u.session_id as user_session_id,
                t.company_name as tenant_name,
                t.session_id as tenant_session_id
         FROM users u
         LEFT JOIN tenants t ON u.tenant_id = t.id
         WHERE u.email = $1`,
        [email]
    );
    return result.rows[0] || null;
}

/**
 * Find user by ID
 * @param {string} id - User ID (UUID)
 * @returns {Promise<Object|null>} User object or null
 */
async function findUserById(id) {
    const result = await query(
        `SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.status, u.created_at, u.phone_number,
                u.session_id as user_session_id,
                t.company_name as tenant_name,
                t.session_id as tenant_session_id
         FROM users u
         LEFT JOIN tenants t ON u.tenant_id = t.id
         WHERE u.id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user
 */
async function createUser({ tenant_id, name, email, password_hash, role, status = 'active', phone_number = null }) {
    const result = await query(
        `INSERT INTO users (tenant_id, name, email, password_hash, role, status, phone_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, tenant_id, name, email, role, status, phone_number, created_at`,
        [tenant_id, name, email, password_hash, role, status, phone_number]
    );
    return result.rows[0];
}

/**
 * Get all users for a tenant
 * @param {string} tenantId - Tenant ID (UUID)
 * @returns {Promise<Array>} List of users
 */
async function getUsersByTenant(tenantId) {
    const result = await query(
        `SELECT id, tenant_id, name, email, role, status, phone_number, created_at
         FROM users
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
    );
    return result.rows;
}

/**
 * Update user status
 * @param {string} userId - User ID (UUID)
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated user
 */
async function updateUserStatus(userId, status) {
    const result = await query(
        'UPDATE users SET status = $1 WHERE id = $2 RETURNING *',
        [status, userId]
    );
    return result.rows[0];
}

/**
 * Update user details (generic)
 * @param {string} userId - User ID (UUID)
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated user
 */
async function updateUser(userId, updates) {
    const ALLOWED_FIELDS = ['name', 'email', 'password_hash', 'role', 'status', 'phone_number'];
    const fields = Object.keys(updates).filter(key => ALLOWED_FIELDS.includes(key));
    
    if (fields.length === 0) return null;

    const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map(f => updates[f]);
    
    const result = await query(
        `UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`,
        [userId, ...values]
    );
    return result.rows[0];
}

/**
 * Delete user
 * @param {string} userId - User ID (UUID)
 * @returns {Promise<boolean>} Success status
 */
async function deleteUser(userId) {
    const result = await query(
        'DELETE FROM users WHERE id = $1',
        [userId]
    );
    return result.rowCount > 0;
}

// ===== TENANT QUERIES =====

/**
 * Create a new tenant
 * @param {Object} tenantData - Tenant data
 * @returns {Promise<Object>} Created tenant
 */
async function createTenant({ company_name, status = 'active', session_id = null }) {
    const result = await query(
        `INSERT INTO tenants (company_name, status, session_id)
         VALUES ($1, $2, $3)
         RETURNING id, company_name, status, created_at, session_id`,
        [company_name, status, session_id]
    );
    return result.rows[0];
}

/**
 * Get all tenants
 * @returns {Promise<Array>} List of tenants
 */
async function getAllTenants() {
    const result = await query(
        `SELECT t.id, t.company_name, t.status, t.created_at, t.session_id,
                COUNT(u.id) as user_count
         FROM tenants t
         LEFT JOIN users u ON t.id = u.tenant_id
         GROUP BY t.id
         ORDER BY t.created_at DESC`
    );
    return result.rows;
}

/**
 * Get tenant by ID
 * @param {string} tenantId - Tenant ID (UUID)
 * @returns {Promise<Object|null>} Tenant object or null
 */
async function getTenantById(tenantId) {
    const result = await query(
        'SELECT * FROM tenants WHERE id = $1',
        [tenantId]
    );
    return result.rows[0] || null;
}

/**
 * Update tenant status
 * @param {string} tenantId - Tenant ID (UUID)
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated tenant
 */
async function updateTenantStatus(tenantId, status) {
    const result = await query(
        'UPDATE tenants SET status = $1 WHERE id = $2 RETURNING *',
        [status, tenantId]
    );
    return result.rows[0];
}

/**
 * Set tenant session id
 * @param {string} tenantId - Tenant ID (UUID)
 * @param {string|null} sessionId - Session ID
 * @returns {Promise<Object>} Updated tenant
 */
async function setTenantSessionId(tenantId, sessionId) {
    const result = await query(
        'UPDATE tenants SET session_id = $1 WHERE id = $2 RETURNING *',
        [sessionId, tenantId]
    );
    return result.rows[0];
}

/**
 * Delete tenant
 * @param {string} tenantId - Tenant ID (UUID)
 * @returns {Promise<boolean>} Success status
 */
async function deleteTenant(tenantId) {
    const result = await query(
        'DELETE FROM tenants WHERE id = $1',
        [tenantId]
    );
    return result.rowCount > 0;
}

/**
 * Get tenant by session id
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Tenant object or null
 */
async function getTenantBySessionId(sessionId) {
    const result = await query(
        'SELECT * FROM tenants WHERE session_id = $1',
        [sessionId]
    );
    return result.rows[0] || null;
}

/**
 * Get user by session id (for super admin)
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserBySessionId(sessionId) {
    const result = await query(
        'SELECT * FROM users WHERE session_id = $1',
        [sessionId]
    );
    return result.rows[0] || null;
}

/**
 * Set user session id (for super admin)
 * @param {string} userId - User ID (UUID)
 * @param {string|null} sessionId - Session ID
 * @returns {Promise<Object>} Updated user
 */
async function setUserSessionId(userId, sessionId) {
    const result = await query(
        'UPDATE users SET session_id = $1 WHERE id = $2 RETURNING *',
        [sessionId, userId]
    );
    return result.rows[0];
}

/**
 * Get tenant seat limit (max_active_members), default 100 if null
 */
async function getTenantSeatLimit(tenantId) {
    const result = await query(
        'SELECT max_active_members FROM tenants WHERE id = $1',
        [tenantId]
    );
    const limit = result.rows[0]?.max_active_members;
    const parsed = Number.parseInt(limit, 10);
    return Number.isFinite(parsed) ? parsed : 100;
}

/**
 * Get tenant admin agent contact
 * @param {string} tenantId - Tenant ID (UUID)
 * @returns {Promise<Object|null>} Admin agent user or null
 */
async function getTenantAdmin(tenantId) {
    const result = await query(
        `SELECT id, tenant_id, name, email, role, status, created_at
         FROM users
         WHERE tenant_id = $1 AND role = 'admin_agent'
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId]
    );
    return result.rows[0] || null;
}

async function getUsersByTenantWithPhone(tenantId, roles = []) {
    const hasRoleFilter = roles && roles.length > 0;
    const params = hasRoleFilter ? [tenantId, roles] : [tenantId];
    const roleClause = hasRoleFilter ? 'AND role = ANY($2)' : '';
    const result = await query(
        `SELECT id, tenant_id, name, email, role, status, phone_number
         FROM users
         WHERE tenant_id = $1
           AND phone_number IS NOT NULL
           AND status = 'active'
           ${roleClause}`,
        params
    );
    return result.rows;
}

async function getSuperAdminsWithPhone() {
    const result = await query(
        `SELECT id, name, email, phone_number
         FROM users
         WHERE role = 'super_admin'
           AND status = 'active'
           AND phone_number IS NOT NULL`
    );
    return result.rows;
}

async function setSystemSetting(key, value) {
    await query(
        `INSERT INTO system_settings(key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
    );
    return true;
}

async function getSystemSetting(key) {
    const result = await query(
        'SELECT value FROM system_settings WHERE key = $1',
        [key]
    );
    return result.rows[0]?.value || null;
}

// ===== USER INVITES =====

/**
 * Create invite for user
 * @param {Object} inviteData - Invite data
 * @returns {Promise<Object>} Created invite
 */
async function createUserInvite({ tenant_id, name, email, role = 'agent', token, created_by, expires_at, phone_number = null }) {
    const result = await query(
        `INSERT INTO user_invites (tenant_id, name, email, role, token, created_by, expires_at, phone_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, tenant_id, name, email, role, token, status, created_at, expires_at, phone_number`,
        [tenant_id, name, email, role, token, created_by || null, expires_at || null, phone_number]
    );
    return result.rows[0];
}

/**
 * Get invite by token
 * @param {string} token - Invite token
 * @returns {Promise<Object|null>} Invite or null
 */
async function getInviteByToken(token) {
    const result = await query(
        `SELECT i.*, t.company_name as tenant_name
         FROM user_invites i
         LEFT JOIN tenants t ON i.tenant_id = t.id
         WHERE i.token = $1`,
        [token]
    );
    return result.rows[0] || null;
}

/**
 * Mark invite accepted
 * @param {string} token - Invite token
 * @returns {Promise<Object|null>} Updated invite
 */
async function acceptInvite(token) {
    const result = await query(
        `UPDATE user_invites
         SET status = 'accepted'
         WHERE token = $1
         RETURNING *`,
        [token]
    );
    return result.rows[0] || null;
}

/**
 * Count pending invites for a tenant
 * @param {string} tenantId - Tenant ID (UUID)
 * @returns {Promise<number>} Count
 */
async function countPendingInvites(tenantId) {
    const result = await query(
        `SELECT COUNT(*) as total
         FROM user_invites
         WHERE tenant_id = $1 AND status = 'pending'`,
        [tenantId]
    );
    return parseInt(result.rows[0]?.total || '0', 10);
}

// ===== TENANT WEBHOOKS =====

/**
 * List webhooks for a tenant
 * @param {string} tenantId - Tenant ID (UUID)
 * @returns {Promise<Array>} List of webhooks
 */
async function getTenantWebhooks(tenantId) {
    const result = await query(
        `SELECT id, tenant_id, url, created_at
         FROM tenant_webhooks
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
    );
    return result.rows;
}

/**
 * Create webhook for a tenant
 * @param {string} tenantId - Tenant ID (UUID)
 * @param {string} url - Webhook URL
 * @returns {Promise<Object>} Created webhook
 */
async function createTenantWebhook(tenantId, url) {
    const result = await query(
        `INSERT INTO tenant_webhooks (tenant_id, url)
         VALUES ($1, $2)
         RETURNING id, tenant_id, url, created_at`,
        [tenantId, url]
    );
    return result.rows[0];
}

/**
 * Get ticket by ID with last customer message timestamp (for guard)
 * @param {string} ticketId - Ticket ID (UUID)
 * @returns {Promise<Object|null>} Ticket with last_customer_message_at
 */
async function getTicketWithLastCustomerMessage(ticketId) {
    const result = await query(
        `SELECT t.*,
                (
                    SELECT created_at
                    FROM messages m
                    WHERE m.ticket_id = t.id AND m.sender_type = 'customer'
                    ORDER BY created_at DESC
                    LIMIT 1
                ) AS last_customer_message_at
         FROM tickets t
         WHERE t.id = $1`,
        [ticketId]
    );
    return result.rows[0] || null;
}

/**
 * Count messages for a tenant within a time window
 * @param {string} tenantId - Tenant ID (UUID)
 * @param {number} minutes - Lookback window in minutes
 * @param {string|null} senderType - Optional sender_type filter
 * @returns {Promise<number>} Count of messages
 */
async function countTenantMessagesSince(tenantId, minutes = 60, senderType = null) {
    const lookbackMinutes = Math.max(1, parseInt(minutes, 10) || 60);
    const params = [tenantId, lookbackMinutes];
    const senderClause = senderType ? 'AND m.sender_type = $3' : '';
    if (senderType) {
        params.push(senderType);
    }

    const result = await query(
        `SELECT COUNT(*) AS total
         FROM messages m
         JOIN tickets t ON m.ticket_id = t.id
         WHERE t.tenant_id = $1
           AND m.created_at >= NOW() - ($2 * INTERVAL '1 minute')
           ${senderClause}`,
        params
    );
    return parseInt(result.rows[0]?.total || '0', 10);
}

/**
 * Delete webhook for a tenant
 * @param {string} tenantId - Tenant ID (UUID)
 * @param {string} webhookId - Webhook ID (UUID)
 * @returns {Promise<boolean>} Success status
 */
async function deleteTenantWebhook(tenantId, webhookId) {
    const result = await query(
        'DELETE FROM tenant_webhooks WHERE tenant_id = $1 AND id = $2',
        [tenantId, webhookId]
    );
    return result.rowCount > 0;
}

// ===== MESSAGE/CHAT QUERIES (for n8n) =====

/**
 * Log a message to the database (for n8n webhook)
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} Created message
 */
async function logMessage({ ticket_id, sender_type, message_text, file_url = null }) {
    const result = await query(
        `INSERT INTO messages (ticket_id, sender_type, message_text, file_url)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [ticket_id, sender_type, message_text, file_url]
    );
    return result.rows[0];
}

/**
 * Get or create ticket for a conversation
 * @param {Object} ticketData - Ticket data
 * @returns {Promise<Object>} Ticket object
 */
async function getOrCreateTicket({ tenant_id, customer_name, customer_contact }) {
    // First, try to find an open ticket for this customer
    let result = await query(
        `SELECT * FROM tickets
         WHERE tenant_id = $1 AND customer_contact = $2 AND status IN ('open', 'pending')
         ORDER BY created_at DESC LIMIT 1`,
        [tenant_id, customer_contact]
    );

    if (result.rows[0]) {
        return result.rows[0];
    }

    // Create new ticket if none exists
    result = await query(
        `INSERT INTO tickets (tenant_id, customer_name, customer_contact, status)
         VALUES ($1, $2, $3, 'open')
         RETURNING *`,
        [tenant_id, customer_name, customer_contact]
    );
    return result.rows[0];
}

/**
 * Get messages for a ticket
 * @param {string} ticketId - Ticket ID (UUID)
 * @returns {Promise<Array>} List of messages
 */
async function getMessagesByTicket(ticketId) {
    const result = await query(
        'SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC',
        [ticketId]
    );
    return result.rows;
}

/**
 * Get tickets for a tenant with pagination
 * @param {string} tenantId - Tenant ID (UUID)
 * @param {number} limit - Number of tickets
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} List of tickets
 */
async function getTicketsByTenant(tenantId, limit = 50, offset = 0) {
    const result = await query(
        `SELECT t.*, u.name as agent_name,
                (SELECT message_text FROM messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT sender_type FROM messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_sender_type,
                (SELECT created_at FROM messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
                (SELECT COUNT(*) FROM messages WHERE ticket_id = t.id) as message_count
         FROM tickets t
         LEFT JOIN users u ON t.assigned_agent_id = u.id
         WHERE t.tenant_id = $1
         ORDER BY t.updated_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset]
    );
    return result.rows;
}

/**
 * Update ticket status
 * @param {string} ticketId - Ticket ID (UUID)
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated ticket
 */
async function updateTicketStatus(ticketId, status) {
    const result = await query(
        'UPDATE tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [status, ticketId]
    );
    return result.rows[0];
}

/**
 * Assign ticket to agent
 * @param {string} ticketId - Ticket ID (UUID)
 * @param {string} agentId - Agent user ID (UUID)
 * @returns {Promise<Object>} Updated ticket
 */
async function assignTicketToAgent(ticketId, agentId) {
    const result = await query(
        'UPDATE tickets SET assigned_agent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [agentId, ticketId]
    );
    return result.rows[0];
}

/**
 * Add internal note to ticket (for escalation)
 * @param {string} ticketId - Ticket ID (UUID)
 * @param {string} note - Internal note
 * @returns {Promise<Object>} Updated ticket
 */
async function addTicketNote(ticketId, note) {
    const result = await query(
        `UPDATE tickets
         SET internal_notes = COALESCE(internal_notes, '') || E'\n[' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || '] ' || $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [note, ticketId]
    );
    return result.rows[0];
}

/**
 * Escalate ticket (for n8n)
 * @param {string} ticketId - Ticket ID (UUID)
 * @param {string} reason - Escalation reason
 * @returns {Promise<Object>} Updated ticket
 */
async function escalateTicket(ticketId, reason) {
    const result = await query(
        `UPDATE tickets
         SET status = 'escalated',
             internal_notes = COALESCE(internal_notes, '') || E'\n[ESCALATED ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || '] ' || $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [reason, ticketId]
    );
    return result.rows[0];
}

// ===== STATISTICS =====

/**
 * Get dashboard statistics for a tenant
 * @param {string} tenantId - Tenant ID (UUID, null for super admin = all tenants)
 * @returns {Promise<Object>} Statistics object
 */
async function getDashboardStats(tenantId = null) {
    const tenantFilter = tenantId ? 'WHERE tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];

    const [ticketStats, userStats, todayStats, avgResponse] = await Promise.all([
        query(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'open') as open_tickets,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_tickets,
                COUNT(*) FILTER (WHERE status = 'escalated') as escalated_tickets,
                COUNT(*) FILTER (WHERE status = 'closed') as closed_tickets,
                COUNT(*) as total_tickets
             FROM tickets ${tenantFilter}`,
            params
        ),
        query(
            `SELECT
                COUNT(*) FILTER (WHERE role = 'admin_agent') as admin_count,
                COUNT(*) FILTER (WHERE role = 'agent') as agent_count,
                COUNT(*) as total_users
             FROM users ${tenantFilter}`,
            params
        ),
        tenantId ? query(
            `SELECT COUNT(*) as today_tickets
             FROM tickets
             WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`,
            params
        ) : Promise.resolve({ rows: [{ today_tickets: 0 }] }),
        tenantId ? query(
            `SELECT AVG(EXTRACT(EPOCH FROM (m.created_at - t.created_at)) / 60) as avg_response_minutes
             FROM tickets t
             JOIN LATERAL (
                 SELECT created_at
                 FROM messages
                 WHERE ticket_id = t.id AND sender_type = 'agent'
                 ORDER BY created_at ASC
                 LIMIT 1
             ) m ON true
             WHERE t.tenant_id = $1`,
            params
        ) : Promise.resolve({ rows: [{ avg_response_minutes: null }] })
    ]);

    return {
        tickets: {
            ...ticketStats.rows[0],
            today_tickets: todayStats.rows[0]?.today_tickets || 0,
            avg_response_minutes: avgResponse.rows[0]?.avg_response_minutes
        },
        users: userStats.rows[0]
    };
}

/**
 * Get super admin statistics (all tenants)
 * @returns {Promise<Object>} System-wide statistics
 */
async function getSuperAdminStats() {
    const [tenantStats, userStats, ticketStats, sessionStats] = await Promise.all([
        query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM tenants'),
        query('SELECT COUNT(*) as total FROM users'),
        query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'open\') as open FROM tickets'),
        query(`SELECT
                COUNT(*) FILTER (WHERE session_id IS NOT NULL) as total,
                COUNT(*) FILTER (WHERE session_id IS NOT NULL) as with_session
               FROM (
                 SELECT session_id FROM tenants WHERE session_id IS NOT NULL
                 UNION ALL
                 SELECT session_id FROM users WHERE session_id IS NOT NULL
               ) as all_sessions`)
    ]);

    return {
        tenants: tenantStats.rows[0],
        users: userStats.rows[0],
        tickets: ticketStats.rows[0],
        whatsapp_sessions: {
            total: parseInt(sessionStats.rows[0]?.total || '0', 10)
        }
    };
}

module.exports = {
    query,
    getClient,
    pool,
    ensureTenantWebhooksTable,
    ensureTenantSessionColumn,
    ensureUserSessionColumn,
    ensureUserInvitesTable,
    ensureSystemSettingsTable,
    ensureUserPhoneColumn,
    ensureInvitePhoneColumn,
    // Users
    findUserByEmail,
    findUserById,
    createUser,
    getUsersByTenant,
    getUsersByTenantWithPhone,
    getSuperAdminsWithPhone,
    updateUserStatus,
    updateUser,
    deleteUser,
    getUserBySessionId,
    setUserSessionId,
    // Tenants
    createTenant,
    getAllTenants,
    getTenantById,
    updateTenantStatus,
    setTenantSessionId,
    deleteTenant, // Export deleteTenant
    getTenantBySessionId,
    getTenantAdmin,
    getTenantSeatLimit,
    // Invites
    createUserInvite,
    getInviteByToken,
    acceptInvite,
    countPendingInvites,
    // Settings
    setSystemSetting,
    getSystemSetting,
    // Tenant webhooks
    getTenantWebhooks,
    createTenantWebhook,
    deleteTenantWebhook,
    // Messages & Tickets
    getTicketWithLastCustomerMessage,
    countTenantMessagesSince,
    logMessage,
    getOrCreateTicket,
    getMessagesByTicket,
    getTicketsByTenant,
    updateTicketStatus,
    assignTicketToAgent,
    addTicketNote,
    escalateTicket,
    // Statistics
    getDashboardStats,
    getSuperAdminStats,
};
