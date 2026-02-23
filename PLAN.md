# Rncasp - Implementation Plan

## Context

Rncasp (Really no clue about shift planning) replaces an Excel-based shift planning workflow used for LAN party events. Events range in length (typically 3-7+ days). The current spreadsheet ("BL45 - Schichtplan_Neu") uses a grid with team members as rows and hourly time slots as columns, where cells contain single-letter team codes (A=Anmeldung, B=Bar, C=Catering, E=Entertainment, O=Ordnungscheck, P=Parkwaechter, T=Turniere). Per-team sheets filter to one team. Bottom rows show coverage stats with surplus/deficit indicators. This tool replaces that with a web app supporting auth, permissions, real-time updates, mobile, printing, and exports.

This plan is designed for **parallel execution by multiple Claude Code agents**. Each phase is broken into independent work packages (WPs) that can be assigned to separate agents. Dependencies between WPs are explicit.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend | **Go + Chi v5** | stdlib-compatible, composable routing, single binary for Docker |
| DB access | **sqlc + pgx v5** | Type-safe generated code from SQL, native Postgres features |
| Migrations | **goose v3** | Supports Go + SQL migrations, embeddable in binary |
| Database | **PostgreSQL 17** | JSONB for audit log, TIMESTAMPTZ for shifts, robust |
| Cache/Sessions | **Redis 7** | Fast session lookup, SSE pub/sub for multi-instance |
| Frontend | **React 19 + TypeScript + Vite** | |
| UI | **shadcn/ui + Tailwind CSS v4** | Full control over grid component, print-friendly |
| State | **TanStack Query v5** | Optimistic updates for drag-drop, cache invalidation via SSE |
| DnD | **dnd-kit** | Grid-aware, touch support, custom snap-to-slot |
| i18n | **react-i18next** (frontend) + **go-i18n** (email templates) |
| Real-time | **SSE** (Server-Sent Events) | Simpler than WebSocket, sufficient for server-to-client push |
| API | **REST + OpenAPI 3.1** | Clean resource mapping, cacheable, file downloads |
| PDF | **CSS @media print** (primary) + **chromedp** (server-side fallback) |

---

## Default Color Palette (super-admin configurable)

Stored in `app_settings` table, editable by super-admins in the admin UI.

```json
{
  "primary": "#e26729",
  "primaryDark": "#c4551f",
  "background": "#303030",
  "surface": "#f4f4f4",
  "surfaceAlt": "#efefef",
  "textPrimary": "#000000",
  "textSecondary": "#818181",
  "textOnPrimary": "#ffffff",
  "textOnDark": "#ffffff",
  "border": "#cccccc",
  "error": "#b20101",
  "warning": "#FAE55F",
  "success": "#2d8a4e",
  "info": "#5bbad5",
  "navBackground": "#303030",
  "navText": "#ffffff",
  "buttonPrimary": "#e26729",
  "buttonSecondary": "#818181"
}
```

The frontend reads the palette from the API on load and injects it as CSS custom properties (`--color-primary`, etc.). Tailwind config references these custom properties so all components use the dynamic palette.

---

## Permission Model

| Role | Scope | Can do |
|------|-------|--------|
| **Super-admin** | Global | Everything: create/delete events, manage users, OAuth, SMTP, teams, edit locked events, toggle public access, manage color palette |
| **Event admin** | Per-event | Edit shifts + event settings for assigned events. Cannot: delete event, toggle public access, edit locked events, manage users/SSO |
| **User** | Global | Self-signup for shifts, edit/remove own shifts, view everything. Cannot overbook past coverage requirements |
| **Read-only** | Global | View only |

Dummy accounts (e.g. "Security 1") are non-login placeholder accounts assignable to shifts.

---

## Database Schema (Key Tables)

