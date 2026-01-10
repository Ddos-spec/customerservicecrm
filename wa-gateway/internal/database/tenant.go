package database

import (
	"context"
	"database/sql"

	"customerservicecrm/wa-gateway/internal/models"
)

// CreateTenant creates a new tenant
func CreateTenant(ctx context.Context, companyName string, sessionID *string) (*models.Tenant, error) {
	query := `
		INSERT INTO tenants (company_name, status, session_id)
		VALUES ($1, 'active', $2)
		RETURNING id, company_name, status, session_id, created_at`

	tenant := &models.Tenant{}
	err := DB.QueryRowContext(ctx, query, companyName, sessionID).Scan(
		&tenant.ID, &tenant.CompanyName, &tenant.Status,
		&tenant.SessionID, &tenant.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return tenant, nil
}

// CreateTenantTx creates a new tenant within a transaction
func CreateTenantTx(ctx context.Context, tx *sql.Tx, companyName string, sessionID *string) (*models.Tenant, error) {
	query := `
		INSERT INTO tenants (company_name, status, session_id)
		VALUES ($1, 'active', $2)
		RETURNING id, company_name, status, session_id, created_at`

	tenant := &models.Tenant{}
	err := tx.QueryRowContext(ctx, query, companyName, sessionID).Scan(
		&tenant.ID, &tenant.CompanyName, &tenant.Status,
		&tenant.SessionID, &tenant.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return tenant, nil
}

// GetAllTenants returns all tenants with user count
func GetAllTenants(ctx context.Context) ([]*models.Tenant, error) {
	query := `
		SELECT t.id, t.company_name, t.status, t.session_id, t.created_at,
		       COUNT(u.id) as user_count
		FROM tenants t
		LEFT JOIN users u ON t.id = u.tenant_id
		GROUP BY t.id
		ORDER BY t.created_at DESC`

	rows, err := DB.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenants []*models.Tenant
	for rows.Next() {
		tenant := &models.Tenant{}
		if err := rows.Scan(
			&tenant.ID, &tenant.CompanyName, &tenant.Status,
			&tenant.SessionID, &tenant.CreatedAt, &tenant.UserCount,
		); err != nil {
			return nil, err
		}
		tenants = append(tenants, tenant)
	}

	return tenants, rows.Err()
}

// GetTenantByID returns a tenant by ID
func GetTenantByID(ctx context.Context, tenantID int64) (*models.Tenant, error) {
	query := `SELECT id, company_name, status, session_id, created_at FROM tenants WHERE id = $1`

	tenant := &models.Tenant{}
	err := DB.QueryRowContext(ctx, query, tenantID).Scan(
		&tenant.ID, &tenant.CompanyName, &tenant.Status,
		&tenant.SessionID, &tenant.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return tenant, nil
}

// GetTenantBySessionID returns a tenant by session ID
func GetTenantBySessionID(ctx context.Context, sessionID string) (*models.Tenant, error) {
	query := `SELECT id, company_name, status, session_id, created_at FROM tenants WHERE session_id = $1`

	tenant := &models.Tenant{}
	err := DB.QueryRowContext(ctx, query, sessionID).Scan(
		&tenant.ID, &tenant.CompanyName, &tenant.Status,
		&tenant.SessionID, &tenant.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return tenant, nil
}

// UpdateTenantStatus updates tenant status
func UpdateTenantStatus(ctx context.Context, tenantID int64, status string) (*models.Tenant, error) {
	query := `
		UPDATE tenants SET status = $1
		WHERE id = $2
		RETURNING id, company_name, status, session_id, created_at`

	tenant := &models.Tenant{}
	err := DB.QueryRowContext(ctx, query, status, tenantID).Scan(
		&tenant.ID, &tenant.CompanyName, &tenant.Status,
		&tenant.SessionID, &tenant.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return tenant, nil
}

// SetTenantSessionID updates tenant session ID
func SetTenantSessionID(ctx context.Context, tenantID int64, sessionID *string) (*models.Tenant, error) {
	query := `
		UPDATE tenants SET session_id = $1
		WHERE id = $2
		RETURNING id, company_name, status, session_id, created_at`

	tenant := &models.Tenant{}
	err := DB.QueryRowContext(ctx, query, sessionID, tenantID).Scan(
		&tenant.ID, &tenant.CompanyName, &tenant.Status,
		&tenant.SessionID, &tenant.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return tenant, nil
}

// GetTenantAdmin returns the admin agent for a tenant
func GetTenantAdmin(ctx context.Context, tenantID int64) (*models.User, error) {
	query := `
		SELECT id, tenant_id, name, email, role, status, created_at
		FROM users
		WHERE tenant_id = $1 AND role = 'admin_agent'
		ORDER BY created_at ASC
		LIMIT 1`

	user := &models.User{}
	err := DB.QueryRowContext(ctx, query, tenantID).Scan(
		&user.ID, &user.TenantID, &user.Name, &user.Email,
		&user.Role, &user.Status, &user.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetTenantWebhooks returns all webhooks for a tenant
func GetTenantWebhooks(ctx context.Context, tenantID int64) ([]*models.TenantWebhook, error) {
	query := `
		SELECT id, tenant_id, url, created_at
		FROM tenant_webhooks
		WHERE tenant_id = $1
		ORDER BY created_at DESC`

	rows, err := DB.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var webhooks []*models.TenantWebhook
	for rows.Next() {
		wh := &models.TenantWebhook{}
		if err := rows.Scan(&wh.ID, &wh.TenantID, &wh.URL, &wh.CreatedAt); err != nil {
			return nil, err
		}
		webhooks = append(webhooks, wh)
	}

	return webhooks, rows.Err()
}

// CreateTenantWebhook creates a webhook for a tenant
func CreateTenantWebhook(ctx context.Context, tenantID int64, url string) (*models.TenantWebhook, error) {
	query := `
		INSERT INTO tenant_webhooks (tenant_id, url)
		VALUES ($1, $2)
		RETURNING id, tenant_id, url, created_at`

	wh := &models.TenantWebhook{}
	err := DB.QueryRowContext(ctx, query, tenantID, url).Scan(
		&wh.ID, &wh.TenantID, &wh.URL, &wh.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return wh, nil
}

// DeleteTenantWebhook deletes a webhook
func DeleteTenantWebhook(ctx context.Context, tenantID, webhookID int64) (bool, error) {
	query := `DELETE FROM tenant_webhooks WHERE tenant_id = $1 AND id = $2`
	result, err := DB.ExecContext(ctx, query, tenantID, webhookID)
	if err != nil {
		return false, err
	}

	rows, err := result.RowsAffected()
	return rows > 0, err
}
