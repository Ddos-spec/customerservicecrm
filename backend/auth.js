/**
 * Authentication Module
 * Handles login, logout, session validation, and role-based access
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { formatPhoneNumber } = require('./phone-utils');
const axios = require('axios');
const waGateway = require('./wa-gateway-client');
const gatewayPassword = process.env.WA_GATEWAY_PASSWORD;

const router = express.Router();

// ===== RATE LIMITERS =====
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts, please try again after 15 minutes' }
});

// ===== MIDDLEWARE =====

/**
 * Middleware: Require authenticated session
 */
function requireAuth(req, res, next) {
    if (!req.session?.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized - Please login' });
    }
    next();
}

/**
 * Middleware: Require specific role(s)
 * @param {...string} roles - Allowed roles
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session?.user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        if (!roles.includes(req.session.user.role)) {
            return res.status(403).json({ success: false, error: 'Forbidden - Insufficient permissions' });
        }
        next();
    };
}

/**
 * Middleware: Require tenant access (agent can only access own tenant)
 */
function requireTenantAccess(req, res, next) {
    if (!req.session?.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Super admin can access all tenants
    if (req.session.user.role === 'super_admin') {
        return next();
    }

    // Others can only access their own tenant
    const requestedTenantId = (req.params.tenantId || req.body.tenant_id || req.query.tenant_id || '').toString().trim();
    if (requestedTenantId && requestedTenantId !== req.session.user.tenant_id) {
        return res.status(403).json({ success: false, error: 'Forbidden - Cannot access other tenant data' });
    }

    next();
}

function isValidHttpUrl(value) {
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        
        // SSRF Protection: Block private IPs and localhost
        const hostname = parsed.hostname;
        if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) return false;
        if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return false; // 172.16.x.x - 172.31.x.x
        
        return true;
    } catch {
        return false;
    }
}

function isInviteExpired(invite) {
    if (!invite?.expires_at) return false;
    const expiresAt = new Date(invite.expires_at).getTime();
    return Number.isFinite(expiresAt) && Date.now() > expiresAt;
}

// ===== SUPER ADMIN AUTO-CREATION =====

/**
 * Ensure super admin exists (reads from ENV)
 * Called on server startup
 */
async function ensureSuperAdmin() {
    console.log('🔍 Checking super admin ENV vars...');
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;

    console.log(`   SUPER_ADMIN_EMAIL: ${email ? '✓ SET' : '✗ NOT SET'}`);
    console.log(`   SUPER_ADMIN_PASSWORD: ${password ? '✓ SET' : '✗ NOT SET'}`);

    if (!email || !password) {
        console.log('⚠️  SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set in ENV');
        console.log('   Super admin auto-creation skipped. Set these ENV vars to enable.');
        return null;
    }

    try {
        console.log('   Checking if super admin exists in database...');
        // Check if super admin already exists
        const existing = await db.findUserByEmail(email);
        console.log(`   findUserByEmail result: ${existing ? 'FOUND (id=' + existing.id + ')' : 'NOT FOUND'}`);

        if (existing) {
            // Update password if changed in ENV
            const passwordMatch = await bcrypt.compare(password, existing.password_hash);
            if (!passwordMatch) {
                const newHash = await bcrypt.hash(password, 12);
                await db.query(
                    'UPDATE users SET password_hash = $1 WHERE id = $2',
                    [newHash, existing.id]
                );
                console.log('✅ Super admin password updated from ENV');
            } else {
                console.log('✅ Super admin already exists, password matches');
            }
            return existing;
        }

        // Create super admin
        console.log('   Creating new super admin...');
        const password_hash = await bcrypt.hash(password, 12);
        const user = await db.createUser({
            tenant_id: null, // Super admin has no tenant
            name: 'Super Admin',
            email,
            password_hash,
            role: 'super_admin',
            status: 'active'
        });

        console.log(`✅ Super admin created: ${email}`);
        return user;
    } catch (error) {
        console.error('❌ Error ensuring super admin:', error.message);
        console.error('   Stack:', error.stack);
        return null;
    }
}

function getFrontendBase() {
    const raw = process.env.FRONTEND_URL || 'https://customerservicecrm.vercel.app';
    return raw.replace(/\/+$/, '');
}

/**
 * Send invite payload to n8n webhook (email format)
 */