```
users:          id, username, full_name, display_name, email, password_hash, role(super_admin|user|read_only),
                language(en|de), account_type(local|oauth|dummy), totp_secret, totp_enabled, is_active

oauth_providers: id, name, client_id, client_secret, authorize_url, token_url, userinfo_url, scopes, is_enabled
oauth_connections: id, user_id, provider_id, external_id, access_token, refresh_token
sessions:       id, user_id, token_hash, ip_address, user_agent, expires_at

teams:          id, name, abbreviation(1 char), color(hex), sort_order, is_active

events:         id, name, slug(unique), description, location, participant_count,
                start_time, end_time, time_granularity(15min|30min|1hour),
                is_locked, is_public, created_by
event_teams:    event_id, team_id, is_visible
event_admins:   event_id, user_id
event_hidden_ranges: id, event_id, hide_start_hour, hide_end_hour

shifts:         id, event_id, team_id, user_id, start_time, end_time, created_by
coverage_requirements: id, event_id, team_id, start_time, end_time, required_count

user_availability: id, event_id, user_id, start_time, end_time, status(available|preferred|unavailable), note

ical_tokens:    id, user_id, token_hash, label, scope(user|event_all|event_team),
                event_id(nullable), team_id(nullable), created_at, last_used_at, is_active

notifications:  id, user_id, event_id, title, body, trigger_type, is_read
notification_preferences: user_id, trigger_type, channel(in_app|email|webhook), is_enabled
webhook_configs: id, event_id, name, url, secret, trigger_types[], is_enabled

audit_log:      id, user_id, event_id, action(create|update|delete|login|lock|unlock),
                entity_type, entity_id, old_value(jsonb), new_value(jsonb), ip_address, created_at

smtp_config:    (singleton) host, port, username, password, from_address, from_name, use_tls
app_settings:   key, value(jsonb) -- app_name, registration_enabled, color_palette, etc.
```

All IDs are UUIDs. All timestamps are TIMESTAMPTZ (UTC). Shifts stored as exact time ranges, grid rendering snaps to event's granularity.

---

## Event Locking

Event locking is **togglable** - events can be locked and unlocked multiple times throughout their lifecycle:
- An event may start locked (before shift planning begins), then be unlocked for planning
- Locked again when shifts are finalized/printed, unlocked for tweaks, re-locked, etc.
- When locked: only super-admins can edit shifts (to track actual hours after printing)
- Event admins and users cannot modify shifts in a locked event
- Lock/unlock actions are recorded in the audit log with timestamps

---

## iCal Subscription Endpoints

Users generate iCal tokens in their settings page. Tokens are scoped:

```
GET /ical/user/{user_uuid}/{token}          -- All shifts for a specific user
GET /ical/event/{slug}/all/{token}          -- All shifts in an event
GET /ical/event/{slug}/{team_abbr}/{token}  -- Shifts for one team in an event
```

- If no token is provided (or invalid token), show public data only (if the event has `is_public=true`)
- Tokens are hashed in the database (like sessions), displayed once on creation
- Users can create multiple tokens with labels (e.g., "My Phone Calendar", "Google Calendar")
- Users can revoke tokens in their settings
- `last_used_at` tracks usage for identifying stale tokens
- iCal feeds return proper `VCALENDAR` with `VEVENT` entries including team name, location, and event description

---

## Project Structure

