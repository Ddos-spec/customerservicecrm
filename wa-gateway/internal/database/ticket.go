package database

import (
	"context"
	"database/sql"

	"customerservicecrm/wa-gateway/internal/models"
)

// GetOrCreateTicket gets an existing open ticket or creates a new one
func GetOrCreateTicket(ctx context.Context, tenantID int64, customerName, customerContact string) (*models.Ticket, error) {
	// First try to find existing open ticket
	query := `
		SELECT id, tenant_id, customer_name, customer_contact, status,
		       assigned_agent_id, internal_notes, created_at, updated_at
		FROM tickets
		WHERE tenant_id = $1 AND customer_contact = $2 AND status IN ('open', 'pending')
		ORDER BY created_at DESC
		LIMIT 1`

	ticket := &models.Ticket{}
	err := DB.QueryRowContext(ctx, query, tenantID, customerContact).Scan(
		&ticket.ID, &ticket.TenantID, &ticket.CustomerName, &ticket.CustomerContact,
		&ticket.Status, &ticket.AssignedAgentID, &ticket.InternalNotes,
		&ticket.CreatedAt, &ticket.UpdatedAt,
	)

	if err == nil {
		return ticket, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	// Create new ticket
	createQuery := `
		INSERT INTO tickets (tenant_id, customer_name, customer_contact, status)
		VALUES ($1, $2, $3, 'open')
		RETURNING id, tenant_id, customer_name, customer_contact, status,
		          assigned_agent_id, internal_notes, created_at, updated_at`

	err = DB.QueryRowContext(ctx, createQuery, tenantID, customerName, customerContact).Scan(
		&ticket.ID, &ticket.TenantID, &ticket.CustomerName, &ticket.CustomerContact,
		&ticket.Status, &ticket.AssignedAgentID, &ticket.InternalNotes,
		&ticket.CreatedAt, &ticket.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return ticket, nil
}

// GetTicketsByTenant returns tickets for a tenant with pagination
func GetTicketsByTenant(ctx context.Context, tenantID int64, limit, offset int) ([]*models.Ticket, error) {
	query := `
		SELECT t.id, t.tenant_id, t.customer_name, t.customer_contact, t.status,
		       t.assigned_agent_id, t.internal_notes, t.created_at, t.updated_at,
		       u.name as agent_name,
		       (SELECT message_text FROM messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1),
		       (SELECT sender_type FROM messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1),
		       (SELECT created_at FROM messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1),
		       (SELECT COUNT(*) FROM messages WHERE ticket_id = t.id)
		FROM tickets t
		LEFT JOIN users u ON t.assigned_agent_id = u.id
		WHERE t.tenant_id = $1
		ORDER BY t.updated_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := DB.QueryContext(ctx, query, tenantID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []*models.Ticket
	for rows.Next() {
		ticket := &models.Ticket{}
		if err := rows.Scan(
			&ticket.ID, &ticket.TenantID, &ticket.CustomerName, &ticket.CustomerContact,
			&ticket.Status, &ticket.AssignedAgentID, &ticket.InternalNotes,
			&ticket.CreatedAt, &ticket.UpdatedAt, &ticket.AgentName,
			&ticket.LastMessage, &ticket.LastSenderType, &ticket.LastMessageAt,
			&ticket.MessageCount,
		); err != nil {
			return nil, err
		}
		tickets = append(tickets, ticket)
	}

	return tickets, rows.Err()
}

// GetTicketByID returns a ticket by ID
func GetTicketByID(ctx context.Context, ticketID int64) (*models.Ticket, error) {
	query := `
		SELECT id, tenant_id, customer_name, customer_contact, status,
		       assigned_agent_id, internal_notes, created_at, updated_at
		FROM tickets
		WHERE id = $1`

	ticket := &models.Ticket{}
	err := DB.QueryRowContext(ctx, query, ticketID).Scan(
		&ticket.ID, &ticket.TenantID, &ticket.CustomerName, &ticket.CustomerContact,
		&ticket.Status, &ticket.AssignedAgentID, &ticket.InternalNotes,
		&ticket.CreatedAt, &ticket.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return ticket, nil
}

// UpdateTicketStatus updates ticket status
func UpdateTicketStatus(ctx context.Context, ticketID int64, status string) (*models.Ticket, error) {
	query := `
		UPDATE tickets
		SET status = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
		RETURNING id, tenant_id, customer_name, customer_contact, status,
		          assigned_agent_id, internal_notes, created_at, updated_at`

	ticket := &models.Ticket{}
	err := DB.QueryRowContext(ctx, query, status, ticketID).Scan(
		&ticket.ID, &ticket.TenantID, &ticket.CustomerName, &ticket.CustomerContact,
		&ticket.Status, &ticket.AssignedAgentID, &ticket.InternalNotes,
		&ticket.CreatedAt, &ticket.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return ticket, nil
}

// AssignTicketToAgent assigns a ticket to an agent
func AssignTicketToAgent(ctx context.Context, ticketID, agentID int64) (*models.Ticket, error) {
	query := `
		UPDATE tickets
		SET assigned_agent_id = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
		RETURNING id, tenant_id, customer_name, customer_contact, status,
		          assigned_agent_id, internal_notes, created_at, updated_at`

	ticket := &models.Ticket{}
	err := DB.QueryRowContext(ctx, query, agentID, ticketID).Scan(
		&ticket.ID, &ticket.TenantID, &ticket.CustomerName, &ticket.CustomerContact,
		&ticket.Status, &ticket.AssignedAgentID, &ticket.InternalNotes,
		&ticket.CreatedAt, &ticket.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return ticket, nil
}

// LogMessage logs a message to a ticket
func LogMessage(ctx context.Context, ticketID int64, senderType, messageText string, fileURL *string) (*models.Message, error) {
	query := `
		INSERT INTO messages (ticket_id, sender_type, message_text, file_url)
		VALUES ($1, $2, $3, $4)
		RETURNING id, ticket_id, sender_type, message_text, file_url, created_at`

	msg := &models.Message{}
	err := DB.QueryRowContext(ctx, query, ticketID, senderType, messageText, fileURL).Scan(
		&msg.ID, &msg.TicketID, &msg.SenderType, &msg.MessageText, &msg.FileURL, &msg.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	// Update ticket updated_at
	DB.ExecContext(ctx, "UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", ticketID)

	return msg, nil
}

// GetMessagesByTicket returns all messages for a ticket
func GetMessagesByTicket(ctx context.Context, ticketID int64) ([]*models.Message, error) {
	query := `
		SELECT id, ticket_id, sender_type, message_text, file_url, created_at
		FROM messages
		WHERE ticket_id = $1
		ORDER BY created_at ASC`

	rows, err := DB.QueryContext(ctx, query, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*models.Message
	for rows.Next() {
		msg := &models.Message{}
		if err := rows.Scan(
			&msg.ID, &msg.TicketID, &msg.SenderType, &msg.MessageText, &msg.FileURL, &msg.CreatedAt,
		); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	return messages, rows.Err()
}

// EscalateTicket escalates a ticket with reason
func EscalateTicket(ctx context.Context, ticketID int64, reason string) (*models.Ticket, error) {
	query := `
		UPDATE tickets
		SET status = 'escalated',
		    internal_notes = COALESCE(internal_notes, '') || E'\n[ESCALATED ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || '] ' || $1,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
		RETURNING id, tenant_id, customer_name, customer_contact, status,
		          assigned_agent_id, internal_notes, created_at, updated_at`

	ticket := &models.Ticket{}
	err := DB.QueryRowContext(ctx, query, reason, ticketID).Scan(
		&ticket.ID, &ticket.TenantID, &ticket.CustomerName, &ticket.CustomerContact,
		&ticket.Status, &ticket.AssignedAgentID, &ticket.InternalNotes,
		&ticket.CreatedAt, &ticket.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return ticket, nil
}
