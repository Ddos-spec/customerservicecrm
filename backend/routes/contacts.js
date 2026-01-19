const express = require('express');
function buildContactsRouter(deps) {
    const router = express.Router();
    // deps: { sessions, validateToken, waGateway, db, ... }
    const { validateToken, waGateway, db } = deps;

    /**
     * GET /api/v1/contacts
     * Priority: Local DB (Unified) -> Gateway API (Fallback/Sync)
     */
    router.get('/contacts', validateToken, async (req, res) => {
        const sessionId = req.sessionId || req.query.sessionId || req.body.sessionId;
        const forceSync = req.query.force === 'true';

        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID tidak ditemukan.' });
        }

        try {
            // 1. Ambil Tenant ID dari Session
            const tenant = await db.getTenantBySessionId(sessionId);
            
            // 2. Cek Database Lokal dulu (jika tenant ada & tidak dipaksa sync)
            if (tenant && !forceSync) {
                // Query langsung ke tabel 'contacts' (yang sudah diisi oleh Trigger Sync)
                const dbContacts = await db.getContactsByTenant(tenant.id);
                
                if (dbContacts && dbContacts.length > 0) {
                    console.log(`[Contacts] Served ${dbContacts.length} contacts from Local DB for ${sessionId}`);
                    return res.json({ success: true, contacts: dbContacts, source: 'db' });
                }
            }

            // 3. Fallback: Ambil dari Gateway API (jika DB kosong atau forceSync)
            console.log(`[Contacts] Fetching from Gateway API for ${sessionId} (Force: ${forceSync})`);
            const response = await waGateway.getContacts(sessionId);
            
            if (response.status === true || response.status === 'success') {
                const rawContacts = response.data || [];
                
                // Format agar sesuai struktur frontend
                const formattedContacts = rawContacts.map(c => ({
                    jid: c.JID || c.jid || '',
                    name: c.FullName || c.PushName || c.FirstName || (c.JID ? c.JID.split('@')[0] : 'Unknown'),
                    shortName: c.FirstName || '',
                    pushName: c.PushName || '',
                    phone: c.JID ? c.JID.split('@')[0] : '',
                    isBusiness: !!c.BusinessName
                }));

                // Trigger manual sync ke DB (untuk memastikan data masuk jika Trigger DB belum jalan)
                if (tenant && formattedContacts.length > 0) {
                    // Kita panggil db.syncContacts, tapi sebenarnya Trigger di DB 'whatsmeow_contacts'
                    // harusnya sudah menangani ini secara otomatis saat Gateway menyimpan data session.
                    // Fungsi ini sekarang jadi double-cover (aman).
                    db.syncContacts(tenant.id, formattedContacts).catch(err => 
                        console.warn('[Sync] Manual sync warning:', err.message)
                    );
                }

                return res.json({ success: true, contacts: formattedContacts, source: 'gateway' });
            }
        } catch (error) {
            console.error('[Contacts] Error:', error.message);
            return res.status(500).json({ status: 'error', message: 'Gagal mengambil kontak.' });
        }

        return res.json({ success: true, contacts: [] });
    });

    /**
     * GET /api/v1/groups
     * Mengambil daftar grup dari Gateway Go.
     */
    router.get('/groups', validateToken, async (req, res) => {
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
    router.post('/check-number', validateToken, async (req, res) => {
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
