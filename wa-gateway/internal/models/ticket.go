package models

import (
	"database/sql"
	"time"
)

// Ticket status constants
const (
	TicketStatusOpen      = "open"
	TicketStatusPending   = "pending"
	TicketStatusEscalated = "escalated"
	TicketStatusClosed    = "closed"
)

// Ticket represents a support ticket
type Ticket struct {
	ID              int64          `json:"id"`
	TenantID        int64          `json:"tenant_id"`
	CustomerName    string         `json:"customer_name"`
	CustomerContact string         `json:"customer_contact"`
	Status          string         `json:"status"`
	AssignedAgentID sql.NullInt64  `json:"-"`
	InternalNotes   sql.NullString `json:"-"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`

	// Joined fields
	AgentName          sql.NullString `json:"-"`
	LastMessage        sql.NullString `json:"-"`
	LastSenderType     sql.NullString `json:"-"`
	LastMessageAt      sql.NullTime   `json:"-"`
	MessageCount       int            `json:"message_count,omitempty"`
}

// ToJSON prepares ticket for JSON serialization
func (t *Ticket) ToJSON() map[string]interface{} {
	result := map[string]interface{}{
		"id":               t.ID,
		"tenant_id":        t.TenantID,
		"customer_name":    t.CustomerName,
		"customer_contact": t.CustomerContact,
		"status":           t.Status,
		"created_at":       t.CreatedAt,
		"updated_at":       t.UpdatedAt,
	}

	if t.AssignedAgentID.Valid {
		result["assigned_agent_id"] = t.AssignedAgentID.Int64
	}
	if t.AgentName.Valid {
		result["agent_name"] = t.AgentName.String
	}
	if t.InternalNotes.Valid {
		result["internal_notes"] = t.InternalNotes.String
	}
	if t.LastMessage.Valid {
		result["last_message"] = t.LastMessage.String
	}
	if t.LastSenderType.Valid {
		result["last_sender_type"] = t.LastSenderType.String
	}
	if t.LastMessageAt.Valid {
		result["last_message_at"] = t.LastMessageAt.Time
	}
	if t.MessageCount > 0 {
		result["message_count"] = t.MessageCount
	}

	return result
}

// Message represents a chat message in a ticket
type Message struct {
	ID          int64          `json:"id"`
	TicketID    int64          `json:"ticket_id"`
	SenderType  string         `json:"sender_type"` // "customer" or "agent"
	MessageText sql.NullString `json:"-"`
	FileURL     sql.NullString `json:"-"`
	CreatedAt   time.Time      `json:"created_at"`
}

// ToJSON prepares message for JSON serialization
func (m *Message) ToJSON() map[string]interface{} {
	result := map[string]interface{}{
		"id":          m.ID,
		"ticket_id":   m.TicketID,
		"sender_type": m.SenderType,
		"created_at":  m.CreatedAt,
	}

	if m.MessageText.Valid {
		result["message_text"] = m.MessageText.String
	}
	if m.FileURL.Valid {
		result["file_url"] = m.FileURL.String
	}

	return result
}

// CreateMessageRequest represents request to create a message
type CreateMessageRequest struct {
	MessageText string `json:"message_text" validate:"required"`
}

// TicketStats represents ticket statistics
type TicketStats struct {
	OpenTickets      int `json:"open_tickets"`
	PendingTickets   int `json:"pending_tickets"`
	EscalatedTickets int `json:"escalated_tickets"`
	ClosedTickets    int `json:"closed_tickets"`
	TotalTickets     int `json:"total_tickets"`
	TodayTickets     int `json:"today_tickets,omitempty"`
	AvgResponseMins  *float64 `json:"avg_response_minutes,omitempty"`
}

// UserStats represents user statistics
type UserStats struct {
	AdminCount int `json:"admin_count"`
	AgentCount int `json:"agent_count"`
	TotalUsers int `json:"total_users"`
}

// DashboardStats represents combined dashboard statistics
type DashboardStats struct {
	Tickets TicketStats `json:"tickets"`
	Users   UserStats   `json:"users"`
}

// SuperAdminStats represents system-wide statistics
type SuperAdminStats struct {
	Tenants struct {
		Total  int `json:"total"`
		Active int `json:"active"`
	} `json:"tenants"`
	Users struct {
		Total int `json:"total"`
	} `json:"users"`
	Tickets struct {
		Total int `json:"total"`
		Open  int `json:"open"`
	} `json:"tickets"`
}
