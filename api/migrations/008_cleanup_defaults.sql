-- +goose Up
INSERT INTO app_settings (key, value) VALUES ('cleanup', '{"cleanup_enabled": true, "cleanup_interval_hours": 24, "retention_days_audit": 90, "retention_days_notifications": 30, "retention_days_recovery_codes": 90}')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM app_settings WHERE key = 'cleanup';
