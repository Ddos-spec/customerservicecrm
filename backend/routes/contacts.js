const express = require('express');
const router = express.Router();

function buildContactsRouter(deps) {
    // deps: { sessions, validateToken, waGateway, db, ... }
    const { validateToken, waGateway, db } = deps;

    // Middleware: Validasi Token Login (Session Admin/Agent)
    router.use(validateToken);

    /**
     * GET /api/v1/contacts
     * Fetch from Gateway AND Sync to Backend Database (Postgres)
     */
    router.get('/contacts', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;

        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID (WhatsApp) tidak ditemukan untuk user ini.' });
        }

        try {
            const response = await waGateway.getContacts(sessionId);
            
            if (response.status === true || response.status === 'success') {
                const rawContacts = response.data || [];
                const formattedContacts = rawContacts.map(c => {
                    const jid = c.JID || c.jid || '';
                    const firstName = c.FirstName || c.firstName || '';
                    const fullName = c.FullName || c.fullName || '';
                    const pushName = c.PushName || c.pushName || '';
                    const businessName = c.BusinessName || c.businessName || '';

                    const name = businessName || fullName || pushName || firstName || (typeof jid === 'string' ? jid.split('@')[0] : 'Unknown');
                    const phone = typeof jid === 'string' ? jid.split('@')[0] : '';
                    
                    return {
                        jid: jid,
                        name: name,
                        shortName: firstName,
                        pushName: pushName,
                        phone: phone,
                        isBusiness: !!businessName
                    };
                });

                // --- SYNC TO BACKEND DB (BACKGROUND) ---
                if (db && formattedContacts.length > 0) {
                    db.getTenantBySessionId(sessionId).then(tenant => {
                        if (tenant) {
                            db.syncContacts(tenant.id, formattedContacts).catch(err => 
                                console.error(`[Sync] Failed to sync contacts for ${sessionId}:`, err.message)
                            );
                        } else {
                            console.warn(`[Sync] Skipping DB sync: No tenant found for session ${sessionId}`);
                        }
                    }).catch(err => console.error('[Sync] Tenant lookup failed:', err.message));
                }
                // ---------------------------------------

                return res.json({ success: true, contacts: formattedContacts });
            }
        } catch (gwError) {
            console.warn(`[Contacts] Gateway fetch failed for ${sessionId}:`, gwError.message);
        }

        // Fallback: return empty list instead of crashing
        return res.json({ success: true, contacts: [] });
    });

    /**
     * GET /api/v1/groups
     * Mengambil daftar grup dari Gateway Go.
     */
    router.get('/groups', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;

        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID (WhatsApp) tidak ditemukan untuk user ini.' });
        }

        try {
            // Panggil Gateway Go
            // Pastikan backend/wa-gateway-client.js punya method getGroups(sessionId)
            const response = await waGateway.getGroups(sessionId);

            // Response dari Gateway biasanya: { status: true, message: '...', data: [...] }
            if (response.status === true || response.status === 'success') {
                return res.status(200).json({
                    status: 'success',
                    data: response.data // Array of groups { JID, Name, ... }
                });
            } else {
                return res.status(502).json({
                    status: 'error',
                    message: response.message || 'Gagal mengambil data grup dari Gateway.'
                });
            }

        } catch (error) {
            console.error('[API] Error fetching groups:', error.message);
            
            // Handle specific errors
            if (error.message.includes('401')) {
                 return res.status(401).json({ status: 'error', message: 'Gateway Unauthorized: Token expired or invalid.' });
            }
            if (error.message.includes('404')) {
                 return res.status(404).json({ status: 'error', message: 'Session WhatsApp tidak ditemukan atau belum connect.' });
            }

            return res.status(500).json({
                status: 'error',
                message: `Internal Error: ${error.message}`
            });
        }
    });

    /**
     * POST /api/v1/check-number
     * Cek apakah nomor terdaftar di WA
     */
    router.post('/check-number', async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const { numbers } = req.body; // Array of strings

        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Parameter "numbers" (array) wajib diisi.' });
        }

        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID (WhatsApp) tidak ditemukan.' });
        }

        try {
            // Loop check
            const results = [];
            for (const num of numbers) {
                // Bersihkan nomor
                const cleanNum = num.replace(/\D/g, ''); 
                
                try {
                    const check = await waGateway.checkRegistered(sessionId, cleanNum);
                    // Response: { status: true, message: '...' } -> artinya registered
                    // Jika unregister biasanya throw error atau status false
                    
                    results.push({
                        number: num,
                        exists: check.status === true,
                        jid: check.data?.jid || `${cleanNum}@s.whatsapp.net` // Mock JID if not returned
                    });
                } catch (err) {
                     results.push({
                        number: num,
                        exists: false,
                        error: err.message
                    });
                }
            }

            res.status(200).json({ status: 'success', results });

        } catch (error) {
             res.status(500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}

module.exports = { buildContactsRouter };
