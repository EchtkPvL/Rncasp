-- name: ListOAuthProviders :many
SELECT * FROM oauth_providers ORDER BY name;

-- name: ListEnabledOAuthProviders :many
SELECT id, name FROM oauth_providers WHERE is_enabled = true ORDER BY name;

-- name: GetOAuthProviderByID :one
SELECT * FROM oauth_providers WHERE id = $1;

-- name: GetOAuthProviderByName :one
SELECT * FROM oauth_providers WHERE name = $1;

-- name: CreateOAuthProvider :one
INSERT INTO oauth_providers (name, client_id, client_secret, authorize_url, token_url, userinfo_url, scopes)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateOAuthProvider :one
UPDATE oauth_providers SET
    name = COALESCE(sqlc.narg('name'), name),
    client_id = COALESCE(sqlc.narg('client_id'), client_id),
    client_secret = COALESCE(sqlc.narg('client_secret'), client_secret),
    authorize_url = COALESCE(sqlc.narg('authorize_url'), authorize_url),
    token_url = COALESCE(sqlc.narg('token_url'), token_url),
    userinfo_url = COALESCE(sqlc.narg('userinfo_url'), userinfo_url),
    scopes = COALESCE(sqlc.narg('scopes'), scopes),
    is_enabled = COALESCE(sqlc.narg('is_enabled'), is_enabled)
WHERE id = $1
RETURNING *;

-- name: DeleteOAuthProvider :exec
DELETE FROM oauth_providers WHERE id = $1;

-- name: GetOAuthConnectionByExternalID :one
SELECT * FROM oauth_connections WHERE provider_id = $1 AND external_id = $2;

-- name: ListOAuthConnectionsByUser :many
SELECT oc.*, op.name AS provider_name
FROM oauth_connections oc
JOIN oauth_providers op ON oc.provider_id = op.id
WHERE oc.user_id = $1;

-- name: CreateOAuthConnection :one
INSERT INTO oauth_connections (user_id, provider_id, external_id, access_token, refresh_token)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: DeleteOAuthConnection :exec
DELETE FROM oauth_connections WHERE id = $1 AND user_id = $2;
