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

// ===== USER QUERIES =====

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null
 */
async function findUserByEmail(email) {
    const result = await query(
        `SELECT u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role, u.status, u.created_at,
                t.company_name as tenant_name
         FROM users u
         LEFT JOIN tenants t ON u.tenant_id = t.id
         WHERE u.email = $1`,
        [email]
    );
    return result.rows[0] || null;
}

/**
 * Find user by ID
 * @param {number} id - User ID
 * @returns {Promise<Object|null>} User object or null
 */
async function findUserById(id) {
    const result = await query(
        `SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.status, u.created_at,
                t.company_name as tenant_name
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
async function createUser({ tenant_id, name, email, password_hash, role, status = 'active' }) {
    const result = await query(
        `INSERT INTO users (tenant_id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant_id, name, email, role, status, created_at`,
        [tenant_id, name, email, password_hash, role, status]
    );
    return result.rows[0];
}

/**
 * Get all users for a tenant
 * @param {number} tenantId - Tenant ID
 * @returns {Promise<Array>} List of users
 */
async function getUsersByTenant(tenantId) {
    const result = await query(
        `SELECT id, tenant_id, name, email, role, status, created_at
         FROM users
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
    );
    return result.rows;
}

/**
 * Update user status
 * @param {number} userId - User ID
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
 * Delete user
 * @param {number} userId - User ID
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
async function createTenant({ company_name, status = 'active' }) {
    const result = await query(
        `INSERT INTO tenants (company_name, status)
         VALUES ($1, $2)
         RETURNING id, company_name, status, created_at`,
        [company_name, status]
    );
    return result.rows[0];
}

/**
 * Get all tenants
 * @returns {Promise<Array>} List of tenants
 */
async function getAllTenants() {
    const result = await query(
        `SELECT t.id, t.company_name, t.status, t.created_at,
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
 * @param {number} tenantId - Tenant ID
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
 * @param {number} tenantId - Tenant ID
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
 * @param {number} ticketId - Ticket ID
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
 * @param {number} tenantId - Tenant ID
 * @param {number} limit - Number of tickets
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} List of tickets
 */
async function getTicketsByTenant(tenantId, limit = 50, offset = 0) {
    const result = await query(
        `SELECT t.*, u.name as agent_name,
                (SELECT message_text FROM messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
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
 * @param {number} ticketId - Ticket ID
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
 * @param {number} ticketId - Ticket ID
 * @param {number} agentId - Agent user ID
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
 * @param {number} ticketId - Ticket ID
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
 * @param {number} ticketId - Ticket ID
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
 * @param {number} tenantId - Tenant ID (null for super admin = all tenants)
 * @returns {Promise<Object>} Statistics object
 */
async function getDashboardStats(tenantId = null) {
    const tenantFilter = tenantId ? 'WHERE tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];

    const [ticketStats, userStats] = await Promise.all([
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
        )
    ]);

    return {
        tickets: ticketStats.rows[0],
        users: userStats.rows[0]
    };
}

/**
 * Get super admin statistics (all tenants)
 * @returns {Promise<Object>} System-wide statistics
 */
async function getSuperAdminStats() {
    const [tenantStats, userStats, ticketStats] = await Promise.all([
        query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM tenants'),
        query('SELECT COUNT(*) as total FROM users'),
        query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'open\') as open FROM tickets')
    ]);

    return {
        tenants: tenantStats.rows[0],
        users: userStats.rows[0],
        tickets: ticketStats.rows[0]
    };
}

module.exports = {
    query,
    getClient,
    pool,
    // Users
    findUserByEmail,
    findUserById,
    createUser,
    getUsersByTenant,
    updateUserStatus,
    deleteUser,
    // Tenants
    createTenant,
    getAllTenants,
    getTenantById,
    updateTenantStatus,
    // Messages & Tickets
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
