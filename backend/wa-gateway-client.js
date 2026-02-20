/**
 * WhatsApp Gateway Client
 *
 * This module handles communication with the Go WhatsApp Gateway service.
 * It replaces direct Baileys usage with HTTP calls to the gateway.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DEFAULT_GATEWAY_URL = process.env.WA_GATEWAY_URL || 'http://localhost:3001/api/v1/whatsapp';
const GATEWAY_TIMEOUT = parseInt(process.env.WA_GATEWAY_TIMEOUT || '30000', 10);

const gatewayClients = new Map();

function normalizeGatewayUrl(url) {
    const trimmed = (url || '').toString().trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/+$/, '');
}

function getGatewayClient(baseUrl) {
    const normalized = normalizeGatewayUrl(baseUrl || DEFAULT_GATEWAY_URL);
    if (!gatewayClients.has(normalized)) {
        gatewayClients.set(normalized, axios.create({
            baseURL: normalized,
            timeout: GATEWAY_TIMEOUT,
            maxBodyLength: Infinity,
            headers: {
                'Content-Type': 'application/json',
            },
        }));
    }
    return gatewayClients.get(normalized);
}

// Default client (fallback)
const gatewayClient = getGatewayClient(DEFAULT_GATEWAY_URL);

// Session tokens cache (JID -> JWT token)
const sessionTokens = new Map();

// Collision Map (Normalized JID -> Original JID)
const sessionJidMap = new Map();

// Session -> gateway URL mapping (JID -> gateway URL)
const sessionGatewayUrls = new Map();

// Error callback for session invalidation
let onSessionError = null;

/**
 * Register a callback for session errors (e.g., "Client not Valid")
 * @param {Function} callback - Function(sessionId, error) to call on session errors
 */
function setSessionErrorCallback(callback) {
    onSessionError = callback;
}

/**
 * Check if an error indicates the session is invalid/disconnected
 */
function isSessionInvalidError(error, response) {
    const errorMsg = (error?.message || '').toLowerCase();
    const responseMsg = (response?.data?.message || response?.message || '').toLowerCase();

    const invalidPatterns = [
        'client not valid',
        'not logged in',
        'session not found',
        'unauthorized',
        'not connected',
        'connection closed',
        'websocket closed',
        'device removed',
        'logged out'
    ];

    return invalidPatterns.some(pattern =>
        errorMsg.includes(pattern) || responseMsg.includes(pattern)
    );
}

/**
 * Normalize JID to ensure consistency (e.g. 0812... -> 62812...)
 */
function normalizeJid(jid) {
    if (!jid) return '';
    let clean = jid.toString().replace(/\D/g, ''); // Remove non-digits
    if (clean.startsWith('0')) {
        clean = '62' + clean.slice(1);
    }
    return clean;
}

/**
 * Set the gateway URL for a session
 */
function setSessionGatewayUrl(jid, gatewayUrl) {
    const cleanJid = normalizeJid(jid);
    if (!cleanJid) return;
    const normalizedUrl = normalizeGatewayUrl(gatewayUrl);
    if (!normalizedUrl) {
        sessionGatewayUrls.delete(cleanJid);
        return;
    }
    sessionGatewayUrls.set(cleanJid, normalizedUrl);
}

/**
 * Get the gateway URL for a session (if mapped)
 */
function getSessionGatewayUrl(jid) {
    const cleanJid = normalizeJid(jid);
    if (!cleanJid) return null;
    return sessionGatewayUrls.get(cleanJid) || null;
}

/**
 * Reset all gateway URL mappings
 */
function resetSessionGatewayUrls() {
    sessionGatewayUrls.clear();
}

/**
 * Resolve gateway URL for a session (fallback to default)
 */
function resolveGatewayUrl(jid) {
    return getSessionGatewayUrl(jid) || DEFAULT_GATEWAY_URL;
}

/**
 * Set the JWT token for a session
 */
