-- +goose Up
ALTER TABLE users ADD COLUMN time_format VARCHAR(5) NOT NULL DEFAULT '24h' CHECK (time_format IN ('24h', '12h'));

-- +goose Down
ALTER TABLE users DROP COLUMN time_format;