```
rncasp/
  CLAUDE.md                         # Project context for AI agents
  PLAN.md                           # This implementation plan
  docker-compose.yml                # Production
  docker-compose.dev.yml            # Development overlay (hot reload, mailpit)
  Makefile                          # Common commands
  .env.example

  api/                              # Go backend
    Dockerfile / Dockerfile.dev
    cmd/server/main.go
    internal/
      config/config.go              # Env-based configuration
      server/server.go, routes.go   # HTTP server + route registration
      server/middleware/             # auth, cors, audit, ratelimit
      handler/                      # HTTP handlers (auth, users, events, teams, shifts, coverage,
                                    #   availability, notifications, audit, export, sse, ical, admin, health)
      service/                      # Business logic layer
      repository/queries/           # sqlc SQL files -> generated Go code
      model/                        # DTOs, request/response types, domain errors
      sse/broker.go                 # SSE event broadcasting
      mail/                         # SMTP mailer + HTML templates
      webhook/dispatcher.go
      ical/generator.go
      pdf/generator.go              # chromedp-based PDF
    migrations/                     # goose SQL migrations
    openapi/spec.yaml

  web/                              # React frontend
    Dockerfile / Dockerfile.dev
    src/
      api/                          # API client, types (generated from OpenAPI)
      hooks/                        # TanStack Query hooks (useAuth, useShifts, useSSE, etc.)
      components/
        ui/                         # shadcn/ui components
        layout/                     # AppLayout, Navbar, Sidebar
        auth/                       # LoginForm, OAuthButton, TOTPSetup
        grid/                       # ShiftGrid, GridHeader, GridRow, GridCell, ShiftBlock,
                                    # CoverageBar, DragOverlay, TimeRuler
        events/                     # EventList, EventForm, EventSettings
        shifts/                     # ShiftForm, UserShiftList
        teams/                      # TeamList, TeamForm, TeamBadge
        notifications/              # NotificationBell, NotificationPreferences
        admin/                      # UserManagement, OAuthProviderForm, AuditLogViewer, ColorPaletteEditor
        availability/               # AvailabilityGrid
        export/                     # ExportMenu, PrintDialog, ICalTokenManager
        common/                     # LanguageSwitcher, ErrorBoundary, ConfirmDialog
      pages/                        # LoginPage, DashboardPage, EventPage, AdminPage, PublicEventPage, etc.
      contexts/AuthContext.tsx
      i18n/config.ts                # i18next setup (browser detection, no URL lang)
      lib/                          # utils, time helpers, permission helpers, print utils
      styles/print.css              # @media print styles
    public/locales/{en,de}/         # Translation JSON files (common, events, shifts, admin)

  deploy/
    nginx/nginx.conf                # Production reverse proxy
    postgres/init.sql
```

---

## Docker Setup

**Production** (`docker-compose.yml`): api (multi-stage Go build), web (Vite build -> nginx), postgres:17-alpine, redis:7-alpine

**Development** (`docker-compose.dev.yml` overlay): api with Air hot-reload + volume mount, web with Vite HMR, mailpit (SMTP testing on port 8025)

Key: All services on a shared `rncasp` bridge network. Postgres and Redis have health checks. API waits for healthy DB before starting.

---

## Views

1. **Everything view** - Full grid: all users as rows, time slots as columns, cells show team abbreviation with team color background. Like the main Excel sheet.
2. **Per team view** - Same grid filtered to one team's shifts only. Critical for team leads.
3. **Per day filter** - Applicable to any view. Custom time range filter (date picker).
4. **Per user view** - List format for selected user(s): "Tom: Friday 11:00-14:00 [Bar], 16:30-19:00 [Catering]"

---

## Coverage/Stats System

- Coverage requirements are time-varying per team per event (different requirements for different time ranges)
- Each team can have independent requirements for any time slot
- Some teams have no requirement (optional)
- Visual indicator per slot: understaffed (red), satisfied (green), overstaffed (yellow), no requirement (gray)
- Users cannot self-signup past the required count; event admins and super-admins can overbook

---

## Key Features

