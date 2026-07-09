const axios = require('axios');

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const REQUEST_TIMEOUT_MS = 30000;

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
    return {
        text: choice?.message?.content || '',
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

module.exports = { chatCompletion, createEmbeddings, OPENROUTER_BASE_URL };
