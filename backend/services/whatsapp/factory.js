const WhatsmeowDriver = require('./drivers/whatsmeow');
const MetaCloudDriver = require('./drivers/meta');

/**
 * WhatsApp Provider Factory
 * Creates the appropriate driver based on tenant configuration.
 */
class ProviderFactory {
    /**
     * Get a provider instance for a tenant
     * @param {Object} tenant - Tenant object from DB
     * @returns {import('./provider')} Provider instance
     */
    static getProvider(tenant) {
        if (!tenant) {
            throw new Error('Tenant is required to create provider');
        }

        const providerType = tenant.wa_provider || 'whatsmeow';

        switch (providerType) {
            case 'meta':
                // Check requirements
                if (!tenant.meta_phone_id || !tenant.meta_token) {
                    throw new Error(`Tenant ${tenant.company_name} is missing Meta API credentials`);
                }
                return new MetaCloudDriver({
                    phoneId: tenant.meta_phone_id,
                    token: tenant.meta_token,
                    version: 'v18.0' // Can be configurable later
                });

            case 'whatsmeow':
            default:
                // Check requirements
                if (!tenant.session_id) {
                    throw new Error(`Tenant ${tenant.company_name} has no WhatsApp Session ID`);
                }
                return new WhatsmeowDriver({
                    sessionId: tenant.session_id
                });
        }
    }
}

module.exports = ProviderFactory;
