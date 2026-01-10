package database

import (
	"context"
	"database/sql"
	"time"

	"customerservicecrm/wa-gateway/internal/models"
)

// CreateUserInvite creates a new user invite
func CreateUserInvite(ctx context.Context, tenantID int64, name, email, role, token string, createdBy *int64, expiresAt *time.Time) (*models.UserInvite, error) {
	query := `
		INSERT INTO user_invites (tenant_id, name, email, role, token, created_by, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, tenant_id, name, email, role, token, status, created_at, expires_at`

	invite := &models.UserInvite{}
	err := DB.QueryRowContext(ctx, query, tenantID, name, email, role, token, createdBy, expiresAt).Scan(
		&invite.ID, &invite.TenantID, &invite.Name, &invite.Email,
		&invite.Role, &invite.Token, &invite.Status, &invite.CreatedAt, &invite.ExpiresAt,
	)

	if err != nil {
		return nil, err
	}

	return invite, nil
}

// GetInviteByToken returns an invite by token
func GetInviteByToken(ctx context.Context, token string) (*models.UserInvite, error) {
	query := `
		SELECT i.id, i.tenant_id, i.name, i.email, i.role, i.token, i.status,
		       i.created_by, i.created_at, i.expires_at, t.company_name
		FROM user_invites i
		LEFT JOIN tenants t ON i.tenant_id = t.id
		WHERE i.token = $1`

	invite := &models.UserInvite{}
	err := DB.QueryRowContext(ctx, query, token).Scan(
		&invite.ID, &invite.TenantID, &invite.Name, &invite.Email,
		&invite.Role, &invite.Token, &invite.Status, &invite.CreatedBy,
		&invite.CreatedAt, &invite.ExpiresAt, &invite.TenantName,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return invite, nil
}

// AcceptInvite marks an invite as accepted
func AcceptInvite(ctx context.Context, token string) (*models.UserInvite, error) {
	query := `
		UPDATE user_invites SET status = 'accepted'
		WHERE token = $1
		RETURNING id, tenant_id, name, email, role, token, status, created_at, expires_at`

	invite := &models.UserInvite{}
	err := DB.QueryRowContext(ctx, query, token).Scan(
		&invite.ID, &invite.TenantID, &invite.Name, &invite.Email,
		&invite.Role, &invite.Token, &invite.Status, &invite.CreatedAt, &invite.ExpiresAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return invite, nil
}

// CountPendingInvites counts pending invites for a tenant
func CountPendingInvites(ctx context.Context, tenantID int64) (int, error) {
	query := `SELECT COUNT(*) FROM user_invites WHERE tenant_id = $1 AND status = 'pending'`
	var count int
	err := DB.QueryRowContext(ctx, query, tenantID).Scan(&count)
	return count, err
}

// GetPendingInvitesByTenant returns all pending invites for a tenant
func GetPendingInvitesByTenant(ctx context.Context, tenantID int64) ([]*models.UserInvite, error) {
	query := `
		SELECT id, tenant_id, name, email, role, token, status, created_at, expires_at
		FROM user_invites
		WHERE tenant_id = $1 AND status = 'pending'
		ORDER BY created_at DESC`

	rows, err := DB.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invites []*models.UserInvite
	for rows.Next() {
		invite := &models.UserInvite{}
		if err := rows.Scan(
			&invite.ID, &invite.TenantID, &invite.Name, &invite.Email,
			&invite.Role, &invite.Token, &invite.Status, &invite.CreatedAt, &invite.ExpiresAt,
		); err != nil {
			return nil, err
		}
		invites = append(invites, invite)
	}

	return invites, rows.Err()
}

// DeleteInvite deletes an invite by ID
func DeleteInvite(ctx context.Context, inviteID int64) (bool, error) {
	query := `DELETE FROM user_invites WHERE id = $1`
	result, err := DB.ExecContext(ctx, query, inviteID)
	if err != nil {
		return false, err
	}

	rows, err := result.RowsAffected()
	return rows > 0, err
}

// ExpireOldInvites marks old invites as expired
func ExpireOldInvites(ctx context.Context) (int64, error) {
	query := `
		UPDATE user_invites
		SET status = 'expired'
		WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()`

	result, err := DB.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}

	return result.RowsAffected()
}