- **Drag & drop**: dnd-kit with snap-to-grid, move and resize shifts, optimistic updates
- **Availability**: Users mark available/preferred/unavailable time ranges per event, visible to admins on the grid
- **Notifications**: In-app bell + email (SMTP) + webhooks (Discord/Slack). Per-user preferences.
- **Real-time**: SSE pushes shift changes -> TanStack Query cache invalidation -> grid re-renders
- **Export**: CSV, PDF (print CSS + chromedp fallback), iCal (.ics) per event and per user
- **iCal subscriptions**: Token-based endpoints at `/ical/user/{uuid}/{token}`, `/ical/event/{slug}/all/{token}`, `/ical/event/{slug}/{team}/{token}`. Public fallback without token.
- **Print**: A4/A3 landscape, auto-pagination, paper size selector dialog
- **Audit log**: All mutations logged with old/new JSONB values, viewable by super-admins + event admins
- **Event locking**: Togglable lock/unlock (can be locked/unlocked multiple times). Locked = only super-admins can edit shifts.
- **Public access**: Toggle per event (super-admin only), accessible via slug URL without auth
- **i18n**: German + English, browser-detected, user-overridable, NOT in URL
- **Color palette**: Super-admin configurable in settings, applied as CSS custom properties
- **First-run**: First registered user auto-promoted to super-admin, setup wizard

---

## Implementation Phases (Multi-Agent Ready)

Each phase is broken into **work packages (WPs)** that can be executed by independent agents. Dependencies are noted with `requires: WP-X.Y`.

### Phase 1: Foundation

**WP-1.1: Project scaffolding + Docker** (Agent A)
- Initialize Go module (`api/`), create `cmd/server/main.go`
- Create `docker-compose.yml`, `docker-compose.dev.yml`
- Go Dockerfiles (prod multi-stage + dev with Air)
- `.env.example`, `Makefile` with targets: `dev`, `build`, `migrate`, `sqlc`, `lint`
- Health check endpoint (`GET /api/health`)
- Config loader from env vars (`internal/config/config.go`)

**WP-1.2: Database schema + codegen** (Agent B) `requires: WP-1.1 (go.mod exists)`
- Write full PostgreSQL migration (`migrations/001_initial_schema.sql`) with all tables from schema above
- Seed migration (`migrations/002_seed_defaults.sql`) with default app_settings including color palette
- Configure sqlc (`sqlc.yaml`) and write all `.sql` query files
- Run `sqlc generate` to produce Go repository code

**WP-1.3: React project setup** (Agent C)
- Initialize Vite + React + TypeScript project (`web/`)
- Install and configure: shadcn/ui, Tailwind CSS v4, react-router v7, TanStack Query v5, react-i18next, dnd-kit
- Web Dockerfiles (prod nginx + dev Vite HMR)
- Create translation JSON stubs for `en` and `de` (common, events, shifts, admin namespaces)
- i18next config with browser detection (no URL), fallback to `en`
- Base layout component (AppLayout with Navbar placeholder)
- Dynamic CSS custom property injection from API color palette
- `LanguageSwitcher` component

**WP-1.4: Authentication backend** (Agent A or B) `requires: WP-1.2`
- Auth handler: register, login, logout
- Password hashing with bcrypt
- Session management: secure HTTP-only cookies, SHA-256 token hash in DB + Redis
- Auth middleware (extract user from session, inject into context)
- First-user auto-promotion to super-admin

**WP-1.5: Authentication frontend** (Agent C or D) `requires: WP-1.3, WP-1.4`
- `AuthContext` with user state, login/logout functions
- Protected route wrapper component
- LoginPage, RegisterPage
- API client layer (`api/client.ts`) with cookie-based auth
- Redirect unauthenticated users to login

### Phase 2: Core Data Model

**WP-2.1: Teams backend** (Agent A) `requires: WP-1.4`
- Teams CRUD handler + service (super-admin only for create/update/delete)
- Team list endpoint (all authenticated users)
- Input validation (unique name, unique abbreviation, valid hex color)

**WP-2.2: Events backend** (Agent B) `requires: WP-1.4`
- Events CRUD handler + service
- Slug-based URL routing (`/api/events/{slug}`)
- Event creation (super-admin only) with: name, slug, description, location, participant_count, start/end time, time_granularity
- Event-team visibility management (which teams are shown per event)
- Event hidden hours configuration
- Event admin assignment (super-admin assigns event admins)
- Event lock/unlock endpoint (super-admin only, togglable)
- Event public access toggle (super-admin only)
- Permission middleware: `requireSuperAdmin`, `requireEventAdmin(slug)`, `requireUser`, `requireReadOnly`

