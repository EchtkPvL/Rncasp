package handler

import (
	"net/http"
	"strconv"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/google/uuid"
)

type AuditHandler struct {
	auditService *service.AuditService
}

func NewAuditHandler(auditService *service.AuditService) *AuditHandler {
	return &AuditHandler{auditService: auditService}
}

func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	filter := service.AuditLogFilter{}

	if v := r.URL.Query().Get("event_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "event_id", "invalid event ID"))
			return
		}
		filter.EventID = &id
	}

	if v := r.URL.Query().Get("user_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "user_id", "invalid user ID"))
			return
		}
		filter.UserID = &id
	}

	if v := r.URL.Query().Get("action"); v != "" {
		filter.Action = &v
	}

	if v := r.URL.Query().Get("entity_type"); v != "" {
		filter.EntityType = &v
	}

	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n > 0 {
			filter.Limit = int32(n)
		}
	}

	if v := r.URL.Query().Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n >= 0 {
			filter.Offset = int32(n)
		}
	}

	entries, err := h.auditService.ListAuditLog(r.Context(), filter)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, entries)
}
