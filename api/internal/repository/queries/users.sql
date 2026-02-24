-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE LOWER(username) = LOWER($1);

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: ListUsers :many
SELECT * FROM users
WHERE ($1::varchar IS NULL OR role = $1)
  AND ($2::varchar IS NULL OR account_type = $2)
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: CreateUser :one
INSERT INTO users (username, full_name, display_name, email, password_hash, role, language, account_type)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: UpdateUser :one
UPDATE users SET
    full_name = COALESCE(sqlc.narg('full_name'), full_name),
    display_name = COALESCE(sqlc.narg('display_name'), display_name),
    email = COALESCE(sqlc.narg('email'), email),
    role = COALESCE(sqlc.narg('role'), role),
    language = COALESCE(sqlc.narg('language'), language),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    time_format = COALESCE(sqlc.narg('time_format'), time_format),
    username = COALESCE(sqlc.narg('username'), username),
    account_type = COALESCE(sqlc.narg('account_type'), account_type),
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1;

-- name: SetTOTPSecret :exec
UPDATE users SET totp_secret = $2, totp_enabled = $3, updated_at = NOW() WHERE id = $1;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: ListSuperAdminEmails :many
SELECT email FROM users
WHERE role = 'super_admin' AND is_active = true AND email IS NOT NULL;

-- name: SearchUsers :many
SELECT * FROM users
WHERE (username ILIKE '%' || $1 || '%' OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
ORDER BY username
LIMIT $2 OFFSET $3;