**WP-2.3: Teams + Events frontend** (Agent C) `requires: WP-1.5, WP-2.1, WP-2.2`
- TanStack Query hooks: `useTeams`, `useEvents`, `useEvent(slug)`
- DashboardPage with event list (EventCard components)
- Team management page (super-admin: CRUD with color picker)
- EventForm (creation dialog with slug, dates, granularity, team visibility)
- EventSettingsPage (edit event, manage event admins, hide hours, lock/unlock)
- Permission-aware UI (hide admin actions from regular users)

### Phase 3: Shift Grid (Core Feature)

**WP-3.1: Shifts + coverage backend** (Agent A) `requires: WP-2.2`
- Shifts CRUD handler + service
- Self-signup logic: users can only create/edit/delete their own shifts
- Event admin: can create/edit/delete any shift in their event
- Super-admin: can do anything including in locked events
- Overlap detection: warn but allow (return warning in response)
- Overbooking prevention: users cannot exceed coverage requirement, admins can
- Locked event enforcement (reject non-super-admin mutations)
- Coverage requirements CRUD (time-varying per team per event)
- Grid data endpoint: returns shifts + coverage + team colors optimized for grid rendering

**WP-3.2: Shift grid frontend** (Agent B) `requires: WP-2.3, WP-3.1`
- `ShiftGrid` container: fetches data, manages grid state
- `GridHeader`: renders time slot columns based on event granularity (15/30/60 min)
- `GridRow`: one per user, renders cells across time slots
- `GridCell`: single time slot for one user - shows team abbreviation with team color background
- `ShiftBlock`: colored block spanning multiple cells for a shift
- `CoverageBar`: bottom row per team showing understaffed/satisfied/overstaffed
- `TimeRuler`: sticky time axis with day separators
- Event hidden hours respected (collapsed columns)
- Sticky first column (user names) for horizontal scrolling

**WP-3.3: Views + filters frontend** (Agent C) `requires: WP-3.2`
- Everything view (default: all users, all teams)
- Per team view: filter grid to show only shifts for selected team
- Per day filter: date range picker applied to any view
- Per user view: list format (`UserShiftList` component) for one or more selected users
- View selector UI (tabs or dropdown)
- Shift creation dialog (click empty cell -> select team, set start/end time)
- Shift deletion with confirmation dialog
- Overlap warning display

### Phase 4: Drag & Drop

**WP-4.1: DnD integration** (Agent A) `requires: WP-3.2`
- dnd-kit `DndContext` wrapper around ShiftGrid
- `useDraggable` on ShiftBlock components
- `useDroppable` on GridCell components
- Snap-to-grid: align to event's time granularity
- `DragOverlay` for visual feedback during drag
- Drag to move (change time slot)
- Drag to resize (extend/shorten shift by dragging edges)
- Optimistic update on drop -> API call -> rollback on failure
- Mobile touch support (dnd-kit handles this natively)
- Keyboard accessibility for shift management

### Phase 5: OAuth2 + 2FA

**WP-5.1: OAuth2 backend** (Agent A) `requires: WP-1.4`
- OAuth provider CRUD (super-admin manages providers)
- Generic OAuth2 flow: authorize redirect, callback handling, token exchange, userinfo fetch
- Configurable per provider: client_id, client_secret, authorize_url, token_url, userinfo_url, scopes
- Auto-create user on first OAuth login (link external_id to new user)
- Link/unlink OAuth connections for existing users
- GitLab as example default (pre-filled URLs for self-hosted GitLab)

