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
	"google.golang.org/protobuf/proto"

	"customerservicecrm/wa-gateway/pkg/ephemeralmedia"
	"customerservicecrm/wa-gateway/pkg/log"
	"customerservicecrm/wa-gateway/pkg/webhook"
)

const groupNameCacheTTL = 10 * time.Minute
const statusBroadcastJID = "status@broadcast"
const restoredMessageStartupWindow = 10 * time.Minute
const restoredMessageGracePeriod = 2 * time.Minute

type groupNameCacheEntry struct {
	name      string
	fetchedAt time.Time
}

type SessionStats struct {
	SessionID            string `json:"sessionId"`
	TotalMessages        uint64 `json:"totalMessages"`
	PrivateMessages      uint64 `json:"privateMessages"`
	GroupMessages        uint64 `json:"groupMessages"`
	OutgoingMessages     uint64 `json:"outgoingMessages"`
	LastMessageAt        int64  `json:"lastMessageAt"`
	LastPrivateMessageAt int64  `json:"lastPrivateMessageAt"`
	LastGroupMessageAt   int64  `json:"lastGroupMessageAt"`
	LastFrom             string `json:"lastFrom,omitempty"`
	LastTo               string `json:"lastTo,omitempty"`
	LastType             string `json:"lastType,omitempty"`
	LastPushName         string `json:"lastPushName,omitempty"`
}

var (
	statsMu      sync.RWMutex
	sessionStats = make(map[string]*SessionStats)
)

// Handler handles WhatsApp events and forwards them to webhooks
type Handler struct {
	sessionID        string
	client           *whatsmeow.Client
	startedAt        time.Time
	groupNameCache   map[string]groupNameCacheEntry
	groupNameCacheMu sync.RWMutex
}

// NewHandler creates a new event handler for a WhatsApp session
func NewHandler(sessionID string, client *whatsmeow.Client) *Handler {
	return &Handler{
		sessionID:      sessionID,
		client:         client,
		startedAt:      time.Now(),
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

	fromJID, toJID := h.resolveMessageParties(evt)
	isGroup := isRealGroupJID(evt.Info.Chat)
	isBroadcast := isBroadcastJID(evt.Info.Chat)
	if h.isLikelyRestoredMessage(evt.Info.Timestamp) {
		log.Print(nil).Debugf("[MESSAGE] Ignored restored old message %s | chat: %s | messageAt: %s | session: %s",
			evt.Info.ID, evt.Info.Chat.String(), evt.Info.Timestamp.Format(time.RFC3339), h.sessionID)
		return
	}

	// Build message payload
	msg := webhook.MessagePayload{
		ID:        evt.Info.ID,
		From:      fromJID,
		To:        toJID,
		IsGroup:   isGroup,
		IsFromMe:  evt.Info.IsFromMe,
		PushName:  evt.Info.PushName,
		Timestamp: evt.Info.Timestamp.Unix(),
		Raw: map[string]interface{}{
			"chat":        evt.Info.Chat.String(),
			"sender":      evt.Info.Sender.String(),
			"isGroup":     evt.Info.IsGroup,
			"isBroadcast": isBroadcast,
		},
	}

	if msg.IsGroup {
		if groupName := h.getGroupName(evt.Info.Chat); groupName != "" {
			msg.GroupName = groupName
		}
	}

	// Determine message type and extract content
	h.extractMessageContent(evt.Message, &msg)
	h.attachEphemeralMediaReference(evt.Message, evt.Info.ID, &msg)

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
	} else if isBroadcast {
		chatType = "broadcast"
	}
	log.Print(nil).Infof("[%s] [%s] %s | from: %s | type: %s | session: %s",
		direction, chatType, msg.PushName, msg.From, msg.Type, h.sessionID)

	if isBroadcast {
		log.Print(nil).Debugf("[MESSAGE] Ignored broadcast/status event %s | chat: %s | session: %s",
			msg.ID, evt.Info.Chat.String(), h.sessionID)
		return
	}

	recordMessageStats(h.sessionID, msg)

	// Queue webhook
	if err := webhook.QueueMessage(h.sessionID, msg); err != nil {
		log.Print(nil).Errorf("[MESSAGE] Failed to queue webhook: %v", err)
	}
}

