package events

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"

	"customerservicecrm/wa-gateway/pkg/log"
	"customerservicecrm/wa-gateway/pkg/webhook"
)

const groupNameCacheTTL = 10 * time.Minute

type groupNameCacheEntry struct {
	name      string
	fetchedAt time.Time
}

// Handler handles WhatsApp events and forwards them to webhooks
type Handler struct {
	sessionID string
	client    *whatsmeow.Client
	groupNameCache   map[string]groupNameCacheEntry
	groupNameCacheMu sync.RWMutex
}

// NewHandler creates a new event handler for a WhatsApp session
func NewHandler(sessionID string, client *whatsmeow.Client) *Handler {
	return &Handler{
		sessionID: sessionID,
		client:    client,
		groupNameCache: make(map[string]groupNameCacheEntry),
	}
}

// Register registers the event handler with the WhatsApp client
func (h *Handler) Register() {
	h.client.AddEventHandler(h.handleEvent)
	log.Print(nil).Infof("Event handler registered for session: %s", h.sessionID)
}

// handleEvent is the main event dispatcher
func (h *Handler) handleEvent(evt interface{}) {
	switch v := evt.(type) {
	case *events.Message:
		h.handleMessage(v)
	case *events.Receipt:
		h.handleReceipt(v)
	case *events.Presence:
		h.handlePresence(v)
	case *events.ChatPresence:
		h.handleChatPresence(v)
	case *events.Connected:
		h.handleConnected(v)
	case *events.Disconnected:
		h.handleDisconnected(v)
	case *events.LoggedOut:
		h.handleLoggedOut(v)
	case *events.HistorySync:
		h.handleHistorySync(v)
	case *events.PushName:
		h.handlePushName(v)
	}
}

// handleMessage handles incoming messages
func (h *Handler) handleMessage(evt *events.Message) {
	// Skip if message is empty
	if evt.Message == nil {
		return
	}

	// Build message payload
	msg := webhook.MessagePayload{
		ID:        evt.Info.ID,
		From:      evt.Info.Sender.String(),
		To:        evt.Info.Chat.String(),
		IsGroup:   evt.Info.IsGroup,
		IsFromMe:  evt.Info.IsFromMe,
		PushName:  evt.Info.PushName,
		Timestamp: evt.Info.Timestamp.Unix(),
	}

	if msg.IsGroup {
		if groupName := h.getGroupName(evt.Info.Chat); groupName != "" {
			msg.GroupName = groupName
		}
	}

	// Determine message type and extract content
	h.extractMessageContent(evt.Message, &msg)

	// Handle quoted message if exists
	if evt.Message.GetExtendedTextMessage() != nil {
		contextInfo := evt.Message.GetExtendedTextMessage().GetContextInfo()
		if contextInfo != nil && contextInfo.QuotedMessage != nil {
			msg.QuotedMessage = map[string]interface{}{
				"id":   contextInfo.GetStanzaID(),
				"from": contextInfo.GetParticipant(),
			}
		}
	}

	// Log incoming message
	direction := "INCOMING"
	if msg.IsFromMe {
		direction = "OUTGOING"
	}
	chatType := "private"
	if msg.IsGroup {
		chatType = "group"
	}
	log.Print(nil).Infof("[%s] [%s] %s | from: %s | type: %s | session: %s",
		direction, chatType, msg.PushName, msg.From, msg.Type, h.sessionID)

	// Queue webhook
	if err := webhook.QueueMessage(h.sessionID, msg); err != nil {
		log.Print(nil).Errorf("[MESSAGE] Failed to queue webhook: %v", err)
	}
}

func (h *Handler) getGroupName(jid types.JID) string {
	key := jid.String()

	h.groupNameCacheMu.RLock()
	entry, ok := h.groupNameCache[key]
	h.groupNameCacheMu.RUnlock()
	if ok && entry.name != "" && time.Since(entry.fetchedAt) < groupNameCacheTTL {
		return entry.name
	}

	info, err := h.client.GetGroupInfo(context.Background(), jid)
	if err != nil {
		log.Print(nil).Warnf("[GROUP] Failed to get group info for %s: %v", key, err)
		return ""
	}

	name := strings.TrimSpace(info.Name)
	if name == "" {
		return ""
	}

	h.groupNameCacheMu.Lock()
	h.groupNameCache[key] = groupNameCacheEntry{name: name, fetchedAt: time.Now()}
	h.groupNameCacheMu.Unlock()
	return name
}

