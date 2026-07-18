const { chatCompletion, createEmbeddings } = require('./openrouter');
const { retrieveTopK } = require('./retrieval');

const HISTORY_LIMIT = 14;
const MESSAGE_MAX_LENGTH = 6000;
const TOP_K = 4;
const MIN_RELEVANCE_SCORE = 0.3;

function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
        .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
        .map((item) => ({ role: item.role, content: item.content.trim().slice(0, MESSAGE_MAX_LENGTH) }))
        .filter((item) => item.content)
        .slice(-HISTORY_LIMIT);
}

async function buildKnowledgeContext(tenantId, config, message) {
    try {
        const [embedding] = await createEmbeddings({
            apiKey: config.openrouter_api_key,
            model: config.embedding_model,
            input: [message],
        });
        const chunks = await retrieveTopK(tenantId, embedding, TOP_K);
        const relevant = chunks.filter((chunk) => chunk.score >= MIN_RELEVANCE_SCORE);
        if (relevant.length === 0) return '';
        return relevant.map((chunk) => `- ${chunk.content}`).join('\n');
    } catch (error) {
        // The assistant remains useful for drafting and planning even while a
        // tenant's document index is unavailable.
        console.warn(`[Tenant Assistant] Knowledge retrieval skipped for tenant ${tenantId}: ${error.message}`);
        return '';
    }
}

async function answerTenantAssistant({ tenant, config, message, history }) {
    if (!config?.openrouter_api_key) {
        throw new Error('API key OpenRouter belum diisi. Simpan key di AI Agent terlebih dahulu.');
    }

    const prompt = typeof message === 'string' ? message.trim().slice(0, MESSAGE_MAX_LENGTH) : '';
    if (!prompt) throw new Error('Pertanyaan atau instruksi tidak boleh kosong.');

    const knowledge = await buildKnowledgeContext(tenant.id, config, prompt);
    const systemPrompt = `Kamu adalah AI Assistant operasional untuk ${tenant.company_name || 'tenant ini'}.

Bantu owner dan tim menjalankan pekerjaan: menyusun balasan customer, merangkum percakapan yang diberikan user, membuat SOP/checklist, ide kampanye, analisis prioritas, dan draft konten. Jawab dalam bahasa Indonesia yang jelas, praktis, dan terstruktur.

Aturan penting:
- Gunakan informasi bisnis di bawah hanya sebagai fakta bila memang relevan. Jika tidak ada data, katakan apa yang perlu diverifikasi; jangan mengarang harga, stok, kebijakan, atau hasil kerja.
- Kamu boleh membuat draft, rencana, dan langkah tindakan. Jangan mengklaim sudah mengirim pesan, mengubah data, menghubungi orang, atau mengeksekusi aksi eksternal karena kamu tidak memiliki akses eksekusi tersebut.
- Jaga data tenant tetap di percakapan ini. Jangan meminta API key dan jangan pernah menuliskan ulang rahasia.
- Jika instruksi ambigu, ajukan paling banyak satu pertanyaan klarifikasi yang paling menentukan.

${knowledge ? `Pengetahuan bisnis tenant yang relevan:\n${knowledge}` : 'Tidak ada sumber pengetahuan tenant yang relevan untuk pertanyaan ini.'}`;

    return chatCompletion({
        apiKey: config.openrouter_api_key,
        model: config.chat_model,
        temperature: Math.min(Math.max(Number(config.temperature) || 0.3, 0), 1),
        maxTokens: Math.min(Math.max(Number(config.max_tokens) || 500, 200), 1200),
        messages: [
            { role: 'system', content: systemPrompt },
            ...normalizeHistory(history),
            { role: 'user', content: prompt },
        ],
    });
}

module.exports = { answerTenantAssistant, normalizeHistory };
