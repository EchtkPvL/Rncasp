-- name: GetEventByID :one
SELECT * FROM events WHERE id = $1;

-- name: GetEventBySlug :one
SELECT * FROM events WHERE slug = $1;

-- name: ListEvents :many
SELECT * FROM events ORDER BY start_time DESC;

-- name: CreateEvent :one
INSERT INTO events (name, slug, description, location, participant_count, start_time, end_time, time_granularity, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: UpdateEvent :one
UPDATE events SET
    name = COALESCE(sqlc.narg('name'), name),
    slug = COALESCE(sqlc.narg('slug'), slug),
    description = COALESCE(sqlc.narg('description'), description),
    location = COALESCE(sqlc.narg('location'), location),
    participant_count = COALESCE(sqlc.narg('participant_count'), participant_count),
    start_time = COALESCE(sqlc.narg('start_time'), start_time),
    end_time = COALESCE(sqlc.narg('end_time'), end_time),
    time_granularity = COALESCE(sqlc.narg('time_granularity'), time_granularity),
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteEvent :exec
DELETE FROM events WHERE id = $1;

-- name: SetEventLocked :exec
UPDATE events SET is_locked = $2, updated_at = NOW() WHERE id = $1;

-- name: SetEventPublic :exec
UPDATE events SET is_public = $2, updated_at = NOW() WHERE id = $1;

-- name: ListEventTeams :many
SELECT t.*, et.is_visible
FROM teams t
JOIN event_teams et ON t.id = et.team_id
WHERE et.event_id = $1
ORDER BY t.sort_order, t.name;

-- name: SetEventTeam :exec
INSERT INTO event_teams (event_id, team_id, is_visible)
VALUES ($1, $2, $3)
ON CONFLICT (event_id, team_id)
DO UPDATE SET is_visible = EXCLUDED.is_visible;

-- name: RemoveEventTeam :exec
DELETE FROM event_teams WHERE event_id = $1 AND team_id = $2;

-- name: ListEventAdmins :many
SELECT u.id, u.username, u.full_name, u.display_name, u.email
FROM users u
JOIN event_admins ea ON u.id = ea.user_id
WHERE ea.event_id = $1
ORDER BY u.username;

-- name: AddEventAdmin :exec
INSERT INTO event_admins (event_id, user_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveEventAdmin :exec
DELETE FROM event_admins WHERE event_id = $1 AND user_id = $2;

-- name: IsEventAdmin :one
SELECT EXISTS(SELECT 1 FROM event_admins WHERE event_id = $1 AND user_id = $2);

-- name: ListEventHiddenRanges :many
SELECT * FROM event_hidden_ranges WHERE event_id = $1 ORDER BY hide_start_hour;

-- name: SetEventHiddenRange :one
INSERT INTO event_hidden_ranges (event_id, hide_start_hour, hide_end_hour)
VALUES ($1, $2, $3)
RETURNING *;

-- name: DeleteEventHiddenRanges :exec
DELETE FROM event_hidden_ranges WHERE event_id = $1;
