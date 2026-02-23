-- +goose Up
-- +goose StatementBegin

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Users
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'user', 'read_only')),
    language VARCHAR(5) NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'de')),
    account_type VARCHAR(50) NOT NULL DEFAULT 'local' CHECK (account_type IN ('local', 'oauth', 'dummy')),
    totp_secret VARCHAR(255),
    totp_enabled BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Sessions
-- ============================================================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================================
-- OAuth Providers
-- ============================================================================
CREATE TABLE oauth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    client_id VARCHAR(512) NOT NULL,
    client_secret VARCHAR(512) NOT NULL,
    authorize_url VARCHAR(512) NOT NULL,
    token_url VARCHAR(512) NOT NULL,
    userinfo_url VARCHAR(512) NOT NULL,
    scopes VARCHAR(512) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- OAuth Connections
-- ============================================================================
CREATE TABLE oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES oauth_providers(id) ON DELETE CASCADE,
    external_id VARCHAR(512) NOT NULL,
    access_token VARCHAR(1024),
    refresh_token VARCHAR(1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, external_id)
);

CREATE INDEX idx_oauth_connections_user_id ON oauth_connections(user_id);

-- ============================================================================
-- Recovery Codes (for TOTP 2FA)
-- ============================================================================
CREATE TABLE recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX idx_recovery_codes_user_id ON recovery_codes(user_id);

-- ============================================================================
-- Teams
-- ============================================================================
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    abbreviation CHAR(1) UNIQUE NOT NULL,
    color VARCHAR(7) NOT NULL, -- hex color e.g. #FF5733
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Events
-- ============================================================================
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    location VARCHAR(255),
    participant_count INTEGER,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    time_granularity VARCHAR(10) NOT NULL DEFAULT '1hour' CHECK (time_granularity IN ('15min', '30min', '1hour')),
    is_locked BOOLEAN NOT NULL DEFAULT false,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_slug ON events(slug);

-- ============================================================================
-- Event-Team visibility
-- ============================================================================
CREATE TABLE event_teams (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (event_id, team_id)
);

-- ============================================================================
-- Event Admins
-- ============================================================================
CREATE TABLE event_admins (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, user_id)
);

-- ============================================================================
-- Event Hidden Hours
-- ============================================================================
CREATE TABLE event_hidden_ranges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    hide_start_hour INTEGER NOT NULL CHECK (hide_start_hour >= 0 AND hide_start_hour <= 23),
    hide_end_hour INTEGER NOT NULL CHECK (hide_end_hour >= 0 AND hide_end_hour <= 23)
);

CREATE INDEX idx_event_hidden_ranges_event_id ON event_hidden_ranges(event_id);

-- ============================================================================
-- Shifts
-- ============================================================================
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX idx_shifts_event_id ON shifts(event_id);
CREATE INDEX idx_shifts_user_id ON shifts(user_id);
CREATE INDEX idx_shifts_team_id ON shifts(team_id);
CREATE INDEX idx_shifts_time_range ON shifts(event_id, start_time, end_time);

-- ============================================================================
-- Coverage Requirements
-- ============================================================================
CREATE TABLE coverage_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    required_count INTEGER NOT NULL CHECK (required_count >= 0),
    CHECK (end_time > start_time)
);

CREATE INDEX idx_coverage_requirements_event_team ON coverage_requirements(event_id, team_id);

-- ============================================================================
-- User Availability
-- ============================================================================
CREATE TABLE user_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('available', 'preferred', 'unavailable')),
    note TEXT,
    CHECK (end_time > start_time)
);

CREATE INDEX idx_user_availability_event_user ON user_availability(event_id, user_id);

-- ============================================================================
-- iCal Tokens
-- ============================================================================
CREATE TABLE ical_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    token VARCHAR(255) NOT NULL,
    label VARCHAR(255) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('user', 'event', 'team')),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_ical_tokens_user_id ON ical_tokens(user_id);
CREATE INDEX idx_ical_tokens_token_hash ON ical_tokens(token_hash);

-- ============================================================================
-- Notifications
-- ============================================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    trigger_type VARCHAR(50) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- ============================================================================
-- Notification Preferences
-- ============================================================================
CREATE TABLE notification_preferences (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('in_app', 'email', 'webhook')),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, trigger_type, channel)
);

-- ============================================================================
-- Webhook Configs
-- ============================================================================
CREATE TABLE webhook_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(512) NOT NULL,
    secret VARCHAR(255) NOT NULL,
    trigger_types VARCHAR[] NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_configs_event_id ON webhook_configs(event_id);

-- ============================================================================
-- Audit Log
-- ============================================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'login', 'lock', 'unlock', 'lock_toggle', 'public_toggle')),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_event_id ON audit_log(event_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ============================================================================
-- SMTP Config (singleton)
-- ============================================================================
CREATE TABLE smtp_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    username VARCHAR(255),
    password VARCHAR(255),
    from_address VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    use_tls BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- App Settings (key-value store)
-- ============================================================================
CREATE TABLE app_settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS smtp_config CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS webhook_configs CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS ical_tokens CASCADE;
DROP TABLE IF EXISTS user_availability CASCADE;
DROP TABLE IF EXISTS coverage_requirements CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS event_hidden_ranges CASCADE;
DROP TABLE IF EXISTS event_admins CASCADE;
DROP TABLE IF EXISTS event_teams CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS recovery_codes CASCADE;
DROP TABLE IF EXISTS oauth_connections CASCADE;
DROP TABLE IF EXISTS oauth_providers CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP EXTENSION IF EXISTS "pgcrypto";
-- +goose StatementEnd
