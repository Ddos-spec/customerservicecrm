const express = require('express');
const { extractKeywords } = require('../utils/stopwords');

function buildAnalyticsRouter(deps) {
    const router = express.Router();
    const { db } = deps;

    const requireOwner = (req, res) => {
        const user = req.session?.user;
        if (!user) {
            res.status(401).json({ status: 'error', message: 'Authentication required' });
            return null;
        }
        if (!user.tenant_id) {
            res.status(400).json({ status: 'error', message: 'Tenant not found' });
            return null;
        }
        return { user, tenantId: user.tenant_id };
    };

    // GET /api/v1/analytics/keywords
    // Get top keywords from customer chats
    router.get('/keywords', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;

        try {
            const limit = req.query.limit || 1000;

            // Fetch last N messages from contacts for this tenant
            // We join with chats to filter by tenant_id
            const result = await db.query(`
                SELECT m.body 
                FROM messages m
                JOIN chats c ON m.chat_id = c.id
                WHERE c.tenant_id = $1 
                AND m.sender_type = 'contact'
                AND m.message_type = 'text'
                AND m.body IS NOT NULL
                ORDER BY m.created_at DESC
                LIMIT $2
            `, [ctx.tenantId, limit]);

            // Process text
            const wordCounts = {};
            
            result.rows.forEach(row => {
                if (row.body) {
                    const words = extractKeywords(row.body);
                    words.forEach(word => {
                        wordCounts[word] = (wordCounts[word] || 0) + 1;
                    });
                }
            });

            // Convert to array and sort
            const keywords = Object.entries(wordCounts)
                .map(([word, count]) => ({ word, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 50); // Return top 50

            // Also fetch current tenant category
            const tenantRes = await db.query('SELECT business_category FROM tenants WHERE id = $1', [ctx.tenantId]);
            const category = tenantRes.rows[0]?.business_category || 'general';

            res.json({
                status: 'success',
                data: {
                    category,
                    keywords
                }
            });

        } catch (error) {
            console.error('Error fetching analytics keywords:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    });

    // PUT /api/v1/analytics/category
    // Update tenant business category
    router.put('/category', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;

        try {
            const { category } = req.body;

            if (!category) {
                return res.status(400).json({ status: 'error', message: 'Category is required' });
            }

            await db.query(
                'UPDATE tenants SET business_category = $1 WHERE id = $2',
                [category, ctx.tenantId]
            );

            res.json({ status: 'success', message: 'Business category updated' });
        } catch (error) {
            console.error('Error updating tenant category:', error);
            res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    });

    return router;
}

module.exports = { buildAnalyticsRouter };
