function createReplyBatcher({ delayMs = 8000, maxItems = 10, onFlush, onError } = {}) {
    if (typeof onFlush !== 'function') {
        throw new Error('onFlush callback is required');
    }

    const pending = new Map();

    function cancel(key) {
        const current = pending.get(key);
        if (!current) return false;
        clearTimeout(current.timer);
        pending.delete(key);
        return true;
    }

    function schedule(key, item) {
        const existing = pending.get(key);
        if (existing) clearTimeout(existing.timer);

        const items = [...(existing?.items || []), item].slice(-maxItems);
        const batch = { items, timer: null };
        batch.timer = setTimeout(async () => {
            if (pending.get(key) !== batch) return;
            pending.delete(key);
            try {
                await onFlush(key, items);
            } catch (error) {
                if (typeof onError === 'function') onError(error, key, items);
            }
        }, delayMs);
        batch.timer.unref?.();
        pending.set(key, batch);
        return items.length;
    }

    function clear() {
        for (const batch of pending.values()) clearTimeout(batch.timer);
        pending.clear();
    }

    return {
        schedule,
        cancel,
        clear,
        pendingCount: () => pending.size,
    };
}

module.exports = { createReplyBatcher };