**WP-5.2: TOTP 2FA backend** (Agent B) `requires: WP-1.4`
- TOTP setup endpoint: generate secret, return QR code URI + recovery codes
- TOTP verification on login (if enabled for user)
- Recovery code usage (one-time use)
- TOTP disable endpoint (requires current TOTP code)
- Use `pquerna/otp` library

**WP-5.3: OAuth2 + 2FA frontend** (Agent C) `requires: WP-5.1, WP-5.2`
- OAuth login buttons on LoginPage (dynamically rendered from active providers)
- OAuth account linking in user profile settings
- TOTP setup page with QR code display and verification step
- Recovery codes display (show once, warn to save)
- 2FA prompt on login when TOTP is enabled
- OAuth provider management in admin panel (OAuthProviderForm)

### Phase 6: Notifications + Real-time

**WP-6.1: SSE backend** (Agent A) `requires: WP-1.4`
- SSE broker (`internal/sse/broker.go`): manage client connections, broadcast events
- SSE handler (`GET /api/sse`): authenticated, long-lived connection
- Event types: `shift.created`, `shift.updated`, `shift.deleted`, `event.locked`, `event.unlocked`, `coverage.updated`
- Redis Pub/Sub for multi-instance event distribution
- In single-instance mode: in-memory channel fallback

**WP-6.2: Notification system backend** (Agent B) `requires: WP-1.4`
- Notification storage and CRUD
- Notification triggers on shift changes (created, updated, deleted), event creation, lock/unlock
- SMTP email sender (`internal/mail/mailer.go`) with HTML templates
- Webhook dispatcher (`internal/webhook/dispatcher.go`) with HMAC signing
- SMTP config management (super-admin)
- Notification preferences per user per trigger per channel
- Webhook CRUD per event

**WP-6.3: Notifications + SSE frontend** (Agent C) `requires: WP-6.1, WP-6.2`
- `useSSE` hook: connect to SSE, dispatch events to TanStack Query cache invalidation
- `NotificationBell` component with unread count badge
- `NotificationList` dropdown/page with mark-as-read
- `NotificationPreferences` settings page
- Real-time grid updates (grid re-renders when shifts change via SSE)
- SMTP settings page (super-admin)
- Webhook management UI

### Phase 7: Availability + Dummy Accounts

**WP-7.1: Availability backend** (Agent A) `requires: WP-2.2`
- User availability CRUD per event (available/preferred/unavailable time ranges with optional note)
- Availability data included in grid data endpoint

**WP-7.2: Dummy accounts backend** (Agent B) `requires: WP-1.4`
- Dummy account CRUD (super-admin creates, account_type='dummy')
- Dummy accounts show in user list for shift assignment but cannot login
- Dummy accounts have display_name but no email/password/TOTP

**WP-7.3: Availability + Dummy frontend** (Agent C) `requires: WP-7.1, WP-7.2, WP-3.2`
- `AvailabilityGrid`: users mark time slots as available/preferred/unavailable per event
- Availability indicators on the shift grid (subtle background tint on cells)
- Dummy account management page (super-admin)
- Dummy accounts visually distinguished in grid (e.g., italic name, icon)

### Phase 8: Export + Print + iCal Subscriptions

**WP-8.1: Export backend** (Agent A) `requires: WP-3.1`
- CSV export endpoint (`GET /api/events/{slug}/export/csv`) with configurable columns/filters
- iCal export per event (`GET /api/events/{slug}/export/ical`)
- Server-side PDF generation with chromedp (fallback for API-triggered exports)

**WP-8.2: iCal subscription system** (Agent B) `requires: WP-3.1`
- `ical_tokens` table management: create, list, revoke tokens
- Token generation: crypto/rand, store SHA-256 hash, return raw token once
- iCal subscription endpoints (no auth, token in URL):
  - `GET /ical/user/{user_uuid}/{token}` - all shifts for a user
  - `GET /ical/event/{slug}/all/{token}` - all shifts in an event
  - `GET /ical/event/{slug}/{team_abbr}/{token}` - shifts for one team in event
