// Script untuk memicu fix kontak secara remote
const https = require('https');

const BASE_URL = 'https://postgres-customerservicecrm.qk6yxt.easypanel.host/api/v1/admin';
const EMAIL = 'myaicustom@gmail.com';
const PASSWORD = 'superadmin123';

// Helper function untuk request
function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (cookie) {
            options.headers['Cookie'] = cookie;
        }

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ 
                        status: res.statusCode, 
                        headers: res.headers, 
                        body: parsed 
                    });
                } catch (e) {
                    console.error('Raw response:', data);
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function run() {
    console.log('1. Logging in...');
    const loginRes = await request('POST', '/login', { email: EMAIL, password: PASSWORD });
    
    if (!loginRes.body.success) {
        console.error('Login Failed:', loginRes.body);
        return;
    }

    // Ambil Cookie
    const cookies = loginRes.headers['set-cookie'];
    if (!cookies) {
        console.error('No cookies received!');
        return;
    }
    const sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
    console.log('✅ Logged in. Session Cookie obtained.');

    console.log('2. Triggering Fix Contacts...');
    // Coba POST dulu
    let fixRes = await request('POST', '/fix-contacts', {}, sessionCookie);
    
    if (fixRes.status === 404) {
        console.log('POST not found, trying GET...');
        fixRes = await request('GET', '/fix-contacts', null, sessionCookie);
    }

    console.log('Response:', JSON.stringify(fixRes.body, null, 2));
}

run();
