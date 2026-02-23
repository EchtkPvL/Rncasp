package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/server/middleware"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type AvailabilityHandler struct {
	availabilityService *service.AvailabilityService
}

func NewAvailabilityHandler(availabilityService *service.AvailabilityService) *AvailabilityHandler {
	return &AvailabilityHandler{availabilityService: availabilityService}
}

type availabilityEntryRequest struct {
	StartTime string  `json:"start_time"`
	EndTime   string  `json:"end_time"`
	Status    string  `json:"status"`
	Note      *string `json:"note"`
}

type setAvailabilityRequest struct {
	Entries []availabilityEntryRequest `json:"entries"`
}

// ListByEvent returns all availability for an event.
func (h *AvailabilityHandler) ListByEvent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	avail, err := h.availabilityService.ListByEvent(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, avail)
}

// ListMine returns the current user's availability for an event.
func (h *AvailabilityHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	callerID := middleware.GetUserID(r.Context())
	if callerID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	avail, err := h.availabilityService.ListByEventAndUser(r.Context(), slug, *callerID)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, avail)
}

// SetMine replaces the current user's availability for an event.
func (h *AvailabilityHandler) SetMine(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	callerID := middleware.GetUserID(r.Context())
	if callerID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}
	callerRole := middleware.GetRole(r.Context())

	var req setAvailabilityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	entries := make([]service.AvailabilityEntry, len(req.Entries))
	for i, e := range req.Entries {
		startTime, err := time.Parse(time.RFC3339, e.StartTime)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "start_time", "invalid datetime format, use RFC3339"))
			return
		}
		endTime, err := time.Parse(time.RFC3339, e.EndTime)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "end_time", "invalid datetime format, use RFC3339"))
			return
		}
		entries[i] = service.AvailabilityEntry{
			StartTime: startTime,
			EndTime:   endTime,
			Status:    e.Status,
			Note:      e.Note,
		}
	}

	result, err := h.availabilityService.SetAvailability(r.Context(), service.SetAvailabilityInput{
		EventSlug: slug,
		UserID:    *callerID,
		Entries:   entries,
	}, *callerID, callerRole)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, result)
}

// SetForUser replaces a specific user's availability (admin operation).
func (h *AvailabilityHandler) SetForUser(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	userID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid user ID"))
		return
	}

	callerID := middleware.GetUserID(r.Context())
	if callerID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}
	callerRole := middleware.GetRole(r.Context())

	var req setAvailabilityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	entries := make([]service.AvailabilityEntry, len(req.Entries))
	for i, e := range req.Entries {
		startTime, err := time.Parse(time.RFC3339, e.StartTime)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "start_time", "invalid datetime format, use RFC3339"))
			return
		}
		endTime, err := time.Parse(time.RFC3339, e.EndTime)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "end_time", "invalid datetime format, use RFC3339"))
			return
		}
		entries[i] = service.AvailabilityEntry{
			StartTime: startTime,
			EndTime:   endTime,
			Status:    e.Status,
			Note:      e.Note,
		}
	}

	result, err := h.availabilityService.SetAvailability(r.Context(), service.SetAvailabilityInput{
		EventSlug: slug,
		UserID:    userID,
		Entries:   entries,
	}, *callerID, callerRole)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, result)
}