function setSessionToken(jid, token) {
    const cleanJid = normalizeJid(jid);
    
    // Collision Detection (Security Critical)
    if (sessionJidMap.has(cleanJid)) {
        const existingJid = sessionJidMap.get(cleanJid);
        if (existingJid !== jid) {
            const errorMsg = `[Gateway-Client] ⛔ SECURITY ALERT: IDENTITY COLLISION DETECTED! Normalized JID '${cleanJid}' is already owned by '${existingJid}' but '${jid}' is trying to claim it. This request is blocked to prevent Cross-Tenant Identity Swapping.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    sessionJidMap.set(cleanJid, jid);
    sessionTokens.set(cleanJid, token);
}

/**
 * Get the JWT token for a session
 */
function getSessionToken(jid) {
    return sessionTokens.get(normalizeJid(jid));
}

/**
 * Remove session token
 */
function removeSessionToken(jid) {
    sessionTokens.delete(normalizeJid(jid));
}

/**
 * Normalize gateway response
 */
function unwrap(response) {
    const payload = response?.data || {};
    if (typeof payload.status === 'undefined') {
        throw new Error('Gateway response tidak valid');
    }
    return payload;
}

/**
 * Handle gateway error and check for session invalidation
 * @param {string} jid - Session JID
 * @param {Error} error - The error that occurred
 * @param {Object} response - Optional response object
 */
function handleGatewayError(jid, error, response = null) {
    // Check if this error indicates session is invalid
    if (isSessionInvalidError(error, response)) {
        console.warn(`[Gateway] Session ${jid} appears to be invalid: ${error.message}`);

        // Notify callback if registered
        if (typeof onSessionError === 'function') {
            try {
                onSessionError(normalizeJid(jid), error);
            } catch (cbErr) {
                console.error('[Gateway] Error in session error callback:', cbErr.message);
            }
        }
    }

    // Check for HTTP 500 errors which may indicate session issues
    const statusCode = error?.response?.status || response?.status;
    if (statusCode >= 500) {
        console.warn(`[Gateway] Server error (${statusCode}) for session ${jid}`);

        if (typeof onSessionError === 'function') {
            try {
                onSessionError(normalizeJid(jid), error);
            } catch (cbErr) {
                console.error('[Gateway] Error in session error callback:', cbErr.message);
            }
        }
    }
}

function getGatewayErrorMessage(error) {
    const responseData = error?.response?.data;
    if (typeof responseData?.message === 'string' && responseData.message.trim()) {
        return responseData.message.trim();
    }
    if (typeof responseData?.error === 'string' && responseData.error.trim()) {
        return responseData.error.trim();
    }
    return error?.message || 'Unknown gateway error';
}

async function reauthAndReconnect(jid) {
    const password = process.env.WA_GATEWAY_PASSWORD;
    if (!password) return false;

    const auth = await authenticate(jid, password);
    if (!auth?.data?.token) return false;

    setSessionToken(jid, auth.data.token);

    // Best-effort self-healing: ensure gateway has an initialized/reconnected client.
    try {
        await login(jid);
    } catch (loginErr) {
        console.warn(`[Gateway-Retry] Reconnect attempt for ${jid} returned: ${loginErr.message}`);
    }

    return true;
}

/**
 * Get authorization header for a session
 */
function getAuthHeader(jid) {
    const cleanJid = normalizeJid(jid);
    const token = sessionTokens.get(cleanJid);
    if (!token) {
        throw new Error(`No token found for session ${jid} (normalized: ${cleanJid})`);
    }
    
    // Debug Trace for Identity Swapping
    const registeredOwner = sessionJidMap.get(cleanJid);
    if (registeredOwner && registeredOwner !== jid) {
        console.warn(`[Gateway-Client] ⚠️ Using token for '${cleanJid}' (owned by '${registeredOwner}') to authenticate request for '${jid}'. Possible Identity Swap.`);
    }

    return { Authorization: `Bearer ${token}` };
}

function buildUrlEncoded(fields = {}) {
    const params = new URLSearchParams();
    Object.entries(fields).forEach(([key, value]) => {
        if (typeof value === 'undefined' || value === null) return;
        params.set(key, String(value));
    });
    return params;
}

const MIME_MAP = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
};

function guessMimeType(filename, fallback = 'application/octet-stream') {
    const ext = path.extname(filename || '').toLowerCase();
    return MIME_MAP[ext] || fallback;
}

async function resolveFileSource(source, fallbackName, fallbackMime = 'application/octet-stream') {
    if (Buffer.isBuffer(source)) {
        return { file: new Blob([source], { type: fallbackMime }), filename: fallbackName };
    }

    if (typeof source === 'string') {
        if (fs.existsSync(source)) {
            const data = await fs.promises.readFile(source);
            const filename = path.basename(source) || fallbackName;
            const mimeType = guessMimeType(filename, fallbackMime);
            return { file: new Blob([data], { type: mimeType }), filename };
        }

        const dataUrlMatch = source.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
            const [, mimeType, base64Data] = dataUrlMatch;
            const buffer = Buffer.from(base64Data, 'base64');
            return { file: new Blob([buffer], { type: mimeType || fallbackMime }), filename: fallbackName };
        }

        if (source.startsWith('http://') || source.startsWith('https://')) {
            const response = await axios.get(source, { responseType: 'arraybuffer' });
            const mimeType = response.headers['content-type'] || fallbackMime;
            return { file: new Blob([response.data], { type: mimeType }), filename: fallbackName };
        }
    }

    throw new Error('Media source tidak ditemukan atau tidak didukung');
}

async function postFormData(route, form, headers = {}, sessionId = null) {
    const formHeaders = typeof form.getHeaders === 'function'
        ? form.getHeaders()
        : { 'Content-Type': 'multipart/form-data' };
    const finalHeaders = { ...formHeaders, ...headers };
    const client = getGatewayClient(resolveGatewayUrl(sessionId));
    const response = await client.post(route, form, { headers: finalHeaders });
    return unwrap(response);
}

async function postUrlEncoded(route, params, headers = {}, sessionId = null) {
    const client = getGatewayClient(resolveGatewayUrl(sessionId));
    const response = await client.post(route, params, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...headers,
        },
    });
    return unwrap(response);
}

async function getWithAuth(route, headers = {}, params = {}, sessionId = null) {
    const client = getGatewayClient(resolveGatewayUrl(sessionId));
    const response = await client.get(route, {
        headers,
        params,
    });
    return unwrap(response);
}

/**
 * Authenticate with the gateway and get JWT token
 */
async function authenticate(username, password) {
    try {
        const client = getGatewayClient(resolveGatewayUrl(username));
        const response = await client.get('/auth', {
            auth: { username, password },
        });
        const payload = unwrap(response);
        if (!payload.status || !payload.data?.token) {
            throw new Error(payload.message || 'Gateway authentication failed');
        }
        return payload;
    } catch (error) {
        throw new Error(`Gateway authentication failed: ${error.message}`);
    }
}

/**
 * Login to WhatsApp (get QR code)
 * @param {string} jid - Phone number / JID
 * @returns {Promise<{qr: string, timeout: number}>}
 */
async function login(jid) {
    try {
        const form = buildUrlEncoded({ output: 'json' });
        const payload = await postUrlEncoded('/login', form, getAuthHeader(jid), jid);
        return payload;
    } catch (error) {
        throw new Error(`Login failed: ${error.message}`);
    }
}

/**
 * Login with pairing code
 * @param {string} jid - Phone number / JID
 * @returns {Promise<{code: string, timeout: number}>}
 */
async function loginWithPairingCode(jid) {
    try {
        const form = buildUrlEncoded({});
        const payload = await postUrlEncoded('/login/pair', form, getAuthHeader(jid), jid);
        return payload;
    } catch (error) {
        throw new Error(`Pairing login failed: ${error.message}`);
    }
}

/**
 * Logout from WhatsApp
 * @param {string} jid - Phone number / JID
 */
async function logout(jid) {
    try {
        const form = buildUrlEncoded({});
        const payload = await postUrlEncoded('/logout', form, getAuthHeader(jid), jid);
        removeSessionToken(jid);
        return payload;
    } catch (error) {
        throw new Error(`Logout failed: ${error.message}`);
    }
}

/**
 * Check if a number is registered on WhatsApp
 * @param {string} jid - Session JID
 * @param {string} phone - Phone number to check
 */
async function checkRegistered(jid, phone) {
    try {
        const payload = await getWithAuth('/registered', getAuthHeader(jid), { msisdn: phone }, jid);
        return payload;
    } catch (error) {
        throw new Error(`Check registered failed: ${error.message}`);
    }
}

/**
 * Send a text message
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {string} message - Message text
 */
async function sendText(jid, to, message) {
    try {
        const form = buildUrlEncoded({ msisdn: to, message });
        return await postUrlEncoded('/send/text', form, getAuthHeader(jid), jid);
    } catch (error) {
        // RETRY LOGIC: If 500 (Client not logged in) or 401 (Unauthorized)
        if (error?.response?.status === 500 || error?.response?.status === 401) {
            console.warn(`[Gateway-Retry] Send failed (${error.response.status}). Attempting re-auth for ${jid}...`);
            try {
                const recovered = await reauthAndReconnect(jid);
                if (recovered) {
                    console.log(`[Gateway-Retry] Recovery successful for ${jid}. Retrying send...`);
                    const form = buildUrlEncoded({ msisdn: to, message });
                    return await postUrlEncoded('/send/text', form, getAuthHeader(jid), jid);
                }
            } catch (retryErr) {
                console.error(`[Gateway-Retry] Retry failed for ${jid}: ${retryErr.message}`);
            }
        }
        
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send text failed: ${getGatewayErrorMessage(error)}`);
    }
}

