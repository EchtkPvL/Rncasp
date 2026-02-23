-- name: CreateICalToken :one
INSERT INTO ical_tokens (user_id, token_hash, label, scope, event_id, team_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListICalTokensByUser :many
SELECT * FROM ical_tokens
WHERE user_id = $1 AND is_active = true
ORDER BY created_at DESC;

-- name: GetICalTokenByHash :one
SELECT it.*, u.username
FROM ical_tokens it
JOIN users u ON it.user_id = u.id
WHERE it.token_hash = $1 AND it.is_active = true;

-- name: RevokeICalToken :exec
UPDATE ical_tokens SET is_active = false WHERE id = $1 AND user_id = $2;

-- name: UpdateICalTokenLastUsed :exec
UPDATE ical_tokens SET last_used_at = NOW() WHERE id = $1;
