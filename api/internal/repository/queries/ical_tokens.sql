-- name: CreateICalToken :one
INSERT INTO ical_tokens (user_id, token_hash, token, label, scope, event_id, team_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListICalTokensByUser :many
SELECT it.*,
       e.slug AS event_slug,
       t.abbreviation AS team_abbreviation
FROM ical_tokens it
LEFT JOIN events e ON it.event_id = e.id
LEFT JOIN teams t ON it.team_id = t.id
WHERE it.user_id = $1 AND it.is_active = true
ORDER BY it.created_at DESC;

-- name: GetICalTokenByHash :one
SELECT it.*, u.username
FROM ical_tokens it
JOIN users u ON it.user_id = u.id
WHERE it.token_hash = $1 AND it.is_active = true;

-- name: RevokeICalToken :exec
UPDATE ical_tokens SET is_active = false WHERE id = $1 AND user_id = $2;

-- name: UpdateICalTokenLastUsed :exec
UPDATE ical_tokens SET last_used_at = NOW() WHERE id = $1;
