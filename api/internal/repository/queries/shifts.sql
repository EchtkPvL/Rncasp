-- name: GetShiftByID :one
SELECT s.*, t.abbreviation AS team_abbreviation, t.color AS team_color, t.name AS team_name,
       u.username, u.full_name AS user_full_name, u.display_name AS user_display_name
FROM shifts s
JOIN teams t ON s.team_id = t.id
JOIN users u ON s.user_id = u.id
WHERE s.id = $1;

-- name: ListShiftsByEvent :many
SELECT s.*, t.abbreviation AS team_abbreviation, t.color AS team_color, t.name AS team_name,
       u.username, u.full_name AS user_full_name, u.display_name AS user_display_name, u.account_type
FROM shifts s
JOIN teams t ON s.team_id = t.id
JOIN users u ON s.user_id = u.id
WHERE s.event_id = $1
ORDER BY s.start_time, u.username;

-- name: ListShiftsByEventAndTeam :many
SELECT s.*, t.abbreviation AS team_abbreviation, t.color AS team_color, t.name AS team_name,
       u.username, u.full_name AS user_full_name, u.display_name AS user_display_name
FROM shifts s
JOIN teams t ON s.team_id = t.id
JOIN users u ON s.user_id = u.id
WHERE s.event_id = $1 AND s.team_id = $2
ORDER BY s.start_time, u.username;

-- name: ListShiftsByUser :many
SELECT s.*, t.abbreviation AS team_abbreviation, t.color AS team_color, t.name AS team_name,
       e.name AS event_name, e.slug AS event_slug
FROM shifts s
JOIN teams t ON s.team_id = t.id
JOIN events e ON s.event_id = e.id
WHERE s.user_id = $1
ORDER BY s.start_time;

-- name: CreateShift :one
INSERT INTO shifts (event_id, team_id, user_id, start_time, end_time, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateShift :one
UPDATE shifts SET
    team_id = COALESCE(sqlc.narg('team_id'), team_id),
    start_time = COALESCE(sqlc.narg('start_time'), start_time),
    end_time = COALESCE(sqlc.narg('end_time'), end_time),
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteShift :exec
DELETE FROM shifts WHERE id = $1;

-- name: CountShiftsInTimeRange :one
SELECT COUNT(*) FROM shifts
WHERE event_id = $1 AND team_id = $2
  AND start_time < $4 AND end_time > $3;

-- name: GetOverlappingShifts :many
SELECT * FROM shifts
WHERE user_id = $1 AND event_id = $2
  AND start_time < $4 AND end_time > $3
  AND ($5::uuid IS NULL OR id != $5);
