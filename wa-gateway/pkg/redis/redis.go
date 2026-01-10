package redis

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"customerservicecrm/wa-gateway/pkg/env"
	"customerservicecrm/wa-gateway/pkg/log"
)

var (
	Client *redis.Client
	once   sync.Once
)

// Init initializes the Redis client
func Init() {
	once.Do(func() {
		redisURL, err := env.GetEnvString("REDIS_URL")
		if err != nil {
			redisURL = "redis://localhost:6379"
		}

		opts, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Print(nil).Fatalf("Failed to parse Redis URL: %v", err)
		}

		Client = redis.NewClient(opts)

		// Test connection
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := Client.Ping(ctx).Err(); err != nil {
			log.Print(nil).Fatalf("Failed to connect to Redis: %v", err)
		}

		log.Print(nil).Info("Redis connected successfully")
	})
}

// GetClient returns the Redis client
func GetClient() *redis.Client {
	if Client == nil {
		Init()
	}
	return Client
}

// Close closes the Redis connection
func Close() error {
	if Client != nil {
		return Client.Close()
	}
	return nil
}

// Set stores a value in Redis with optional expiration
func Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	return Client.Set(ctx, key, value, expiration).Err()
}

// Get retrieves a value from Redis
func Get(ctx context.Context, key string) (string, error) {
	return Client.Get(ctx, key).Result()
}

// Del deletes a key from Redis
func Del(ctx context.Context, keys ...string) error {
	return Client.Del(ctx, keys...).Err()
}

// Exists checks if a key exists in Redis
func Exists(ctx context.Context, keys ...string) (int64, error) {
	return Client.Exists(ctx, keys...).Result()
}

// SetJSON stores a JSON-serializable value in Redis
func SetJSON(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	return Client.Set(ctx, key, value, expiration).Err()
}

// LPush pushes values to the left of a list
func LPush(ctx context.Context, key string, values ...interface{}) error {
	return Client.LPush(ctx, key, values...).Err()
}

// RPop pops a value from the right of a list
func RPop(ctx context.Context, key string) (string, error) {
	return Client.RPop(ctx, key).Result()
}

// LLen returns the length of a list
func LLen(ctx context.Context, key string) (int64, error) {
	return Client.LLen(ctx, key).Result()
}
