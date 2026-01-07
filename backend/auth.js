/**
 * Authentication Module
 * Handles login, logout, session validation, and role-based access
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const router = express.Router();

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
    const requestedTenantId = parseInt(req.params.tenantId || req.body.tenant_id || req.query.tenant_id);
    if (requestedTenantId && requestedTenantId !== req.session.user.tenant_id) {
        return res.status(403).json({ success: false, error: 'Forbidden - Cannot access other tenant data' });
    }

    next();
}

// ===== SUPER ADMIN AUTO-CREATION =====

/**
 * Ensure super admin exists (reads from ENV)
 * Called on server startup
 */
async function ensureSuperAdmin() {
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!email || !password) {
        console.log('⚠️  SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set in ENV');
        console.log('   Super admin auto-creation skipped. Set these ENV vars to enable.');
        return null;
    }

    try {
        // Check if super admin already exists
        const existing = await db.findUserByEmail(email);
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
            }
            return existing;
        }

        // Create super admin
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

// ===== ROUTES =====

/**
 * POST /api/v1/admin/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
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

        // Create session
        req.session.user = {
            id: user.id,
            tenant_id: user.tenant_id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenant_name: user.tenant_name
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
                    tenant_name: user.tenant_name
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
        const { company_name } = req.body;
        if (!company_name) {
            return res.status(400).json({ success: false, error: 'Company name is required' });
        }

        const tenant = await db.createTenant({ company_name });
        res.status(201).json({ success: true, tenant });
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

// ===== USER MANAGEMENT =====

/**
 * GET /api/v1/admin/users
 * List users (filtered by tenant for non-super-admin)
 */
router.get('/users', requireAuth, async (req, res) => {
    try {
        const { tenant_id } = req.query;
        const user = req.session.user;

        let targetTenantId;
        if (user.role === 'super_admin') {
            targetTenantId = tenant_id ? parseInt(tenant_id) : null;
        } else {
            targetTenantId = user.tenant_id;
        }

        if (!targetTenantId && user.role !== 'super_admin') {
            return res.status(400).json({ success: false, error: 'Tenant ID required' });
        }

        const users = targetTenantId
            ? await db.getUsersByTenant(targetTenantId)
            : []; // Super admin without filter gets empty (must specify tenant)

        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

/**
 * POST /api/v1/admin/users
 * Create new user (admin_agent or agent)
 */
router.post('/users', requireRole('super_admin', 'admin_agent'), async (req, res) => {
    try {
        const { tenant_id, name, email, password, role } = req.body;
        const currentUser = req.session.user;

        // Validation
        if (!name || !email || !password || !role) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }

        // Role validation
        if (!['admin_agent', 'agent'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        // Tenant validation
        let targetTenantId;
        if (currentUser.role === 'super_admin') {
            if (!tenant_id) {
                return res.status(400).json({ success: false, error: 'Tenant ID required for super admin' });
            }
            targetTenantId = tenant_id;
        } else {
            // Admin agent can only create for their own tenant
            targetTenantId = currentUser.tenant_id;
            if (role === 'admin_agent') {
                return res.status(403).json({ success: false, error: 'Cannot create another admin agent' });
            }
        }

        // Check if email already exists
        const existing = await db.findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already exists' });
        }

        // Check agent slot limit (4 max per tenant)
        const existingUsers = await db.getUsersByTenant(targetTenantId);
        if (existingUsers.length >= 4) {
            return res.status(400).json({ success: false, error: 'Agent slot limit reached (max 4)' });
        }

        // Create user
        const password_hash = await bcrypt.hash(password, 12);
        const user = await db.createUser({
            tenant_id: targetTenantId,
            name,
            email,
            password_hash,
            role
        });

        res.status(201).json({ success: true, user });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, error: 'Failed to create user' });
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

module.exports = {
    router,
    requireAuth,
    requireRole,
    requireTenantAccess,
    ensureSuperAdmin
};
