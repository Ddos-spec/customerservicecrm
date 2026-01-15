/**
 * WhatsApp Socket Compatibility Layer
 *
 * This module provides a Baileys-compatible interface that wraps
 * the Go WhatsApp Gateway client. This allows existing code that
 * expects session.sock to work without major refactoring.
 */

const waGateway = require('./wa-gateway-client');

/**
 * Create a compatible "socket" object for a session
 * @param {string} sessionId - The WhatsApp session ID
 * @returns {Object} A socket-like object with Baileys-compatible methods
 */
function createCompatSocket(sessionId) {
    return {
        sessionId,

        extractMessageId(response) {
            return response?.data?.msgid || response?.data?.message_id || response?.data?.id || 'unknown';
        },

        /**
         * Send a message (Baileys-compatible)
         * Maps to Go gateway endpoints based on message type
         */
        async sendMessage(jid, content, options = {}) {
            const phone = jid.includes('@') ? jid.split('@')[0] : jid;

            try {
                let result;

                // Link with preview
                if (content.linkPreview) {
                    const preview = content.linkPreview;
                    const url = preview.canonicalUrl || preview.url || preview.matchedText;
                    const caption = content.text || preview.title || '';
                    if (!url) {
                        throw new Error('URL untuk link preview tidak tersedia');
                    }
                    result = await waGateway.sendLink(sessionId, phone, url, caption);
                }
                // Text message
                else if (content.text || content.conversation) {
                    result = await waGateway.sendText(sessionId, phone, content.text || content.conversation);
                }
                // Image message
                else if (content.image) {
                    const imageData = content.image.url || content.image;
                    result = await waGateway.sendImage(sessionId, phone, imageData, content.caption || '', content.viewOnce || false);
                }
                // Video message
                else if (content.video) {
                    const videoData = content.video.url || content.video;
                    result = await waGateway.sendVideo(sessionId, phone, videoData, content.caption || '', content.viewOnce || false);
                }
                // Audio message
                else if (content.audio) {
                    const audioData = content.audio.url || content.audio;
                    result = await waGateway.sendAudio(sessionId, phone, audioData);
                }
                // Document message
                else if (content.document) {
                    const docData = content.document.url || content.document;
                    result = await waGateway.sendDocument(sessionId, phone, docData, content.fileName || 'document');
                }
                // Poll message
                else if (content.poll) {
                    const poll = content.poll;
                    result = await waGateway.sendPoll(sessionId, phone, poll.name || poll.title || '', poll.values || poll.options || [], poll.selectableCount > 1);
                }
                // Location message
                else if (content.location) {
                    result = await waGateway.sendLocation(
                        sessionId,
                        phone,
                        content.location.degreesLatitude,
                        content.location.degreesLongitude
                    );
                }
                // Contact message
                else if (content.contacts && content.contacts.contacts) {
                    const contact = content.contacts.contacts[0];
                    const vcard = contact.vcard || '';
                    // Extract name and phone from vcard
                    const nameMatch = vcard.match(/FN:(.+)/);
                    const phoneMatch = vcard.match(/TEL.*:(.+)/);
                    result = await waGateway.sendContact(
                        sessionId,
                        phone,
                        nameMatch ? nameMatch[1] : 'Contact',
                        phoneMatch ? phoneMatch[1].replace(/\D/g, '') : ''
                    );
                }
                // Delete message
                else if (content.delete && content.delete.id) {
                    result = await waGateway.deleteMessage(sessionId, phone, content.delete.id);
                }
                // Reaction
                else if (content.react && content.react.key?.id) {
                    result = await waGateway.reactToMessage(sessionId, phone, content.react.key.id, content.react.text);
                }
                // Edit message
                else if (content.edit && content.edit.id) {
                    result = await waGateway.editMessage(sessionId, phone, content.edit.id, content.edit.text);
                }
                // Sticker (if supported by your setup)
                else if (content.sticker) {
                    const stickerData = content.sticker.url || content.sticker;
                    result = await waGateway.sendSticker(sessionId, phone, stickerData);
                }
                else {
                    // Unknown message type, try to send as text
                    const textContent = JSON.stringify(content);
                    result = await waGateway.sendText(sessionId, phone, textContent);
                }

                // Return Baileys-compatible response
                const messageId = this.extractMessageId(result);
                return {
                    status: result?.status === false ? 0 : 1,
                    key: {
                        remoteJid: jid,
                        fromMe: true,
                        id: messageId
                    },
                    message: content
                };
            } catch (error) {
                throw new Error(`Failed to send message: ${error.message}`);
            }
        },

        /**
         * Send presence update (composing, paused, etc.)
         */
        async sendPresenceUpdate(type, jid) {
            // The Go gateway might not have a direct presence endpoint
            // This is a no-op for now, but could be implemented later
            // console.log(`[Compat] Presence update: ${type} for ${jid}`);
            return true;
        },

        /**
         * Check if numbers are on WhatsApp
         */
        async onWhatsApp(...jids) {
            const results = [];
            for (const jid of jids) {
                const phone = jid.replace(/[^0-9]/g, '');
                try {
                    const result = await waGateway.checkRegistered(sessionId, phone);
                    results.push({
                        jid: `${phone}@s.whatsapp.net`,
                        exists: result?.data?.registered || false
                    });
                } catch (error) {
                    results.push({
                        jid: `${phone}@s.whatsapp.net`,
                        exists: false
                    });
                }
            }
            return results;
        },

        /**
         * Get profile picture URL
         */
        async profilePictureUrl(jid, type = 'preview') {
            // Not directly supported - return null
            return null;
        },

        /**
         * Update profile name
         */
        async updateProfileName(name) {
            // Not directly supported
            throw new Error('Profile update not supported via gateway');
        },

        /**
         * Update profile status
         */
        async updateProfileStatus(status) {
            // Not directly supported
            throw new Error('Status update not supported via gateway');
        },

        /**
         * Chat modify (archive, mute, pin, etc.)
         */
        async chatModify(modification, jid) {
            // Not directly supported - return success
            console.log(`[Compat] Chat modify: ${JSON.stringify(modification)} for ${jid}`);
            return true;
        },

        /**
         * Get joined groups
         */
        async groupFetchAllParticipating() {
            try {
                const result = await waGateway.getGroups(sessionId);
                // Transform to Baileys format
                const groups = {};
                const rawGroups = Array.isArray(result?.data)
                    ? result.data
                    : Array.isArray(result?.data?.groups)
                        ? result.data.groups
                        : [];

                for (const group of rawGroups) {
                    const id = group.id || group.ID || group.jid || group.JID || group.jidString || group?.JID?.user;
                    if (!id) continue;
                    groups[id] = {
                        id,
                        subject: group.subject || group.name || group.topic || `Group ${id}`,
                        participants: group.participants || group.Participants || []
                    };
                }
                return groups;
            } catch (error) {
                return {};
            }
        },

        /**
         * Get group metadata
         */
        async groupMetadata(jid) {
            // Not directly supported - return minimal info
            return {
                id: jid,
                subject: 'Group',
                participants: []
            };
        },

        /**
         * Accept group invite
         */
        async groupAcceptInvite(codeOrLink) {
            const link = codeOrLink.includes('chat.whatsapp.com/')
                ? codeOrLink
                : `https://chat.whatsapp.com/${codeOrLink}`;
            const result = await waGateway.joinGroup(sessionId, link);
            return result?.data || null;
        },

        /**
         * Leave group
         */
        async groupLeave(jid) {
            const groupId = jid.split('@')[0];
            return await waGateway.leaveGroup(sessionId, groupId);
        },

        /**
         * Logout
         */
        async logout() {
            return await waGateway.logout(sessionId);
        },

        /**
         * End connection (disconnect WebSocket)
         */
        end() {
            // No-op for gateway
            return true;
        },

        /**
         * Event emitter placeholder
         */
        ev: {
            on: () => {},
            off: () => {},
            removeAllListeners: () => {}
        },

        /**
         * WebSocket placeholder
         */
        ws: {
            close: () => {}
        }
    };
}

/**
 * Enhance a session object with a compatible socket
 * @param {Object} session - The session object
 * @param {string} sessionId - The session ID
 * @returns {Object} Session with sock property
 */
function enhanceSession(session, sessionId) {
    if (!session.sock) {
        session.sock = createCompatSocket(sessionId);
    }
    return session;
}

module.exports = {
    createCompatSocket,
    enhanceSession
};
