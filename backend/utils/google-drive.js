/**
 * Google Drive storage for inbound customer media (photos/docs/audio/video).
 *
 * Reuses the same OAuth client + refresh token as crm-n8n-dashboard (same
 * Google Drive account) — see GOOGLE_OAUTH_* in .env. Uses raw REST calls via
 * axios instead of the googleapis SDK to avoid adding a new dependency to
 * this project.
 */
const axios = require('axios');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const DRIVE_MEDIA_URL_TTL_SECONDS = Number.parseInt(process.env.DRIVE_MEDIA_URL_TTL_SECONDS || String(7 * 24 * 60 * 60), 10);
const MAX_REMOTE_MEDIA_BYTES = 25 * 1024 * 1024;

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function getSigningSecret() {
    return process.env.EPHEMERAL_MEDIA_SIGNING_SECRET
        || process.env.SESSION_SECRET
        || process.env.WA_GATEWAY_PASSWORD
        || 'customerservicecrm-drive-media-dev-secret';
}

function signDriveFileId(fileId, exp) {
    return crypto.createHmac('sha256', getSigningSecret()).update(`${fileId}:${exp}`).digest('hex');
}

function buildSignedDriveMediaUrl(publicBaseUrl, fileId) {
    const exp = Math.floor(Date.now() / 1000) + DRIVE_MEDIA_URL_TTL_SECONDS;
    const sig = signDriveFileId(fileId, exp);
    return `${publicBaseUrl}/api/v1/media/drive/${encodeURIComponent(fileId)}?exp=${exp}&sig=${sig}`;
}

function verifySignedDriveMediaRequest({ fileId, exp, sig }) {
    const cleanFileId = typeof fileId === 'string' ? fileId.trim() : '';
    const cleanSig = typeof sig === 'string' ? sig.trim() : '';
    const expiresAt = Number.parseInt(exp, 10);

    if (!cleanFileId || !cleanSig || !Number.isFinite(expiresAt) || expiresAt <= 0) {
        return { ok: false, statusCode: 400, message: 'Invalid drive media parameters' };
    }
    if (expiresAt < Math.floor(Date.now() / 1000)) {
        return { ok: false, statusCode: 410, message: 'Drive media URL has expired' };
    }

    const expectedSig = signDriveFileId(cleanFileId, expiresAt);
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const sigBuf = Buffer.from(cleanSig, 'hex');
    const validSig = expectedBuf.length === sigBuf.length && crypto.timingSafeEqual(expectedBuf, sigBuf);
    if (!validSig) {
        return { ok: false, statusCode: 401, message: 'Invalid drive media signature' };
    }

    return { ok: true, fileId: cleanFileId };
}

function isConfigured() {
    return Boolean(
        process.env.GOOGLE_OAUTH_CLIENT_ID
        && process.env.GOOGLE_OAUTH_CLIENT_SECRET
        && process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    );
}

function getDriveFileIdFromUrl(mediaUrl) {
    if (typeof mediaUrl !== 'string' || !mediaUrl.trim()) return null;

    try {
        const parsed = new URL(mediaUrl.trim(), 'https://crm.invalid');
        const match = parsed.pathname.match(/\/api\/v1\/media\/drive\/([^/]+)$/);
        if (!match?.[1]) return null;

        const fileId = decodeURIComponent(match[1]).trim();
        return /^[A-Za-z0-9_-]{8,}$/.test(fileId) ? fileId : null;
    } catch (_error) {
        return null;
    }
}

function isPrivateIpAddress(address) {
    const ipVersion = net.isIP(address);
    if (ipVersion === 4) {
        const octets = address.split('.').map((value) => Number.parseInt(value, 10));
        const [first, second] = octets;
        return first === 0
            || first === 10
            || first === 127
            || (first === 100 && second >= 64 && second <= 127)
            || (first === 169 && second === 254)
            || (first === 172 && second >= 16 && second <= 31)
            || (first === 192 && second === 168)
            || (first === 198 && (second === 18 || second === 19))
            || first >= 224;
    }

    if (ipVersion === 6) {
        const normalized = address.toLowerCase();
        return normalized === '::'
            || normalized === '::1'
            || normalized.startsWith('fc')
            || normalized.startsWith('fd')
            || normalized.startsWith('fe8')
            || normalized.startsWith('fe9')
            || normalized.startsWith('fea')
            || normalized.startsWith('feb')
            || normalized.startsWith('::ffff:');
    }

    return true;
}

async function assertPublicRemoteUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (_error) {
        throw new Error('URL media tidak valid');
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error('URL media harus berupa HTTP(S) publik tanpa kredensial');
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(hostname)
        ? [{ address: hostname }]
        : await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateIpAddress(address))) {
        throw new Error('URL media harus mengarah ke host publik');
    }

    return parsed;
}

function sanitizeFilename(value, fallback = 'media') {
    const filename = typeof value === 'string' ? value.trim() : '';
    const withoutReservedCharacters = filename.replace(/[<>:"/\\|?*]/g, '-');
    const clean = Array.from(withoutReservedCharacters)
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code >= 32 && code !== 127;
        })
        .join('')
        .replace(/\s+/g, ' ')
        .slice(0, 180);
    return clean || fallback;
}

