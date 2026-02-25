-- name: ListWebhooksByEvent :many
SELECT * FROM webhook_configs WHERE event_id = $1 ORDER BY name;

-- name: GetWebhookByID :one
SELECT * FROM webhook_configs WHERE id = $1;

-- name: CreateWebhook :one
INSERT INTO webhook_configs (event_id, name, url, secret, trigger_types, format)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateWebhook :one
UPDATE webhook_configs SET
    name = COALESCE(sqlc.narg('name'), name),
    url = COALESCE(sqlc.narg('url'), url),
    secret = COALESCE(sqlc.narg('secret'), secret),
    trigger_types = COALESCE(sqlc.narg('trigger_types'), trigger_types),
    is_enabled = COALESCE(sqlc.narg('is_enabled'), is_enabled),
    format = COALESCE(sqlc.narg('format'), format)
WHERE id = $1
RETURNING *;

-- name: DeleteWebhook :exec
DELETE FROM webhook_configs WHERE id = $1;

-- name: ListActiveWebhooksForTrigger :many
SELECT * FROM webhook_configs
WHERE event_id = $1 AND is_enabled = true AND $2 = ANY(trigger_types);

-- name: ListGlobalWebhooks :many
SELECT * FROM webhook_configs WHERE event_id IS NULL ORDER BY name;

-- name: CreateGlobalWebhook :one
INSERT INTO webhook_configs (name, url, secret, trigger_types, format)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListActiveGlobalWebhooksForTrigger :many
SELECT * FROM webhook_configs
WHERE event_id IS NULL AND is_enabled = true AND $1 = ANY(trigger_types);
