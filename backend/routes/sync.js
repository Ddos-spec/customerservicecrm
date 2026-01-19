const express = require('express');
const { normalizeJid, getJidUser } = require('../utils/jid');
const router = express.Router();

function buildSyncRouter({ waGateway, db, validateToken }) {

    // Session-based auth middleware - allows super_admin without tenant_id
    const requireSession = (req, res, next) => {
        // Debug Log Agresif
        console.log(`[Sync] Request incoming to ${req.originalUrl}`);
        console.log(`[Sync] Headers Cookie: ${req.headers.cookie ? 'PRESENT' : 'MISSING'}`);
        console.log(`[Sync] Session ID: ${req.sessionID}`);
        console.log('[Sync] Session User:', req.session?.user ? req.session.user.email : 'NONE');
        
        const user = req.session?.user;
        if (!user) {
            console.warn('[Sync] Authentication failed: No user in session.');
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        next();
    };

    /**
     * POST /api/v1/sync/contacts
     * Force sync contacts and groups from WhatsApp Gateway to CRM Database
     * Super admin can specify tenant_id in body, admin_agent uses their own tenant
     */
    router.post('/contacts', requireSession, async (req, res) => {
        const user = req.session.user;

        // Determine tenant_id: from user (admin_agent) or from body/first tenant (super_admin)
        let tenantId = user.tenant_id;
        let sessionId = user.session_id;

        if (!tenantId && user.role === 'super_admin') {
            // Super admin - get tenant from body or use first available
            tenantId = req.body.tenant_id;
            if (!tenantId) {
                const tenants = await db.getAllTenants();
                if (tenants.length === 0) {
                    return res.status(400).json({ status: 'error', message: 'No tenants found' });
                }
                tenantId = tenants[0].id;
                sessionId = tenants[0].session_id;
            } else {
                const tenant = await db.getTenantById(tenantId);
                if (!tenant) {
                    return res.status(400).json({ status: 'error', message: 'Tenant not found' });
                }
                sessionId = tenant.session_id;
            }
        }

        if (!tenantId) {
            return res.status(400).json({ status: 'error', message: 'No tenant associated with this user' });
        }

        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'No WhatsApp session linked to this tenant.' });
        }

        try {
            console.log(`[Sync] Starting SMART SYNC for session ${sessionId}...`);

            // 1. Massive SQL Sync for Contacts (Fastest Way)
            // Copy data directly from whatsmeow_contacts to contacts table
            // This bypasses Node.js memory loop and HTTP overhead
            const syncQuery = `
                INSERT INTO public.contacts (tenant_id, jid, phone_number, full_name, updated_at)
                SELECT 
                    $1::uuid, 
                    wc.their_jid, 
                    split_part(wc.their_jid, '@', 1), 
                    COALESCE(wc.full_name, wc.first_name, wc.push_name, split_part(wc.their_jid, '@', 1)), 
                    NOW()
                FROM 
                    public.whatsmeow_contacts wc
                WHERE 
                    wc.our_jid LIKE $2 || '%'
                ON CONFLICT (tenant_id, jid) 
                DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    updated_at = NOW()
            `;
            
            // Use session_id as prefix match for our_jid
            const contactsResult = await db.query(syncQuery, [tenantId, sessionId]);
            const syncedCount = contactsResult.rowCount;
            console.log(`[Sync] SQL Sync completed. Processed ${syncedCount} contacts.`);

            // 2. Sync Groups via Gateway API (To get participant metadata correctly)
            // Groups are usually fewer in number, so API fetch is safe
            const groupsRes = await waGateway.getGroups(sessionId);
            const groups = groupsRes.status === 'success' ? (groupsRes.data || []) : [];
            
            const unifiedGroups = [];
            for (const g of groups) {
                const rawJid = g.JID || g.jid;
                if (!rawJid) continue;
                const jid = normalizeJid(rawJid, { isGroup: true });
                if (!jid) continue;
                const groupName = g.Subject || g.subject || g.Name || g.name || 'Unknown Group';
                
                unifiedGroups.push({
                    jid: jid,
                    fullName: groupName,
                    displayName: groupName,
                    phone: getJidUser(jid),
                    isBusiness: false,
                    isGroup: true
                });
            }

            if (unifiedGroups.length > 0) {
                await db.syncContacts(tenantId, unifiedGroups);
                
                // Auto-create Chat entries for groups
                for (const c of unifiedGroups) {
                    await db.getOrCreateChat(tenantId, c.jid, c.displayName, true);
                }
            }

            res.json({
                status: 'success',
                message: `Synced ${syncedCount} contacts (SQL) and ${unifiedGroups.length} groups (API).`,
                details: {
                    contacts: syncedCount,
                    groups: unifiedGroups.length
                }
            });

        } catch (error) {
            console.error('[Sync] Error:', error);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}

module.exports = { buildSyncRouter };
