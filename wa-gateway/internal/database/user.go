package database

import (
	"context"
	"database/sql"

	"customerservicecrm/wa-gateway/internal/models"
)

// FindUserByEmail finds a user by email
func FindUserByEmail(ctx context.Context, email string) (*models.User, error) {
	query := `
		SELECT u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role, u.status, u.created_at,
		       t.company_name, t.session_id
		FROM users u
		LEFT JOIN tenants t ON u.tenant_id = t.id
		WHERE u.email = $1`

	user := &models.User{}
	err := DB.QueryRowContext(ctx, query, email).Scan(
		&user.ID, &user.TenantID, &user.Name, &user.Email, &user.PasswordHash,
		&user.Role, &user.Status, &user.CreatedAt,
		&user.TenantName, &user.TenantSessionID,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return user, nil
}

// FindUserByID finds a user by ID
func FindUserByID(ctx context.Context, id int64) (*models.User, error) {
	query := `
		SELECT u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role, u.status, u.created_at,
		       t.company_name, t.session_id
		FROM users u
		LEFT JOIN tenants t ON u.tenant_id = t.id
		WHERE u.id = $1`

	user := &models.User{}
	err := DB.QueryRowContext(ctx, query, id).Scan(
		&user.ID, &user.TenantID, &user.Name, &user.Email, &user.PasswordHash,
		&user.Role, &user.Status, &user.CreatedAt,
		&user.TenantName, &user.TenantSessionID,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return user, nil
}

// CreateUser creates a new user
func CreateUser(ctx context.Context, tenantID *int64, name, email, passwordHash, role string) (*models.User, error) {
	query := `
		INSERT INTO users (tenant_id, name, email, password_hash, role, status)
		VALUES ($1, $2, $3, $4, $5, 'active')
		RETURNING id, tenant_id, name, email, role, status, created_at`

	user := &models.User{}
	err := DB.QueryRowContext(ctx, query, tenantID, name, email, passwordHash, role).Scan(
		&user.ID, &user.TenantID, &user.Name, &user.Email,
		&user.Role, &user.Status, &user.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return user, nil
}

// CreateUserTx creates a new user within a transaction
func CreateUserTx(ctx context.Context, tx *sql.Tx, tenantID int64, name, email, passwordHash, role string) (*models.User, error) {
	query := `
		INSERT INTO users (tenant_id, name, email, password_hash, role, status)
		VALUES ($1, $2, $3, $4, $5, 'active')
		RETURNING id, tenant_id, name, email, role, status, created_at`

	user := &models.User{}
	err := tx.QueryRowContext(ctx, query, tenantID, name, email, passwordHash, role).Scan(
		&user.ID, &user.TenantID, &user.Name, &user.Email,
		&user.Role, &user.Status, &user.CreatedAt,
	)

	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetUsersByTenant returns all users for a tenant
func GetUsersByTenant(ctx context.Context, tenantID int64) ([]*models.User, error) {
	query := `
		SELECT id, tenant_id, name, email, role, status, created_at
		FROM users
		WHERE tenant_id = $1
		ORDER BY created_at DESC`

	rows, err := DB.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		user := &models.User{}
		if err := rows.Scan(
			&user.ID, &user.TenantID, &user.Name, &user.Email,
			&user.Role, &user.Status, &user.CreatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, rows.Err()
}

// UpdateUserStatus updates user status
func UpdateUserStatus(ctx context.Context, userID int64, status string) (*models.User, error) {
	query := `
		UPDATE users SET status = $1
		WHERE id = $2
		RETURNING id, tenant_id, name, email, role, status, created_at`

	user := &models.User{}
	err := DB.QueryRowContext(ctx, query, status, userID).Scan(
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

// UpdateUserPassword updates user password
func UpdateUserPassword(ctx context.Context, userID int64, passwordHash string) error {
	query := `UPDATE users SET password_hash = $1 WHERE id = $2`
	_, err := DB.ExecContext(ctx, query, passwordHash, userID)
	return err
}

// DeleteUser deletes a user
func DeleteUser(ctx context.Context, userID int64) (bool, error) {
	query := `DELETE FROM users WHERE id = $1`
	result, err := DB.ExecContext(ctx, query, userID)
	if err != nil {
		return false, err
	}

	rows, err := result.RowsAffected()
	return rows > 0, err
}

// CountUsersByTenant returns user count for a tenant
func CountUsersByTenant(ctx context.Context, tenantID int64) (int, error) {
	query := `SELECT COUNT(*) FROM users WHERE tenant_id = $1`
	var count int
	err := DB.QueryRowContext(ctx, query, tenantID).Scan(&count)
	return count, err
}