/**
 * Send an image
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {Buffer|string} image - Image buffer or base64 string
 * @param {string} caption - Image caption
 * @param {boolean} viewOnce - View once flag
 */
async function sendImage(jid, to, image, caption = '', viewOnce = false) {
    try {
        const formData = new FormData();
        formData.append('msisdn', to);
        if (caption) formData.append('caption', caption);
        formData.append('viewonce', String(Boolean(viewOnce)));

        const { file, filename } = await resolveFileSource(image, 'image');
        formData.append('image', file, filename);

        return await postFormData('/send/image', formData, getAuthHeader(jid), jid);
    } catch (error) {
        if (error?.response?.status === 500 || error?.response?.status === 401) {
            console.warn(`[Gateway-Retry] Send image failed (${error.response.status}). Attempting recovery for ${jid}...`);
            try {
                const recovered = await reauthAndReconnect(jid);
                if (recovered) {
                    const retryFormData = new FormData();
                    retryFormData.append('msisdn', to);
                    if (caption) retryFormData.append('caption', caption);
                    retryFormData.append('viewonce', String(Boolean(viewOnce)));

                    const { file, filename } = await resolveFileSource(image, 'image');
                    retryFormData.append('image', file, filename);

                    console.log(`[Gateway-Retry] Recovery successful for ${jid}. Retrying send image...`);
                    return await postFormData('/send/image', retryFormData, getAuthHeader(jid), jid);
                }
            } catch (retryErr) {
                console.error(`[Gateway-Retry] Send image retry failed for ${jid}: ${retryErr.message}`);
            }
        }

        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send image failed: ${getGatewayErrorMessage(error)}`);
    }
}

/**
 * Send a document
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {Buffer|string} document - Document buffer or base64 string
 * @param {string} filename - Document filename
 */
async function sendDocument(jid, to, document, filename) {
    try {
        const formData = new FormData();
        formData.append('msisdn', to);
        const { file, filename: resolvedName } = await resolveFileSource(document, filename || 'document');
        formData.append('document', file, resolvedName);

        return await postFormData('/send/document', formData, getAuthHeader(jid), jid);
    } catch (error) {
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send document failed: ${error.message}`);
    }
}

