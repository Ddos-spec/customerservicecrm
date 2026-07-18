const db = require('../../db');
const { retrieveTopK } = require('./retrieval');
const { chatCompletion, createEmbeddings } = require('./openrouter');

const TOP_K = 4;
const MIN_RELEVANCE_SCORE = 0.3;
const EMPTY_RESPONSE_REPLY = 'Maaf, saya belum menangkap pesannya. Bisa dijelaskan sedikit lagi?';
const SERVICE_FAILURE_REPLY = 'Maaf, saya sedang mengalami kendala teknis. Silakan kirim ulang pesan Anda sebentar lagi ya.';
const HANDOFF_MARKER = '[[ESCALATE_TO_HUMAN]]';
const HANDOFF_MARKER_PATTERN = /\[\[\s*ESCALATE_TO_HUMAN\s*\]\]/gi;
const HISTORY_LIMIT = 16;

function requestsHumanHandoff(text) {
    if (!text) return false;
    HANDOFF_MARKER_PATTERN.lastIndex = 0;
    return HANDOFF_MARKER_PATTERN.test(text);
}

function stripHandoffMarker(text) {
    if (!text) return '';
    HANDOFF_MARKER_PATTERN.lastIndex = 0;
    return text.replace(HANDOFF_MARKER_PATTERN, '').replace(/\n{3,}/g, '\n\n').trim();
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
async function handleIncomingMessage({ tenant, chat, messageText, savedMessage, sendReply, canAutoReply }) {
    const isStillSafeToReply = async () => {
        if (typeof canAutoReply !== 'function') return true;
        return Boolean(await canAutoReply());
    };

    const config = await db.getTenantAiConfig(tenant.id);
    if (!config.openrouter_api_key) {
        console.warn(`[AI Agent] Tenant ${tenant.id} belum mengisi API key OpenRouter — pesan dibiarkan masuk ke inbox agent seperti biasa.`);
        return;
    }

    let completion;
    try {
        const [queryEmbedding] = await createEmbeddings({
            apiKey: config.openrouter_api_key,
            model: config.embedding_model,
            input: [messageText],
        });

        const topChunks = await retrieveTopK(tenant.id, queryEmbedding, TOP_K);
        const relevantChunks = topChunks.filter((chunk) => chunk.score >= MIN_RELEVANCE_SCORE);

        const basePrompt = config.system_prompt?.trim() || 'Kamu adalah customer service yang ramah dan membantu.';
        const contextSection = relevantChunks.length > 0
            ? `Informasi relevan dari knowledge base:\n${relevantChunks.map((chunk) => `- ${chunk.content}`).join('\n')}`
            : 'Tidak ditemukan informasi spesifik di knowledge base untuk pesan ini.';
        // System prompt tenant adalah pengambil keputusan bisnis tunggal, termasuk kapan
        // percakapan perlu diteruskan. Platform hanya memberi konteks knowledge base dan
        // marker internal untuk menjalankan handoff yang diminta oleh prompt tersebut.
        const systemPrompt = `${basePrompt}\n\n${contextSection}\n\nKonteks platform: Ini adalah percakapan WhatsApp dengan customer. Gunakan riwayat percakapan dan informasi knowledge base di atas sebagai referensi. Jika, DAN HANYA JIKA, system prompt di atas memutuskan percakapan harus diteruskan ke manusia, tulis ${HANDOFF_MARKER} pada baris terakhir balasan. Marker itu perintah internal dan tidak boleh dijelaskan kepada customer.`;

        const history = (await db.getMessagesByChat(chat.id, HISTORY_LIMIT))
            .filter((message) => message.message_type === 'text' && message.body?.trim())
            .map((message) => ({
                role: message.is_from_me ? 'assistant' : 'user',
                content: message.body.trim(),
            }));

        const hasCurrentMessage = history.some((message, index) => (
            index === history.length - 1
            && message.role === 'user'
            && message.content === messageText.trim()
        ));
        if (!hasCurrentMessage) history.push({ role: 'user', content: messageText });

        completion = await chatCompletion({
            apiKey: config.openrouter_api_key,
            model: config.chat_model,
            temperature: Number(config.temperature),
            maxTokens: config.max_tokens,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                ...history,
            ],
        });

        console.info('[AI Agent] Completion success', {
            tenantId: tenant.id,
            chatId: chat.id,
            model: completion.model,
            generationId: completion.id,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
        });
    } catch (error) {
        console.error('[AI Agent] Generation failed; escalating chat to a human', {
            tenantId: tenant.id,
            chatId: chat.id,
            error: error.message,
        });
        if (!await isStillSafeToReply()) {
            console.info(`[AI Agent] Provider failure reply dibatalkan; chat ${chat.id} sudah diambil alih manusia atau AI dimatikan.`);
            return;
        }
        // A provider failure must not silently leave the customer stranded or
        // let the bot repeatedly retry. Put the chat in the human queue and
        // leave one transparent message in the same WhatsApp conversation.
        await logEscalation({
            tenantId: tenant.id,
            chatId: chat.id,
            triggerType: 'ai_provider_failure',
            detail: error.message,
            messageId: savedMessage?.id,
        });
        await sendReply(SERVICE_FAILURE_REPLY);
        return;
    }

    const replyText = stripHandoffMarker(completion.text);
    if (!await isStillSafeToReply()) {
        console.info(`[AI Agent] Balasan generasi ${completion.id || '-'} dibatalkan; chat ${chat.id} sudah diambil alih manusia atau AI dimatikan.`);
        return;
    }
    if (requestsHumanHandoff(completion.text)) {
        await logEscalation({
            tenantId: tenant.id,
            chatId: chat.id,
            triggerType: 'llm_handoff',
            detail: completion.text,
            messageId: savedMessage?.id,
        });
        await sendReply(replyText || 'Terima kasih, Kak. Informasinya sudah cukup dan admin kami akan melanjutkan bantuan langsung di chat ini ya.');
        return;
    }

    await sendReply(replyText || EMPTY_RESPONSE_REPLY);
}

module.exports = {
    handleIncomingMessage,
    requestsHumanHandoff,
    stripHandoffMarker,
};
