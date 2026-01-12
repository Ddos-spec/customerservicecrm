package models

import (
	"database/sql"
	"time"
)

// Role constants
const (
	RoleSuperAdmin = "super_admin"
	RoleAdminAgent = "admin_agent"
	RoleAgent      = "agent"
)

// Status constants
const (
	StatusActive    = "active"
	StatusSuspended = "suspended"
)

// User represents a user in the system
type User struct {
	ID              int64          `json:"id"`
	TenantID        sql.NullInt64  `json:"-"`
	TenantIDValue   *int64         `json:"tenant_id"`
	Name            string         `json:"name"`
	Email           string         `json:"email"`
	PasswordHash    string         `json:"-"`
	Role            string         `json:"role"`
	Status          string         `json:"status"`
	CreatedAt       time.Time      `json:"created_at"`
	TenantName      sql.NullString `json:"-"`
	TenantNameValue *string        `json:"tenant_name,omitempty"`
	TenantSessionID sql.NullString `json:"-"`
	SessionIDValue  *string        `json:"tenant_session_id,omitempty"`
}

// ToJSON prepares user for JSON serialization
func (u *User) ToJSON() map[string]interface{} {
	result := map[string]interface{}{
		"id":         u.ID,
		"name":       u.Name,
		"email":      u.Email,
		"role":       u.Role,
		"status":     u.Status,
		"created_at": u.CreatedAt,
	}

	if u.TenantID.Valid {
		result["tenant_id"] = u.TenantID.Int64
	}
	if u.TenantName.Valid {
		result["tenant_name"] = u.TenantName.String
	}
	if u.TenantSessionID.Valid {
		result["tenant_session_id"] = u.TenantSessionID.String
	}

	return result
}

// SessionUser represents user data stored in session
type SessionUser struct {
	ID              int64   `json:"id"`
	TenantID        *int64  `json:"tenant_id,omitempty"`
	Name            string  `json:"name"`
	Email           string  `json:"email"`
	Role            string  `json:"role"`
	TenantName      *string `json:"tenant_name,omitempty"`
	TenantSessionID *string `json:"tenant_session_id,omitempty"`
}

// FromUser creates a SessionUser from User
func (s *SessionUser) FromUser(u *User) {
	s.ID = u.ID
	s.Name = u.Name
	s.Email = u.Email
	s.Role = u.Role

	if u.TenantID.Valid {
		s.TenantID = &u.TenantID.Int64
	}
	if u.TenantName.Valid {
		s.TenantName = &u.TenantName.String
	}
	if u.TenantSessionID.Valid {
		s.TenantSessionID = &u.TenantSessionID.String
	}
}

// IsSuperAdmin checks if user is super admin
func (s *SessionUser) IsSuperAdmin() bool {
	return s.Role == RoleSuperAdmin
}

// IsAdminAgent checks if user is admin agent
func (s *SessionUser) IsAdminAgent() bool {
	return s.Role == RoleAdminAgent
}

// HasRole checks if user has one of the specified roles
func (s *SessionUser) HasRole(roles ...string) bool {
	for _, r := range roles {
		if s.Role == r {
			return true
		}
	}
	return false
}

// UserInvite represents an invitation for a new user
type UserInvite struct {
	ID         int64          `json:"id"`
	TenantID   int64          `json:"tenant_id"`
	Name       string         `json:"name"`
	Email      string         `json:"email"`
	Role       string         `json:"role"`
	Token      string         `json:"token,omitempty"`
	Status     string         `json:"status"`
	CreatedBy  sql.NullInt64  `json:"-"`
	CreatedAt  time.Time      `json:"created_at"`
	ExpiresAt  sql.NullTime   `json:"-"`
	TenantName sql.NullString `json:"-"`
}

// IsExpired checks if the invite has expired
func (i *UserInvite) IsExpired() bool {
	if !i.ExpiresAt.Valid {
		return false
	}
	return time.Now().After(i.ExpiresAt.Time)
}

// ToPublicJSON returns invite data safe for public display
func (i *UserInvite) ToPublicJSON() map[string]interface{} {
	result := map[string]interface{}{
		"name":  i.Name,
		"email": i.Email,
	}
	if i.TenantName.Valid {
		result["tenant_name"] = i.TenantName.String
	}
	if i.ExpiresAt.Valid {
		result["expires_at"] = i.ExpiresAt.Time
	}
	return result
}
