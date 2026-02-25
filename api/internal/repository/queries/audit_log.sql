-- name: CreateAuditLogEntry :one
INSERT INTO audit_log (user_id, event_id, action, entity_type, entity_id, old_value, new_value, ip_address)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListAuditLog :many
SELECT al.*, u.username, e.slug AS event_slug
FROM audit_log al
LEFT JOIN users u ON al.user_id = u.id
LEFT JOIN events e ON al.event_id = e.id
WHERE ($1::uuid IS NULL OR al.event_id = $1)
  AND ($2::uuid IS NULL OR al.user_id = $2)
  AND ($3::varchar IS NULL OR al.action = $3)
  AND ($4::varchar IS NULL OR al.entity_type = $4)
ORDER BY al.created_at DESC
LIMIT $5 OFFSET $6;
