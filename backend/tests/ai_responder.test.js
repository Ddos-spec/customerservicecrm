jest.mock('../db', () => ({
    getTenantAiConfig: jest.fn(),
    getMessagesByChat: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../services/ai/retrieval', () => ({
    retrieveTopK: jest.fn(),
}));

jest.mock('../services/ai/openrouter', () => ({
    chatCompletion: jest.fn(),
    createEmbeddings: jest.fn(),
}));

const db = require('../db');
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

    it('membiarkan chat tetap terbuka saat layanan AI gagal agar dapat dicoba lagi', async () => {
        createEmbeddings.mockRejectedValue(new Error('provider unavailable'));
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: 'Bisa bantu pesanan saya?',
            savedMessage,
            sendReply,
        });

        expect(db.query).not.toHaveBeenCalled();
        expect(sendReply).toHaveBeenCalledWith(expect.stringContaining('kendala teknis'));
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    it('menyembunyikan marker handoff dan benar-benar menghentikan AI di chat', async () => {
        db.getMessagesByChat.mockResolvedValue([
            { message_type: 'text', body: 'Saya punya toko dan ingin otomatisasi CS WhatsApp.', is_from_me: false },
        ]);
        chatCompletion.mockResolvedValueOnce({
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

    it('tidak memaksa handoff hanya karena customer tertarik dan ingin lanjut', async () => {
        const qualifiedMessage = 'Solusi AI CS tadi cocok untuk toko online saya. Saya setuju dan mau lanjut.';
        db.getMessagesByChat.mockResolvedValue([
            { message_type: 'text', body: qualifiedMessage, is_from_me: false },
        ]);
        chatCompletion.mockResolvedValueOnce({
            text: 'Siap, Kak. Biar saya arahkan dengan tepat, produk atau alur WhatsApp mana yang paling ingin diotomatisasi lebih dulu?',
            model: 'test/chat-model',
            id: 'generation-qualified-discovery',
            usage: { prompt_tokens: 80, completion_tokens: 22 },
        });
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: qualifiedMessage,
            savedMessage,
            sendReply,
        });

        expect(chatCompletion).toHaveBeenCalledTimes(1);
        expect(sendReply).toHaveBeenCalledWith(expect.stringContaining('produk atau alur WhatsApp'));
        expect(db.query).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO escalation_log'),
            expect.anything()
        );
    });

    it('tidak handoff terlalu cepat sebelum AI memetakan solusi dan melakukan closing', async () => {
        const discoveryMessage = 'Saya punya toko online, admin kewalahan menjawab stok, dan saya ingin respons WhatsApp lebih cepat.';
        db.getMessagesByChat.mockResolvedValue([
            { message_type: 'text', body: discoveryMessage, is_from_me: false },
        ]);
        chatCompletion.mockResolvedValueOnce({
            text: 'AI CS WhatsApp cocok untuk membantu pertanyaan stok dan status pesanan secara otomatis. Apakah fokus utama ini sudah sesuai, Kak?',
            model: 'test/chat-model',
            id: 'generation-sales-discovery',
            usage: { prompt_tokens: 80, completion_tokens: 24 },
        });
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: discoveryMessage,
            savedMessage,
            sendReply,
        });

        expect(sendReply).toHaveBeenCalledWith(expect.stringContaining('Apakah fokus utama ini sudah sesuai'));
        expect(db.query).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO escalation_log'),
            expect.anything()
        );
    });

    it('menyelesaikan koordinasi meeting sebelum menyerahkan chat ke admin', async () => {
        const meetingMessage = 'Hari Senin pukul 13.00 WIB saya ingin meeting online untuk bahas AI CS.';
        db.getMessagesByChat.mockResolvedValue([
            { message_type: 'text', body: meetingMessage, is_from_me: false },
        ]);
        chatCompletion.mockResolvedValueOnce({
            text: 'Bisa, Kak. Untuk link meeting, apakah akan dibuat oleh Kakak atau perlu disiapkan admin kami?',
            model: 'test/chat-model',
            id: 'generation-meeting-coordination',
            usage: { prompt_tokens: 70, completion_tokens: 20 },
        });
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: meetingMessage,
            savedMessage,
            sendReply,
        });

        expect(sendReply).toHaveBeenCalledWith(expect.stringContaining('apakah akan dibuat oleh Kakak'));
        expect(db.query).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO escalation_log'),
            expect.anything()
        );
    });

    it('tidak memaksa handoff saat detail meeting lengkap tanpa marker dari system prompt', async () => {
        const firstMessage = 'Saya ingin meeting online hari Senin jam 13.00 WIB untuk bahas AI CS.';
        const latestMessage = 'Tolong link meeting disiapkan oleh admin my-aicustom.';
        db.getMessagesByChat.mockResolvedValue([
            { message_type: 'text', body: firstMessage, is_from_me: false },
            { message_type: 'text', body: latestMessage, is_from_me: false },
        ]);
        chatCompletion.mockResolvedValueOnce({
            text: 'Baik, Kak. Meeting Senin pukul 13.00 WIB sudah dicatat dan admin akan mengirim link di chat ini.',
            model: 'test/chat-model',
            id: 'generation-meeting-handoff',
            usage: { prompt_tokens: 90, completion_tokens: 20 },
        });
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: latestMessage,
            savedMessage,
            sendReply,
        });

        expect(chatCompletion).toHaveBeenCalledTimes(1);
        expect(db.query).not.toHaveBeenCalled();
        expect(sendReply).toHaveBeenCalledWith(expect.stringContaining('admin akan mengirim link'));
    });

    it('tidak memaksa handoff hanya karena customer menyebut admin atau refund', async () => {
        const customerMessage = 'Saya mau komplain refund dan bicara dengan admin.';
        db.getMessagesByChat.mockResolvedValue([
            { message_type: 'text', body: customerMessage, is_from_me: false },
        ]);
        chatCompletion.mockResolvedValueOnce({
            text: 'Baik, saya bantu cek kendalanya dulu. Nomor pesanannya berapa?',
            model: 'test/chat-model',
            id: 'generation-prompt-first',
            usage: { prompt_tokens: 70, completion_tokens: 16 },
        });
        const sendReply = jest.fn();

        await handleIncomingMessage({
            tenant,
            chat,
            messageText: customerMessage,
            savedMessage,
            sendReply,
        });

        expect(chatCompletion).toHaveBeenCalledTimes(1);
        expect(db.query).not.toHaveBeenCalled();
        expect(sendReply).toHaveBeenCalledWith(expect.stringContaining('Nomor pesanannya'));
    });
});
