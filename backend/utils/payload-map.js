const path = require('path');
const mediaDir = path.join(__dirname, '..', 'media');

function mapMessagePayload(msg) {
    const { type, text } = msg;
    switch (type) {
        case 'text': {
            if (!text || !text.body) {
                throw new Error('For "text" type, "text.body" is required.');
            }
            return { text: text.body };
        }
        case 'image': {
            const img = msg.image;
            if (!img || (!img.link && !img.id)) {
                throw new Error('For "image" type, "image.link" or "image.id" is required.');
            }
            const imageUrl = img.id ? path.join(mediaDir, img.id) : img.link;
            return { image: { url: imageUrl }, caption: img.caption };
        }
        case 'document': {
            const doc = msg.document;
            if (!doc || (!doc.link && !doc.id)) {
                throw new Error('For "document" type, "document.link" or "document.id" is required.');
            }
            const docUrl = doc.id ? path.join(mediaDir, doc.id) : doc.link;
            return {
                document: { url: docUrl },
                mimetype: doc.mimetype,
                fileName: doc.filename,
                caption: doc.caption
            };
        }
        case 'video': {
            const vid = msg.video;
            if (!vid || (!vid.link && !vid.id)) {
                throw new Error('For "video" type, "video.link" or "video.id" is required.');
            }
            const videoUrl = vid.id ? path.join(mediaDir, vid.id) : vid.link;
            return {
                video: { url: videoUrl },
                caption: vid.caption,
                gifPlayback: vid.gifPlayback || false
            };
        }
        case 'audio': {
            const aud = msg.audio;
            if (!aud || (!aud.link && !aud.id)) {
                throw new Error('For "audio" type, "audio.link" or "audio.id" is required.');
            }
            const audioUrl = aud.id ? path.join(mediaDir, aud.id) : aud.link;
            return {
                audio: { url: audioUrl },
                mimetype: aud.mimetype || 'audio/mp4',
                ptt: aud.ptt || false
            };
        }
        case 'sticker': {
            const stk = msg.sticker;
            if (!stk || (!stk.link && !stk.id)) {
                throw new Error('For "sticker" type, "sticker.link" or "sticker.id" is required.');
            }
            const stickerUrl = stk.id ? path.join(mediaDir, stk.id) : stk.link;
            return {
                sticker: { url: stickerUrl }
            };
        }
        case 'location': {
            const loc = msg.location;
            if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
                throw new Error('For "location" type, "location.latitude" and "location.longitude" (numbers) are required.');
            }
            return {
                location: {
                    degreesLatitude: loc.latitude,
                    degreesLongitude: loc.longitude,
                    name: loc.name || '',
                    address: loc.address || ''
                }
            };
        }
        case 'contact': {
            const cnt = msg.contact;
            if (!cnt || !cnt.name || !cnt.phone) {
                throw new Error('For "contact" type, "contact.name" and "contact.phone" are required.');
            }
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${cnt.name}\nTEL;type=CELL;type=VOICE;waid=${cnt.phone.replace(/\D/g, '')}:${cnt.phone}\nEND:VCARD`;
            return {
                contacts: {
                    displayName: cnt.name,
                    contacts: [{
                        vcard: vcard
                    }]
                }
            };
        }
        case 'contacts': {
            const cnts = msg.contacts;
            if (!cnts || !Array.isArray(cnts) || cnts.length === 0) {
                throw new Error('For "contacts" type, "contacts" array with at least one contact is required.');
            }
            const vcards = cnts.map(c => ({
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nTEL;type=CELL;type=VOICE;waid=${c.phone.replace(/\D/g, '')}:${c.phone}\nEND:VCARD`
            }));
            return {
                contacts: {
                    displayName: cnts.length > 1 ? `${cnts.length} contacts` : cnts[0].name,
                    contacts: vcards
                }
            };
        }
        case 'reaction': {
            const react = msg.reaction;
            if (!react || !react.messageId || !react.emoji) {
                throw new Error('For "reaction" type, "reaction.messageId" and "reaction.emoji" are required.');
            }
            return {
                react: {
                    text: react.emoji,
                    key: {
                        remoteJid: msg.to,
                        id: react.messageId,
                        fromMe: react.fromMe || false
                    }
                }
            };
        }
        case 'poll': {
            const poll = msg.poll;
            if (!poll || !poll.name || !poll.options || !Array.isArray(poll.options) || poll.options.length < 2) {
                throw new Error('For "poll" type, "poll.name" and "poll.options" (array with at least 2 options) are required.');
            }
            return {
                poll: {
                    name: poll.name,
                    values: poll.options,
                    selectableCount: poll.selectableCount || 1
                }
            };
        }
        case 'button': {
            const btn = msg.button;
            if (!btn || !btn.text || !btn.buttons || !Array.isArray(btn.buttons)) {
                throw new Error('For "button" type, "button.text" and "button.buttons" array are required.');
            }
            return {
                text: btn.text,
                footer: btn.footer || '',
                buttons: btn.buttons.map((b, i) => ({
                    buttonId: b.id || `btn_${i}`,
                    buttonText: { displayText: b.text },
                    type: 1
                })),
                headerType: 1
            };
        }
        case 'list': {
            const lst = msg.list;
            if (!lst || !lst.text || !lst.buttonText || !lst.sections || !Array.isArray(lst.sections)) {
                throw new Error('For "list" type, "list.text", "list.buttonText", and "list.sections" array are required.');
            }
            return {
                text: lst.text,
                footer: lst.footer || '',
                title: lst.title || '',
                buttonText: lst.buttonText,
                sections: lst.sections.map(section => ({
                    title: section.title || '',
                    rows: (section.rows || []).map((row, i) => ({
                        rowId: row.id || `row_${i}`,
                        title: row.title,
                        description: row.description || ''
                    }))
                }))
            };
        }
        case 'template': {
            const tpl = msg.template;
            if (!tpl || !tpl.text || !tpl.buttons || !Array.isArray(tpl.buttons)) {
                throw new Error('For "template" type, "template.text" and "template.buttons" array are required.');
            }
            const templateButtons = tpl.buttons.map((b, i) => {
                if (b.type === 'url') {
                    return {
                        index: i + 1,
                        urlButton: {
                            displayText: b.text,
                            url: b.url
                        }
                    };
                } else if (b.type === 'call') {
                    return {
                        index: i + 1,
                        callButton: {
                            displayText: b.text,
                            phoneNumber: b.phone
                        }
                    };
                }
                return {
                    index: i + 1,
                    quickReplyButton: {
                        displayText: b.text,
                        id: b.id || `quick_${i}`
                    }
                };
            });
            return {
                text: tpl.text,
                footer: tpl.footer || '',
                templateButtons: templateButtons
            };
        }
        default:
            throw new Error(`Unsupported message type: ${type}`);
    }
}

module.exports = { mapMessagePayload };
