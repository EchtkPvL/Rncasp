# Rncasp - Really No Clue About Shift Planning

A full-stack shift planning web application for LAN party events and multi-day gatherings. Replaces Excel-based shift coordination with an interactive grid, real-time updates, drag-and-drop scheduling, and team-based coverage tracking.

## Features

- **Interactive Shift Grid** - Drag-and-drop scheduling with snap-to-grid, move and resize shifts, optimistic updates
- **Team-Based Coverage** - Per-team coverage requirements with real-time understaffed/satisfied/overstaffed indicators
- **Multiple Views** - Everything (all users/teams), per-team filter, per-day filter, my shifts
- **Real-Time Updates** - Server-Sent Events (SSE) with Redis Pub/Sub push shift changes to all connected clients instantly
- **Authentication** - Local login with bcrypt, OAuth2 (configurable providers), TOTP 2FA with recovery codes
- **Role-Based Permissions** - Super-admin, event admin (per-event), user, read-only, plus dummy (placeholder) accounts
- **Notifications** - In-app bell, email (SMTP), webhooks (HMAC-signed, Discord/Slack compatible)
- **iCal Subscriptions** - Token-scoped calendar feeds (per-user, per-event, per-team)
- **Export & Print** - Unified export modal with CSV download, iCal export, and dedicated print layouts (grid table with colspan shifts, user-grouped list), configurable paper size (A4/A3), orientation, day selection, coverage bars, and team colors
- **Internationalization** - German and English, browser-detected, user-overridable
- **Configurable Color Palette** - Super-admin editable theme injected as CSS custom properties
- **Audit Logging** - All mutations recorded with before/after JSONB diffs
- **Public Event Access** - Optional public read-only view per event
- **Mobile Responsive** - Hamburger navigation, touch-optimized drag, bottom-sheet dialogs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Go 1.23, Chi v5 router |
| **Database** | PostgreSQL 17, sqlc + pgx v5 |
| **Cache/Sessions** | Redis 7 |
| **Migrations** | Auto-run on startup (embedded SQL) |
| **Frontend** | React 19, TypeScript, Vite |
| **UI** | Tailwind CSS v4 with CSS custom properties |
| **State** | TanStack Query v5 |
| **Drag & Drop** | dnd-kit |
| **i18n** | react-i18next |
| **Real-time** | SSE (Server-Sent Events) |
| **Infrastructure** | Docker, Docker Compose, nginx |

## Prerequisites

- Docker and Docker Compose
- Go 1.23+ (for local development without Docker)
- Node.js 20+ (for local frontend development)
- Make

## Quick Start

```bash
# Clone and configure
cp .env.example .env

# Start all services (API + Web + Postgres + Redis + Mailpit)
make dev
```

Services will be available at:
- **Web UI**: http://localhost:5173
- **API**: http://localhost:8080
- **Mailpit** (dev email): http://localhost:8025

The first registered user is automatically promoted to super-admin.

## Development

### Full Stack (Docker)

```bash
make dev          # Start all services with hot reload (Air for Go, Vite HMR for React)
make dev-down     # Stop all services
make dev-logs     # Stream container logs
```

### Backend Only

```bash
cd api && go run cmd/server/main.go
```

### Frontend Only

```bash
cd web && npm run dev
```

### Database

Migrations run automatically on API startup. To add a new migration, create a file in `api/migrations/` following the naming convention `NNN_description.sql` with goose-format markers (`-- +goose Up` / `-- +goose Down`).

```bash
make sqlc         # Regenerate Go code from SQL queries
```

### Testing

```bash
# Backend
cd api && go test ./...

# With coverage
cd api && go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out
```

### Linting

```bash
make lint
```

## Production Deployment

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/EchtkPvL/Rncasp.git
cd Rncasp

