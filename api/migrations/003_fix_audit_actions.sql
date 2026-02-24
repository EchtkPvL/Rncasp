-- +goose Up
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
    CHECK (action IN ('create', 'update', 'delete', 'login', 'lock', 'unlock', 'lock_toggle', 'public_toggle'));

-- +goose Down
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
    CHECK (action IN ('create', 'update', 'delete', 'login', 'lock', 'unlock'));
