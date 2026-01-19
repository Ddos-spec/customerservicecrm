const express = require('express');

function buildMarketingRouter(deps) {
    const router = express.Router();
    const { db, validateToken } = deps;

    router.use(validateToken);

    const requireOwner = (req, res) => {
        const user = req.session?.user;
        if (!user) {
            res.status(401).json({ status: 'error', message: 'Authentication required' });
            return null;
        }
        if (user.role !== 'admin_agent') {
            res.status(403).json({ status: 'error', message: 'Access denied' });
            return null;
        }
        if (!user.tenant_id) {
            res.status(400).json({ status: 'error', message: 'Tenant tidak ditemukan' });
            return null;
        }
        return { user, tenantId: user.tenant_id };
    };

    router.get('/groups', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;

        try {
            const result = await db.query(`
                SELECT
                    g.*,
                    COALESCE(COUNT(m.contact_id), 0)::int as member_count
                FROM contact_groups g
                LEFT JOIN contact_group_members m ON m.group_id = g.id
                WHERE g.tenant_id = $1
                GROUP BY g.id
                ORDER BY g.created_at DESC
            `, [ctx.tenantId]);

            res.json({ status: 'success', data: result.rows });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    router.post('/groups', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;

        const name = (req.body?.name || '').toString().trim();
        const description = (req.body?.description || '').toString().trim() || null;

        if (!name) {
            return res.status(400).json({ status: 'error', message: 'Nama group wajib diisi' });
        }

        try {
            const result = await db.query(`
                INSERT INTO contact_groups (tenant_id, name, description)
                VALUES ($1, $2, $3)
                RETURNING *
            `, [ctx.tenantId, name, description]);

            res.status(201).json({ status: 'success', data: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ status: 'error', message: 'Nama group sudah digunakan' });
            }
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    router.post('/groups/:groupId/members', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;

        const groupId = req.params.groupId;
        const contactIds = Array.isArray(req.body?.contact_ids) ? req.body.contact_ids : [];

        if (!groupId) {
            return res.status(400).json({ status: 'error', message: 'Group ID tidak valid' });
        }
        if (contactIds.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Contact list kosong' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const groupRes = await client.query(`
                SELECT id FROM contact_groups WHERE id = $1 AND tenant_id = $2
            `, [groupId, ctx.tenantId]);

            if (groupRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ status: 'error', message: 'Group tidak ditemukan' });
            }

            const insertRes = await client.query(`
                INSERT INTO contact_group_members (contact_id, group_id)
                SELECT c.id, $1
                FROM contacts c
                WHERE c.id = ANY($2::uuid[])
                  AND c.tenant_id = $3
                ON CONFLICT DO NOTHING
            `, [groupId, contactIds, ctx.tenantId]);

            await client.query('COMMIT');
            res.json({ status: 'success', added: insertRes.rowCount });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ status: 'error', message: error.message });
        } finally {
            client.release();
        }
    });

    router.post('/campaigns', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;

        const name = (req.body?.name || '').toString().trim();
        const messageTemplate = (req.body?.message_template || '').toString();
        const groupIds = Array.isArray(req.body?.group_ids) ? req.body.group_ids : [];
        const scheduledAtRaw = req.body?.scheduled_at ? new Date(req.body.scheduled_at) : new Date();

        if (!name) {
            return res.status(400).json({ status: 'error', message: 'Nama campaign wajib diisi' });
        }
        if (!messageTemplate.trim()) {
            return res.status(400).json({ status: 'error', message: 'Message template wajib diisi' });
        }
        if (groupIds.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Pilih minimal 1 group' });
        }
        if (Number.isNaN(scheduledAtRaw.getTime())) {
            return res.status(400).json({ status: 'error', message: 'Jadwal tidak valid' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const campaignRes = await client.query(`
                INSERT INTO campaigns (tenant_id, name, message_template, scheduled_at, status)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [ctx.tenantId, name, messageTemplate, scheduledAtRaw.toISOString(), 'scheduled']);

            const campaign = campaignRes.rows[0];

            const queueRes = await client.query(`
                INSERT INTO campaign_messages (campaign_id, contact_id, phone_number, status)
                SELECT DISTINCT $1, c.id, c.phone_number, 'pending'
                FROM contact_group_members cgm
                JOIN contact_groups cg ON cg.id = cgm.group_id
                JOIN contacts c ON c.id = cgm.contact_id
                WHERE cg.tenant_id = $2
                  AND c.tenant_id = $2
                  AND cg.id = ANY($3::uuid[])
                  AND c.phone_number IS NOT NULL
                  AND c.phone_number <> ''
                  AND c.jid NOT LIKE '%@g.us'
            `, [campaign.id, ctx.tenantId, groupIds]);

            const totalTargets = queueRes.rowCount || 0;
            await client.query(`
                UPDATE campaigns
                SET total_targets = $1
                WHERE id = $2
            `, [totalTargets, campaign.id]);

            await client.query('COMMIT');
            res.status(201).json({
                status: 'success',
                campaign: { ...campaign, total_targets: totalTargets }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ status: 'error', message: error.message });
        } finally {
            client.release();
        }
    });

    router.get('/campaigns', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;

        const limitRaw = parseInt(req.query.limit, 10);
        const pageRaw = parseInt(req.query.page, 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(limitRaw, 100) : 20;
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const offset = (page - 1) * limit;

        try {
            const [listRes, countRes] = await Promise.all([
                db.query(`
                    SELECT *
                    FROM campaigns
                    WHERE tenant_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                `, [ctx.tenantId, limit, offset]),
                db.query(`
                    SELECT COUNT(*) as total
                    FROM campaigns
                    WHERE tenant_id = $1
                `, [ctx.tenantId])
            ]);

            const total = Number.parseInt(countRes.rows[0]?.total, 10) || 0;

            res.json({
                status: 'success',
                data: listRes.rows,
                total,
                page,
                limit
            });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}

module.exports = { buildMarketingRouter };
