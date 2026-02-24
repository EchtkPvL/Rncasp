package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/pdf"
	"github.com/echtkpvl/rncasp/internal/server/middleware"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type ExportHandler struct {
	exportService *service.ExportService
	baseURL       string
}

func NewExportHandler(exportService *service.ExportService, baseURL string) *ExportHandler {
	return &ExportHandler{exportService: exportService, baseURL: baseURL}
}

// ExportCSV downloads a CSV of shifts for an event.
func (h *ExportHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	data, filename, err := h.exportService.ExportCSV(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// ExportICal downloads an iCal file for an event.
func (h *ExportHandler) ExportICal(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	data, filename, err := h.exportService.ExportICalEvent(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// ExportPDF downloads a PDF of the shift plan for an event.
func (h *ExportHandler) ExportPDF(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	q := r.URL.Query()

	opts := pdf.PDFOptions{
		Layout:         q.Get("layout"),
		PaperSize:      q.Get("paper"),
		Landscape:      q.Get("landscape") != "false",
		ShowCoverage:   q.Get("coverage") != "false",
		ShowTeamColors: q.Get("colors") != "false",
	}
	if opts.Layout == "" {
		opts.Layout = "grid"
	}
	if opts.PaperSize == "" {
		opts.PaperSize = "A4"
	}
	if d := q.Get("days"); d != "" {
		opts.Days = strings.Split(d, ",")
	}
	if u := q.Get("users"); u != "" {
		opts.UserIDs = strings.Split(u, ",")
	}

	data, filename, err := h.exportService.ExportPDF(r.Context(), slug, opts)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// iCal Token management

type createTokenRequest struct {
	Label   string  `json:"label"`
	Scope   string  `json:"scope"`
	EventID *string `json:"event_id"`
	TeamID  *string `json:"team_id"`
}

func (h *ExportHandler) CreateToken(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	var req createTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	input := service.CreateICalTokenInput{
		Label: req.Label,
		Scope: req.Scope,
	}

	if req.EventID != nil {
		id, err := uuid.Parse(*req.EventID)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "event_id", "invalid event ID"))
			return
		}
		input.EventID = &id
	}

	if req.TeamID != nil {
		id, err := uuid.Parse(*req.TeamID)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "team_id", "invalid team ID"))
			return
		}
		input.TeamID = &id
	}

	resp, err := h.exportService.CreateToken(r.Context(), *userID, input, h.baseURL)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusCreated, resp)
}

func (h *ExportHandler) ListTokens(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	tokens, err := h.exportService.ListTokens(r.Context(), *userID, h.baseURL)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, tokens)
}

func (h *ExportHandler) RevokeToken(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	tokenID, err := uuid.Parse(chi.URLParam(r, "tokenId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid token ID"))
		return
	}

	if err := h.exportService.RevokeToken(r.Context(), tokenID, *userID); err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, map[string]string{"message": "token revoked"})
}

// ServeICalFeed serves an iCal subscription feed (public, no auth required).
func (h *ExportHandler) ServeICalFeed(w http.ResponseWriter, r *http.Request) {
	rawToken := chi.URLParam(r, "token")

	data, err := h.exportService.ServeICalSubscription(r.Context(), rawToken)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}
