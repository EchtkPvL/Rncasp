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

type EventHandler struct {
	eventService *service.EventService
}

func NewEventHandler(eventService *service.EventService) *EventHandler {
	return &EventHandler{eventService: eventService}
}

type createEventRequest struct {
	Name             string  `json:"name"`
	Slug             string  `json:"slug"`
	Description      *string `json:"description"`
	Location         *string `json:"location"`
	ParticipantCount *int32  `json:"participant_count"`
	StartTime        string  `json:"start_time"`
	EndTime          string  `json:"end_time"`
	TimeGranularity  string  `json:"time_granularity"`
}

type updateEventRequest struct {
	Name             *string `json:"name"`
	Description      *string `json:"description"`
	Location         *string `json:"location"`
	ParticipantCount *int32  `json:"participant_count"`
	StartTime        *string `json:"start_time"`
	EndTime          *string `json:"end_time"`
	TimeGranularity  *string `json:"time_granularity"`
}

type setLockedRequest struct {
	IsLocked bool `json:"is_locked"`
}

type setPublicRequest struct {
	IsPublic bool `json:"is_public"`
}

type setEventTeamRequest struct {
	TeamID    string `json:"team_id"`
	IsVisible bool   `json:"is_visible"`
}

type addAdminRequest struct {
	UserID string `json:"user_id"`
}

type hiddenRangeRequest struct {
	HideStartHour int32 `json:"hide_start_hour"`
	HideEndHour   int32 `json:"hide_end_hour"`
}

type setHiddenRangesRequest struct {
	Ranges []hiddenRangeRequest `json:"ranges"`
}

func (h *EventHandler) List(w http.ResponseWriter, r *http.Request) {
	events, err := h.eventService.List(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, events)
}

func (h *EventHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	event, err := h.eventService.GetBySlug(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	// Enrich response with caller's event admin status
	if userID := middleware.GetUserID(r.Context()); userID != nil {
		isAdmin, _ := h.eventService.IsEventAdmin(r.Context(), slug, *userID)
		event.IsEventAdmin = isAdmin
	}

	model.JSON(w, http.StatusOK, event)
}

func (h *EventHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	startTime, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "start_time", "invalid datetime format, use RFC3339"))
		return
	}
	endTime, err := time.Parse(time.RFC3339, req.EndTime)
	if err != nil {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "end_time", "invalid datetime format, use RFC3339"))
		return
	}

	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	event, err := h.eventService.Create(r.Context(), service.CreateEventInput{
		Name:             req.Name,
		Slug:             req.Slug,
		Description:      req.Description,
		Location:         req.Location,
		ParticipantCount: req.ParticipantCount,
		StartTime:        startTime,
		EndTime:          endTime,
		TimeGranularity:  req.TimeGranularity,
		CreatedBy:        *userID,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, event)
}

func (h *EventHandler) Update(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	var req updateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	input := service.UpdateEventInput{
		Name:             req.Name,
		Description:      req.Description,
		Location:         req.Location,
		ParticipantCount: req.ParticipantCount,
		TimeGranularity:  req.TimeGranularity,
	}

	if req.StartTime != nil {
		t, err := time.Parse(time.RFC3339, *req.StartTime)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "start_time", "invalid datetime format"))
			return
		}
		input.StartTime = &t
	}
	if req.EndTime != nil {
		t, err := time.Parse(time.RFC3339, *req.EndTime)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "end_time", "invalid datetime format"))
			return
		}
		input.EndTime = &t
	}

	event, err := h.eventService.Update(r.Context(), slug, input)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, event)
}

func (h *EventHandler) Delete(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if err := h.eventService.Delete(r.Context(), slug); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "event deleted"})
}

func (h *EventHandler) SetLocked(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req setLockedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}
	if err := h.eventService.SetLocked(r.Context(), slug, req.IsLocked); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]bool{"is_locked": req.IsLocked})
}

func (h *EventHandler) SetPublic(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req setPublicRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}
	if err := h.eventService.SetPublic(r.Context(), slug, req.IsPublic); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]bool{"is_public": req.IsPublic})
}

// Team visibility endpoints

func (h *EventHandler) ListTeams(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	teams, err := h.eventService.ListTeams(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, teams)
}

func (h *EventHandler) SetTeam(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req setEventTeamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}
	teamID, err := uuid.Parse(req.TeamID)
	if err != nil {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "team_id", "invalid team ID"))
		return
	}
	if err := h.eventService.SetTeam(r.Context(), slug, service.SetEventTeamInput{
		TeamID:    teamID,
		IsVisible: req.IsVisible,
	}); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "team visibility updated"})
}

func (h *EventHandler) RemoveTeam(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	teamID, err := uuid.Parse(chi.URLParam(r, "teamId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid team ID"))
		return
	}
	if err := h.eventService.RemoveTeam(r.Context(), slug, teamID); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "team removed from event"})
}

// Admin management endpoints

func (h *EventHandler) ListAdmins(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	admins, err := h.eventService.ListAdmins(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, admins)
}

func (h *EventHandler) AddAdmin(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req addAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}
	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "user_id", "invalid user ID"))
		return
	}
	if err := h.eventService.AddAdmin(r.Context(), slug, userID); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "admin added"})
}

func (h *EventHandler) RemoveAdmin(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	userID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid user ID"))
		return
	}
	if err := h.eventService.RemoveAdmin(r.Context(), slug, userID); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "admin removed"})
}

// Hidden hours endpoints

func (h *EventHandler) ListHiddenRanges(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ranges, err := h.eventService.ListHiddenRanges(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, ranges)
}

func (h *EventHandler) SetHiddenRanges(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req setHiddenRangesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	ranges := make([]service.HiddenRangeInput, len(req.Ranges))
	for i, r := range req.Ranges {
		ranges[i] = service.HiddenRangeInput{
			HideStartHour: r.HideStartHour,
			HideEndHour:   r.HideEndHour,
		}
	}

	result, err := h.eventService.SetHiddenRanges(r.Context(), slug, ranges)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, result)
}
