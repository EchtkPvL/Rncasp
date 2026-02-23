-- name: CreateNotification :one
INSERT INTO notifications (user_id, event_id, title, body, trigger_type)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListNotifications :many
SELECT * FROM notifications
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountUnreadNotifications :one
SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false;

-- name: MarkNotificationRead :exec
UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false;

-- name: GetNotificationPreferences :many
SELECT * FROM notification_preferences WHERE user_id = $1;

-- name: UpsertNotificationPreference :exec
INSERT INTO notification_preferences (user_id, trigger_type, channel, is_enabled)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, trigger_type, channel)
DO UPDATE SET is_enabled = EXCLUDED.is_enabled;
