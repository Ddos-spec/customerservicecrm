const crypto = require('crypto');

const DEFAULT_URL_TTL_SECONDS = Number.parseInt(process.env.EPHEMERAL_MEDIA_URL_TTL_SECONDS || '900', 10);

function getSigningSecret() {
    return process.env.EPHEMERAL_MEDIA_SIGNING_SECRET
        || process.env.SESSION_SECRET
        || process.env.WA_GATEWAY_PASSWORD
        || 'customerservicecrm-ephemeral-media-dev-secret';
}

function normalizeUnixSeconds(value, fallbackSeconds = DEFAULT_URL_TTL_SECONDS) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return nowSeconds + fallbackSeconds;
    }

    if (parsed > 1_000_000_000_000) {
        return Math.floor(parsed / 1000);
    }

    return parsed;
}

function getPublicBaseUrl(req) {
    const override = (process.env.EPHEMERAL_MEDIA_PUBLIC_BASE_URL || '').trim();
    if (override) return override.replace(/\/+$/, '');

    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto)
        ? (forwardedProto[0] || req.protocol || 'https')
        : (typeof forwardedProto === 'string' && forwardedProto.trim()
            ? forwardedProto.split(',')[0].trim()
            : (req.protocol || 'https'));

    return `${proto}://${req.get('host')}`;
}

function createSignature(sessionId, token, exp) {
    return crypto
        .createHmac('sha256', getSigningSecret())
        .update(`${sessionId}:${token}:${exp}`)
        .digest('hex');
}

function buildSignedEphemeralMediaUrl(req, { sessionId, token, expiresAt }) {
    const cleanSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    const cleanToken = typeof token === 'string' ? token.trim() : '';
    if (!cleanSessionId || !cleanToken) return null;

    const exp = normalizeUnixSeconds(expiresAt);
    const sig = createSignature(cleanSessionId, cleanToken, exp);
    const baseUrl = getPublicBaseUrl(req);

    return `${baseUrl}/api/v1/media/ephemeral/${encodeURIComponent(cleanToken)}?sessionId=${encodeURIComponent(cleanSessionId)}&exp=${exp}&sig=${sig}`;
}

function timingSafeEqualHex(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
    } catch (_error) {
        return false;
    }
}

function verifySignedEphemeralMediaRequest({ sessionId, token, exp, sig }) {
    const cleanSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    const cleanToken = typeof token === 'string' ? token.trim() : '';
    const cleanSig = typeof sig === 'string' ? sig.trim() : '';
    const rawExp = Number.parseInt(exp, 10);
    const expiresAt = Number.isFinite(rawExp)
        ? (rawExp > 1_000_000_000_000 ? Math.floor(rawExp / 1000) : rawExp)
        : NaN;

    if (!cleanSessionId || !cleanToken || !cleanSig || !Number.isFinite(expiresAt) || expiresAt <= 0) {
        return { ok: false, statusCode: 400, message: 'Invalid ephemeral media parameters' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (expiresAt < nowSeconds) {
        return { ok: false, statusCode: 410, message: 'Ephemeral media URL has expired' };
    }

    const expectedSig = createSignature(cleanSessionId, cleanToken, expiresAt);
    if (!timingSafeEqualHex(cleanSig, expectedSig)) {
        return { ok: false, statusCode: 401, message: 'Invalid ephemeral media signature' };
    }

    return { ok: true, sessionId: cleanSessionId, token: cleanToken, exp: expiresAt };
}

module.exports = {
    buildSignedEphemeralMediaUrl,
    verifySignedEphemeralMediaRequest,
    getPublicBaseUrl,
};
