package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/echtkpvl/rncasp/internal/repository"
)

type CleanupService struct {
	queries *repository.Queries
	logger  *slog.Logger
	stopCh  chan struct{}
}

type CleanupSettings struct {
	Enabled                    bool `json:"cleanup_enabled"`
	IntervalHours              int  `json:"cleanup_interval_hours"`
	RetentionDaysAudit         int  `json:"retention_days_audit"`
	RetentionDaysNotifications int  `json:"retention_days_notifications"`
	RetentionDaysRecoveryCodes int  `json:"retention_days_recovery_codes"`
}

type CleanupResult struct {
	ExpiredSessions    int64 `json:"expired_sessions"`
	OldAuditEntries    int64 `json:"old_audit_entries"`
	OldNotifications   int64 `json:"old_notifications"`
	UsedRecoveryCodes  int64 `json:"used_recovery_codes"`
}

func NewCleanupService(queries *repository.Queries, logger *slog.Logger) *CleanupService {
	return &CleanupService{
		queries: queries,
		logger:  logger,
		stopCh:  make(chan struct{}),
	}
}

func (s *CleanupService) Start(ctx context.Context) {
	// Run once on startup after a short delay
	timer := time.NewTimer(1 * time.Minute)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-timer.C:
			settings := s.readSettings(ctx)
			if settings.Enabled {
				result := s.runCleanup(ctx, settings)
				s.logger.Info("scheduled cleanup completed",
					"expired_sessions", result.ExpiredSessions,
					"old_audit_entries", result.OldAuditEntries,
					"old_notifications", result.OldNotifications,
					"used_recovery_codes", result.UsedRecoveryCodes,
				)
			} else {
				s.logger.Debug("scheduled cleanup skipped (disabled)")
			}

			// Re-read settings for next interval
			settings = s.readSettings(ctx)
			interval := time.Duration(settings.IntervalHours) * time.Hour
			if interval < 1*time.Hour {
				interval = 1 * time.Hour
			}
			timer.Reset(interval)
		}
	}
}

func (s *CleanupService) Stop() {
	close(s.stopCh)
}

func (s *CleanupService) RunNow(ctx context.Context) (*CleanupResult, error) {
	settings := s.readSettings(ctx)
	result := s.runCleanup(ctx, settings)
	return &result, nil
}

func (s *CleanupService) GetSettings(ctx context.Context) CleanupSettings {
	return s.readSettings(ctx)
}

func (s *CleanupService) readSettings(ctx context.Context) CleanupSettings {
	defaults := CleanupSettings{
		Enabled:                    true,
		IntervalHours:              24,
		RetentionDaysAudit:         90,
		RetentionDaysNotifications: 30,
		RetentionDaysRecoveryCodes: 90,
	}

	setting, err := s.queries.GetAppSetting(ctx, "cleanup")
	if err != nil {
		return defaults
	}

	var settings CleanupSettings
	if err := json.Unmarshal(setting.Value, &settings); err != nil {
		s.logger.Error("failed to parse cleanup settings", "error", err)
		return defaults
	}

	return settings
}

func (s *CleanupService) runCleanup(ctx context.Context, settings CleanupSettings) CleanupResult {
	var result CleanupResult

	// Delete expired sessions (always, regardless of retention settings)
	count, err := s.queries.DeleteExpiredSessions(ctx)
	if err != nil {
		s.logger.Error("failed to delete expired sessions", "error", err)
	} else {
		result.ExpiredSessions = count
	}

	// Delete old audit log entries
	cutoff := time.Now().AddDate(0, 0, -settings.RetentionDaysAudit)
	count, err = s.queries.DeleteOldAuditLog(ctx, cutoff)
	if err != nil {
		s.logger.Error("failed to delete old audit log entries", "error", err)
	} else {
		result.OldAuditEntries = count
	}

	// Delete old read notifications
	cutoff = time.Now().AddDate(0, 0, -settings.RetentionDaysNotifications)
	count, err = s.queries.DeleteOldNotifications(ctx, cutoff)
	if err != nil {
		s.logger.Error("failed to delete old notifications", "error", err)
	} else {
		result.OldNotifications = count
	}

	// Delete used recovery codes
	cutoff = time.Now().AddDate(0, 0, -settings.RetentionDaysRecoveryCodes)
	count, err = s.queries.DeleteUsedRecoveryCodes(ctx, cutoff)
	if err != nil {
		s.logger.Error("failed to delete used recovery codes", "error", err)
	} else {
		result.UsedRecoveryCodes = count
	}

	return result
}
