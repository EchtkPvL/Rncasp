package handler

import (
	"encoding/json"
	"net/http"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
)

type AdminHandler struct {
	appSettingsService *service.AppSettingsService
	cleanupService     *service.CleanupService
}

func NewAdminHandler(appSettingsService *service.AppSettingsService, cleanupService *service.CleanupService) *AdminHandler {
	return &AdminHandler{appSettingsService: appSettingsService, cleanupService: cleanupService}
}

// ListSettings returns all app settings.
func (h *AdminHandler) ListSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.appSettingsService.ListAll(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, settings)
}

// ListPublicSettings returns only the allowlisted settings for unauthenticated access.
func (h *AdminHandler) ListPublicSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.appSettingsService.ListPublic(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, settings)
}

// GetSetting returns a single app setting by key.
func (h *AdminHandler) GetSetting(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")

	setting, err := h.appSettingsService.Get(r.Context(), key)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, setting)
}

type upsertSettingRequest struct {
	Value json.RawMessage `json:"value"`
}

// SetSetting upserts an app setting.
func (h *AdminHandler) SetSetting(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")

	var req upsertSettingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	setting, err := h.appSettingsService.Set(r.Context(), key, req.Value)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, setting)
}

// DeleteSetting removes an app setting.
func (h *AdminHandler) DeleteSetting(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")

	if err := h.appSettingsService.Delete(r.Context(), key); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DashboardStats returns aggregated stats for the admin dashboard.
func (h *AdminHandler) DashboardStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.appSettingsService.GetDashboardStats(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, stats)
}

// RunCleanup triggers an immediate cleanup and returns the result.
func (h *AdminHandler) RunCleanup(w http.ResponseWriter, r *http.Request) {
	result, err := h.cleanupService.RunNow(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, result)
}