// extractMessageContent extracts content from various message types
func (h *Handler) extractMessageContent(msg *waE2E.Message, payload *webhook.MessagePayload) {
	switch {
	case msg.GetConversation() != "":
		payload.Type = "text"
		payload.Body = msg.GetConversation()

	case msg.GetExtendedTextMessage() != nil:
		payload.Type = "text"
		payload.Body = msg.GetExtendedTextMessage().GetText()

	case msg.GetImageMessage() != nil:
		payload.Type = "image"
		payload.Caption = msg.GetImageMessage().GetCaption()
		payload.MediaMimeType = msg.GetImageMessage().GetMimetype()
		payload.MediaURL = msg.GetImageMessage().GetURL()

	case msg.GetVideoMessage() != nil:
		payload.Type = "video"
		payload.Caption = msg.GetVideoMessage().GetCaption()
		payload.MediaMimeType = msg.GetVideoMessage().GetMimetype()
		payload.MediaURL = msg.GetVideoMessage().GetURL()

	case msg.GetAudioMessage() != nil:
		payload.Type = "audio"
		payload.MediaMimeType = msg.GetAudioMessage().GetMimetype()
		payload.MediaURL = msg.GetAudioMessage().GetURL()

	case msg.GetDocumentMessage() != nil:
		payload.Type = "document"
		payload.Caption = msg.GetDocumentMessage().GetCaption()
		payload.MediaMimeType = msg.GetDocumentMessage().GetMimetype()
		payload.MediaURL = msg.GetDocumentMessage().GetURL()

	case msg.GetStickerMessage() != nil:
		payload.Type = "sticker"
		payload.MediaMimeType = msg.GetStickerMessage().GetMimetype()
		payload.MediaURL = msg.GetStickerMessage().GetURL()

	case msg.GetLocationMessage() != nil:
		payload.Type = "location"
		loc := msg.GetLocationMessage()
		payload.Body = fmt.Sprintf("%f,%f", loc.GetDegreesLatitude(), loc.GetDegreesLongitude())

	case msg.GetContactMessage() != nil:
		payload.Type = "contact"
		payload.Body = msg.GetContactMessage().GetVcard()

	case msg.GetReactionMessage() != nil:
		payload.Type = "reaction"
		payload.Body = msg.GetReactionMessage().GetText()

	case msg.GetPollCreationMessage() != nil:
		payload.Type = "poll"
		payload.Body = msg.GetPollCreationMessage().GetName()

	default:
		payload.Type = "unknown"
	}
}

// handleReceipt handles message receipts (read, delivered, etc.)
func (h *Handler) handleReceipt(evt *events.Receipt) {
	data := map[string]interface{}{
		"type":      string(evt.Type),
		"messageId": evt.MessageIDs,
		"from":      evt.Chat.String(),
		"timestamp": evt.Timestamp.Unix(),
	}

	log.Print(nil).Debugf("[RECEIPT] %s | chat: %s | session: %s", evt.Type, evt.Chat.String(), h.sessionID)

	if err := webhook.QueueEvent(h.sessionID, "receipt", data); err != nil {
		log.Print(nil).Errorf("[RECEIPT] Failed to queue webhook: %v", err)
	}
}

// handlePresence handles presence updates
func (h *Handler) handlePresence(evt *events.Presence) {
	data := map[string]interface{}{
		"from":      evt.From.String(),
		"available": evt.Unavailable == false,
		"lastSeen":  evt.LastSeen.Unix(),
	}

	if err := webhook.QueueEvent(h.sessionID, "presence", data); err != nil {
		log.Print(nil).Errorf("Failed to queue presence webhook: %v", err)
	}
}

// handleChatPresence handles typing indicators
func (h *Handler) handleChatPresence(evt *events.ChatPresence) {
	state := "paused"
	if evt.State == types.ChatPresenceComposing {
		state = "composing"
	}

	media := "text"
	if evt.Media == types.ChatPresenceMediaAudio {
		media = "audio"
	}

	data := map[string]interface{}{
		"chat":   evt.Chat.String(),
		"sender": evt.Sender.String(),
		"state":  state,
		"media":  media,
	}

	if err := webhook.QueueEvent(h.sessionID, "typing", data); err != nil {
		log.Print(nil).Errorf("Failed to queue typing webhook: %v", err)
	}
}