function filenameFromContentDisposition(value) {
    if (typeof value !== 'string') return null;
    const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8?.[1]) {
        try {
            return sanitizeFilename(decodeURIComponent(utf8[1]));
        } catch (_error) {
            return sanitizeFilename(utf8[1]);
        }
    }
    const basic = value.match(/filename\s*=\s*"?([^";]+)"?/i);
    return basic?.[1] ? sanitizeFilename(basic[1]) : null;
}

function decodeDataUrl(value) {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(value);
    if (!match) throw new Error('Data URL media tidak valid');

    const mimeType = match[1] || 'application/octet-stream';
    const isBase64 = Boolean(match[2]);
    const encoded = match[3] || '';
    const data = isBase64
        ? Buffer.from(encoded, 'base64')
        : Buffer.from(decodeURIComponent(encoded), 'utf8');

    if (!data.length || data.length > MAX_REMOTE_MEDIA_BYTES) {
        throw new Error('Ukuran media harus antara 1 byte dan 25MB');
    }

    return { data, mimeType };
}

async function fetchRemoteMedia(sourceUrl, fallbackFilename, fallbackMimeType) {
    if (typeof sourceUrl !== 'string' || !sourceUrl.trim()) {
        throw new Error('Sumber media wajib diisi');
    }

    const trimmedUrl = sourceUrl.trim();
    if (trimmedUrl.startsWith('data:')) {
        const decoded = decodeDataUrl(trimmedUrl);
        return {
            data: decoded.data,
            mimeType: decoded.mimeType || fallbackMimeType || 'application/octet-stream',
            filename: sanitizeFilename(fallbackFilename, `media-${Date.now()}`),
        };
    }

    let currentUrl = trimmedUrl;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
        await assertPublicRemoteUrl(currentUrl);
        const response = await axios.get(currentUrl, {
            responseType: 'arraybuffer',
            maxRedirects: 0,
            maxBodyLength: MAX_REMOTE_MEDIA_BYTES,
            maxContentLength: MAX_REMOTE_MEDIA_BYTES,
            timeout: 30_000,
            validateStatus: (status) => status >= 200 && status < 400,
        });

        if (response.status >= 300) {
            const location = response.headers.location;
            if (!location || redirectCount === 3) {
                throw new Error('Redirect URL media tidak valid');
            }
            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }

        const data = Buffer.from(response.data);
        if (!data.length || data.length > MAX_REMOTE_MEDIA_BYTES) {
            throw new Error('Ukuran media harus antara 1 byte dan 25MB');
        }

        const sourceFilename = new URL(currentUrl).pathname.split('/').filter(Boolean).pop();
        return {
            data,
            mimeType: String(response.headers['content-type'] || fallbackMimeType || 'application/octet-stream').split(';')[0].trim(),
            filename: filenameFromContentDisposition(response.headers['content-disposition'])
                || sanitizeFilename(fallbackFilename || sourceFilename, `media-${Date.now()}`),
        };
    }

    throw new Error('Terlalu banyak redirect media');
}

async function getAccessToken() {
    if (!isConfigured()) {
        throw new Error('Google Drive belum dikonfigurasi (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN)');
    }
    const now = Date.now();
    if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 30_000) {
        return cachedAccessToken;
    }

    const response = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        grant_type: 'refresh_token',
    }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
    });

    cachedAccessToken = response.data.access_token;
    cachedAccessTokenExpiresAt = now + (Number(response.data.expires_in || 3600) * 1000);
    return cachedAccessToken;
}

/**
 * Upload a buffer to Drive. Returns the Drive file id.
 */
async function uploadMediaToDrive(buffer, mimeType, filename) {
    const accessToken = await getAccessToken();

    const uploadRes = await axios.post(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=media',
        buffer,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': mimeType || 'application/octet-stream',
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 30_000,
        },
    );

    const fileId = uploadRes.data.id;
    if (!fileId) throw new Error('Google Drive tidak mengembalikan file id');

    // Set the real filename (media upload alone creates it with a generic name).
    await axios.patch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        { name: filename || `media-${Date.now()}` },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            timeout: 15_000,
        },
    ).catch((err) => {
        console.error('[GoogleDrive] Gagal set nama file (non-fatal):', err.message);
    });

    return fileId;
}

async function copyMediaToDrive(sourceUrl, fallbackFilename, fallbackMimeType) {
    const media = await fetchRemoteMedia(sourceUrl, fallbackFilename, fallbackMimeType);
    const fileId = await uploadMediaToDrive(media.data, media.mimeType, media.filename);
    return { fileId, ...media };
}

/**
 * Download a file's bytes + metadata from Drive by file id.
 */
async function downloadMediaFromDrive(fileId) {
    const accessToken = await getAccessToken();

    const metaRes = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: 'name,mimeType' },
        timeout: 15_000,
    });

    const contentRes = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { alt: 'media' },
        responseType: 'arraybuffer',
        timeout: 30_000,
    });

    return {
        buffer: Buffer.from(contentRes.data),
        mimeType: metaRes.data.mimeType || 'application/octet-stream',
        filename: metaRes.data.name || fileId,
    };
}

module.exports = {
    isConfigured,
    uploadMediaToDrive,
    copyMediaToDrive,
    downloadMediaFromDrive,
    buildSignedDriveMediaUrl,
    verifySignedDriveMediaRequest,
    getDriveFileIdFromUrl,
    fetchRemoteMedia,
};