- Public fallback: if no token and event is public, return public data
- iCal generation with proper VCALENDAR/VEVENT structure (team name, location, description)
- `last_used_at` tracking on token usage
- Token management API endpoints for user settings

**WP-8.3: Export + Print frontend** (Agent C) `requires: WP-8.1, WP-8.2`
- `ExportMenu` component (CSV, PDF, iCal download, copy iCal subscription URL)
- `PrintDialog`: paper size selection (A4/A3), landscape orientation
- CSS `@media print` stylesheet with:
  - Auto-pagination (`page-break-*` properties)
  - A4 and A3 support via `@page { size: }` rules
  - Hidden UI elements (navbar, sidebar, buttons)
  - Preserved team colors
- `ICalTokenManager` in user settings: create tokens with label/scope, list active tokens, revoke

### Phase 9: Audit Log + Public Access

**WP-9.1: Audit log backend** (Agent A) `requires: WP-1.4`
- Audit middleware: intercept all mutating requests, log old/new values as JSONB
- Audit log query endpoints with filtering (by event, user, action, entity type, date range)
- Viewable by super-admins globally, event admins for their events

**WP-9.2: Public event access** (Agent B) `requires: WP-2.2, WP-3.1`
- Public event endpoint (`GET /api/public/events/{slug}`) - no auth required
- Public shift data endpoint (`GET /api/public/events/{slug}/shifts`) - no auth required
- Only returns data if event has `is_public=true`
- PublicEventPage: read-only grid view without auth UI

**WP-9.3: Audit log + public frontend** (Agent C) `requires: WP-9.1, WP-9.2`
- `AuditLogViewer`: filterable table/list of changes with pagination
- Show diff (old -> new values) for each audit entry
- PublicEventPage with read-only grid (no edit controls, no login required)

### Phase 10: Admin Dashboard + Settings

**WP-10.1: Admin backend** (Agent A) `requires: WP-1.4`
- User management endpoints (list, search, edit roles, deactivate, delete)
- App settings CRUD (app_name, registration_enabled, default_language, color_palette)
- Dashboard stats endpoint (user count, event count, active sessions, recent activity)

**WP-10.2: Admin frontend** (Agent B) `requires: WP-10.1`
- `UserManagement` page: user list with search, role editor, activation toggle
- `ColorPaletteEditor`: visual color picker for each palette entry, preview panel
- App settings page (registration toggle, default language)
- Admin dashboard with stats overview

### Phase 11: Mobile + Polish

**WP-11.1: Mobile responsive** (Agent A) `requires: WP-3.2`
- Responsive grid layout: horizontal scroll with pinned user column on mobile
- Hamburger menu navigation for mobile
- Touch-optimized shift interactions (larger tap targets)
- Bottom sheet dialogs for shift creation/editing on mobile

**WP-11.2: UX polish** (Agent B) `requires: all prior WPs`
- Loading skeletons for grid and lists
- Empty state illustrations/messages
- Error boundary with retry
- Toast notifications for actions (shift created, saved, etc.)
- Keyboard shortcuts documentation
- Consistent i18n: verify all strings in both DE and EN

### Phase 12: Testing + Security + Deployment

**WP-12.1: Backend tests** (Agent A) `requires: all backend WPs`
- Go unit tests for all services (table-driven tests)
- Go integration tests with testcontainers-go (PostgreSQL + Redis)
- API endpoint tests with httptest

**WP-12.2: Frontend tests** (Agent B) `requires: all frontend WPs`
- React component tests with Vitest + Testing Library
- Hook tests for TanStack Query hooks
- E2E tests with Playwright (critical flows: login, create event, assign shift, grid interaction)

**WP-12.3: Security + deployment** (Agent C)
- CSRF protection (SameSite cookie + optional CSRF token header)
- Rate limiting on auth endpoints
- Input validation and sanitization on all endpoints
- Production nginx config with security headers
- README with setup instructions
- `.env` documentation

