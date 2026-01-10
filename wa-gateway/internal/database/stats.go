package database

import (
	"context"

	"customerservicecrm/wa-gateway/internal/models"
)

// GetDashboardStats returns dashboard statistics for a tenant
func GetDashboardStats(ctx context.Context, tenantID int64) (*models.DashboardStats, error) {
	stats := &models.DashboardStats{}

	// Ticket stats
	ticketQuery := `
		SELECT
			COUNT(*) FILTER (WHERE status = 'open') as open_tickets,
			COUNT(*) FILTER (WHERE status = 'pending') as pending_tickets,
			COUNT(*) FILTER (WHERE status = 'escalated') as escalated_tickets,
			COUNT(*) FILTER (WHERE status = 'closed') as closed_tickets,
			COUNT(*) as total_tickets
		FROM tickets
		WHERE tenant_id = $1`

	if err := DB.QueryRowContext(ctx, ticketQuery, tenantID).Scan(
		&stats.Tickets.OpenTickets,
		&stats.Tickets.PendingTickets,
		&stats.Tickets.EscalatedTickets,
		&stats.Tickets.ClosedTickets,
		&stats.Tickets.TotalTickets,
	); err != nil {
		return nil, err
	}

	// User stats
	userQuery := `
		SELECT
			COUNT(*) FILTER (WHERE role = 'admin_agent') as admin_count,
			COUNT(*) FILTER (WHERE role = 'agent') as agent_count,
			COUNT(*) as total_users
		FROM users
		WHERE tenant_id = $1`

	if err := DB.QueryRowContext(ctx, userQuery, tenantID).Scan(
		&stats.Users.AdminCount,
		&stats.Users.AgentCount,
		&stats.Users.TotalUsers,
	); err != nil {
		return nil, err
	}

	// Today's tickets
	todayQuery := `
		SELECT COUNT(*)
		FROM tickets
		WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`

	if err := DB.QueryRowContext(ctx, todayQuery, tenantID).Scan(&stats.Tickets.TodayTickets); err != nil {
		return nil, err
	}

	// Average response time
	avgQuery := `
		SELECT AVG(EXTRACT(EPOCH FROM (m.created_at - t.created_at)) / 60)
		FROM tickets t
		JOIN LATERAL (
			SELECT created_at
			FROM messages
			WHERE ticket_id = t.id AND sender_type = 'agent'
			ORDER BY created_at ASC
			LIMIT 1
		) m ON true
		WHERE t.tenant_id = $1`

	var avgMins *float64
	DB.QueryRowContext(ctx, avgQuery, tenantID).Scan(&avgMins)
	stats.Tickets.AvgResponseMins = avgMins

	return stats, nil
}

// GetSuperAdminStats returns system-wide statistics
func GetSuperAdminStats(ctx context.Context) (*models.SuperAdminStats, error) {
	stats := &models.SuperAdminStats{}

	// Tenant stats
	tenantQuery := `
		SELECT
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status = 'active') as active
		FROM tenants`

	if err := DB.QueryRowContext(ctx, tenantQuery).Scan(
		&stats.Tenants.Total,
		&stats.Tenants.Active,
	); err != nil {
		return nil, err
	}

	// User stats
	userQuery := `SELECT COUNT(*) FROM users`
	if err := DB.QueryRowContext(ctx, userQuery).Scan(&stats.Users.Total); err != nil {
		return nil, err
	}

	// Ticket stats
	ticketQuery := `
		SELECT
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status = 'open') as open
		FROM tickets`

	if err := DB.QueryRowContext(ctx, ticketQuery).Scan(
		&stats.Tickets.Total,
		&stats.Tickets.Open,
	); err != nil {
		return nil, err
	}

	return stats, nil
}

// CountTenantMessagesSince counts messages for a tenant within a time window
func CountTenantMessagesSince(ctx context.Context, tenantID int64, minutes int, senderType *string) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM messages m
		JOIN tickets t ON m.ticket_id = t.id
		WHERE t.tenant_id = $1
		  AND m.created_at >= NOW() - ($2 * INTERVAL '1 minute')`

	params := []interface{}{tenantID, minutes}

	if senderType != nil {
		query += " AND m.sender_type = $3"
		params = append(params, *senderType)
	}

	var count int
	err := DB.QueryRowContext(ctx, query, params...).Scan(&count)
	return count, err
}
