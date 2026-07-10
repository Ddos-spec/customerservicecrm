jest.mock('../db', () => ({
    getTenantAiConfig: jest.fn(),
    getMessagesByChat: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../services/ai/escalation', () => ({
    detectKeywordEscalation: jest.fn(),
}));

jest.mock('../services/ai/retrieval', () => ({
    retrieveTopK: jest.fn(),
}));

jest.mock('../services/ai/openrouter', () => ({
    chatCompletion: jest.fn(),
    createEmbeddings: jest.fn(),
}));

const db = require('../db');
const { detectKeywordEscalation } = require('../services/ai/escalation');
const { retrieveTopK } = require('../services/ai/retrieval');
const { chatCompletion, createEmbeddings } = require('../services/ai/openrouter');
const { handleIncomingMessage } = require('../services/ai/responder');

const tenant = { id: 'tenant-1' };
const chat = { id: 'chat-1' };
const savedMessage = { id: 'message-3' };

describe('AI responder', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.getTenantAiConfig.mockResolvedValue({
            openrouter_api_key: 'test-key',
            chat_model: 'test/chat-model',
            embedding_model: 'test/embedding-model',
            system_prompt: 'Kamu adalah customer service toko yang ramah dan solutif.',
            temperature: 0.3,
            max_tokens: 500,
        });
        db.query.mockResolvedValue({ rows: [] });
        detectKeywordEscalation.mockReturnValue({ shouldEscalate: false });
        createEmbeddings.mockResolvedValue([[0.1, 0.2]]);
        retrieveTopK.mockResolvedValue([]);
    });

    it('mengirim riwayat chat secara kronologis tanpa menggandakan pesan terbaru', async () => {
        db.getMessagesByChat.mockResolvedValue([
            { message_type: 'text', body: 'Halo', is_from_me: false },
            { message_type: 'text', body: 'Halo, ada yang bisa dibantu?', is_from_me: true },
            { message_type: 'text', body: 'Ada ukuran XL?', is_from_me: false },
        ]);
        chatCompletion.mockResolvedValue({
            text: 'Ada, ukuran XL tersedia.',
            model: 'test/chat-model',
            id: 'generation-1',
            usage: { prompt_tokens: 40, completion_tokens: 8 },
        });
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: 'Ada ukuran XL?',
            savedMessage,
            sendReply,
        });

        expect(chatCompletion).toHaveBeenCalledWith(expect.objectContaining({
            messages: expect.arrayContaining([
                { role: 'user', content: 'Halo' },
                { role: 'assistant', content: 'Halo, ada yang bisa dibantu?' },
                { role: 'user', content: 'Ada ukuran XL?' },
            ]),
        }));
        const messages = chatCompletion.mock.calls[0][0].messages;
        expect(messages.filter((message) => message.content === 'Ada ukuran XL?')).toHaveLength(1);
        expect(sendReply).toHaveBeenCalledWith('Ada, ukuran XL tersedia.');
    });

    it('mengalihkan chat ke manusia dan memberi kabar saat layanan AI gagal', async () => {
        createEmbeddings.mockRejectedValue(new Error('provider unavailable'));
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: 'Bisa bantu pesanan saya?',
            savedMessage,
            sendReply,
        });

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO escalation_log'),
            expect.arrayContaining(['tenant-1', 'chat-1', 'ai_service_error'])
        );
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE chats SET status = 'escalated'"),
            ['chat-1']
        );
        expect(sendReply).toHaveBeenCalledWith(expect.stringContaining('diteruskan ke tim customer service'));
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    it('menyembunyikan marker handoff dan benar-benar menghentikan AI di chat', async () => {
        db.getMessagesByChat.mockResolvedValue([
            { message_type: 'text', body: 'Saya punya toko dan ingin otomatisasi CS WhatsApp.', is_from_me: false },
        ]);
        chatCompletion.mockResolvedValue({
            text: 'Informasinya sudah cukup, Kak. Admin kami akan melanjutkan langsung di chat ini.\n\n[[ESCALATE_TO_HUMAN]]',
            model: 'test/chat-model',
            id: 'generation-handoff',
            usage: { prompt_tokens: 60, completion_tokens: 16 },
        });
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: 'Saya punya toko dan ingin otomatisasi CS WhatsApp.',
            savedMessage,
            sendReply,
        });

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO escalation_log'),
            expect.arrayContaining(['tenant-1', 'chat-1', 'llm_handoff'])
        );
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE chats SET status = 'escalated'"),
            ['chat-1']
        );
        expect(sendReply).toHaveBeenCalledWith('Informasinya sudah cukup, Kak. Admin kami akan melanjutkan langsung di chat ini.');
        expect(sendReply.mock.calls[0][0]).not.toContain('ESCALATE_TO_HUMAN');
    });
});
