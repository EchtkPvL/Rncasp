-- Fix audit_log action CHECK constraint to include lock_toggle and public_toggle
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
    CHECK (action IN ('create', 'update', 'delete', 'login', 'lock', 'unlock', 'lock_toggle', 'public_toggle'));
