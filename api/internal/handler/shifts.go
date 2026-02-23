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

type ShiftHandler struct {
	shiftService *service.ShiftService
}

func NewShiftHandler(shiftService *service.ShiftService) *ShiftHandler {
	return &ShiftHandler{shiftService: shiftService}
}

// Request types

type createShiftRequest struct {
	TeamID    string `json:"team_id"`
	UserID    string `json:"user_id"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

type updateShiftRequest struct {
	TeamID    *string `json:"team_id"`
	StartTime *string `json:"start_time"`
	EndTime   *string `json:"end_time"`
}

type createCoverageRequest struct {
	TeamID        string `json:"team_id"`
	StartTime     string `json:"start_time"`
	EndTime       string `json:"end_time"`
	RequiredCount int32  `json:"required_count"`
}

type updateCoverageRequest struct {
	TeamID        string `json:"team_id"`
	StartTime     string `json:"start_time"`
	EndTime       string `json:"end_time"`
	RequiredCount int32  `json:"required_count"`
}

// Shift endpoints

func (h *ShiftHandler) ListByEvent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	// Optional team filter
	teamIDStr := r.URL.Query().Get("team_id")
	if teamIDStr != "" {
		teamID, err := uuid.Parse(teamIDStr)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "team_id", "invalid team ID"))
			return
		}
		shifts, err := h.shiftService.ListByEventAndTeam(r.Context(), slug, teamID)
		if err != nil {
			model.ErrorResponse(w, err)
			return
		}
		model.JSON(w, http.StatusOK, shifts)
		return
	}

	shifts, err := h.shiftService.ListByEvent(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, shifts)
}

func (h *ShiftHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "shiftId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid shift ID"))
		return
	}

	shift, err := h.shiftService.GetByID(r.Context(), id)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, shift)
}

func (h *ShiftHandler) Create(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	var req createShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	teamID, err := uuid.Parse(req.TeamID)
	if err != nil {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "team_id", "invalid team ID"))
		return
	}

	userID, err := uuid.Parse(req.UserID)
	if err != nil {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "user_id", "invalid user ID"))
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

	callerID := middleware.GetUserID(r.Context())
	if callerID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}
	callerRole := middleware.GetRole(r.Context())

	result, err := h.shiftService.Create(r.Context(), service.CreateShiftInput{
		EventSlug: slug,
		TeamID:    teamID,
		UserID:    userID,
		StartTime: startTime,
		EndTime:   endTime,
	}, *callerID, callerRole)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, result)
}

func (h *ShiftHandler) Update(w http.ResponseWriter, r *http.Request) {
	shiftID, err := uuid.Parse(chi.URLParam(r, "shiftId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid shift ID"))
		return
	}

	var req updateShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	input := service.UpdateShiftInput{}

	if req.TeamID != nil {
		id, err := uuid.Parse(*req.TeamID)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "team_id", "invalid team ID"))
			return
		}
		input.TeamID = &id
	}

	if req.StartTime != nil {
		t, err := time.Parse(time.RFC3339, *req.StartTime)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "start_time", "invalid datetime format, use RFC3339"))
			return
		}
		input.StartTime = &t
	}

	if req.EndTime != nil {
		t, err := time.Parse(time.RFC3339, *req.EndTime)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "end_time", "invalid datetime format, use RFC3339"))
			return
		}
		input.EndTime = &t
	}

	callerID := middleware.GetUserID(r.Context())
	if callerID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}
	callerRole := middleware.GetRole(r.Context())

	shift, err := h.shiftService.Update(r.Context(), shiftID, input, *callerID, callerRole)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, shift)
}

func (h *ShiftHandler) Delete(w http.ResponseWriter, r *http.Request) {
	shiftID, err := uuid.Parse(chi.URLParam(r, "shiftId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid shift ID"))
		return
	}

	callerID := middleware.GetUserID(r.Context())
	if callerID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}
	callerRole := middleware.GetRole(r.Context())

	if err := h.shiftService.Delete(r.Context(), shiftID, *callerID, callerRole); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "shift deleted"})
}

// Grid data endpoint

func (h *ShiftHandler) GridData(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	data, err := h.shiftService.GridData(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, data)
}

// Coverage endpoints

func (h *ShiftHandler) ListCoverage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	coverage, err := h.shiftService.ListCoverage(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, coverage)
}

func (h *ShiftHandler) CreateCoverage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	var req createCoverageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	teamID, err := uuid.Parse(req.TeamID)
	if err != nil {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "team_id", "invalid team ID"))
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

	cov, err := h.shiftService.CreateCoverage(r.Context(), service.CreateCoverageInput{
		EventSlug:     slug,
		TeamID:        teamID,
		StartTime:     startTime,
		EndTime:       endTime,
		RequiredCount: req.RequiredCount,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, cov)
}

func (h *ShiftHandler) DeleteCoverageByTeam(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	teamID, err := uuid.Parse(chi.URLParam(r, "teamId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid team ID"))
		return
	}

	if err := h.shiftService.DeleteCoverageByTeam(r.Context(), slug, teamID); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "coverage requirements deleted"})
}

func (h *ShiftHandler) UpdateCoverage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	coverageID, err := uuid.Parse(chi.URLParam(r, "coverageId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid coverage ID"))
		return
	}

	var req updateCoverageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	teamID, err := uuid.Parse(req.TeamID)
	if err != nil {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "team_id", "invalid team ID"))
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

	cov, err := h.shiftService.UpdateCoverage(r.Context(), service.UpdateCoverageInput{
		EventSlug:     slug,
		CoverageID:    coverageID,
		TeamID:        teamID,
		StartTime:     startTime,
		EndTime:       endTime,
		RequiredCount: req.RequiredCount,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, cov)
}

func (h *ShiftHandler) DeleteCoverage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	coverageID, err := uuid.Parse(chi.URLParam(r, "coverageId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid coverage ID"))
		return
	}

	if err := h.shiftService.DeleteCoverage(r.Context(), slug, coverageID); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "coverage requirement deleted"})
}
