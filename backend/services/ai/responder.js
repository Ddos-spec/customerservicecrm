const db = require('../../db');
const { detectKeywordEscalation } = require('./escalation');
const { retrieveTopK } = require('./retrieval');
const { chatCompletion, createEmbeddings } = require('./openrouter');

const TOP_K = 4;
const MIN_RELEVANCE_SCORE = 0.3;
const FALLBACK_ESCALATION_REPLY = 'Mohon maaf, untuk pertanyaan ini kami akan hubungkan dengan agent kami ya 🙏';
const SERVICE_FAILURE_REPLY = 'Mohon maaf, sistem kami sedang mengalami kendala. Pesan Anda sudah diteruskan ke tim customer service dan akan dibantu di chat ini ya 🙏';
const HANDOFF_MARKER = '[[ESCALATE_TO_HUMAN]]';
const HANDOFF_MARKER_PATTERN = /\[\[\s*ESCALATE_TO_HUMAN\s*\]\]/gi;
const HANDOFF_CLASSIFIER_MIN_CHARS = 40;
const UNCERTAIN_PATTERNS = [
    /tidak tahu/i,
    /tidak (memiliki|ada) informasi/i,
    /maaf.*tidak (bisa|dapat) (membantu|menjawab)/i,
    /i don't know/i,
    /i'm not sure/i,
    /i do not have/i,
];
const HISTORY_LIMIT = 16;

function looksUncertain(text) {
    if (!text || !text.trim()) return true;
    return UNCERTAIN_PATTERNS.some((pattern) => pattern.test(text));
}

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

async function classifyHandoff(config, history) {
    const latestCustomerMessage = [...history].reverse().find((message) => message.role === 'user')?.content || '';
    if (latestCustomerMessage.trim().length < HANDOFF_CLASSIFIER_MIN_CHARS) return false;

    const transcript = history
        .slice(-10)
        .map((message) => `${message.role === 'assistant' ? 'CS' : 'CUSTOMER'}: ${message.content}`)
        .join('\n')
        .slice(-5000);

    try {
        const decision = await chatCompletion({
            apiKey: config.openrouter_api_key,
            model: config.chat_model,
            temperature: 0,
            maxTokens: 12,
            messages: [
                {
                    role: 'system',
                    content: `Nilai apakah percakapan customer service harus diserahkan ke admin manusia sekarang. Jawab HANYA HANDOFF atau CONTINUE.

Jawab HANDOFF jika salah satu benar:
- Customer meminta admin/manusia, siap deal, meminta negosiasi harga, atau membutuhkan keputusan/detail khusus.
- Informasi sudah cukup untuk admin bertindak: konteks bisnis, masalah/proses yang ingin dibantu, dan hasil utama yang diharapkan sudah disebut atau tersirat jelas.

Jangan meminta budget, timeline, meeting, atau fitur tambahan jika inti kebutuhan sudah jelas. Pertanyaan umum, sapaan, atau kebutuhan yang masih kabur adalah CONTINUE.`,
                },
                { role: 'user', content: transcript },
            ],
        });
        return /^HANDOFF\b/i.test(decision.text.trim());
    } catch (error) {
        console.warn('[AI Agent] Handoff classifier failed, continuing with main responder:', error.message);
        return false;
    }
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

    let completion;
    let forceHandoff = false;
    try {
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
        const systemPrompt = `${basePrompt}\n\n${contextSection}\n\nAturan:\n1. Kamu SEDANG mengobrol dengan customer di WhatsApp ini — chat ini SENDIRI adalah channel resminya. Jangan menyuruh customer pindah ke website, form, email, Calendly, telepon, atau channel lain. Semua konsultasi dan tindak lanjut berlangsung di chat WhatsApp ini.\n2. Untuk sapaan, basa-basi, atau pertanyaan umum, balas secara natural sesuai kepribadian di atas.\n3. Untuk klaim FAKTUAL (harga, kebijakan, fitur spesifik, data perusahaan), HANYA pakai informasi dari knowledge base — kalau tidak ada datanya, katakan dengan jujur akan dibantu lebih lanjut oleh tim, jangan mengarang.\n4. Pahami riwayat percakapan. Jangan mengulang sapaan, pertanyaan, atau informasi yang sudah jelas.\n5. Jawab ringkas, hangat, dan berorientasi solusi seperti customer service manusia. Ajukan maksimal satu pertanyaan paling relevan dalam satu balasan.\n6. Jika informasi inti customer sudah cukup untuk ditindaklanjuti admin, customer meminta manusia, perlu negosiasi, atau butuh keputusan yang bukan wewenangmu: beri konfirmasi singkat bahwa admin akan melanjutkan di chat ini, lalu tulis ${HANDOFF_MARKER} pada baris terakhir. Marker itu adalah perintah internal; jangan jelaskan artinya.`;

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

        forceHandoff = await classifyHandoff(config, history);

        completion = await chatCompletion({
            apiKey: config.openrouter_api_key,
            model: config.chat_model,
            temperature: Number(config.temperature),
            maxTokens: config.max_tokens,
            messages: [
                {
                    role: 'system',
                    content: `${systemPrompt}\n7. Keputusan handoff untuk balasan ini: ${forceHandoff ? 'WAJIB HANDOFF. Jangan ajukan pertanyaan lagi; rangkum singkat, katakan admin akan melanjutkan di chat ini, lalu tambahkan marker internal.' : 'LANJUTKAN DISCOVERY secara natural bila masih ada satu informasi inti yang benar-benar dibutuhkan.'}`,
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
        console.error('[AI Agent] Generation failed, escalating safely', {
            tenantId: tenant.id,
            chatId: chat.id,
            error: error.message,
        });
        await logEscalation({
            tenantId: tenant.id,
            chatId: chat.id,
            triggerType: 'ai_service_error',
            detail: error.message,
            messageId: savedMessage?.id,
        });
        await sendReply(SERVICE_FAILURE_REPLY);
        return;
    }

    const replyText = stripHandoffMarker(completion.text);
    if (forceHandoff || requestsHumanHandoff(completion.text)) {
        await logEscalation({
            tenantId: tenant.id,
            chatId: chat.id,
            triggerType: 'llm_handoff',
            detail: `${forceHandoff ? 'classifier_handoff: ' : ''}${completion.text}`,
            messageId: savedMessage?.id,
        });
        await sendReply(replyText || 'Terima kasih, Kak. Informasinya sudah cukup dan admin kami akan melanjutkan bantuan langsung di chat ini ya.');
        return;
    }

    if (looksUncertain(replyText)) {
        await logEscalation({
            tenantId: tenant.id,
            chatId: chat.id,
            triggerType: 'llm_uncertain',
            detail: replyText,
            messageId: savedMessage?.id,
        });
        await sendReply(FALLBACK_ESCALATION_REPLY);
        return;
    }

    await sendReply(replyText);
}

module.exports = { handleIncomingMessage, looksUncertain, requestsHumanHandoff, stripHandoffMarker };