---

## Key API Endpoints

```
# Auth
POST   /api/auth/register, /api/auth/login, /api/auth/logout
GET    /api/auth/oauth/{provider}, /api/auth/oauth/{provider}/callback
POST   /api/auth/totp/setup, /api/auth/totp/verify
DELETE /api/auth/totp
GET    /api/auth/me

# Users
GET    /api/users                    POST /api/users/dummy
GET    /api/users/{id}               PUT  /api/users/{id}               DELETE /api/users/{id}

# Events
GET    /api/events                   POST /api/events
GET    /api/events/{slug}            PUT  /api/events/{slug}            DELETE /api/events/{slug}
PUT    /api/events/{slug}/lock       PUT  /api/events/{slug}/public
GET    /api/events/{slug}/admins     POST /api/events/{slug}/admins     DELETE /api/events/{slug}/admins/{userId}
PUT    /api/events/{slug}/teams

# Teams
GET    /api/teams                    POST /api/teams
PUT    /api/teams/{id}               DELETE /api/teams/{id}

# Shifts
GET    /api/events/{slug}/shifts     POST /api/events/{slug}/shifts
PUT    /api/events/{slug}/shifts/{id}  DELETE /api/events/{slug}/shifts/{id}

# Coverage
GET    /api/events/{slug}/coverage   PUT  /api/events/{slug}/coverage

# Availability
GET    /api/events/{slug}/availability   PUT /api/events/{slug}/availability

# iCal Tokens (user settings)
GET    /api/ical-tokens              POST /api/ical-tokens              DELETE /api/ical-tokens/{id}

# iCal Subscriptions (no auth, token in URL)
GET    /ical/user/{uuid}/{token}
GET    /ical/event/{slug}/all/{token}
GET    /ical/event/{slug}/{team_abbr}/{token}

# Notifications
GET    /api/notifications            PUT  /api/notifications/{id}/read  PUT /api/notifications/read-all
GET    /api/notifications/preferences  PUT /api/notifications/preferences

# SSE
GET    /api/sse

# Exports
GET    /api/events/{slug}/export/csv   GET /api/events/{slug}/export/pdf

# Admin
GET    /api/admin/oauth-providers    POST/PUT/DELETE /api/admin/oauth-providers/{id}
GET    /api/admin/smtp               PUT  /api/admin/smtp               POST /api/admin/smtp/test
GET    /api/admin/audit-log
GET    /api/admin/settings           PUT  /api/admin/settings
GET    /api/admin/webhooks           POST/PUT/DELETE /api/admin/webhooks/{id}

# Public
GET    /api/public/events/{slug}     GET  /api/public/events/{slug}/shifts

# Health
GET    /api/health
```

---

## Verification

1. `docker compose up` starts all services, API healthy, DB migrated
2. Register first user -> auto super-admin
3. Create teams (Bar, Catering, etc.) with colors
4. Create event with slug, set time granularity
5. Assign event admins, hide/show teams per event
6. Create shifts via grid click and drag-drop
7. Verify coverage indicators (red/green/yellow)
8. Test all 4 views (everything, per-team, per-day, per-user)
9. Self-signup as regular user, verify overbooking prevention
10. Lock event, verify only super-admin can edit; unlock, verify edit works again
11. Enable public access, verify unauthenticated slug URL works
12. Test OAuth2 login, TOTP setup
13. Verify SSE real-time updates across two browser tabs
14. Export CSV/PDF, verify content
15. Create iCal token, subscribe in calendar app, verify shifts appear
16. Test `/ical/event/{slug}/all/{token}` and team-filtered variants
17. Print in A4/A3, verify pagination
18. Switch language DE<->EN, verify all strings
19. Change color palette in admin, verify UI updates
20. Check audit log for all changes
21. Test on mobile browser
