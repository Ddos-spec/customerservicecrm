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

    if (relevantChunks.length === 0) {
        await logEscalation({
            tenantId: tenant.id,
            chatId: chat.id,
            triggerType: 'no_context',
            detail: messageText,
            messageId: savedMessage?.id,
        });
        await sendReply(FALLBACK_ESCALATION_REPLY);
        return;
    }

    const contextText = relevantChunks.map((chunk) => `- ${chunk.content}`).join('\n');
    const basePrompt = config.system_prompt?.trim() || 'Kamu adalah customer service yang ramah dan membantu.';
    const systemPrompt = `${basePrompt}\n\nGunakan informasi berikut untuk menjawab pertanyaan customer:\n${contextText}\n\nJika informasi di atas tidak cukup untuk menjawab pertanyaan, katakan dengan jujur bahwa kamu tidak tahu jawabannya — jangan mengarang jawaban.`;

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
