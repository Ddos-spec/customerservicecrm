const express = require('express');
const router = express.Router();
const { validateToken } = require('../auth');

function buildDebugRouter(deps) {
    const { db } = deps;

    // Helper untuk auth session
    const requireOwner = (req, res) => {
        const user = req.session?.user;
        if (!user) {
            res.status(401).json({ status: 'error', message: 'Authentication required' });
            return null;
        }
        return { user, tenantId: user.tenant_id };
    };

    // GET /api/v1/debug/messages
    // Mengambil 50 pesan terakhir dari database untuk tenant ini TANPA FILTER sender_type
    // Tujuannya: Melihat data aslinya seperti apa (sender_type nya apa, message_type nya apa)
    router.get('/messages', async (req, res) => {
        const ctx = requireOwner(req, res);
        if (!ctx) return;

        try {
            // Query polos untuk diagnosa
            const result = await db.query(`
                SELECT 
                    m.id,
                    m.body,
                    m.sender_type,
                    m.message_type,
                    m.created_at,
                    c.id as chat_id
                FROM messages m
                JOIN chats c ON m.chat_id = c.id
                WHERE c.tenant_id = $1
                ORDER BY m.created_at DESC
                LIMIT 50
            `, [ctx.tenantId]);

            // Hitung statistik ringkas
            const stats = await db.query(`
                SELECT 
                    sender_type, 
                    message_type,
                    COUNT(*) as count 
                FROM messages m
                JOIN chats c ON m.chat_id = c.id
                WHERE c.tenant_id = $1
                GROUP BY sender_type, message_type
            `, [ctx.tenantId]);

            res.json({
                status: 'success',
                debug_info: {
                    total_fetched: result.rowCount,
                    summary_stats: stats.rows, // Ini akan memberitahu kita jumlah pesan per tipe
                    raw_samples: result.rows   // Ini data mentahnya
                }
            });

        } catch (error) {
            console.error('Debug Error:', error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}

module.exports = { buildDebugRouter };