// handleConnected handles connection events
func (h *Handler) handleConnected(evt *events.Connected) {
	log.Print(nil).Infof("[CONNECTED] Session %s is now connected to WhatsApp", h.sessionID)

	data := map[string]interface{}{
		"status": "connected",
	}

	if err := webhook.QueueEvent(h.sessionID, "connection", data); err != nil {
		log.Print(nil).Errorf("[CONNECTED] Failed to queue webhook: %v", err)
	} else {
		log.Print(nil).Debugf("[CONNECTED] Webhook queued for session: %s", h.sessionID)
	}
}

// handleDisconnected handles disconnection events
func (h *Handler) handleDisconnected(evt *events.Disconnected) {
	log.Print(nil).Warnf("[DISCONNECTED] Session %s disconnected from WhatsApp", h.sessionID)

	data := map[string]interface{}{
		"status": "disconnected",
	}

	if err := webhook.QueueEvent(h.sessionID, "connection", data); err != nil {
		log.Print(nil).Errorf("[DISCONNECTED] Failed to queue webhook: %v", err)
	} else {
		log.Print(nil).Debugf("[DISCONNECTED] Webhook queued for session: %s", h.sessionID)
	}
}

// handleLoggedOut handles logout events
func (h *Handler) handleLoggedOut(evt *events.LoggedOut) {
	log.Print(nil).Warnf("[LOGGED_OUT] Session %s logged out | reason: %s", h.sessionID, evt.Reason.String())

	data := map[string]interface{}{
		"status": "logged_out",
		"reason": evt.Reason.String(),
	}

	if err := webhook.QueueEvent(h.sessionID, "connection", data); err != nil {
		log.Print(nil).Errorf("[LOGGED_OUT] Failed to queue webhook: %v", err)
	} else {
		log.Print(nil).Debugf("[LOGGED_OUT] Webhook queued for session: %s", h.sessionID)
	}
}

// handleHistorySync handles history sync events
func (h *Handler) handleHistorySync(evt *events.HistorySync) {
	syncType := evt.Data.GetSyncType().String()
	progress := evt.Data.GetProgress()

	log.Print(nil).Infof("[HISTORY_SYNC] Session %s | type: %s | progress: %d%%", h.sessionID, syncType, progress)

	data := map[string]interface{}{
		"type":     syncType,
		"progress": progress,
	}

	if err := webhook.QueueEvent(h.sessionID, "history_sync", data); err != nil {
		log.Print(nil).Errorf("[HISTORY_SYNC] Failed to queue webhook: %v", err)
	}
}

// handlePushName handles push name updates
func (h *Handler) handlePushName(evt *events.PushName) {
	log.Print(nil).Debugf("[PUSH_NAME] %s changed name: %s -> %s | session: %s",
		evt.JID.String(), evt.OldPushName, evt.NewPushName, h.sessionID)

	data := map[string]interface{}{
		"jid":      evt.JID.String(),
		"pushName": evt.NewPushName,
		"oldName":  evt.OldPushName,
	}

	if err := webhook.QueueEvent(h.sessionID, "push_name", data); err != nil {
		log.Print(nil).Errorf("[PUSH_NAME] Failed to queue webhook: %v", err)
	}
}

// DownloadMedia downloads media from a message
func (h *Handler) DownloadMedia(msg *waE2E.Message) ([]byte, error) {
	var downloadable whatsmeow.DownloadableMessage

	switch {
	case msg.GetImageMessage() != nil:
		downloadable = msg.GetImageMessage()
	case msg.GetVideoMessage() != nil:
		downloadable = msg.GetVideoMessage()
	case msg.GetAudioMessage() != nil:
		downloadable = msg.GetAudioMessage()
	case msg.GetDocumentMessage() != nil:
		downloadable = msg.GetDocumentMessage()
	case msg.GetStickerMessage() != nil:
		downloadable = msg.GetStickerMessage()
	default:
		return nil, fmt.Errorf("message type does not support media download")
	}

	data, err := h.client.Download(context.Background(), downloadable)
	if err != nil {
		return nil, fmt.Errorf("failed to download media: %w", err)
	}

	return data, nil
}
