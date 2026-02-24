export interface User {
  id: string;
  username: string;
  full_name: string;
  display_name: string | null;
  email: string | null;
  role: "super_admin" | "user" | "read_only";
  language: "en" | "de";
  account_type: "local" | "oauth" | "dummy";
  time_format: "24h" | "12h";
  totp_enabled: boolean;
  is_active: boolean;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  full_name: string;
  email?: string;
  language?: string;
}

// Teams
export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateTeamRequest {
  name: string;
  abbreviation: string;
  color: string;
  sort_order?: number;
}

export interface UpdateTeamRequest {
  name?: string;
  abbreviation?: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
}

// Events
export interface Event {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  participant_count: number | null;
  start_time: string;
  end_time: string;
  time_granularity: "15min" | "30min" | "1hour";
  is_locked: boolean;
  is_public: boolean;
  is_event_admin: boolean;
  created_by: string;
  created_at: string;
}

export interface CreateEventRequest {
  name: string;
  slug: string;
  description?: string;
  location?: string;
  participant_count?: number;
  start_time: string;
  end_time: string;
  time_granularity: string;
}

export interface UpdateEventRequest {
  name?: string;
  description?: string;
  location?: string;
  participant_count?: number;
  start_time?: string;
  end_time?: string;
  time_granularity?: string;
}

export interface EventTeam {
  event_id: string;
  team_id: string;
  team_name: string;
  team_abbreviation: string;
  team_color: string;
  is_visible: boolean;
}

export interface EventAdmin {
  user_id: string;
  username: string;
  full_name: string;
}

export interface HiddenRange {
  id: string;
  event_id: string;
  hide_start_hour: number;
  hide_end_hour: number;
}

// Shifts
export interface Shift {
  id: string;
  event_id: string;
  team_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  team_name: string;
  team_abbreviation: string;
  team_color: string;
  username: string;
  user_full_name: string;
  user_display_name: string | null;
  created_at: string;
}

export interface UserShift {
  id: string;
  event_id: string;
  team_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  team_name: string;
  team_abbreviation: string;
  team_color: string;
  event_name: string;
  event_slug: string;
  created_at: string;
}

export interface ShiftWithWarnings {
  shift: Shift;
  warnings?: string[];
}

export interface CreateShiftRequest {
  team_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
}

export interface UpdateShiftRequest {
  team_id?: string;
  start_time?: string;
  end_time?: string;
}

// Coverage
export interface CoverageRequirement {
  id: string;
  event_id: string;
  team_id: string;
  start_time: string;
  end_time: string;
  required_count: number;
}

export interface CreateCoverageRequest {
  team_id: string;
  start_time: string;
  end_time: string;
  required_count: number;
}

export interface UpdateCoverageRequest {
  team_id: string;
  start_time: string;
  end_time: string;
  required_count: number;
}

// Availability
export interface Availability {
  id: string;
  event_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  status: "available" | "preferred" | "unavailable";
  note: string | null;
}

export interface AvailabilityGridEntry {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  status: "available" | "preferred" | "unavailable";
  note: string | null;
  username: string;
  user_full_name: string;
  user_display_name: string | null;
}

export interface AvailabilityEntry {
  start_time: string;
  end_time: string;
  status: "available" | "preferred" | "unavailable";
  note?: string;
}

export interface SetAvailabilityRequest {
  entries: AvailabilityEntry[];
}

// Grid data (combined endpoint response)
export interface GridData {
  event: Event;
  shifts: Shift[];
  coverage: CoverageRequirement[];
  availability: AvailabilityGridEntry[];
  event_teams?: EventTeam[];
}

// Dummy accounts
export interface CreateDummyRequest {
  username: string;
  full_name: string;
  display_name?: string;
}

export interface UpdateDummyRequest {
  full_name?: string;
  display_name?: string;
}

// OAuth
export interface OAuthProvider {
  id: string;
  name: string;
  client_id: string;
  authorize_url: string;
  token_url: string;
  userinfo_url: string;
  scopes: string;
  is_enabled: boolean;
  created_at: string;
}

export interface PublicOAuthProvider {
  id: string;
  name: string;
}

export interface CreateOAuthProviderRequest {
  name: string;
  client_id: string;
  client_secret: string;
  authorize_url: string;
  token_url: string;
  userinfo_url: string;
  scopes: string;
}

export interface UpdateOAuthProviderRequest {
  name?: string;
  client_id?: string;
  client_secret?: string;
  authorize_url?: string;
  token_url?: string;
  userinfo_url?: string;
  scopes?: string;
  is_enabled?: boolean;
}

export interface OAuthConnection {
  id: string;
  provider_id: string;
  provider_name: string;
  external_id: string;
  created_at: string;
}

// TOTP
export interface TOTPSetupResult {
  secret: string;
  provision_uri: string;
  recovery_codes: string[];
}

export interface TOTPChallenge {
  totp_required: true;
  pending_token: string;
}

export type LoginResult = User | TOTPChallenge;

// Notifications
export interface Notification {
  id: string;
  event_id: string | null;
  title: string;
  body: string | null;
  trigger_type: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreference {
  trigger_type: string;
  channel: string;
  is_enabled: boolean;
}

export interface UpdatePreferenceRequest {
  trigger_type: string;
  channel: string;
  is_enabled: boolean;
}

// Webhooks
export interface Webhook {
  id: string;
  event_id: string;
  name: string;
  url: string;
  trigger_types: string[];
  is_enabled: boolean;
  created_at: string;
}

export interface CreateWebhookRequest {
  name: string;
  url: string;
  secret: string;
  trigger_types: string[];
}

export interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  secret?: string;
  trigger_types?: string[];
  is_enabled?: boolean;
}

// SMTP
export interface SMTPConfig {
  host: string;
  port: number;
  username: string | null;
  from_address: string;
  from_name: string | null;
  use_tls: boolean;
  updated_at: string;
}

export interface UpdateSMTPConfigRequest {
  host: string;
  port: number;
  username?: string;
  password?: string;
  from_address: string;
  from_name?: string;
  use_tls: boolean;
}

// iCal Tokens
export interface ICalToken {
  id: string;
  label: string;
  scope: "user" | "event" | "team";
  event_id: string | null;
  team_id: string | null;
  created_at: string;
  last_used_at: string | null;
  url: string;
}

export interface CreateICalTokenRequest {
  label: string;
  scope: "user" | "event" | "team";
  event_id?: string;
  team_id?: string;
}

// Audit Log
export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  username: string | null;
  event_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  created_at: string;
}

// Print config
export interface PrintConfig {
  layout: "grid" | "list";
  paperSize: "A4" | "A3";
  landscape: boolean;
  showCoverage: boolean;
  showTeamColors: boolean;
  selectedDays: Date[];
  selectedUserIds: string[] | null; // null = all users
}

// SSE
export interface SSEEvent {
  type: string;
  event_id?: string;
  payload?: unknown;
}
