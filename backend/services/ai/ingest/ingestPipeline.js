const db = require('../../../db');
const { splitIntoChunks } = require('../chunking');
const { createEmbeddings } = require('../openrouter');
const { parseUrlContent } = require('./parseUrl');

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const EMBEDDING_BATCH_SIZE = 20;

async function embedAndStoreChunks(document, rawText) {
    const chunks = splitIntoChunks(rawText, { size: CHUNK_SIZE, overlap: CHUNK_OVERLAP });
    if (chunks.length === 0) {
        throw new Error('Tidak ada konten yang bisa diambil dari sumber ini');
    }

    const config = await db.getTenantAiConfig(document.tenant_id);
    if (!config.openrouter_api_key) {
        throw new Error('API key OpenRouter belum diisi di Konfigurasi AI Agent');
    }

    const embeddedChunks = [];
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddings = await createEmbeddings({
            apiKey: config.openrouter_api_key,
            model: config.embedding_model,
            input: batch,
        });
        batch.forEach((content, idx) => {
            embeddedChunks.push({ content, embedding: embeddings[idx], chunkIndex: i + idx });
        });
    }

    await db.replaceKnowledgeChunks(document.tenant_id, document.id, embeddedChunks);
    await db.updateKnowledgeDocumentStatus(document.id, 'ready', { chunkCount: embeddedChunks.length });
}

async function ingestDocument(documentId) {
    const document = await db.getKnowledgeDocumentById(documentId);
    if (!document) throw new Error('Dokumen tidak ditemukan');

    await db.updateKnowledgeDocumentStatus(documentId, 'processing');
    try {
        await embedAndStoreChunks(document, document.raw_text);
    } catch (error) {
        await db.updateKnowledgeDocumentStatus(documentId, 'failed', { errorMessage: error.message });
        throw error;
    }
}

async function ingestUrlDocument(documentId) {
    const document = await db.getKnowledgeDocumentById(documentId);
    if (!document) throw new Error('Dokumen tidak ditemukan');

    await db.updateKnowledgeDocumentStatus(documentId, 'processing');
    try {
        const { title, text } = await parseUrlContent(document.source_url);
        await db.updateKnowledgeDocumentTitleAndText(documentId, title, text);
        await embedAndStoreChunks(document, text);
    } catch (error) {
        await db.updateKnowledgeDocumentStatus(documentId, 'failed', { errorMessage: error.message });
        throw error;
    }
}

module.exports = { ingestDocument, ingestUrlDocument };
