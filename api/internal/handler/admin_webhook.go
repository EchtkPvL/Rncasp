package handler

import (
	"encoding/json"
	"net/http"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type AdminWebhookHandler struct {
	webhookService *service.WebhookService
}

func NewAdminWebhookHandler(webhookService *service.WebhookService) *AdminWebhookHandler {
	return &AdminWebhookHandler{webhookService: webhookService}
}

func (h *AdminWebhookHandler) List(w http.ResponseWriter, r *http.Request) {
	webhooks, err := h.webhookService.ListGlobal(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, webhooks)
}

func (h *AdminWebhookHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	webhook, err := h.webhookService.CreateGlobal(r.Context(), service.CreateWebhookInput{
		Name:         req.Name,
		URL:          req.URL,
		Secret:       req.Secret,
		Format:       req.Format,
		TriggerTypes: req.TriggerTypes,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, webhook)
}

func (h *AdminWebhookHandler) Update(w http.ResponseWriter, r *http.Request) {
	webhookID, err := uuid.Parse(chi.URLParam(r, "webhookId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid webhook ID"))
		return
	}

	var req updateWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	webhook, err := h.webhookService.Update(r.Context(), webhookID, service.UpdateWebhookInput{
		Name:         req.Name,
		URL:          req.URL,
		Secret:       req.Secret,
		Format:       req.Format,
		TriggerTypes: req.TriggerTypes,
		IsEnabled:    req.IsEnabled,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, webhook)
}

func (h *AdminWebhookHandler) Test(w http.ResponseWriter, r *http.Request) {
	webhookID, err := uuid.Parse(chi.URLParam(r, "webhookId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid webhook ID"))
		return
	}

	if err := h.webhookService.Test(r.Context(), webhookID); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "test webhook sent"})
}

func (h *AdminWebhookHandler) Delete(w http.ResponseWriter, r *http.Request) {
	webhookID, err := uuid.Parse(chi.URLParam(r, "webhookId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid webhook ID"))
		return
	}

	if err := h.webhookService.Delete(r.Context(), webhookID); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "webhook deleted"})
}