func (h *Handler) resolveMessageParties(evt *events.Message) (from string, to string) {
	chat := evt.Info.Chat.String()
	sender := evt.Info.Sender.String()
	ownJID := h.ownJID()

	if isRealGroupJID(evt.Info.Chat) {
		if sender == "" {
			sender = chat
		}
		return sender, chat
	}

	if evt.Info.IsFromMe {
		return ownJID, chat
	}

	if sender != "" {
		from = sender
	} else {
		from = chat
	}
	to = ownJID
	return from, to
}

func isRealGroupJID(jid types.JID) bool {
	return strings.HasSuffix(jid.String(), "@g.us")
}

func isBroadcastJID(jid types.JID) bool {
	raw := jid.String()
	return raw == statusBroadcastJID || strings.HasSuffix(raw, "@broadcast")
}

func (h *Handler) isLikelyRestoredMessage(messageAt time.Time) bool {
	if messageAt.IsZero() {
		return false
	}
	if time.Since(h.startedAt) > restoredMessageStartupWindow {
		return false
	}
	return messageAt.Before(h.startedAt.Add(-restoredMessageGracePeriod))
}

func (h *Handler) ownJID() string {
	if h.client == nil || h.client.Store == nil || h.client.Store.ID == nil {
		return h.sessionID + "@s.whatsapp.net"
	}
	return h.client.Store.ID.String()
}

func recordMessageStats(sessionID string, msg webhook.MessagePayload) {
	statsMu.Lock()
	defer statsMu.Unlock()

	current, ok := sessionStats[sessionID]
	if !ok {
		current = &SessionStats{SessionID: sessionID}
		sessionStats[sessionID] = current
	}

	now := time.Now().Unix()
	current.TotalMessages++
	current.LastMessageAt = now
	current.LastFrom = msg.From
	current.LastTo = msg.To
	current.LastType = msg.Type
	current.LastPushName = msg.PushName

	if msg.IsFromMe {
		current.OutgoingMessages++
	}
	if msg.IsGroup {
		current.GroupMessages++
		current.LastGroupMessageAt = now
	} else {
		current.PrivateMessages++
		current.LastPrivateMessageAt = now
	}
}

func GetSessionStats(sessionID string) *SessionStats {
	statsMu.RLock()
	defer statsMu.RUnlock()

	current, ok := sessionStats[sessionID]
	if !ok {
		return &SessionStats{SessionID: sessionID}
	}
	copy := *current
	return &copy
}

func GetAllSessionStats() []SessionStats {
	statsMu.RLock()
	defer statsMu.RUnlock()

	result := make([]SessionStats, 0, len(sessionStats))
	for _, current := range sessionStats {
		result = append(result, *current)
	}
	return result
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

func (h *Handler) attachEphemeralMediaReference(msg *waE2E.Message, messageID string, payload *webhook.MessagePayload) {
	mediaType, mimeType, filename, protoMessage := extractEphemeralMediaReference(msg)
	if protoMessage == nil || mediaType == "" {
		return
	}

	meta, err := ephemeralmedia.StoreReference(context.Background(), h.sessionID, messageID, mediaType, mimeType, filename, protoMessage)
	if err != nil {
		log.Print(nil).Warnf("[MEDIA] Failed to cache ephemeral media reference for %s (%s): %v", messageID, mediaType, err)
		return
	}

	payload.EphemeralMediaToken = meta.Token
	payload.EphemeralMediaExpiresAt = meta.ExpiresAt
	if payload.MediaMimeType == "" {
		payload.MediaMimeType = meta.MimeType
	}
}

func extractEphemeralMediaReference(msg *waE2E.Message) (mediaType, mimeType, filename string, payload proto.Message) {
	switch {
	case msg.GetImageMessage() != nil:
		image := msg.GetImageMessage()
		return "image", image.GetMimetype(), "", image
	case msg.GetVideoMessage() != nil:
		video := msg.GetVideoMessage()
		return "video", video.GetMimetype(), "", video
	case msg.GetAudioMessage() != nil:
		audio := msg.GetAudioMessage()
		return "audio", audio.GetMimetype(), "", audio
	case msg.GetDocumentMessage() != nil:
		document := msg.GetDocumentMessage()
		return "document", document.GetMimetype(), document.GetFileName(), document
	case msg.GetStickerMessage() != nil:
		sticker := msg.GetStickerMessage()
		return "sticker", sticker.GetMimetype(), "", sticker
	default:
		return "", "", "", nil
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
