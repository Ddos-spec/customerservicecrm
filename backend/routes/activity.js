const express = require('express');

function buildActivityRouter({ db, resolveAuthenticatedUser }) {
    const router = express.Router();

    const getUser = (req, res) => {
        const user = resolveAuthenticatedUser(req);
        if (!user) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return null;
        }
        return user;
    };

    // GET /api/v1/activity — super admin sees system feed; tenant users see only their tenant.
    router.get('/', async (req, res) => {
        const user = getUser(req, res);
        if (!user) return;
        try {
            const events = await db.getActivityFeed({
                tenantId: user.role === 'super_admin' ? null : user.tenant_id,
                limit: req.query.limit,
            });
            return res.json({ success: true, events });
        } catch (error) {
            console.error('Activity feed error:', error.message);
            return res.status(500).json({ success: false, error: 'Gagal memuat aktivitas' });
        }
    });

    return router;
}

module.exports = { buildActivityRouter };
