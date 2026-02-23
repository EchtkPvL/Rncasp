-- name: ListCoverageRequirements :many
SELECT * FROM coverage_requirements
WHERE event_id = $1
ORDER BY team_id, start_time;

-- name: ListCoverageRequirementsByTeam :many
SELECT * FROM coverage_requirements
WHERE event_id = $1 AND team_id = $2
ORDER BY start_time;

-- name: CreateCoverageRequirement :one
INSERT INTO coverage_requirements (event_id, team_id, start_time, end_time, required_count)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateCoverageRequirement :one
UPDATE coverage_requirements
SET team_id = $2, start_time = $3, end_time = $4, required_count = $5
WHERE id = $1
RETURNING *;

-- name: DeleteCoverageRequirementByID :exec
DELETE FROM coverage_requirements WHERE id = $1;

-- name: DeleteCoverageRequirementsByEvent :exec
DELETE FROM coverage_requirements WHERE event_id = $1;

-- name: DeleteCoverageRequirementsByEventAndTeam :exec
DELETE FROM coverage_requirements WHERE event_id = $1 AND team_id = $2;
