-- +goose Up
-- Make username lookups case-insensitive while preserving original casing.
-- Replace the default UNIQUE constraint with a unique index on LOWER(username).
ALTER TABLE users DROP CONSTRAINT users_username_key;
CREATE UNIQUE INDEX idx_users_username_lower ON users(LOWER(username));

-- +goose Down
DROP INDEX idx_users_username_lower;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
