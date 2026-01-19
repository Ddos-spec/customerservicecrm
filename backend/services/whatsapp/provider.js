/**
 * Abstract WhatsApp Provider
 * Defines the standard interface for all WhatsApp drivers (Whatsmeow, Meta, etc.)
 */
class WhatsAppProvider {
    constructor(config) {
        this.config = config;
    }

    /**
     * Send a text message
     * @param {string} to - Recipient JID/Phone
     * @param {string} text - Message body
     * @returns {Promise<{messageId: string}>}
     */
    async sendText(to, text) {
        throw new Error('Method sendText() must be implemented');
    }

    /**
     * Send an image
     * @param {string} to - Recipient
     * @param {Buffer|string} image - Image data/url
     * @param {string} caption - Caption
     * @returns {Promise<{messageId: string}>}
     */
    async sendImage(to, image, caption) {
        throw new Error('Method sendImage() must be implemented');
    }

    // Add other methods as needed (sendDocument, etc.)

    /**
     * Check if a number is registered
     * @param {string} phone
     * @returns {Promise<{exists: boolean, jid: string}>}
     */
    async checkNumber(phone) {
        throw new Error('Method checkNumber() must be implemented');
    }

    /**
     * Get profile picture URL
     * @param {string} jid
     * @returns {Promise<string|null>}
     */
    async getProfilePicture(jid) {
        throw new Error('Method getProfilePicture() must be implemented');
    }
}

module.exports = WhatsAppProvider;
