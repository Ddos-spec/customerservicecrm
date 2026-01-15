function normalizeJid(jid, options = {}) {
    if (!jid) return '';
    const raw = String(jid).trim();
    if (!raw) return '';

    const parts = raw.split('@');
    let user = parts[0] || '';
    let server = parts[1] || '';

    if (user.includes(':')) {
        user = user.split(':')[0];
    }
    if (user.startsWith('+')) {
        user = user.slice(1);
    }

    const isGroup = typeof options.isGroup === 'boolean'
        ? options.isGroup
        : server === 'g.us' || user.includes('-');

    if (!server) {
        server = isGroup ? 'g.us' : 's.whatsapp.net';
    } else if (server === 'c.us') {
        server = 's.whatsapp.net';
    }

    if (!user || !server) return '';
    return `${user}@${server}`;
}

function getJidUser(jid) {
    if (!jid) return '';
    return String(jid).split('@')[0];
}

module.exports = {
    normalizeJid,
    getJidUser,
};
