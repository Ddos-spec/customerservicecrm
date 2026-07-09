const db = require('../../db');

function dotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}

function magnitude(a) {
    return Math.sqrt(dotProduct(a, a));
}

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    const magA = magnitude(a);
    const magB = magnitude(b);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct(a, b) / (magA * magB);
}

async function retrieveTopK(tenantId, queryEmbedding, k = 4) {
    const chunks = await db.getKnowledgeChunksByTenant(tenantId);
    return chunks
        .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
}

module.exports = { cosineSimilarity, retrieveTopK };
