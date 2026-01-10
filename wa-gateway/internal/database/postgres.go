package database

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	_ "github.com/lib/pq"

	"customerservicecrm/wa-gateway/pkg/env"
	"customerservicecrm/wa-gateway/pkg/log"
)

var (
	DB   *sql.DB
	once sync.Once
)

// Init initializes the PostgreSQL database connection
func Init() error {
	var initErr error
	once.Do(func() {
		dbURL, err := env.GetEnvString("DATABASE_URL")
		if err != nil {
			initErr = fmt.Errorf("DATABASE_URL not set: %w", err)
			return
		}

		db, err := sql.Open("postgres", dbURL)
		if err != nil {
			initErr = fmt.Errorf("failed to open database: %w", err)
			return
		}

		// Connection pool settings
		db.SetMaxOpenConns(25)
		db.SetMaxIdleConns(10)
		db.SetConnMaxLifetime(5 * time.Minute)
		db.SetConnMaxIdleTime(1 * time.Minute)

		// Test connection
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := db.PingContext(ctx); err != nil {
			initErr = fmt.Errorf("failed to ping database: %w", err)
			return
		}

		DB = db
		log.Print(nil).Info("PostgreSQL connected successfully")
	})
	return initErr
}

// GetDB returns the database connection
func GetDB() *sql.DB {
	if DB == nil {
		Init()
	}
	return DB
}

// Close closes the database connection
func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}

// Transaction executes a function within a transaction
func Transaction(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("failed to rollback: %v (original error: %w)", rbErr, err)
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// EnsureSchema ensures required tables and columns exist
func EnsureSchema(ctx context.Context) error {
	queries := []string{
		// Tenants table
		`CREATE TABLE IF NOT EXISTS tenants (
			id SERIAL PRIMARY KEY,
			company_name TEXT NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			session_id TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS tenants_session_id_idx ON tenants (session_id) WHERE session_id IS NOT NULL`,

		// Users table
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role VARCHAR(20) NOT NULL DEFAULT 'agent',
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users (tenant_id)`,
		`CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)`,

		// User invites table
		`CREATE TABLE IF NOT EXISTS user_invites (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			role VARCHAR(20) NOT NULL DEFAULT 'agent',
			token TEXT NOT NULL UNIQUE,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			expires_at TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS user_invites_tenant_id_idx ON user_invites (tenant_id)`,
		`CREATE INDEX IF NOT EXISTS user_invites_token_idx ON user_invites (token)`,

		// Tenant webhooks table
		`CREATE TABLE IF NOT EXISTS tenant_webhooks (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			url TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS tenant_webhooks_tenant_url_idx ON tenant_webhooks (tenant_id, url)`,

		// Tickets table
		`CREATE TABLE IF NOT EXISTS tickets (
			id SERIAL PRIMARY KEY,
			tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			customer_name TEXT NOT NULL,
			customer_contact TEXT NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'open',
			assigned_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
			internal_notes TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS tickets_tenant_id_idx ON tickets (tenant_id)`,
		`CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status)`,
		`CREATE INDEX IF NOT EXISTS tickets_customer_contact_idx ON tickets (customer_contact)`,

		// Messages table
		`CREATE TABLE IF NOT EXISTS messages (
			id SERIAL PRIMARY KEY,
			ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
			sender_type VARCHAR(20) NOT NULL,
			message_text TEXT,
			file_url TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS messages_ticket_id_idx ON messages (ticket_id)`,
	}

	for _, q := range queries {
		if _, err := DB.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("failed to execute schema query: %w", err)
		}
	}

	log.Print(nil).Info("Database schema ensured")
	return nil
}