/**
 * Send audio
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {Buffer|string} audio - Audio buffer or base64 string
 */
async function sendAudio(jid, to, audio) {
    try {
        const formData = new FormData();
        formData.append('msisdn', to);
        const { file, filename } = await resolveFileSource(audio, 'audio');
        formData.append('audio', file, filename);

        return await postFormData('/send/audio', formData, getAuthHeader(jid), jid);
    } catch (error) {
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send audio failed: ${error.message}`);
    }
}

/**
 * Send video
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {Buffer|string} video - Video buffer or base64 string
 * @param {string} caption - Video caption
 * @param {boolean} viewOnce - View once flag
 */
async function sendVideo(jid, to, video, caption = '', viewOnce = false) {
    try {
        const formData = new FormData();
        formData.append('msisdn', to);
        if (caption) formData.append('caption', caption);
        formData.append('viewonce', String(Boolean(viewOnce)));
        const { file, filename } = await resolveFileSource(video, 'video');
        formData.append('video', file, filename);

        return await postFormData('/send/video', formData, getAuthHeader(jid), jid);
    } catch (error) {
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send video failed: ${error.message}`);
    }
}

/**
 * Send sticker
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {Buffer|string} sticker - Sticker buffer or base64 string
 */
async function sendSticker(jid, to, sticker) {
    try {
        const formData = new FormData();
        formData.append('msisdn', to);
        const { file, filename } = await resolveFileSource(sticker, 'sticker');
        formData.append('sticker', file, filename);

        return await postFormData('/send/sticker', formData, getAuthHeader(jid), jid);
    } catch (error) {
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send sticker failed: ${error.message}`);
    }
}

/**
 * Send a location
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 */
async function sendLocation(jid, to, latitude, longitude) {
    try {
        const form = buildUrlEncoded({ msisdn: to, latitude, longitude });
        return await postUrlEncoded('/send/location', form, getAuthHeader(jid), jid);
    } catch (error) {
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send location failed: ${error.message}`);
    }
}

