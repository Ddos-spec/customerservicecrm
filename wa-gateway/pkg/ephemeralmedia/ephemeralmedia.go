package ephemeralmedia

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"mime"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/protobuf/proto"

	"go.mau.fi/whatsmeow"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"

	"customerservicecrm/wa-gateway/pkg/env"
	pkgRedis "customerservicecrm/wa-gateway/pkg/redis"
)

const (
	defaultTTL        = 15 * time.Minute
	redisKeyPrefix    = "wa:media:ephemeral"
	tokenBytesLength  = 18
	defaultBaseName   = "media"
)

type MediaReferenceMeta struct {
	Token     string `json:"token"`
	SessionID string `json:"sessionId"`
	MessageID string `json:"messageId,omitempty"`
	MediaType string `json:"mediaType"`
	MimeType  string `json:"mimeType,omitempty"`
	Filename  string `json:"filename,omitempty"`
	CreatedAt int64  `json:"createdAt"`
	ExpiresAt int64  `json:"expiresAt"`
}

var cacheTTL = loadTTL()

func loadTTL() time.Duration {
	seconds, err := env.GetEnvInt("EPHEMERAL_MEDIA_TTL_SECONDS")
	if err != nil || seconds <= 0 {
		return defaultTTL
	}
	return time.Duration(seconds) * time.Second
}

func metadataKey(token string) string {
	return fmt.Sprintf("%s:%s:meta", redisKeyPrefix, token)
}

func payloadKey(token string) string {
	return fmt.Sprintf("%s:%s:payload", redisKeyPrefix, token)
}

func generateToken() (string, error) {
	buf := make([]byte, tokenBytesLength)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func CreateFilename(mediaType, mimeType, messageID, provided string) string {
	if trimmed := strings.TrimSpace(provided); trimmed != "" {
		return trimmed
	}

	ext := ""
	if mimeType != "" {
		extensions, _ := mime.ExtensionsByType(mimeType)
		if len(extensions) > 0 {
			ext = extensions[0]
		}
	}

	if ext == "" && mimeType != "" {
		if guessed, ok := fallbackExtension(mimeType); ok {
			ext = guessed
		}
	}

	base := strings.TrimSpace(messageID)
	if base == "" {
		base = defaultBaseName
	}
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if mediaType != "" {
		base = fmt.Sprintf("%s-%s", mediaType, base)
	}

	return base + ext
}

func fallbackExtension(mimeType string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/jpeg", "image/jpg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/webp":
		return ".webp", true
	case "image/gif":
		return ".gif", true
	case "video/mp4":
		return ".mp4", true
	case "audio/ogg":
		return ".ogg", true
	case "audio/mpeg":
		return ".mp3", true
	case "audio/mp4":
		return ".m4a", true
	case "application/pdf":
		return ".pdf", true
	default:
		return "", false
	}
}

func StoreReference(ctx context.Context, sessionID, messageID, mediaType, mimeType, filename string, payload proto.Message) (*MediaReferenceMeta, error) {
	if payload == nil {
		return nil, fmt.Errorf("media payload is required")
	}

	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("failed to generate media token: %w", err)
	}

	serialized, err := proto.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize media payload: %w", err)
	}

	now := time.Now()
	meta := &MediaReferenceMeta{
		Token:     token,
		SessionID: sessionID,
		MessageID: messageID,
		MediaType: mediaType,
		MimeType:  strings.TrimSpace(mimeType),
		Filename:  CreateFilename(mediaType, mimeType, messageID, filename),
		CreatedAt: now.Unix(),
		ExpiresAt: now.Add(cacheTTL).Unix(),
	}

	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize media metadata: %w", err)
	}

	client := pkgRedis.GetClient()
	if err := client.Set(ctx, metadataKey(token), metaBytes, cacheTTL).Err(); err != nil {
		return nil, fmt.Errorf("failed to store media metadata: %w", err)
	}
	if err := client.Set(ctx, payloadKey(token), serialized, cacheTTL).Err(); err != nil {
		_ = client.Del(ctx, metadataKey(token)).Err()
		return nil, fmt.Errorf("failed to store media reference payload: %w", err)
	}

	return meta, nil
}

func LoadReference(ctx context.Context, token string) (*MediaReferenceMeta, []byte, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil, fmt.Errorf("media token is required")
	}

	client := pkgRedis.GetClient()
	metaJSON, err := client.Get(ctx, metadataKey(token)).Bytes()
	if err != nil {
		return nil, nil, err
	}

	payload, err := client.Get(ctx, payloadKey(token)).Bytes()
	if err != nil {
		return nil, nil, err
	}

	var meta MediaReferenceMeta
	if err := json.Unmarshal(metaJSON, &meta); err != nil {
		return nil, nil, fmt.Errorf("failed to decode media metadata: %w", err)
	}

	return &meta, payload, nil
}

func BuildDownloadableMessage(mediaType string, payload []byte) (whatsmeow.DownloadableMessage, error) {
	switch strings.ToLower(strings.TrimSpace(mediaType)) {
	case "image":
		msg := &waE2E.ImageMessage{}
		if err := proto.Unmarshal(payload, msg); err != nil {
			return nil, fmt.Errorf("failed to decode image reference: %w", err)
		}
		return msg, nil
	case "video":
		msg := &waE2E.VideoMessage{}
		if err := proto.Unmarshal(payload, msg); err != nil {
			return nil, fmt.Errorf("failed to decode video reference: %w", err)
		}
		return msg, nil
	case "audio":
		msg := &waE2E.AudioMessage{}
		if err := proto.Unmarshal(payload, msg); err != nil {
			return nil, fmt.Errorf("failed to decode audio reference: %w", err)
		}
		return msg, nil
	case "document":
		msg := &waE2E.DocumentMessage{}
		if err := proto.Unmarshal(payload, msg); err != nil {
			return nil, fmt.Errorf("failed to decode document reference: %w", err)
		}
		return msg, nil
	case "sticker":
		msg := &waE2E.StickerMessage{}
		if err := proto.Unmarshal(payload, msg); err != nil {
			return nil, fmt.Errorf("failed to decode sticker reference: %w", err)
		}
		return msg, nil
	default:
		return nil, fmt.Errorf("unsupported media type: %s", mediaType)
	}
}
