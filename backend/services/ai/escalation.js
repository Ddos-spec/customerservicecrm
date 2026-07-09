// Sama seperti daftar di backend/gateway-api.js (check-escalation), dipisah per kategori
// supaya trigger_type di escalation_log lebih informatif.
const EXPLICIT_REQUEST_KEYWORDS = [
    'human', 'manusia', 'agent', 'agen', 'cs', 'customer service',
    'bicara dengan', 'speak to', 'talk to',
];

const SENSITIVE_TOPIC_KEYWORDS = [
    'komplain', 'complaint', 'marah', 'angry', 'kesal',
    'refund', 'pengembalian', 'cancel', 'batal',
    'tidak puas', 'not satisfied', 'kecewa',
];

function detectKeywordEscalation(text) {
    const lower = (text || '').toString().toLowerCase();

    const explicitMatch = EXPLICIT_REQUEST_KEYWORDS.find((kw) => lower.includes(kw));
    if (explicitMatch) {
        return { shouldEscalate: true, triggerType: 'keyword', detail: explicitMatch };
    }

    const sensitiveMatch = SENSITIVE_TOPIC_KEYWORDS.find((kw) => lower.includes(kw));
    if (sensitiveMatch) {
        return { shouldEscalate: true, triggerType: 'sensitive_topic', detail: sensitiveMatch };
    }

    return { shouldEscalate: false };
}

module.exports = { EXPLICIT_REQUEST_KEYWORDS, SENSITIVE_TOPIC_KEYWORDS, detectKeywordEscalation };
