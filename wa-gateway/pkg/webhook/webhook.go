package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"customerservicecrm/wa-gateway/pkg/env"
	"customerservicecrm/wa-gateway/pkg/log"
	pkgRedis "customerservicecrm/wa-gateway/pkg/redis"
)

const (
	webhookQueueKey     = "wa:webhook:queue"
	webhookFailedKey    = "wa:webhook:failed"
	maxRetries          = 3
	retryDelay          = 5 * time.Second
	webhookTimeout      = 10 * time.Second
	processingInterval  = 100 * time.Millisecond
)

var (
	webhookURL     string
	httpClient     *http.Client
	processorOnce  sync.Once
	stopChan       chan struct{}
)

// WebhookPayload represents the structure of webhook data
type WebhookPayload struct {
	Event     string                 `json:"event"`
	SessionID string                 `json:"sessionId"`
	Timestamp int64                  `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
}

// MessagePayload represents an incoming WhatsApp message
type MessagePayload struct {
	ID            string                 `json:"id"`
	From          string                 `json:"from"`
	To            string                 `json:"to"`
	Type          string                 `json:"type"`
	Body          string                 `json:"body,omitempty"`
	Caption       string                 `json:"caption,omitempty"`
	MediaURL      string                 `json:"mediaUrl,omitempty"`
	MediaMimeType string                 `json:"mediaMimeType,omitempty"`
	IsGroup       bool                   `json:"isGroup"`
	IsFromMe      bool                   `json:"isFromMe"`
	PushName      string                 `json:"pushName,omitempty"`
	GroupName     string                 `json:"groupName,omitempty"`
	Timestamp     int64                  `json:"timestamp"`
	QuotedMessage map[string]interface{} `json:"quotedMessage,omitempty"`
	Raw           map[string]interface{} `json:"raw,omitempty"`
}

// QueuedWebhook represents a webhook in the queue
type QueuedWebhook struct {
	Payload   WebhookPayload `json:"payload"`
	Retries   int            `json:"retries"`
	CreatedAt int64          `json:"createdAt"`
}

// Init initializes the webhook system
func Init() {
	var err error
	webhookURL, err = env.GetEnvString("WEBHOOK_URL")
	if err != nil {
		webhookURL = "http://localhost:3000/api/v1/webhook/incoming"
		log.Print(nil).Warnf("WEBHOOK_URL not set, using default: %s", webhookURL)
	}

	httpClient = &http.Client{
		Timeout: webhookTimeout,
	}

	// Start background processor
	StartProcessor()

	log.Print(nil).Infof("Webhook system initialized, target: %s", webhookURL)
}

// SetWebhookURL allows dynamic webhook URL configuration
func SetWebhookURL(url string) {
	webhookURL = url
}

// GetWebhookURL returns the current webhook URL
func GetWebhookURL() string {
	return webhookURL
}

// Queue adds a webhook payload to the processing queue
func Queue(payload WebhookPayload) error {
	queued := QueuedWebhook{
		Payload:   payload,
		Retries:   0,
		CreatedAt: time.Now().Unix(),
	}

	data, err := json.Marshal(queued)
	if err != nil {
		return fmt.Errorf("failed to marshal webhook payload: %w", err)
	}

	ctx := context.Background()
	if err := pkgRedis.LPush(ctx, webhookQueueKey, string(data)); err != nil {
		return fmt.Errorf("failed to queue webhook: %w", err)
	}

	log.Print(nil).Debugf("Webhook queued: %s for session %s", payload.Event, payload.SessionID)
	return nil
}

// QueueMessage is a convenience function for queueing message events
func QueueMessage(sessionID string, msg MessagePayload) error {
	payload := WebhookPayload{
		Event:     "message",
		SessionID: sessionID,
		Timestamp: time.Now().Unix(),
		Data: map[string]interface{}{
			"message": msg,
		},
	}
	return Queue(payload)
}

// QueueEvent queues a generic event
func QueueEvent(sessionID string, event string, data map[string]interface{}) error {
	payload := WebhookPayload{
		Event:     event,
		SessionID: sessionID,
		Timestamp: time.Now().Unix(),
		Data:      data,
	}
	return Queue(payload)
}

// StartProcessor starts the background webhook processor
func StartProcessor() {
	processorOnce.Do(func() {
		stopChan = make(chan struct{})
		go processQueue()
		log.Print(nil).Info("Webhook processor started")
	})
}

// StopProcessor stops the background webhook processor
func StopProcessor() {
	if stopChan != nil {
		close(stopChan)
	}
}

// processQueue continuously processes webhooks from the queue
func processQueue() {
	ticker := time.NewTicker(processingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-stopChan:
			log.Print(nil).Info("Webhook processor stopped")
			return
		case <-ticker.C:
			processNextWebhook()
		}
	}
}

// processNextWebhook processes a single webhook from the queue
func processNextWebhook() {
	ctx := context.Background()

	// Pop from queue
	data, err := pkgRedis.RPop(ctx, webhookQueueKey)
	if err == redis.Nil {
		return // Queue is empty
	}
	if err != nil {
		log.Print(nil).Errorf("Failed to pop from webhook queue: %v", err)
		return
	}

	var queued QueuedWebhook
	if err := json.Unmarshal([]byte(data), &queued); err != nil {
		log.Print(nil).Errorf("Failed to unmarshal queued webhook: %v", err)
		return
	}

	// Try to deliver
	if err := deliver(queued.Payload); err != nil {
		log.Print(nil).Warnf("[WEBHOOK] Delivery failed for %s (session: %s): %v",
			queued.Payload.Event, queued.Payload.SessionID, err)

		// Retry logic
		queued.Retries++
		if queued.Retries < maxRetries {
			// Re-queue for retry
			retryData, _ := json.Marshal(queued)
			time.AfterFunc(retryDelay, func() {
				pkgRedis.LPush(context.Background(), webhookQueueKey, string(retryData))
			})
			log.Print(nil).Infof("[WEBHOOK] Retry scheduled %d/%d for %s (session: %s)",
				queued.Retries, maxRetries, queued.Payload.Event, queued.Payload.SessionID)
		} else {
			// Move to failed queue
			failedData, _ := json.Marshal(queued)
			pkgRedis.LPush(ctx, webhookFailedKey, string(failedData))
			log.Print(nil).Errorf("[WEBHOOK] FAILED after %d retries: %s (session: %s)",
				maxRetries, queued.Payload.Event, queued.Payload.SessionID)
		}
	} else {
		log.Print(nil).Infof("[WEBHOOK] Delivered: %s | session: %s", queued.Payload.Event, queued.Payload.SessionID)
	}
}

// deliver sends the webhook payload to the configured URL
func deliver(payload WebhookPayload) error {
	if webhookURL == "" {
		return fmt.Errorf("webhook URL not configured")
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", webhookURL, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Source", "wa-gateway")
	req.Header.Set("X-Session-ID", payload.SessionID)

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

// GetQueueLength returns the number of pending webhooks
func GetQueueLength() (int64, error) {
	return pkgRedis.LLen(context.Background(), webhookQueueKey)
}

// GetFailedCount returns the number of failed webhooks
func GetFailedCount() (int64, error) {
	return pkgRedis.LLen(context.Background(), webhookFailedKey)
}

// RetryFailed moves all failed webhooks back to the main queue
func RetryFailed() (int64, error) {
	ctx := context.Background()
	var count int64

	for {
		data, err := pkgRedis.RPop(ctx, webhookFailedKey)
		if err == redis.Nil {
			break
		}
		if err != nil {
			return count, err
		}

		// Reset retry count
		var queued QueuedWebhook
		if err := json.Unmarshal([]byte(data), &queued); err != nil {
			continue
		}
		queued.Retries = 0
		retryData, _ := json.Marshal(queued)

		if err := pkgRedis.LPush(ctx, webhookQueueKey, string(retryData)); err != nil {
			return count, err
		}
		count++
	}

	return count, nil
}