/**
 * Send a contact
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {string} name - Contact name
 * @param {string} phone - Contact phone number
 */
async function sendContact(jid, to, name, phone) {
    try {
        const form = buildUrlEncoded({ msisdn: to, name, phone });
        return await postUrlEncoded('/send/contact', form, getAuthHeader(jid), jid);
    } catch (error) {
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send contact failed: ${error.message}`);
    }
}

/**
 * Send a link with preview
 * @param {string} jid - Session JID
 * @param {string} to - Recipient phone number / JID
 * @param {string} url - Link URL
 * @param {string} caption - Link caption
 */
async function sendLink(jid, to, url, caption = '') {
    try {
        const form = buildUrlEncoded({ msisdn: to, url, caption });
        return await postUrlEncoded('/send/link', form, getAuthHeader(jid), jid);
    } catch (error) {
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send link failed: ${error.message}`);
    }
}

/**
 * Send a poll
 */
async function sendPoll(jid, to, question, options = [], multiAnswer = false) {
    try {
        const form = buildUrlEncoded({
            msisdn: to,
            question,
            options: options.join(', '),
            multianswer: String(Boolean(multiAnswer)),
        });
        return await postUrlEncoded('/send/poll', form, getAuthHeader(jid), jid);
    } catch (error) {
        handleGatewayError(jid, error, error?.response);
        throw new Error(`Send poll failed: ${error.message}`);
    }
}

/**
 * Get joined groups
 * @param {string} jid - Session JID
 */
async function getGroups(jid) {
    try {
        const payload = await getWithAuth('/group', getAuthHeader(jid), {}, jid);
        return payload;
    } catch (error) {
        throw new Error(`Get groups failed: ${error.message}`);
    }
}

/**
 * Get contacts from gateway (memory)
 * @param {string} jid - Session JID
 */
async function getContacts(jid) {
    try {
        const payload = await getWithAuth('/contact', getAuthHeader(jid), {}, jid);
        return payload;
    } catch (error) {
        throw new Error(`Get contacts failed: ${error.message}`);
    }
}

/**
 * Get contacts from database (more reliable, gets all historical contacts)
 * @param {string} jid - Session JID
 */
async function getContactsFromDB(jid) {
    try {
        const payload = await getWithAuth('/contact/db', getAuthHeader(jid), {}, jid);
        return payload;
    } catch (error) {
        throw new Error(`Get contacts from DB failed: ${error.message}`);
    }
}

