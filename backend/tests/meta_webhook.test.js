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
                            wa_id: '628123456789'
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

        expect(result).not.toBeNull();
        expect(result.from).toBe('628123456789');
        expect(result.pushName).toBe('John Doe');
        expect(result.body).toBe('Hello World');
        expect(result.type).toBe('text');
        expect(result.metadata.phoneNumberId).toBe('100000000000001');
    });

    it('should return null for non-message events (e.g. status update)', () => {
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
        expect(result).toBeNull();
    });
});
