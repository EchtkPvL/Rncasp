package service

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/jackc/pgx/v5"
)

type AppSettingsService struct {
	queries        *repository.Queries
	logger         *slog.Logger
	webhookService *WebhookService
	auditService   *AuditService
}

func NewAppSettingsService(queries *repository.Queries, logger *slog.Logger) *AppSettingsService {
	return &AppSettingsService{queries: queries, logger: logger}
}

func (s *AppSettingsService) SetWebhookService(ws *WebhookService) {
	s.webhookService = ws
}

func (s *AppSettingsService) SetAuditService(as *AuditService) {
	s.auditService = as
}

// AppSettingResponse is the API-facing representation of an app setting.
type AppSettingResponse struct {
	Key       string          `json:"key"`
	Value     json.RawMessage `json:"value"`
	UpdatedAt string          `json:"updated_at"`
}

// publicSettingsAllowlist defines the keys exposed via the unauthenticated public settings endpoint.
var publicSettingsAllowlist = map[string]bool{
	"app_name":             true,
	"color_palette":        true,
	"registration_enabled": true,
	"default_language":     true,
}

// ListAll returns all app settings.
func (s *AppSettingsService) ListAll(ctx context.Context) ([]AppSettingResponse, error) {
	settings, err := s.queries.ListAppSettings(ctx)
	if err != nil {
		s.logger.Error("failed to list app settings", "error", err)
		return nil, err
	}
	result := make([]AppSettingResponse, len(settings))
	for i, setting := range settings {
		result[i] = appSettingToResponse(setting)
	}
	return result, nil
}

// ListPublic returns only the allowlisted app settings for unauthenticated access.
func (s *AppSettingsService) ListPublic(ctx context.Context) ([]AppSettingResponse, error) {
	settings, err := s.queries.ListAppSettings(ctx)
	if err != nil {
		s.logger.Error("failed to list app settings", "error", err)
		return nil, err
	}
	var result []AppSettingResponse
	for _, setting := range settings {
		if publicSettingsAllowlist[setting.Key] {
			result = append(result, appSettingToResponse(setting))
		}
	}
	return result, nil
}

// Get returns a single app setting by key.
func (s *AppSettingsService) Get(ctx context.Context, key string) (*AppSettingResponse, error) {
	setting, err := s.queries.GetAppSetting(ctx, key)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, model.NewDomainError(model.ErrNotFound, "setting not found")
		}
		s.logger.Error("failed to get app setting", "key", key, "error", err)
		return nil, err
	}
	resp := appSettingToResponse(setting)
	return &resp, nil
}

// Set upserts an app setting.
func (s *AppSettingsService) Set(ctx context.Context, key string, value json.RawMessage) (*AppSettingResponse, error) {
	if key == "" {
		return nil, model.NewDomainError(model.ErrInvalidInput, "key is required")
	}

	// Validate JSON
	if !json.Valid(value) {
		return nil, model.NewDomainError(model.ErrInvalidInput, "value must be valid JSON")
	}

	setting, err := s.queries.UpsertAppSetting(ctx, key, value)
	if err != nil {
		s.logger.Error("failed to upsert app setting", "key", key, "error", err)
		return nil, err
	}

	if s.webhookService != nil {
		go s.webhookService.DispatchGlobal(context.Background(), "settings.changed", map[string]string{
			"key": key,
		})
	}

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, nil, "update", "setting", nil, nil, map[string]string{"key": key}, nil)
	}

	resp := appSettingToResponse(setting)
	return &resp, nil
}

// Delete removes an app setting.
func (s *AppSettingsService) Delete(ctx context.Context, key string) error {
	// Make sure the setting exists first
	_, err := s.queries.GetAppSetting(ctx, key)
	if err != nil {
		if err == pgx.ErrNoRows {
			return model.NewDomainError(model.ErrNotFound, "setting not found")
		}
		return err
	}

	return s.queries.DeleteAppSetting(ctx, key)
}

// DashboardStats holds aggregated stats for the admin dashboard.
type DashboardStats struct {
	TotalUsers         int64 `json:"total_users"`
	TotalEvents        int64 `json:"total_events"`
	ActiveEvents       int64 `json:"active_events"`
	TotalShifts        int64 `json:"total_shifts"`
	TotalTeams         int64 `json:"total_teams"`
	TotalSessions      int64 `json:"total_sessions"`
	ExpiredSessions    int64 `json:"expired_sessions"`
	TotalAuditEntries  int64 `json:"total_audit_entries"`
	TotalNotifications int64 `json:"total_notifications"`
	ReadNotifications  int64 `json:"read_notifications"`
}

// GetDashboardStats returns aggregated stats for the admin dashboard.
func (s *AppSettingsService) GetDashboardStats(ctx context.Context) (*DashboardStats, error) {
	totalUsers, err := s.queries.CountUsers(ctx, repository.CountUsersParams{})
	if err != nil {
		s.logger.Error("failed to count users", "error", err)
		return nil, err
	}

	totalEvents, err := s.queries.CountEvents(ctx)
	if err != nil {
		s.logger.Error("failed to count events", "error", err)
		return nil, err
	}

	activeEvents, err := s.queries.CountActiveEvents(ctx)
	if err != nil {
		s.logger.Error("failed to count active events", "error", err)
		return nil, err
	}

	totalShifts, err := s.queries.CountShifts(ctx)
	if err != nil {
		s.logger.Error("failed to count shifts", "error", err)
		return nil, err
	}

	totalTeams, err := s.queries.CountTeams(ctx)
	if err != nil {
		s.logger.Error("failed to count teams", "error", err)
		return nil, err
	}

	totalSessions, err := s.queries.CountSessions(ctx)
	if err != nil {
		s.logger.Error("failed to count sessions", "error", err)
		return nil, err
	}

	expiredSessions, err := s.queries.CountExpiredSessions(ctx)
	if err != nil {
		s.logger.Error("failed to count expired sessions", "error", err)
		return nil, err
	}

	totalAuditEntries, err := s.queries.CountAuditLogEntries(ctx)
	if err != nil {
		s.logger.Error("failed to count audit log entries", "error", err)
		return nil, err
	}

	totalNotifications, err := s.queries.CountNotifications(ctx)
	if err != nil {
		s.logger.Error("failed to count notifications", "error", err)
		return nil, err
	}

	readNotifications, err := s.queries.CountReadNotifications(ctx)
	if err != nil {
		s.logger.Error("failed to count read notifications", "error", err)
		return nil, err
	}

	return &DashboardStats{
		TotalUsers:         totalUsers,
		TotalEvents:        totalEvents,
		ActiveEvents:       activeEvents,
		TotalShifts:        totalShifts,
		TotalTeams:         totalTeams,
		TotalSessions:      totalSessions,
		ExpiredSessions:    expiredSessions,
		TotalAuditEntries:  totalAuditEntries,
		TotalNotifications: totalNotifications,
		ReadNotifications:  readNotifications,
	}, nil
}

func appSettingToResponse(s repository.AppSetting) AppSettingResponse {
	return AppSettingResponse{
		Key:       s.Key,
		Value:     s.Value,
		UpdatedAt: s.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
}