/**
 * Join a group by invite link
 * @param {string} jid - Session JID
 * @param {string} link - Group invite link
 */
async function joinGroup(jid, link) {
    try {
        const form = buildUrlEncoded({ link });
        return await postUrlEncoded('/group/join', form, getAuthHeader(jid), jid);
    } catch (error) {
        throw new Error(`Join group failed: ${error.message}`);
    }
}

/**
 * Leave a group
 * @param {string} jid - Session JID
 * @param {string} groupId - Group JID
 */
async function leaveGroup(jid, groupId) {
    try {
        // Gateway expects "groupid" (no underscore)
        const form = buildUrlEncoded({ groupid: groupId });
        return await postUrlEncoded('/group/leave', form, getAuthHeader(jid), jid);
    } catch (error) {
        throw new Error(`Leave group failed: ${error.message}`);
    }
}

/**
 * Edit a message
 * @param {string} jid - Session JID
 * @param {string} to - Chat JID
 * @param {string} messageId - Message ID to edit
 * @param {string} newMessage - New message content
 */
async function editMessage(jid, to, messageId, newMessage) {
    try {
        const form = buildUrlEncoded({ msisdn: to, messageid: messageId, message: newMessage });
        return await postUrlEncoded('/message/edit', form, getAuthHeader(jid), jid);
    } catch (error) {
        throw new Error(`Edit message failed: ${error.message}`);
    }
}

/**
 * Delete a message
 * @param {string} jid - Session JID
 * @param {string} to - Chat JID
 * @param {string} messageId - Message ID to delete
 */
async function deleteMessage(jid, to, messageId) {
    try {
        const form = buildUrlEncoded({ msisdn: to, messageid: messageId });
        return await postUrlEncoded('/message/delete', form, getAuthHeader(jid), jid);
    } catch (error) {
        throw new Error(`Delete message failed: ${error.message}`);
    }
}

/**
 * React to a message
 * @param {string} jid - Session JID
 * @param {string} to - Chat JID
 * @param {string} messageId - Message ID to react to
 * @param {string} emoji - Emoji reaction
 */
async function reactToMessage(jid, to, messageId, emoji) {
    try {
        const form = buildUrlEncoded({ msisdn: to, messageid: messageId, emoji });
        return await postUrlEncoded('/message/react', form, getAuthHeader(jid), jid);
    } catch (error) {
        throw new Error(`React to message failed: ${error.message}`);
    }
}

/**
 * Check gateway health
 */
async function checkHealth(gatewayUrl = null) {
    try {
        const client = getGatewayClient(gatewayUrl || DEFAULT_GATEWAY_URL);
        const response = await client.get('/');
        return unwrap(response);
    } catch (error) {
        return { status: 'error', message: error.message };
    }
}

/**
 * Check for collision
 */
function checkCollision(jid) {
    const cleanJid = normalizeJid(jid);
    if (sessionJidMap.has(cleanJid)) {
        const existingJid = sessionJidMap.get(cleanJid);
        if (existingJid !== jid) {
            return { collision: true, existingJid };
        }
    }
    return { collision: false };
}

module.exports = {
    // Token management
    setSessionToken,
    getSessionToken,
    removeSessionToken,
    checkCollision,

    // Gateway routing
    setSessionGatewayUrl,
    getSessionGatewayUrl,
    resetSessionGatewayUrls,
    normalizeGatewayUrl,

    // Error handling callback
    setSessionErrorCallback,

    // Authentication
    authenticate,

    // Session management
    login,
    loginWithPairingCode,
    logout,

    // Messaging
    sendText,
    sendImage,
    sendDocument,
    sendAudio,
    sendVideo,
    sendSticker,
    sendLocation,
    sendContact,
    sendLink,
    sendPoll,

    // Message management
    editMessage,
    deleteMessage,
    reactToMessage,

    // Utilities
    checkRegistered,
    getGroups,
    getContacts,
    getContactsFromDB,
    joinGroup,
    leaveGroup,
    checkHealth,

    // Raw client for advanced usage
    gatewayClient,
};
