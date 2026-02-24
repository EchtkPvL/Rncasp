package handler

import (
	"net/http"
	"strings"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/pdf"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
)

type PublicHandler struct {
	eventService  *service.EventService
	shiftService  *service.ShiftService
	exportService *service.ExportService
}

func NewPublicHandler(eventService *service.EventService, shiftService *service.ShiftService, exportService *service.ExportService) *PublicHandler {
	return &PublicHandler{eventService: eventService, shiftService: shiftService, exportService: exportService}
}

// GetEvent returns a public event by slug (only if is_public=true).
func (h *PublicHandler) GetEvent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	event, err := h.eventService.GetBySlug(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	if !event.IsPublic {
		model.ErrorResponse(w, model.NewDomainError(model.ErrNotFound, "event not found"))
		return
	}

	model.JSON(w, http.StatusOK, event)
}

// GetGrid returns the public grid data for a public event.
func (h *PublicHandler) GetGrid(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	event, err := h.eventService.GetBySlug(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	if !event.IsPublic {
		model.ErrorResponse(w, model.NewDomainError(model.ErrNotFound, "event not found"))
		return
	}

	gridData, err := h.shiftService.GridData(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	// Include event teams so the public grid can show coverage bars
	teams, err := h.eventService.ListTeams(r.Context(), slug)
	if err == nil {
		gridData["event_teams"] = teams
	}

	model.JSON(w, http.StatusOK, gridData)
}

// ExportCSV downloads a CSV of shifts for a public event.
func (h *PublicHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	event, err := h.eventService.GetBySlug(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	if !event.IsPublic {
		model.ErrorResponse(w, model.NewDomainError(model.ErrNotFound, "event not found"))
		return
	}

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

// ExportICal downloads an iCal file for a public event.
func (h *PublicHandler) ExportICal(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	event, err := h.eventService.GetBySlug(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	if !event.IsPublic {
		model.ErrorResponse(w, model.NewDomainError(model.ErrNotFound, "event not found"))
		return
	}

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

// ExportPDF downloads a PDF of shifts for a public event.
func (h *PublicHandler) ExportPDF(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	event, err := h.eventService.GetBySlug(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	if !event.IsPublic {
		model.ErrorResponse(w, model.NewDomainError(model.ErrNotFound, "event not found"))
		return
	}

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
