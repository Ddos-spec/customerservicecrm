package database

import (
	"context"
	"fmt"
)

// WhatsmeowContact represents a contact from whatsmeow_contacts table
type WhatsmeowContact struct {
	OurJID       string  `json:"our_jid"`
	TheirJID     string  `json:"jid"` // Map to JID for consistency with existing API
	FirstName    *string `json:"first_name"`
	FullName     *string `json:"full_name"`
	PushName     *string `json:"push_name"`
	BusinessName *string `json:"business_name"`
}

// GetContactsFromDB queries whatsmeow_contacts table directly
// sessionId should be in format "62xxx" (without the :xx@s.whatsapp.net suffix)
func GetContactsFromDB(ctx context.Context, sessionId string) ([]WhatsmeowContact, error) {
	if DB == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// Query contacts where our_jid starts with the session ID
	// our_jid format: "6289660152525:74@s.whatsapp.net"
	// sessionId format: "6289660152525"
	query := `
		SELECT
			our_jid,
			their_jid,
			first_name,
			full_name,
			push_name,
			business_name
		FROM whatsmeow_contacts
		WHERE our_jid LIKE $1
		ORDER BY
			CASE WHEN full_name IS NOT NULL AND full_name != '' THEN 0 ELSE 1 END,
			COALESCE(full_name, first_name, push_name, their_jid)
	`

	// Match sessionId at the start of our_jid (before the colon)
	pattern := sessionId + ":%"

	rows, err := DB.QueryContext(ctx, query, pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to query contacts: %w", err)
	}
	defer rows.Close()

	var contacts []WhatsmeowContact
	for rows.Next() {
		var c WhatsmeowContact
		if err := rows.Scan(
			&c.OurJID,
			&c.TheirJID,
			&c.FirstName,
			&c.FullName,
			&c.PushName,
			&c.BusinessName,
		); err != nil {
			return nil, fmt.Errorf("failed to scan contact: %w", err)
		}
		contacts = append(contacts, c)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating contacts: %w", err)
	}

	return contacts, nil
}

// CountContactsFromDB counts contacts for a session
func CountContactsFromDB(ctx context.Context, sessionId string) (int, error) {
	if DB == nil {
		return 0, fmt.Errorf("database not initialized")
	}

	query := `SELECT COUNT(*) FROM whatsmeow_contacts WHERE our_jid LIKE $1`
	pattern := sessionId + ":%"

	var count int
	err := DB.QueryRowContext(ctx, query, pattern).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count contacts: %w", err)
	}

	return count, nil
}
