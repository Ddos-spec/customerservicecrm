package models

import (
	"database/sql"
	"time"
)

// Tenant represents a tenant (company) in the system
type Tenant struct {
	ID          int64          `json:"id"`
	CompanyName string         `json:"company_name"`
	Status      string         `json:"status"`
	SessionID   sql.NullString `json:"-"`
	CreatedAt   time.Time      `json:"created_at"`
	UserCount   int            `json:"user_count,omitempty"`
}

// ToJSON prepares tenant for JSON serialization
func (t *Tenant) ToJSON() map[string]interface{} {
	result := map[string]interface{}{
		"id":           t.ID,
		"company_name": t.CompanyName,
		"status":       t.Status,
		"created_at":   t.CreatedAt,
	}

	if t.SessionID.Valid {
		result["session_id"] = t.SessionID.String
	} else {
		result["session_id"] = nil
	}

	if t.UserCount > 0 {
		result["user_count"] = t.UserCount
	}

	return result
}

// GetSessionID returns session ID as pointer
func (t *Tenant) GetSessionID() *string {
	if t.SessionID.Valid {
		return &t.SessionID.String
	}
	return nil
}

// TenantWebhook represents a webhook configured for a tenant
type TenantWebhook struct {
	ID        int64     `json:"id"`
	TenantID  int64     `json:"tenant_id"`
	URL       string    `json:"url"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateTenantRequest represents request to create a tenant
type CreateTenantRequest struct {
	CompanyName   string `json:"company_name" validate:"required"`
	AdminName     string `json:"admin_name" validate:"required"`
	AdminEmail    string `json:"admin_email" validate:"required,email"`
	AdminPassword string `json:"admin_password" validate:"required,min=6"`
	SessionID     string `json:"session_id"`
}

// UpdateTenantStatusRequest represents request to update tenant status
type UpdateTenantStatusRequest struct {
	Status string `json:"status" validate:"required,oneof=active suspended"`
}

// UpdateTenantSessionRequest represents request to update tenant session
type UpdateTenantSessionRequest struct {
	SessionID string `json:"session_id"`
}
