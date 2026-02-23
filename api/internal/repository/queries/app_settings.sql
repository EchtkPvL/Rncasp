-- name: GetAppSetting :one
SELECT * FROM app_settings WHERE key = $1;

-- name: ListAppSettings :many
SELECT * FROM app_settings ORDER BY key;

-- name: UpsertAppSetting :one
INSERT INTO app_settings (key, value)
VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
RETURNING *;

-- name: DeleteAppSetting :exec
DELETE FROM app_settings WHERE key = $1;
