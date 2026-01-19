const { transformMetaMessage } = require('../services/whatsapp/transformer');

describe('Meta Webhook Transformer', () => {
    it('should transform text message correctly', () => {
        const payload = {
            object: 'whatsapp_business_account',
            entry: [{
                id: '123456789',
                changes: [{
                    value: {
                        messaging_product: 'whatsapp',
                        metadata: {
                            display_phone_number: '15550216888',
                            phone_number_id: '100000000000001'
                        },
                        contacts: [{
                            profile: { name: 'John Doe' },
                            wa_id: '628123456789' // Raw
                        }],
                        messages: [{
                            from: '628123456789',
                            id: 'wamid.HBgLM...',
                            timestamp: '1690000000',
                            text: { body: 'Hello World' },
                            type: 'text'
                        }]
                    },
                    field: 'messages'
                }]
            }]
        };

        const result = transformMetaMessage(payload);

        expect(result).toHaveLength(1);
        expect(result[0].from).toBe('628123456789');
        expect(result[0].pushName).toBe('John Doe'); // Check map lookup
        expect(result[0].body).toBe('Hello World');
    });

    it('should handle batch messages', () => {
        const payload = {
            entry: [{
                changes: [{
                    value: {
                        metadata: { phone_number_id: '101' },
                        messages: [
                            { from: '62811', id: '1', type: 'text', text: { body: 'Msg 1' }, timestamp: '1' },
                            { from: '62822', id: '2', type: 'text', text: { body: 'Msg 2' }, timestamp: '2' }
                        ]
                    },
                    field: 'messages'
                }]
            }]
        };

        const result = transformMetaMessage(payload);
        expect(result).toHaveLength(2);
        expect(result[0].from).toBe('62811');
        expect(result[1].from).toBe('62822');
    });

    it('should return empty array for non-message events', () => {
        const payload = {
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        statuses: [{ id: 'wamid...', status: 'delivered' }]
                    },
                    field: 'messages'
                }]
            }]
        };

        const result = transformMetaMessage(payload);
        expect(result).toEqual([]);
    });

    it('should use fallback text for media without caption', () => {
        const payload = {
            entry: [{
                changes: [{
                    value: {
                        messages: [{ 
                            from: '6281', id: '1', type: 'image', timestamp: '1',
                            image: { id: 'media-id' } // No caption
                        }]
                    },
                    field: 'messages'
                }]
            }]
        };
        const result = transformMetaMessage(payload);
        expect(result[0].body).toBe('[Image]');
        expect(result[0].media.id).toBe('media-id');
    });
});
