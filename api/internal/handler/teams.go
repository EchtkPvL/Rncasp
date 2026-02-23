package handler

import (
	"encoding/json"
	"net/http"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/server/middleware"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type TeamHandler struct {
	teamService *service.TeamService
}

func NewTeamHandler(teamService *service.TeamService) *TeamHandler {
	return &TeamHandler{teamService: teamService}
}

type createTeamRequest struct {
	Name         string `json:"name"`
	Abbreviation string `json:"abbreviation"`
	Color        string `json:"color"`
	SortOrder    int32  `json:"sort_order"`
}

type updateTeamRequest struct {
	Name         *string `json:"name"`
	Abbreviation *string `json:"abbreviation"`
	Color        *string `json:"color"`
	SortOrder    *int32  `json:"sort_order"`
	IsActive     *bool   `json:"is_active"`
}

func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	role := middleware.GetRole(r.Context())
	teams, err := h.teamService.List(r.Context(), role)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, teams)
}

func (h *TeamHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid team ID"))
		return
	}

	team, err := h.teamService.GetByID(r.Context(), id)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, team)
}

func (h *TeamHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createTeamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	team, err := h.teamService.Create(r.Context(), service.CreateTeamInput{
		Name:         req.Name,
		Abbreviation: req.Abbreviation,
		Color:        req.Color,
		SortOrder:    req.SortOrder,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, team)
}

func (h *TeamHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid team ID"))
		return
	}

	var req updateTeamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	team, err := h.teamService.Update(r.Context(), id, service.UpdateTeamInput{
		Name:         req.Name,
		Abbreviation: req.Abbreviation,
		Color:        req.Color,
		SortOrder:    req.SortOrder,
		IsActive:     req.IsActive,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, team)
}

func (h *TeamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid team ID"))
		return
	}

	if err := h.teamService.Delete(r.Context(), id); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "team deleted"})
}
