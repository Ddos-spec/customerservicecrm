const { createReplyBatcher } = require('../services/ai/reply-batcher');

describe('AI reply batcher', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('menggabungkan pesan beruntun dan hanya flush sekali setelah customer berhenti mengetik', async () => {
        const onFlush = jest.fn();
        const batcher = createReplyBatcher({ delayMs: 8000, onFlush });

        batcher.schedule('tenant:chat', { text: 'Halo' });
        await jest.advanceTimersByTimeAsync(3000);
        batcher.schedule('tenant:chat', { text: 'Saya punya toko online' });
        await jest.advanceTimersByTimeAsync(3000);
        batcher.schedule('tenant:chat', { text: 'Butuh AI untuk membalas customer' });

        await jest.advanceTimersByTimeAsync(7999);
        expect(onFlush).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1);
        expect(onFlush).toHaveBeenCalledTimes(1);
        expect(onFlush).toHaveBeenCalledWith('tenant:chat', [
            { text: 'Halo' },
            { text: 'Saya punya toko online' },
            { text: 'Butuh AI untuk membalas customer' },
        ]);
    });

    it('membatalkan balasan tertunda ketika manusia mengambil alih', async () => {
        const onFlush = jest.fn();
        const batcher = createReplyBatcher({ delayMs: 8000, onFlush });

        batcher.schedule('tenant:chat', { text: 'Tunggu saya kirim detail' });
        expect(batcher.cancel('tenant:chat')).toBe(true);
        await jest.advanceTimersByTimeAsync(8000);

        expect(onFlush).not.toHaveBeenCalled();
        expect(batcher.pendingCount()).toBe(0);
    });
});