# Configure environment
cp .env.example .env
# Edit .env — at minimum change DB_PASSWORD and APP_BASE_URL
```

Key `.env` settings:

| Variable | What to set |
|----------|-------------|
| `DB_PASSWORD` | Strong database password |
| `APP_BASE_URL` | Your public URL (e.g. `https://shifts.example.com`) |
| `APP_ENV` | `production` |
| `AUTH_COOKIE_SECURE` | `true` if behind HTTPS (recommended) |
| `AUTH_COOKIE_DOMAIN` | Your domain (e.g. `shifts.example.com`) |
| `CORS_ALLOWED_ORIGINS` | Same as `APP_BASE_URL` |
| `HTTP_LISTEN` | Host bind address (default `0.0.0.0:80`, e.g. `127.0.0.1:8080` behind a reverse proxy) |

```bash
# Build and start
docker compose up -d --build
```

The first registered user is automatically promoted to super-admin.

### Updating Production

```bash
# Pull latest changes
git pull

# Rebuild and restart (zero-downtime for web, brief restart for API)
docker compose up -d --build

# Verify
docker compose logs api --tail 20
```

Database migrations run automatically on API startup — no manual migration step needed. The API checks a `schema_migrations` table and applies any pending `.sql` files before accepting traffic.

To force a full rebuild (e.g. after dependency changes):

```bash
docker compose build --no-cache
docker compose up -d
```

### Architecture

Production uses multi-stage Docker builds and Unix sockets for all inter-service communication:

- **API**: Go binary on Alpine (~20MB), listens on Unix socket
- **Web**: Vite build served by nginx, proxies `/api` to API via Unix socket
- **PostgreSQL**: Connected via Unix socket (`/var/run/postgresql`)
- **Redis**: Connected via Unix socket (`/var/run/redis/redis.sock`)
- Only the HTTP port (nginx) is exposed to the host

## Project Structure

```
rncasp/
  api/                              # Go backend
    cmd/server/main.go              # Entry point
    internal/
      config/                       # Environment-based configuration
      server/                       # HTTP server, routes, middleware
        middleware/                  # Auth, CORS, rate limiting, request ID, logging
      handler/                      # HTTP handlers (17 files)
      service/                      # Business logic (15 files)
      repository/                   # sqlc-generated data access layer
        queries/                    # SQL query definitions (15 files)
      model/                        # DTOs, domain errors, response helpers
      sse/                          # SSE event broker with Redis Pub/Sub
      migrate/                      # Auto-migration runner (embedded SQL)
    migrations/                     # PostgreSQL schema migrations (auto-applied on startup)

  web/                              # React frontend
    src/
      api/                          # API client modules (18 files)
      hooks/                        # TanStack Query hooks (10 files)
      components/
        grid/                       # ShiftGrid, TimeRuler, GridRow, ShiftBlock, CoverageBar
        shifts/                     # CreateShiftDialog, ShiftDetailDialog
        layout/                     # AppLayout, Navbar
        events/                     # EventCard, CreateEventDialog
        notifications/              # NotificationBell, NotificationList
        export/                     # ExportMenu, ExportModal, PrintContainer, PrintGridPage, PrintListPage
        common/                     # Toast, ErrorBoundary, LanguageSwitcher, DateTimePicker
      pages/                        # Route-level page components
      contexts/                     # AuthContext
      i18n/                         # i18next configuration
      lib/                          # Utilities (time helpers, permissions)
    public/locales/{en,de}/         # Translation files

  deploy/nginx/                     # Production nginx config
  docker-compose.yml                # Production stack
  docker-compose.dev.yml            # Development overlay
  Makefile                          # Build and dev commands
```

## Architecture

### Backend: Handler -> Service -> Repository

```
HTTP Request
  -> Middleware (auth, rate limit, CORS, request ID, logging)
    -> Handler (parse request, validate input)
      -> Service (business logic, permission checks)
        -> Repository (sqlc-generated database queries)
```

- **Handlers** are thin: parse JSON, call service, return response
- **Services** contain all business rules: permissions, overlap detection, overbooking prevention, event locking
- **Repository** is auto-generated by sqlc from SQL queries -- never edit `*.sql.go` files

### Frontend: Page -> Component -> Hook -> API

```
Page Component
  -> TanStack Query hooks (useShifts, useEvents, etc.)
    -> API client functions (fetch with credentials)
  -> SSE hook triggers cache invalidation on server events
```

## API Overview

