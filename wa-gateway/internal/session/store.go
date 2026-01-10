package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"customerservicecrm/wa-gateway/internal/models"
	"customerservicecrm/wa-gateway/pkg/log"
	pkgRedis "customerservicecrm/wa-gateway/pkg/redis"
)

const (
	sessionPrefix = "session:"
	sessionTTL    = 24 * time.Hour
)

// Store handles session management with Redis
type Store struct {
	client *redis.Client
}

// NewStore creates a new session store
func NewStore() *Store {
	return &Store{
		client: pkgRedis.GetClient(),
	}
}

// GenerateSessionID generates a new random session ID
func GenerateSessionID() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// Create creates a new session for a user
func (s *Store) Create(ctx context.Context, user *models.SessionUser) (string, error) {
	sessionID, err := GenerateSessionID()
	if err != nil {
		return "", fmt.Errorf("failed to generate session ID: %w", err)
	}

	data, err := json.Marshal(user)
	if err != nil {
		return "", fmt.Errorf("failed to marshal session data: %w", err)
	}

	key := sessionPrefix + sessionID
	if err := s.client.Set(ctx, key, data, sessionTTL).Err(); err != nil {
		return "", fmt.Errorf("failed to store session: %w", err)
	}

	log.Print(nil).Debugf("Session created: %s for user %s", sessionID[:16], user.Email)
	return sessionID, nil
}

// Get retrieves a session by ID
func (s *Store) Get(ctx context.Context, sessionID string) (*models.SessionUser, error) {
	if sessionID == "" {
		return nil, nil
	}

	key := sessionPrefix + sessionID
	data, err := s.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	user := &models.SessionUser{}
	if err := json.Unmarshal(data, user); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session data: %w", err)
	}

	// Extend session TTL on access
	s.client.Expire(ctx, key, sessionTTL)

	return user, nil
}

// Update updates an existing session
func (s *Store) Update(ctx context.Context, sessionID string, user *models.SessionUser) error {
	if sessionID == "" {
		return fmt.Errorf("session ID is required")
	}

	data, err := json.Marshal(user)
	if err != nil {
		return fmt.Errorf("failed to marshal session data: %w", err)
	}

	key := sessionPrefix + sessionID
	if err := s.client.Set(ctx, key, data, sessionTTL).Err(); err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

// Delete deletes a session
func (s *Store) Delete(ctx context.Context, sessionID string) error {
	if sessionID == "" {
		return nil
	}

	key := sessionPrefix + sessionID
	if err := s.client.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}

	log.Print(nil).Debugf("Session deleted: %s", sessionID[:16])
	return nil
}

// Exists checks if a session exists
func (s *Store) Exists(ctx context.Context, sessionID string) (bool, error) {
	if sessionID == "" {
		return false, nil
	}

	key := sessionPrefix + sessionID
	result, err := s.client.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("failed to check session: %w", err)
	}

	return result > 0, nil
}

// Refresh extends the session TTL
func (s *Store) Refresh(ctx context.Context, sessionID string) error {
	if sessionID == "" {
		return nil
	}

	key := sessionPrefix + sessionID
	if err := s.client.Expire(ctx, key, sessionTTL).Err(); err != nil {
		return fmt.Errorf("failed to refresh session: %w", err)
	}

	return nil
}

// DeleteAllForUser deletes all sessions for a user (for logout everywhere)
func (s *Store) DeleteAllForUser(ctx context.Context, userID int64) error {
	// This would require maintaining a user -> sessions mapping
	// For simplicity, we'll skip this for now
	// In production, you might want to add a user_sessions set in Redis
	return nil
}

// Global session store instance
var DefaultStore *Store

// Init initializes the global session store
func Init() {
	DefaultStore = NewStore()
	log.Print(nil).Info("Session store initialized")
}

// GetStore returns the global session store
func GetStore() *Store {
	if DefaultStore == nil {
		Init()
	}
	return DefaultStore
}
