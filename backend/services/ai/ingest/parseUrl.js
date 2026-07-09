const axios = require('axios');
const cheerio = require('cheerio');

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_SIZE_BYTES = 5 * 1024 * 1024;
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const PRIVATE_IP_PATTERN = /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

function assertPublicHttpUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('URL tidak valid');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('URL harus menggunakan http atau https');
    }
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname) || PRIVATE_IP_PATTERN.test(hostname)) {
        throw new Error('URL yang mengarah ke alamat internal tidak diizinkan');
    }
    return parsed;
}

async function parseUrlContent(rawUrl) {
    const url = assertPublicHttpUrl(rawUrl);

    const response = await axios.get(url.toString(), {
        timeout: FETCH_TIMEOUT_MS,
        maxContentLength: MAX_HTML_SIZE_BYTES,
        maxRedirects: 3,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIAgentKnowledgeBot/1.0)' },
        responseType: 'text',
    });

    const $ = cheerio.load(response.data);
    $('script, style, noscript, nav, footer, header, iframe, svg').remove();

    const title = $('title').first().text().trim() || url.toString();
    const text = $('body').text().replace(/\s+/g, ' ').trim();

    if (!text) {
        throw new Error('Tidak ada konten teks yang bisa diambil dari URL ini');
    }

    return { title, text };
}

module.exports = { parseUrlContent, assertPublicHttpUrl };
