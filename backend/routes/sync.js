const express = require('express');
const { normalizeJid, getJidUser } = require('../utils/jid');
const router = express.Router();

function buildSyncRouter({ waGateway, db, validateToken }) {

    // Session-based auth middleware for internal routes
    const requireSession = (req, res, next) => {
        const user = req.session?.user;
        if (!user || !user.tenant_id) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        next();
    };

    /**
     * POST /api/v1/sync/contacts
     * Force sync contacts and groups from WhatsApp Gateway to CRM Database
     */
    router.post('/contacts', requireSession, async (req, res) => {
        const user = req.session.user;

        const sessionId = user.tenant_session_id;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'No WhatsApp session linked to this tenant.' });
        }

        try {
            console.log(`[Sync] Starting full contact sync for session ${sessionId}...`);

            // 1. Fetch from Gateway
            // Use getContactsFromDB for contacts (queries database directly - more reliable)
            // Use getGroups for groups (from memory)
            const [contactsRes, groupsRes] = await Promise.allSettled([
                waGateway.getContactsFromDB(sessionId),
                waGateway.getGroups(sessionId)
            ]);

            const contacts = contactsRes.status === 'fulfilled' && contactsRes.value?.status === 'success'
                ? (contactsRes.value.data || [])
                : [];

            const groups = groupsRes.status === 'fulfilled' && groupsRes.value?.status === 'success'
                ? (groupsRes.value.data || [])
                : [];

            console.log(`[Sync] Gateway DB returned ${contacts.length} contacts and ${groups.length} groups.`);

            // 2. Prepare Data for DB
            // Combine both into a unified list for insertion
            const unifiedContacts = [];

            // Process Individual Contacts
            // Gateway returns: JID, FirstName, FullName, PushName, BusinessName (capital letters)
            for (const c of contacts) {
                const rawJid = c.JID || c.jid;
                if (!rawJid) continue;
                const jid = normalizeJid(rawJid, { isGroup: false });
                if (!jid) continue;

                // Priority: FullName (saved contact) > FirstName (saved) > PushName (not saved)
                const displayName = c.FullName || c.fullName || c.FirstName || c.firstName || c.PushName || c.pushName || null;

                unifiedContacts.push({
                    jid: jid,
                    fullName: c.FullName || c.fullName || null,
                    firstName: c.FirstName || c.firstName || null,
                    pushName: c.PushName || c.pushName || null,
                    displayName: displayName,
                    phone: getJidUser(jid),
                    isBusiness: !!(c.BusinessName || c.businessName),
                    businessName: c.BusinessName || c.businessName || null,
                    isGroup: false
                });
            }

            // Process Groups
            for (const g of groups) {
                const rawJid = g.JID || g.jid;
                if (!rawJid) continue;
                const jid = normalizeJid(rawJid, { isGroup: true });
                if (!jid) continue;
                const groupName = g.Subject || g.subject || g.Name || g.name || 'Unknown Group';
                unifiedContacts.push({
                    jid: jid,
                    fullName: groupName,
                    firstName: null,
                    pushName: null,
                    displayName: groupName,
                    phone: getJidUser(jid), // Group ID
                    isBusiness: false,
                    isGroup: true
                });
            }

            // 3. Sync to Database
            if (unifiedContacts.length > 0) {
                await db.syncContacts(user.tenant_id, unifiedContacts);

                // Auto-create Chat entries for groups so they appear in list immediately
                for (const c of unifiedContacts) {
                    if (c.isGroup) {
                       await db.getOrCreateChat(user.tenant_id, c.jid, c.displayName, true);
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
