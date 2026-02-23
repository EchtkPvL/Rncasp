-- name: GetTeamByID :one
SELECT * FROM teams WHERE id = $1;

-- name: GetTeamByAbbreviation :one
SELECT * FROM teams WHERE abbreviation = $1;

-- name: ListTeams :many
SELECT * FROM teams ORDER BY sort_order, name;

-- name: ListActiveTeams :many
SELECT * FROM teams WHERE is_active = true ORDER BY sort_order, name;

-- name: CreateTeam :one
INSERT INTO teams (name, abbreviation, color, sort_order)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateTeam :one
UPDATE teams SET
    name = COALESCE(sqlc.narg('name'), name),
    abbreviation = COALESCE(sqlc.narg('abbreviation'), abbreviation),
    color = COALESCE(sqlc.narg('color'), color),
    sort_order = COALESCE(sqlc.narg('sort_order'), sort_order),
    is_active = COALESCE(sqlc.narg('is_active'), is_active)
WHERE id = $1
RETURNING *;

-- name: DeleteTeam :exec
DELETE FROM teams WHERE id = $1;
