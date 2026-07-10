const axios = require('axios');

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const REQUEST_TIMEOUT_MS = 30000;
const MODELS_CACHE_TTL_MS = 15 * 60 * 1000;

let modelsCache = null;
let modelsCacheExpiresAt = 0;

function buildHeaders(apiKey) {
    if (!apiKey) {
        throw new Error('OpenRouter API key belum dikonfigurasi untuk tenant ini');
    }
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    if (process.env.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
    if (process.env.OPENROUTER_X_TITLE) headers['X-Title'] = process.env.OPENROUTER_X_TITLE;
    return headers;
}

async function chatCompletion({ apiKey, model, messages, temperature = 0.3, maxTokens = 500 }) {
    const response = await axios.post(`${OPENROUTER_BASE_URL}/chat/completions`, {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
    }, { headers: buildHeaders(apiKey), timeout: REQUEST_TIMEOUT_MS });

    const choice = response.data?.choices?.[0];
    if (choice?.error || response.data?.error) {
        const providerError = choice?.error || response.data.error;
        const error = new Error(providerError?.message || 'Model AI gagal membuat balasan');
        error.status = providerError?.code || 502;
        error.errorType = providerError?.metadata?.error_type || 'provider_error';
        throw error;
    }

    const text = choice?.message?.content?.trim() || '';
    if (!text) {
        const error = new Error('Model AI tidak menghasilkan balasan');
        error.status = 502;
        error.errorType = 'empty_response';
        throw error;
    }

    return {
        text,
        id: response.data?.id || null,
        model: response.data?.model || model,
        usage: response.data?.usage || null,
        raw: response.data,
    };
}

async function createEmbeddings({ apiKey, model, input }) {
    const texts = Array.isArray(input) ? input : [input];
    const response = await axios.post(`${OPENROUTER_BASE_URL}/embeddings`, {
        model,
        input: texts,
    }, { headers: buildHeaders(apiKey), timeout: REQUEST_TIMEOUT_MS });

    const data = response.data?.data || [];
    return data
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((item) => item.embedding);
}

async function listModels({ apiKey, forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && modelsCache && modelsCacheExpiresAt > now) {
        return modelsCache;
    }

    const headers = apiKey ? buildHeaders(apiKey) : { 'Content-Type': 'application/json' };
    const response = await axios.get(`${OPENROUTER_BASE_URL}/models`, {
        headers,
        timeout: REQUEST_TIMEOUT_MS,
    });

    const models = (response.data?.data || [])
        .filter((model) => {
            const outputs = model?.architecture?.output_modalities;
            return model?.id && (!Array.isArray(outputs) || outputs.includes('text'));
        })
        .map((model) => ({
            id: model.id,
            name: model.name || model.id,
            description: model.description || '',
            context_length: Number(model.context_length) || null,
            pricing: model.pricing || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    modelsCache = models;
    modelsCacheExpiresAt = now + MODELS_CACHE_TTL_MS;
    return models;
}

function getOpenRouterErrorMessage(error) {
    const status = Number(error?.response?.status || error?.status || 0);
    const errorType = error?.response?.data?.error?.metadata?.error_type
        || error?.response?.data?.error_type
        || error?.errorType;

    if (status === 401 || errorType === 'authentication') return 'API key OpenRouter tidak valid atau sudah dicabut.';
    if (status === 402 || errorType === 'payment_required') return 'Saldo OpenRouter tidak cukup. Isi saldo lalu coba lagi.';
    if (status === 403 || errorType === 'permission_denied') return 'API key tidak memiliki izin memakai model ini.';
    if (status === 408 || errorType === 'request_timeout') return 'OpenRouter terlalu lama merespons. Coba lagi beberapa saat.';
    if (status === 429 || errorType === 'rate_limit_exceeded') return 'Batas pemakaian OpenRouter sedang tercapai. Coba lagi sebentar.';
    if (status === 502 || status === 503 || errorType === 'provider_unavailable') return 'Model sedang tidak tersedia. Pilih model lain atau coba lagi.';
    if (errorType === 'empty_response') return 'Model tidak menghasilkan balasan. Coba model lain.';
    return 'Koneksi ke OpenRouter gagal. Periksa API key dan model yang dipilih.';
}

module.exports = {
    chatCompletion,
    createEmbeddings,
    listModels,
    getOpenRouterErrorMessage,
    OPENROUTER_BASE_URL,
};