| Area | Endpoints |
|------|-----------|
| **Auth** | Register, login, logout, OAuth2 flow, TOTP setup/verify |
| **Users** | List, search, CRUD, dummy accounts |
| **Events** | CRUD, slug-based routing, lock/unlock, public toggle, team visibility, admin assignment |
| **Teams** | CRUD with color and abbreviation |
| **Shifts** | CRUD per event, grid data endpoint |
| **Coverage** | Per-team per-event time-varying requirements |
| **Availability** | User availability marking per event |
| **Notifications** | In-app CRUD, preferences, SMTP config, webhooks |
| **iCal** | Token management, subscription feeds (no auth) |
| **Export** | CSV, iCal per event |
| **Admin** | OAuth providers, SMTP, app settings, audit log, dashboard stats |
| **Public** | Read-only event + grid (if `is_public=true`) |
| **SSE** | Real-time event stream |

## Environment Variables

See [`.env.example`](.env.example) for all configuration options. Service connection details (hosts, ports, sockets) are handled by Docker Compose and don't need to be set in `.env`.

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_ENV` | `production` or `development` | `production` |
| `APP_NAME` | Application display name | `Rncasp` |
| `APP_BASE_URL` | Public URL for links/CORS | `http://localhost:8080` |
| `APP_REGISTRATION_ENABLED` | Allow new user registration | `true` |
| `APP_DEFAULT_LANGUAGE` | Default language (`en`/`de`) | `en` |
| `DB_USER` | PostgreSQL username | `rncasp` |
| `DB_PASSWORD` | PostgreSQL password | `rncasp` |
| `DB_NAME` | PostgreSQL database name | `rncasp` |
| `AUTH_SESSION_TTL` | Session duration | `24h` |
| `AUTH_COOKIE_SECURE` | Require HTTPS for cookies | `true` |
| `AUTH_COOKIE_DOMAIN` | Cookie domain scope | (empty) |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:5173` |
| `HTTP_LISTEN` | Host-side `ip:port` for nginx | `0.0.0.0:80` |

## Database Schema

Key tables: `users`, `sessions`, `teams`, `events`, `shifts`, `coverage_requirements`, `user_availability`, `ical_tokens`, `notifications`, `notification_preferences`, `webhooks`, `audit_log`, `oauth_providers`, `oauth_connections`, `smtp_config`, `app_settings`

All IDs are UUIDs. All timestamps are TIMESTAMPTZ (UTC). Shifts are stored as time ranges (start/end), not per-slot records.

## Permission Model

| Role | Scope | Capabilities |
|------|-------|-------------|
| **Super-admin** | Global | Everything: events, users, OAuth, SMTP, teams, locked events, public access, color palette |
| **Event admin** | Per-event | Edit shifts + settings for assigned events |
| **User** | Global | Self-signup for shifts, edit/remove own shifts, view everything |
| **Read-only** | Global | View only |

**Dummy accounts**: Non-login placeholder accounts assignable to shifts (e.g., "Security 1").

## Development Notes

### Adding a New Feature (End-to-End)

1. Add/modify tables in a new migration (`api/migrations/NNN_description.sql`) — applied automatically on next startup
2. Write SQL queries in `api/internal/repository/queries/`, run `make sqlc`
3. Add business logic in `api/internal/service/`
4. Add HTTP handler in `api/internal/handler/`, register route in `routes.go`
5. Create TanStack Query hook in `web/src/hooks/`
6. Build React component in `web/src/components/`
7. Add translation keys to `web/public/locales/{en,de}/`

### sqlc Workflow

Write SQL in `api/internal/repository/queries/*.sql`, run `make sqlc`, **never edit generated files** (`db.go`, `models.go`, `*.sql.go`).

## License

[GNU AGPL v3](LICENSE)

---

## Disclaimer

This project was built by [Claude](https://claude.ai) and [ralph](https://github.com/frankbria/ralph-claude-code). No guarantee that everything works perfectly -- something might be broken, or future updates could break something. To quote a relevant tweet:

> Claude 4 just refactored my entire codebase in one call.
>
> 25 tool invocations. 3,000+ new lines. 12 brand new files.
>
> It modularized everything. Broke up monoliths. Cleaned up spaghetti.
>
> None of it worked.
>
> But boy was it beautiful.
