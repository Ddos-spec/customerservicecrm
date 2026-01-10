const validator = require('validator');
const { formatPhoneNumber, toWhatsAppFormat } = require('../phone-utils');

function sanitizeBatchMessages(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.messages)) return payload.messages;
    if (payload && typeof payload === 'object') return [payload];
    return [];
}

function validateMessageEnvelope(msg) {
    const errors = [];
    if (!msg.to && (msg.receiver || msg.number)) {
        msg.to = msg.receiver || msg.number;
    }
    if (!msg.type && msg.mtype) {
        msg.type = msg.mtype;
    }
    if (!msg.type && msg.message) {
        msg.type = 'text';
    }
    if (msg.type === 'text' && !msg.text && msg.message) {
        msg.text = { body: msg.message };
    }
    if (!msg.to || !msg.type) {
        errors.push('Invalid message format. "to" and "type" are required.');
    }
    return errors;
}

function normalizeDestination(to, recipientType) {
    const isGroup = recipientType === 'group' || (typeof to === 'string' && to.endsWith('@g.us'));
    if (isGroup) {
        return { isGroup: true, destination: to.endsWith('@g.us') ? to : `${to}@g.us`, formatted: to };
    }
    const formattedNumber = formatPhoneNumber(to);
    if (!/^\d+$/.test(formattedNumber)) {
        const err = new Error('Invalid recipient format.');
        err.statusCode = 400;
        throw err;
    }
    return { isGroup: false, destination: toWhatsAppFormat(formattedNumber), formatted: formattedNumber };
}

function validateMediaIdOrLink(file) {
    if (file.id && !validator.isAlphanumeric(file.id.replace(/[\.\-]/g, ''))) {
        const err = new Error('Invalid media ID.');
        err.statusCode = 400;
        throw err;
    }
    if (file.link && !validator.isURL(file.link)) {
        const err = new Error('Invalid media URL.');
        err.statusCode = 400;
        throw err;
    }
}

module.exports = {
    sanitizeBatchMessages,
    validateMessageEnvelope,
    normalizeDestination,
    validateMediaIdOrLink,
};
