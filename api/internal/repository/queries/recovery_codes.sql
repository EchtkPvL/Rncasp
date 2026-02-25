-- name: CreateRecoveryCodes :copyfrom
INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2);

-- name: ListRecoveryCodes :many
SELECT * FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL;

-- name: UseRecoveryCode :exec
UPDATE recovery_codes SET used_at = NOW() WHERE id = $1 AND user_id = $2 AND used_at IS NULL;

-- name: DeleteRecoveryCodes :exec
DELETE FROM recovery_codes WHERE user_id = $1;

-- name: DeleteUsedRecoveryCodes :execrows
DELETE FROM recovery_codes WHERE used_at IS NOT NULL AND used_at < $1;
