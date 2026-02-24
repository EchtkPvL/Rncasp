-- name: ListAvailabilityByEvent :many
SELECT ua.*, u.username, u.full_name AS user_full_name, u.display_name AS user_display_name
FROM user_availability ua
JOIN users u ON ua.user_id = u.id
WHERE ua.event_id = $1
ORDER BY ua.user_id, ua.start_time;

-- name: ListAvailabilityByEventAndUser :many
SELECT * FROM user_availability
WHERE event_id = $1 AND user_id = $2
ORDER BY start_time;

-- name: CreateAvailability :one
INSERT INTO user_availability (event_id, user_id, start_time, end_time, status, note)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: DeleteAvailabilityByEventAndUser :exec
DELETE FROM user_availability WHERE event_id = $1 AND user_id = $2;
