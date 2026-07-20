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

const DRIVE_MEDIA_URL_TTL_SECONDS = Number.parseInt(process.env.DRIVE_MEDIA_URL_TTL_SECONDS || String(7 * 24 * 60 * 60), 10);

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
    downloadMediaFromDrive,
    buildSignedDriveMediaUrl,
    verifySignedDriveMediaRequest,
};
