function normalizeWhitespace(text) {
    return (text || '').toString().replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function splitIntoChunks(text, { size = 1000, overlap = 150 } = {}) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];
    if (normalized.length <= size) return [normalized];

    const chunks = [];
    let start = 0;
    while (start < normalized.length) {
        let end = Math.min(start + size, normalized.length);
        if (end < normalized.length) {
            const lastBreak = normalized.lastIndexOf('\n', end);
            const lastSpace = normalized.lastIndexOf(' ', end);
            const breakPoint = lastBreak > start + size * 0.5 ? lastBreak : lastSpace;
            if (breakPoint > start) end = breakPoint;
        }
        const chunk = normalized.slice(start, end).trim();
        if (chunk) chunks.push(chunk);
        if (end >= normalized.length) break;
        start = Math.max(end - overlap, start + 1);
    }
    return chunks;
}

module.exports = { splitIntoChunks, normalizeWhitespace };
