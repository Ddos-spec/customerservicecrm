const db = require('../../db');
const { detectKeywordEscalation } = require('./escalation');
const { retrieveTopK } = require('./retrieval');
const { chatCompletion, createEmbeddings } = require('./openrouter');

const TOP_K = 4;
const MIN_RELEVANCE_SCORE = 0.3;
const FALLBACK_ESCALATION_REPLY = 'Mohon maaf, untuk pertanyaan ini kami akan hubungkan dengan agent kami ya 🙏';
const UNCERTAIN_PATTERNS = [
    /tidak tahu/i,
    /tidak (memiliki|ada) informasi/i,
    /maaf.*tidak (bisa|dapat) (membantu|menjawab)/i,
    /i don't know/i,
    /i'm not sure/i,
    /i do not have/i,
];

function looksUncertain(text) {
    if (!text || !text.trim()) return true;
    return UNCERTAIN_PATTERNS.some((pattern) => pattern.test(text));
}

async function logEscalation({ tenantId, chatId, triggerType, detail, messageId }) {
    await db.query(
        'INSERT INTO escalation_log (tenant_id, chat_id, trigger_type, trigger_detail, message_id) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, chatId, triggerType, detail ? detail.toString().slice(0, 500) : null, messageId || null]
    );
    await db.query("UPDATE chats SET status = 'escalated', updated_at = now() WHERE id = $1", [chatId]);
}

/**
 * Orkestrasi balasan AI Agent untuk satu pesan masuk.
 * `sendReply` di-inject oleh caller (webhook-handler.js) untuk menghindari circular require
 * dan supaya fungsi ini gampang diuji tanpa provider WhatsApp asli.
 */
async function handleIncomingMessage({ tenant, chat, messageText, savedMessage, sendReply }) {
    const config = await db.getTenantAiConfig(tenant.id);
    if (!config.openrouter_api_key) {
        console.warn(`[AI Agent] Tenant ${tenant.id} belum mengisi API key OpenRouter — pesan dibiarkan masuk ke inbox agent seperti biasa.`);
        return;
    }

    const keywordCheck = detectKeywordEscalation(messageText);
    if (keywordCheck.shouldEscalate) {
        await logEscalation({
            tenantId: tenant.id,
            chatId: chat.id,
            triggerType: keywordCheck.triggerType,
            detail: keywordCheck.detail,
            messageId: savedMessage?.id,
        });
        await sendReply(FALLBACK_ESCALATION_REPLY);
        return;
    }

    const [queryEmbedding] = await createEmbeddings({
        apiKey: config.openrouter_api_key,
        model: config.embedding_model,
        input: [messageText],
    });

    const topChunks = await retrieveTopK(tenant.id, queryEmbedding, TOP_K);
    const relevantChunks = topChunks.filter((chunk) => chunk.score >= MIN_RELEVANCE_SCORE);

    // Catatan: kosongnya hasil retrieval TIDAK langsung eskalasi. Sapaan/basa-basi ("halo",
    // "test") wajar tidak match knowledge base apa pun — AI tetap harus bisa membalas itu
    // secara natural. Eskalasi baru terjadi kalau LLM sendiri mengaku tidak tahu jawaban
    // faktualnya (lihat looksUncertain di bawah), bukan berdasarkan skor kemiripan semata.
    const basePrompt = config.system_prompt?.trim() || 'Kamu adalah customer service yang ramah dan membantu.';
    const contextSection = relevantChunks.length > 0
        ? `Informasi relevan dari knowledge base:\n${relevantChunks.map((chunk) => `- ${chunk.content}`).join('\n')}`
        : 'Tidak ditemukan informasi spesifik di knowledge base untuk pesan ini.';
    const systemPrompt = `${basePrompt}\n\n${contextSection}\n\nAturan:\n1. Kamu SEDANG mengobrol dengan customer di WhatsApp ini — chat ini SENDIRI adalah channel resminya. Jangan menyuruh customer "hubungi kami di WhatsApp" atau "chat kami di sini", karena mereka sudah di sini. Kalau perlu menindaklanjuti dengan tim manusia, katakan akan dihubungkan/dibantu langsung di chat ini juga, bukan disuruh pindah channel — kecuali knowledge base secara eksplisit menyebut cara lain (misal email untuk kirim dokumen, atau link jadwal meeting) yang relevan dengan kebutuhannya.\n2. Untuk sapaan, basa-basi, atau pertanyaan umum, balas secara natural sesuai kepribadian di atas.\n3. Untuk klaim FAKTUAL (harga, kebijakan, fitur spesifik, data perusahaan), HANYA pakai informasi dari knowledge base — kalau tidak ada datanya, katakan dengan jujur akan dibantu lebih lanjut oleh tim, jangan mengarang.`;

    const completion = await chatCompletion({
        apiKey: config.openrouter_api_key,
        model: config.chat_model,
        temperature: Number(config.temperature),
        maxTokens: config.max_tokens,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: messageText },
        ],
    });

    if (looksUncertain(completion.text)) {
        await logEscalation({
            tenantId: tenant.id,
            chatId: chat.id,
            triggerType: 'llm_uncertain',
            detail: completion.text,
            messageId: savedMessage?.id,
        });
        await sendReply(FALLBACK_ESCALATION_REPLY);
        return;
    }

    await sendReply(completion.text);
}

module.exports = { handleIncomingMessage, looksUncertain };
