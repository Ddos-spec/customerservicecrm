const express = require('express');
const router = express.Router();

function buildSyncRouter({ waGateway, db, validateToken }) {
    
    router.use(validateToken);

    /**
     * POST /api/v1/sync/contacts
     * Force sync contacts and groups from WhatsApp Gateway to CRM Database
     */
    router.post('/contacts', async (req, res) => {
        const user = req.session?.user;
        if (!user || !user.tenant_id) {
            return res.status(401).json({ status: 'error', message: 'Unauthorized' });
        }

        const sessionId = user.tenant_session_id;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'No WhatsApp session linked to this tenant.' });
        }

        try {
            console.log(`[Sync] Starting full contact sync for session ${sessionId}...`);

            // 1. Fetch from Gateway
            const [contactsRes, groupsRes] = await Promise.allSettled([
                waGateway.getContacts(sessionId),
                waGateway.getGroups(sessionId)
            ]);

            const contacts = contactsRes.status === 'fulfilled' && contactsRes.value?.status === 'success' 
                ? (contactsRes.value.data || []) 
                : [];
            
            const groups = groupsRes.status === 'fulfilled' && groupsRes.value?.status === 'success' 
                ? (groupsRes.value.data || []) 
                : [];

            console.log(`[Sync] Gateway returned ${contacts.length} contacts and ${groups.length} groups.`);

            // 2. Prepare Data for DB
            // Combine both into a unified list for insertion
            const unifiedContacts = [];

            // Process Individual Contacts
            for (const c of contacts) {
                if (!c.jid) continue;
                unifiedContacts.push({
                    jid: c.jid,
                    name: c.pushName || c.fullName || c.name || c.verifiedName,
                    shortName: c.firstName || c.shortName,
                    phone: c.jid.split('@')[0],
                    isBusiness: c.isBusiness || false,
                    isGroup: false
                });
            }

            // Process Groups
            for (const g of groups) {
                if (!g.jid) continue;
                unifiedContacts.push({
                    jid: g.jid,
                    name: g.subject || g.name || 'Unknown Group',
                    shortName: g.subject,
                    phone: g.jid.split('@')[0], // Group ID
                    isBusiness: false,
                    isGroup: true
                });
            }

            // 3. Sync to Database
            if (unifiedContacts.length > 0) {
                await db.syncContacts(user.tenant_id, unifiedContacts);
                
                // Optional: Auto-create Chat entries for groups so they appear in list immediately
                // For performance, we might only want to do this for groups or frequently contacted
                for (const c of unifiedContacts) {
                    if (c.isGroup) {
                       await db.getOrCreateChat(user.tenant_id, c.jid, c.name);
                    }
                }
            }

            console.log(`[Sync] Successfully synced ${unifiedContacts.length} items to DB.`);

            res.json({
                status: 'success',
                message: `Synced ${unifiedContacts.length} contacts/groups.`,
                details: {
                    contacts: contacts.length,
                    groups: groups.length
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
