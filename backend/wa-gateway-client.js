/**
 * WhatsApp Gateway Client
 *
 * This module handles communication with the Go WhatsApp Gateway service.
 * It replaces direct Baileys usage with HTTP calls to the gateway.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GATEWAY_URL = process.env.WA_GATEWAY_URL || 'http://localhost:3001/api/v1/whatsapp';
const GATEWAY_TIMEOUT = parseInt(process.env.WA_GATEWAY_TIMEOUT || '30000', 10);

// Create axios instance with default config
const gatewayClient = axios.create({
    baseURL: GATEWAY_URL,
    timeout: GATEWAY_TIMEOUT,
    maxBodyLength: Infinity,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Session tokens cache (JID -> JWT token)
const sessionTokens = new Map();

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
 * Set the JWT token for a session
 */
function setSessionToken(jid, token) {
    sessionTokens.set(normalizeJid(jid), token);
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
 * Get authorization header for a session
 */
function getAuthHeader(jid) {
    const cleanJid = normalizeJid(jid);
    const token = sessionTokens.get(cleanJid);
    if (!token) {
        throw new Error(`No token found for session ${jid} (normalized: ${cleanJid})`);
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

async function postFormData(route, form, headers = {}) {
    const formHeaders = typeof form.getHeaders === 'function'
        ? form.getHeaders()
        : { 'Content-Type': 'multipart/form-data' };
    const finalHeaders = { ...formHeaders, ...headers };
    const response = await gatewayClient.post(route, form, { headers: finalHeaders });
    return unwrap(response);
}

async function postUrlEncoded(route, params, headers = {}) {
    const response = await gatewayClient.post(route, params, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...headers,
        },
    });
    return unwrap(response);
}

async function getWithAuth(route, headers = {}, params = {}) {
    const response = await gatewayClient.get(route, {
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
        const response = await gatewayClient.get('/auth', {
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
        const payload = await postUrlEncoded('/login', form, getAuthHeader(jid));
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
        const payload = await postUrlEncoded('/login/pair', form, getAuthHeader(jid));
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
        const payload = await postUrlEncoded('/logout', form, getAuthHeader(jid));
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
        const payload = await getWithAuth('/registered', getAuthHeader(jid), { msisdn: phone });
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
        return await postUrlEncoded('/send/text', form, getAuthHeader(jid));
    } catch (error) {
        throw new Error(`Send text failed: ${error.message}`);
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

        return await postFormData('/send/image', formData, getAuthHeader(jid));
    } catch (error) {
        throw new Error(`Send image failed: ${error.message}`);
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

        return await postFormData('/send/document', formData, getAuthHeader(jid));
    } catch (error) {
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

        return await postFormData('/send/audio', formData, getAuthHeader(jid));
    } catch (error) {
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

        return await postFormData('/send/video', formData, getAuthHeader(jid));
    } catch (error) {
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

        return await postFormData('/send/sticker', formData, getAuthHeader(jid));
    } catch (error) {
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
        return await postUrlEncoded('/send/location', form, getAuthHeader(jid));
    } catch (error) {
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
        return await postUrlEncoded('/send/contact', form, getAuthHeader(jid));
    } catch (error) {
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
        return await postUrlEncoded('/send/link', form, getAuthHeader(jid));
    } catch (error) {
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
        return await postUrlEncoded('/send/poll', form, getAuthHeader(jid));
    } catch (error) {
        throw new Error(`Send poll failed: ${error.message}`);
    }
}

/**
 * Get joined groups
 * @param {string} jid - Session JID
 */
async function getGroups(jid) {
    try {
        const payload = await getWithAuth('/group', getAuthHeader(jid));
        return payload;
    } catch (error) {
        throw new Error(`Get groups failed: ${error.message}`);
    }
}

/**
 * Get contacts from gateway
 * @param {string} jid - Session JID
 */
async function getContacts(jid) {
    try {
        const payload = await getWithAuth('/contact', getAuthHeader(jid));
        return payload;
    } catch (error) {
        throw new Error(`Get contacts failed: ${error.message}`);
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
        return await postUrlEncoded('/group/join', form, getAuthHeader(jid));
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
        return await postUrlEncoded('/group/leave', form, getAuthHeader(jid));
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
        return await postUrlEncoded('/message/edit', form, getAuthHeader(jid));
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
        return await postUrlEncoded('/message/delete', form, getAuthHeader(jid));
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
        return await postUrlEncoded('/message/react', form, getAuthHeader(jid));
    } catch (error) {
        throw new Error(`React to message failed: ${error.message}`);
    }
}

/**
 * Check gateway health
 */
async function checkHealth() {
    try {
        const response = await gatewayClient.get('/');
        return unwrap(response);
    } catch (error) {
        return { status: 'error', message: error.message };
    }
}

module.exports = {
    // Token management
    setSessionToken,
    getSessionToken,
    removeSessionToken,

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
    joinGroup,
    leaveGroup,
    checkHealth,

    // Raw client for advanced usage
    gatewayClient,
};
