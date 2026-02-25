-- +goose Up
ALTER TABLE webhook_configs
  ADD COLUMN format VARCHAR(20) NOT NULL DEFAULT 'default',
  ALTER COLUMN event_id DROP NOT NULL,
  ALTER COLUMN secret DROP NOT NULL;

ALTER TABLE webhook_configs ALTER COLUMN secret SET DEFAULT '';

-- +goose Down
DELETE FROM webhook_configs WHERE event_id IS NULL;
ALTER TABLE webhook_configs
  ALTER COLUMN event_id SET NOT NULL,
  ALTER COLUMN secret SET NOT NULL,
  ALTER COLUMN secret DROP DEFAULT;
ALTER TABLE webhook_configs DROP COLUMN format;