async function notifyInviteWebhook(invitePayload) {
    const webhookUrl = process.env.N8N_INVITE_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn('N8N_INVITE_WEBHOOK_URL not set; skip invite webhook');
        return;
    }
    try {
        const { invitee_email, invitee_name, invitee_role, invite_link, login_link, initial_password, tenant_name } = invitePayload;

        // Determine subject based on role
        const isAdmin = invitee_role === 'admin_agent';
        const subject = isAdmin
            ? `Selamat Datang Admin ${tenant_name || 'Tenant Baru'}`
            : 'Undangan Bergabung sebagai Agent';

        // Build HTML message
        const message = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .info-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #4F46E5; }
        .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; }
        .value { font-size: 16px; margin-top: 4px; }
        .button { display: inline-block; background: #4F46E5; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Selamat Datang!</h1>
        </div>
        <div class="content">
            <p>Halo <strong>${invitee_name}</strong>,</p>
            <p>Akun Anda telah berhasil dibuat. Berikut adalah informasi login Anda:</p>

            <div class="info-box">
                <div class="label">Username / Email</div>
                <div class="value">${invitee_email}</div>
            </div>

            ${initial_password ? `
            <div class="info-box">
                <div class="label">Password</div>
                <div class="value">${initial_password}</div>
            </div>
            ` : `
            <div class="info-box">
                <div class="label">Password</div>
                <div class="value">Silakan set password melalui link undangan</div>
            </div>
            `}

            <div class="info-box">
                <div class="label">Role</div>
                <div class="value">${isAdmin ? 'Admin Agent' : 'Agent'}</div>
            </div>

            ${tenant_name ? `
            <div class="info-box">
                <div class="label">Tenant</div>
                <div class="value">${tenant_name}</div>
            </div>
            ` : ''}

            <p style="text-align: center;">
                <a href="${login_link || invite_link}" class="button">Login Sekarang</a>
            </p>
        </div>
        <div class="footer">
            <p style="font-size: 14px; color: #f59e0b; margin-bottom: 8px;">⭐ <strong>Jangan lupa bintangi email ini agar tidak hilang!</strong></p>
            <p>Email ini dikirim secara otomatis. Jangan bagikan informasi login Anda kepada siapapun.</p>
        </div>
    </div>
</body>
</html>`.trim();

        const emailPayload = {
            to: invitee_email,
            subject,
            message
        };

        console.log('Posting invite webhook to', webhookUrl, 'to:', invitee_email);
        const resp = await axios.post(webhookUrl, emailPayload, { timeout: 5000 });
        console.log('Invite webhook sent, status', resp.status);
    } catch (err) {
        console.error('Failed to notify invite webhook:', err.message);
    }
}

// ===== ROUTES =====

/**
 * POST /api/v1/admin/login
 * Login with email and password
 */
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Find user by email
        const user = await db.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Check if user is active
        if (user.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'Account is suspended or inactive'
            });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Determine session_id based on role
        // Super admin uses user.session_id, tenant users use tenants.session_id
        const effectiveSessionId = user.role === 'super_admin'
            ? user.user_session_id
            : user.tenant_session_id;

        // Create session
        req.session.user = {
            id: user.id,
            tenant_id: user.tenant_id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenant_name: user.tenant_name,
            session_id: effectiveSessionId || null,
            user_session_id: user.user_session_id || null,
            tenant_session_id: user.tenant_session_id || null
        };

        // Save session explicitly
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ success: false, error: 'Session error' });
            }

            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    tenant_id: user.tenant_id,
                    tenant_name: user.tenant_name,
                    session_id: effectiveSessionId || null,
                    user_session_id: user.user_session_id || null,
                    tenant_session_id: user.tenant_session_id || null
                }
            });
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/v1/admin/logout
 * Destroy session
 */
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Logout failed' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

/**
 * GET /api/v1/admin/me
 * Get current user info
 */
router.get('/me', requireAuth, (req, res) => {
    res.json({
        success: true,
        user: req.session.user
    });
});

/**
 * GET /api/v1/admin/check
 * Check if session is valid (for frontend)
 */
router.get('/check', (req, res) => {
    if (req.session?.user) {
        res.json({
            success: true,
            authenticated: true,
            user: req.session.user
        });
    } else {
        res.json({
            success: true,
            authenticated: false
        });
    }
});

// ===== TENANT MANAGEMENT (Super Admin Only) =====

/**
 * GET /api/v1/admin/tenants
 * List all tenants
 */
router.get('/tenants', requireRole('super_admin'), async (req, res) => {
    try {
        const tenants = await db.getAllTenants();
        res.json({ success: true, tenants });
    } catch (error) {
        console.error('Error fetching tenants:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch tenants' });
    }
});

/**
 * POST /api/v1/admin/tenants
 * Create new tenant
 */
router.post('/tenants', requireRole('super_admin'), async (req, res) => {
    try {
        const companyName = (req.body?.company_name || '').trim();
        const adminName = (req.body?.admin_name || '').trim();
        const adminEmail = (req.body?.admin_email || '').trim();
        const adminPassword = req.body?.admin_password || '';
        const sessionIdRaw = req.body?.session_id;
        
        // Normalize Session ID (Force 62 format)
        let sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw.trim() : '';
        if (sessionId) {
            sessionId = sessionId.replace(/\D/g, ''); // Remove non-digits
            if (sessionId.startsWith('0')) {
                sessionId = '62' + sessionId.slice(1);
            }
        }
        
        const normalizedSessionId = sessionId === '' ? null : sessionId;

        if (!companyName) {
            return res.status(400).json({ success: false, error: 'Company name is required' });
        }
        if (!adminName || !adminEmail || !adminPassword) {
            return res.status(400).json({ success: false, error: 'Admin name, email, and password are required' });
        }
        if (adminPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const existing = await db.findUserByEmail(adminEmail);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already exists' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const tenantResult = await client.query(
                `INSERT INTO tenants (company_name, status, session_id)
                 VALUES ($1, 'active', $2)
                 RETURNING id, company_name, status, created_at, session_id`,
                [companyName, normalizedSessionId]
            );
            const tenant = tenantResult.rows[0];

            const password_hash = await bcrypt.hash(adminPassword, 12);
            const adminResult = await client.query(
                `INSERT INTO users (tenant_id, name, email, password_hash, role, status)
                 VALUES ($1, $2, $3, $4, 'admin_agent', 'active')
                 RETURNING id, tenant_id, name, email, role, status, created_at`,
                [tenant.id, adminName, adminEmail, password_hash]
            );

            await client.query('COMMIT');

            // Notify n8n webhook for new tenant admin
            const currentUser = req.session.user;
            const baseUrl = getFrontendBase();
            const loginLink = `${baseUrl}/login`;
            await notifyInviteWebhook({
                invite_link: loginLink,
                login_link: loginLink,
                invitee_email: adminEmail,
                invitee_name: adminName,
                invitee_role: 'admin_agent',
                tenant_id: tenant.id,
                tenant_name: companyName,
                created_by_email: currentUser?.email || null,
                created_by_name: currentUser?.name || null,
                created_by_role: currentUser?.role || null,
                expires_at: null,
                username: adminEmail,
                initial_password: adminPassword
            });

            res.status(201).json({ success: true, tenant, admin: adminResult.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505') {
                if (error.constraint === 'users_email_key') {
                    return res.status(409).json({ success: false, error: 'Email already exists' });
                }
                if (error.constraint === 'tenants_session_id_idx') {
                    return res.status(409).json({ success: false, error: 'Session ID already assigned to another tenant' });
                }
                return res.status(409).json({ success: false, error: 'Duplicate entry' });
            }
            console.error('Error creating tenant:', error);
            return res.status(500).json({ success: false, error: 'Failed to create tenant' });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating tenant:', error);
        res.status(500).json({ success: false, error: 'Failed to create tenant' });
    }
});

/**
 * PATCH /api/v1/admin/tenants/:id/status
 * Update tenant status (activate/suspend)
 */
router.patch('/tenants/:id/status', requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const tenant = await db.updateTenantStatus(id, status);
        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        res.json({ success: true, tenant });
    } catch (error) {
        console.error('Error updating tenant:', error);
        res.status(500).json({ success: false, error: 'Failed to update tenant' });
    }
});

/**
 * PATCH /api/v1/admin/tenants/:id/session
 * Set session_id for tenant (1 tenant = 1 session)
 */
router.patch('/tenants/:id/session', requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const rawSessionId = req.body?.session_id;
        
        let sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : '';
        if (sessionId) {
            sessionId = sessionId.replace(/\D/g, '');
            if (sessionId.startsWith('0')) sessionId = '62' + sessionId.slice(1);
        }
        
        const normalized = sessionId === '' ? null : sessionId;

        const tenant = await db.setTenantSessionId(id, normalized);
        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        res.json({ success: true, tenant });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Session ID already assigned to another tenant' });
        }
        console.error('Error updating tenant session:', error);
        res.status(500).json({ success: false, error: 'Failed to update tenant session' });
    }
});

/**
 * DELETE /api/v1/admin/tenants/:id
 * Delete tenant
 */
router.delete('/tenants/:id', requireRole('super_admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await db.deleteTenant(id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }
        res.json({ success: true, message: 'Tenant deleted successfully' });
    } catch (error) {
        console.error('Error deleting tenant:', error);
        res.status(500).json({ success: false, error: 'Failed to delete tenant' });
    }
});

/**
 * PATCH /api/v1/admin/users/:id/session
 * Set session_id for user (for super admin only)
 */
router.patch('/users/:id/session', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const rawSessionId = req.body?.session_id;
        const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : '';
        const normalized = sessionId === '' ? null : sessionId;

        const currentUser = req.session.user;

        // Only allow users to set their own session_id
        // OR super admin can set anyone's session_id
        if (currentUser.role !== 'super_admin' && currentUser.id !== id) {
            return res.status(403).json({ success: false, error: 'Forbidden - Can only set your own session' });
        }

        const user = await db.setUserSessionId(id, normalized);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Update current session if setting own session_id
        if (currentUser.id === id) {
            req.session.user.session_id = normalized;
            req.session.user.user_session_id = normalized;
        }

        res.json({ success: true, user: { id: user.id, session_id: user.session_id } });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Session ID already assigned to another user' });
        }
        console.error('Error updating user session:', error);
        res.status(500).json({ success: false, error: 'Failed to update user session' });
    }
});

/**
 * GET /api/v1/admin/tenant-admin
 * Get admin agent info for tenant
 */
router.get('/tenant-admin', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;
        const tenantId = user.role === 'super_admin'
            ? (req.query.tenant_id ? req.query.tenant_id.toString().trim() : null)
            : user.tenant_id;

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant ID required' });
        }

        const adminUser = await db.getTenantAdmin(tenantId);
        res.json({ success: true, admin: adminUser });
    } catch (error) {
        console.error('Error fetching tenant admin:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch tenant admin' });
    }
});

/**
 * GET /api/v1/admin/tenants/:id/webhooks
 * List webhooks for a tenant
 */
router.get('/tenants/:id/webhooks', requireRole('super_admin'), async (req, res) => {
    try {
        const tenantId = req.params.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant ID is required' });
        }

        const tenant = await db.getTenantById(tenantId);
        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        const webhooks = await db.getTenantWebhooks(tenantId);
        res.json({ success: true, webhooks });
    } catch (error) {
        console.error('Error fetching tenant webhooks:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch tenant webhooks' });
    }
});

/**
 * POST /api/v1/admin/tenants/:id/webhooks
 * Create webhook for a tenant
 */
router.post('/tenants/:id/webhooks', requireRole('super_admin'), async (req, res) => {
    try {
        const tenantId = req.params.id;
        const url = (req.body?.url || '').trim();

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant ID is required' });
        }
        if (!url) {
            return res.status(400).json({ success: false, error: 'Webhook URL is required' });
        }
        if (!isValidHttpUrl(url)) {
            return res.status(400).json({ success: false, error: 'Webhook URL must be valid http/https' });
        }

        const tenant = await db.getTenantById(tenantId);
        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        const webhook = await db.createTenantWebhook(tenantId, url);
        res.status(201).json({ success: true, webhook });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, error: 'Webhook URL already exists for this tenant' });
        }
        console.error('Error creating tenant webhook:', error);
        res.status(500).json({ success: false, error: 'Failed to create tenant webhook' });
    }
});

/**
 * DELETE /api/v1/admin/tenants/:id/webhooks/:webhookId
 * Delete webhook for a tenant
 */
router.delete('/tenants/:id/webhooks/:webhookId', requireRole('super_admin'), async (req, res) => {
    try {
        const tenantId = req.params.id;
        const webhookId = req.params.webhookId;

        if (!tenantId || !webhookId) {
            return res.status(400).json({ success: false, error: 'Tenant ID and webhook ID are required' });
        }

        const deleted = await db.deleteTenantWebhook(tenantId, webhookId);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Webhook not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting tenant webhook:', error);
        res.status(500).json({ success: false, error: 'Failed to delete tenant webhook' });
    }
});

// ===== USER MANAGEMENT =====

/**
 * GET /api/v1/admin/users
 * List users (filtered by tenant for non-super-admin)
 */
router.get('/users', requireAuth, async (req, res) => {
    try {
        const { tenant_id } = req.query;
        const user = req.session.user;

        const targetTenantId = user.role === 'super_admin'
            ? (tenant_id ? tenant_id.toString().trim() : null)
            : user.tenant_id;

        if (!targetTenantId && user.role !== 'super_admin') {
            return res.status(400).json({ success: false, error: 'Tenant ID required' });
        }

        const users = await db.getUsersByTenant(targetTenantId);
        const seatLimit = await db.getTenantSeatLimit(targetTenantId);
        const pendingInvites = await db.countPendingInvites(targetTenantId);

        res.json({ success: true, users, seat_limit: seatLimit, pending_invites: pendingInvites });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

/**
 * POST /api/v1/admin/users
 * Create new user (admin_agent or agent)
 */
router.post('/users', requireRole('super_admin'), async (req, res) => {
    try {
        const { tenant_id, name, email, password, role, phone_number } = req.body;
        const currentUser = req.session.user;

        // Validation
        if (!name || !email || !password || !role) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }

        // Role validation
        if (!['admin_agent', 'agent'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        // Tenant validation (super admin only)
        const targetTenantId = tenant_id?.toString().trim();
        if (!targetTenantId) {
            return res.status(400).json({ success: false, error: 'Tenant ID required for super admin' });
        }

        // Check if email already exists
        const existing = await db.findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already exists' });
        }

        // Check seat limit using tenant max_active_members
        const seatLimit = await db.getTenantSeatLimit(targetTenantId);
        const limit = Number.isFinite(seatLimit) ? seatLimit : 100;
        const existingUsers = await db.getUsersByTenant(targetTenantId);
        const pendingInvites = await db.countPendingInvites(targetTenantId);
        if (existingUsers.length + pendingInvites >= limit) {
            return res.status(400).json({ success: false, error: `Seat limit reached (max ${limit})` });
        }

        // Create user
        const password_hash = await bcrypt.hash(password, 12);
        const normalizedPhone = phone_number ? formatPhoneNumber(phone_number) : null;
        const user = await db.createUser({
            tenant_id: targetTenantId,
            name,
            email,
            password_hash,
            role,
            phone_number: normalizedPhone
        });

        // Notify n8n webhook (email sending handled there)
        const baseUrl = getFrontendBase();
        const inviteLink = `${baseUrl}/login`;
        await notifyInviteWebhook({
            invite_link: inviteLink,
            login_link: inviteLink,
            invitee_email: email,
            invitee_name: name,
            invitee_role: role,
            tenant_id: targetTenantId,
            tenant_name: null,
            created_by_email: currentUser?.email || null,
            created_by_name: currentUser?.name || null,
            created_by_role: currentUser?.role || null,
            expires_at: null,
            username: email,
            initial_password: password
        });

        res.status(201).json({ success: true, user });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, error: 'Failed to create user' });
    }
});

/**
 * POST /api/v1/admin/invites
 * Create invite for user agent
 */
router.post('/invites', requireRole('super_admin', 'admin_agent'), async (req, res) => {
    try {
        const { tenant_id, name, email, phone_number } = req.body;
        const currentUser = req.session.user;

        if (!name || !email) {
            return res.status(400).json({ success: false, error: 'Name and email are required' });
        }

        const targetTenantId = currentUser.role === 'super_admin'
            ? (tenant_id ? tenant_id.toString().trim() : null)
            : currentUser.tenant_id;
        if (!targetTenantId) {
            return res.status(400).json({ success: false, error: 'Tenant ID required' });
        }

        const existing = await db.findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already exists' });
        }

        const seatLimit = await db.getTenantSeatLimit(targetTenantId);
        const limit = Number.isFinite(seatLimit) ? seatLimit : 100;
        const existingUsers = await db.getUsersByTenant(targetTenantId);
        const pendingInvites = await db.countPendingInvites(targetTenantId);
        if (existingUsers.length + pendingInvites >= limit) {
            return res.status(400).json({ success: false, error: `Seat limit reached (max ${limit})` });
        }

        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const normalizedPhone = phone_number ? formatPhoneNumber(phone_number) : null;
        const invite = await db.createUserInvite({
            tenant_id: targetTenantId,
            name,
            email,
            role: 'agent',
            token,
            created_by: currentUser.id,
            expires_at: expiresAt,
            phone_number: normalizedPhone
        });

        // Build invite link for email
        const baseUrl = getFrontendBase();
        const inviteLink = `${baseUrl}/invite/${token}`;
        const loginLink = `${baseUrl}/login`;

        await notifyInviteWebhook({
            invite_link: inviteLink,
            login_link: loginLink,
            invitee_email: email,
            invitee_name: name,
            invitee_role: 'agent',
            tenant_id: targetTenantId,
            tenant_name: null,
            created_by_email: currentUser?.email || null,
            created_by_name: currentUser?.name || null,
            created_by_role: currentUser?.role || null,
            expires_at: expiresAt.toISOString(),
            username: email,
            initial_password: null
        });

        res.status(201).json({ success: true, invite });
    } catch (error) {
        console.error('Error creating invite:', error);
        res.status(500).json({ success: false, error: 'Failed to create invite' });
    }
});

/**
 * GET /api/v1/admin/invites/:token
 * Get invite details (public)
 */
router.get('/invites/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const invite = await db.getInviteByToken(token);
        if (!invite || invite.status !== 'pending' || isInviteExpired(invite)) {
            return res.status(404).json({ success: false, error: 'Invite not found or expired' });
        }
        res.json({
            success: true,
            invite: {
                name: invite.name,
                email: invite.email,
                tenant_name: invite.tenant_name,
                expires_at: invite.expires_at,
                phone_number: invite.phone_number || null
            }
        });
    } catch (error) {
        console.error('Error fetching invite:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch invite' });
    }
});

/**
 * POST /api/v1/admin/invites/:token/accept
 * Accept invite and create user (public)
 */
router.post('/invites/:token/accept', async (req, res) => {
    try {
        const { token } = req.params;
        const { password, phone_number } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const invite = await db.getInviteByToken(token);
        if (!invite || invite.status !== 'pending' || isInviteExpired(invite)) {
            return res.status(404).json({ success: false, error: 'Invite not found or expired' });
        }

        const existing = await db.findUserByEmail(invite.email);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already exists' });
        }

        const seatLimit = await db.getTenantSeatLimit(invite.tenant_id);
        const limit = Number.isFinite(seatLimit) ? seatLimit : 100;
        const existingUsers = await db.getUsersByTenant(invite.tenant_id);
        const pendingInvites = await db.countPendingInvites(invite.tenant_id);
        if (existingUsers.length + pendingInvites > limit) {
            return res.status(400).json({ success: false, error: `Seat limit reached (max ${limit})` });
        }

        const password_hash = await bcrypt.hash(password, 12);
        const normalizedPhone = phone_number
            ? formatPhoneNumber(phone_number)
            : (invite.phone_number ? formatPhoneNumber(invite.phone_number) : null);
        const user = await db.createUser({
            tenant_id: invite.tenant_id,
            name: invite.name,
            email: invite.email,
            password_hash,
            role: invite.role || 'agent',
            phone_number: normalizedPhone
        });

        await db.acceptInvite(token);
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
        console.error('Error accepting invite:', error);
        res.status(500).json({ success: false, error: 'Failed to accept invite' });
    }
});

/**
 * PATCH /api/v1/admin/users/:id/status
 * Update user status
 */
router.patch('/users/:id/status', requireRole('super_admin', 'admin_agent'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        // Check permission
        const targetUser = await db.findUserById(id);
        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const currentUser = req.session.user;
        if (currentUser.role !== 'super_admin' && targetUser.tenant_id !== currentUser.tenant_id) {
            return res.status(403).json({ success: false, error: 'Cannot modify users from other tenant' });
        }

        const user = await db.updateUserStatus(id, status);
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

/**
 * PATCH /api/v1/admin/users/:id
 * Update user details (name, email, password, phone_number, role)
 */
router.patch('/users/:id', requireRole('super_admin', 'admin_agent'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, phone_number, role } = req.body;
        const currentUser = req.session.user;

        // 1. Get Target User
        const targetUser = await db.findUserById(id);
        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // 2. Permission Check
        // Super Admin can edit anyone.
        // Admin Agent can only edit users in their own tenant.
        if (currentUser.role !== 'super_admin' && targetUser.tenant_id !== currentUser.tenant_id) {
            return res.status(403).json({ success: false, error: 'Cannot modify users from other tenant' });
        }
        
        // Admin Agent cannot edit Super Admin
        if (targetUser.role === 'super_admin' && currentUser.role !== 'super_admin') {
             return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        // 3. Prepare Updates
        const updates = {};
        if (name) updates.name = name;
        if (email) {
            // Check uniqueness if email changed
            if (email !== targetUser.email) {
                const existing = await db.findUserByEmail(email);
                if (existing) {
                    return res.status(409).json({ success: false, error: 'Email already exists' });
                }
                updates.email = email;
            }
        }
        if (password && password.trim().length > 0) {
            if (password.length < 6) {
                 return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
            }
            updates.password_hash = await bcrypt.hash(password, 12);
        }
        // Allow clearing phone number with empty string or null
        if (phone_number !== undefined) {
             updates.phone_number = (phone_number && phone_number.toString().trim() !== '')
                 ? formatPhoneNumber(phone_number)
                 : null;
        }
        
        // Only Super Admin can change role
        if (role && currentUser.role === 'super_admin') {
             if (['admin_agent', 'agent'].includes(role)) {
                 updates.role = role;
             }
        }

        if (Object.keys(updates).length === 0) {
            return res.json({ success: true, user: targetUser, message: 'No changes made' });
        }

        // 4. Perform Update
        const updatedUser = await db.updateUser(id, updates);
        
        // Remove password hash from response
        delete updatedUser.password_hash;
        
        res.json({ success: true, user: updatedUser });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/v1/admin/users/:id
 * Delete user
 */
router.delete('/users/:id', requireRole('super_admin', 'admin_agent'), async (req, res) => {
    try {
        const { id } = req.params;

        const targetUser = await db.findUserById(id);
        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const currentUser = req.session.user;

        // Can't delete yourself
        if (targetUser.id === currentUser.id) {
            return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
        }

        // Tenant check
        if (currentUser.role !== 'super_admin' && targetUser.tenant_id !== currentUser.tenant_id) {
            return res.status(403).json({ success: false, error: 'Cannot delete users from other tenant' });
        }

        await db.deleteUser(id);
        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
});

// ===== TICKET & MESSAGE DATA (Tenant Scoped) =====

/**
 * GET /api/v1/admin/tickets
 * List tickets for tenant
 */
router.get('/tickets', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
        const offset = parseInt(req.query.offset || '0', 10);
        const statusFilter = (req.query.status || '').toString();

        const tenantId = user.role === 'super_admin'
            ? (req.query.tenant_id ? req.query.tenant_id.toString().trim() : null)
            : user.tenant_id;

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant ID required' });
        }

        const chats = await db.getChatsByTenant(tenantId, limit, offset);
        let tickets = chats.map(c => ({
            id: c.id,
            status: c.status || 'open',
            customer_name: c.display_name || c.push_name || 'Customer',
            customer_contact: c.phone_number,
            last_message: c.last_message_preview,
            message_count: 0, // Simplified for compatibility
            updated_at: c.last_message_time,
            agent_name: c.agent_name,
            unread_count: c.unread_count
        }));

        if (statusFilter) {
            tickets = tickets.filter((t) => t.status === statusFilter);
        }

        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
    }
});

/**
 * GET /api/v1/admin/tickets/:id/messages
 * Get messages for ticket
 */
router.get('/tickets/:id/messages', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;
        const ticketId = req.params.id;
        if (!ticketId) {
            return res.status(400).json({ success: false, error: 'Ticket ID required' });
        }

        const chatResult = await db.query('SELECT * FROM chats WHERE id = $1', [ticketId]);
        const chat = chatResult.rows[0];
        if (!chat) {
            return res.status(404).json({ success: false, error: 'Ticket (Chat) not found' });
        }
        if (user.role !== 'super_admin' && chat.tenant_id !== user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const messages = await db.getMessagesByChat(ticketId);
        res.json({ success: true, messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch messages' });
    }
});

/**
 * POST /api/v1/admin/tickets/:id/messages
 * Log agent message for ticket
 */
router.post('/tickets/:id/messages', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;
        const ticketId = req.params.id;
        const messageText = (req.body?.message_text || '').trim();

        if (!ticketId) {
            return res.status(400).json({ success: false, error: 'Ticket ID required' });
        }
        if (!messageText) {
            return res.status(400).json({ success: false, error: 'Message text required' });
        }

        const chatResult = await db.query('SELECT * FROM chats WHERE id = $1', [ticketId]);
        const chat = chatResult.rows[0];
        if (!chat) {
            return res.status(404).json({ success: false, error: 'Ticket (Chat) not found' });
        }
        if (user.role !== 'super_admin' && chat.tenant_id !== user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const message = await db.logMessage({
            chatId: ticketId,
            senderType: 'agent',
            senderId: user.id,
            senderName: user.name,
            body: messageText,
            isFromMe: true
        });

        res.status(201).json({ success: true, message });
    } catch (error) {
        console.error('Error logging message:', error);
        res.status(500).json({ success: false, error: 'Failed to log message' });
    }
});

// ===== DASHBOARD STATS =====

/**
 * GET /api/v1/admin/stats
 * Get dashboard statistics
 */
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;

        if (user.role === 'super_admin') {
            const stats = await db.getSuperAdminStats();
            res.json({ success: true, stats });
        } else {
            const stats = await db.getDashboardStats(user.tenant_id);
            res.json({ success: true, stats });
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

/**
 * GET /api/v1/admin/notifier-session
 * Get current notifier session id (super admin only)
 */
router.get('/notifier-session', requireRole('super_admin'), async (req, res) => {
    try {
        const sessionId = await db.getSystemSetting('notifier_session_id');
        res.json({ success: true, notifier_session_id: sessionId });
    } catch (error) {
        console.error('Error fetching notifier session:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch notifier session' });
    }
});

/**
 * POST /api/v1/admin/notifier-session
 * Set notifier session id (super admin only)
 */
router.post('/notifier-session', requireRole('super_admin'), async (req, res) => {
    try {
        const { session_id } = req.body;
        if (!session_id || typeof session_id !== 'string') {
            return res.status(400).json({ success: false, error: 'session_id is required' });
        }
        const trimmed = session_id.trim();
        await db.setSystemSetting('notifier_session_id', trimmed);
        res.json({ success: true, notifier_session_id: trimmed });
    } catch (error) {
        console.error('Error setting notifier session:', error);
        res.status(500).json({ success: false, error: 'Failed to set notifier session' });
    }
});

/**
 * GET /api/v1/admin/wa/groups
 * Fetch joined groups for the tenant's WhatsApp session (safely)
 */
router.get('/wa/groups', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;
        let sessionId = user?.tenant_session_id || user?.tenant_session_id;

        // Fallback: get tenant session id from DB
        if (!sessionId && user?.tenant_id) {
            const tenant = await db.getTenantById(user.tenant_id);
            sessionId = tenant?.session_id;
        }

        // Super admin may query a specific session
        if (!sessionId && user?.role === 'super_admin' && req.query.session_id) {
            sessionId = req.query.session_id.toString().trim();
        }

        if (!sessionId) {
            return res.json({ success: true, groups: [] }); // No session = empty groups
        }

        try {
            // Try to authenticate silently
            await ensureGatewayToken(sessionId);
        } catch (err) {
            console.warn(`[Groups] Gateway auth warning for ${sessionId}:`, err.message);
        }

        try {
            const response = await waGateway.getGroups(sessionId);
            if (response.status === true || response.status === 'success') {
                return res.json({ success: true, groups: response.data || [] });
            }
        } catch (gwError) {
            console.warn(`[Groups] Gateway fetch failed for ${sessionId}:`, gwError.message);
        }

        // Fallback: return empty list instead of crashing
        return res.json({ success: true, groups: [] });

    } catch (error) {
        console.error('Error fetching WA groups:', error);
        // CRITICAL FIX: Return empty list to prevent frontend crash (500)
        res.json({ success: true, groups: [] });
    }
});

/**
 * GET /api/v1/admin/wa/contacts
 * Fetch contacts for the tenant's WhatsApp session (safely)
 */
router.get('/wa/contacts', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;
        let sessionId = user?.tenant_session_id || user?.tenant_session_id;

        if (!sessionId && user?.tenant_id) {
            const tenant = await db.getTenantById(user.tenant_id);
            sessionId = tenant?.session_id;
        }

        if (!sessionId && user?.role === 'super_admin' && req.query.session_id) {
            sessionId = req.query.session_id.toString().trim();
        }

        if (!sessionId) {
            return res.json({ success: true, contacts: [] }); // No session = empty contacts
        }

        try {
            // Try to authenticate silently
            await ensureGatewayToken(sessionId);
        } catch (err) {
            console.warn(`[Contacts] Gateway auth warning for ${sessionId}:`, err.message);
        }

        try {
            const response = await waGateway.getContacts(sessionId);
            if (response.status === true || response.status === 'success') {
                return res.json({ success: true, contacts: response.data || [] });
            }
        } catch (gwError) {
            console.warn(`[Contacts] Gateway fetch failed for ${sessionId}:`, gwError.message);
        }

        // Fallback: return empty list instead of crashing
        return res.json({ success: true, contacts: [] });

    } catch (error) {
        console.error('Error fetching WA contacts:', error);
        // CRITICAL FIX: Return empty list to prevent frontend crash (500)
        res.json({ success: true, contacts: [] });
    }
});

async function ensureGatewayToken(sessionId) {
    if (waGateway.getSessionToken(sessionId)) return true;
    if (!gatewayPassword) throw new Error('Gateway password tidak dikonfigurasi');

    const authResp = await waGateway.authenticate(sessionId, gatewayPassword);
    if (authResp?.status && authResp.data?.token) {
        waGateway.setSessionToken(sessionId, authResp.data.token);
        return true;
    }
    throw new Error(authResp?.message || 'Autentikasi gateway gagal');
}

module.exports = {
    router,
    requireAuth,
    requireRole,
    requireTenantAccess,
    ensureSuperAdmin
};
