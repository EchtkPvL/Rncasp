package migrate

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Run applies all pending migrations from the given filesystem.
// Migration files must be named NNN_description.sql and use goose format
// (-- +goose Up / -- +goose Down markers).
func Run(ctx context.Context, db *pgxpool.Pool, migrations fs.FS, logger *slog.Logger) error {
	// Create tracking table
	if _, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("creating schema_migrations table: %w", err)
	}

	// Collect applied versions
	rows, err := db.Query(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return fmt.Errorf("querying applied migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[string]bool)
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return fmt.Errorf("scanning migration version: %w", err)
		}
		applied[v] = true
	}

	// List and sort migration files
	entries, err := fs.ReadDir(migrations, ".")
	if err != nil {
		return fmt.Errorf("reading migrations directory: %w", err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	// Apply pending migrations
	for _, name := range files {
		if applied[name] {
			continue
		}

		data, err := fs.ReadFile(migrations, name)
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", name, err)
		}

		upSQL := extractUp(string(data))
		if upSQL == "" {
			// No goose markers — treat entire file as the up migration
			upSQL = string(data)
		}

		logger.Info("applying migration", "file", name)

		tx, err := db.Begin(ctx)
		if err != nil {
			return fmt.Errorf("beginning transaction for %s: %w", name, err)
		}

		if _, err := tx.Exec(ctx, upSQL); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("executing migration %s: %w", name, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", name); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("recording migration %s: %w", name, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("committing migration %s: %w", name, err)
		}

		logger.Info("applied migration", "file", name)
	}

	return nil
}

// extractUp returns the SQL between "-- +goose Up" and "-- +goose Down" markers.
// It strips goose StatementBegin/End markers.
func extractUp(content string) string {
	lines := strings.Split(content, "\n")
	var upLines []string
	inUp := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if trimmed == "-- +goose Up" {
			inUp = true
			continue
		}
		if trimmed == "-- +goose Down" {
			break
		}
		if !inUp {
			continue
		}
		// Skip goose statement markers
		if trimmed == "-- +goose StatementBegin" || trimmed == "-- +goose StatementEnd" {
			continue
		}
		upLines = append(upLines, line)
	}

	return strings.TrimSpace(strings.Join(upLines, "\n"))
}
