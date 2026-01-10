const axios = require('axios');

const API_URL = 'http://localhost:3000/api/v1';

async function diagnose() {
    console.log('Starting diagnosis...\n');

    // 1) Check API sessions (memory state)
    console.log('Checking server sessions via API:');
    try {
        const res = await axios.get(`${API_URL}/sessions`);
        const sessions = res.data;
        console.log(`   ${sessions.length} active sessions reported.`);
        sessions.forEach((s) => {
            console.log(`   - [${s.sessionId}] Status: ${s.status}, HasQR: ${Boolean(s.qr)}, Owner: ${s.owner || '-'}`);
        });
    } catch (e) {
        console.log('   Failed to fetch sessions:', e.message);
    }
    console.log('');

    // 2) Optional debug endpoint
    console.log('Checking debug info (if exposed):');
    try {
        const res = await axios.get(`${API_URL}/debug/sessions`);
        console.log('   Debug Data:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log('   Debug endpoint not available (expected if not enabled).');
    }

    console.log('\nDiagnosis complete.');
}

diagnose();
