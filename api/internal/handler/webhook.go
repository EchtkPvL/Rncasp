package handler

import (
	"encoding/json"
	"net/http"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type WebhookHandler struct {
	webhookService *service.WebhookService
	eventService   *service.EventService
}

func NewWebhookHandler(webhookService *service.WebhookService, eventService *service.EventService) *WebhookHandler {
	return &WebhookHandler{webhookService: webhookService, eventService: eventService}
}

type createWebhookRequest struct {
	Name         string   `json:"name"`
	URL          string   `json:"url"`
	Secret       string   `json:"secret"`
	TriggerTypes []string `json:"trigger_types"`
}

type updateWebhookRequest struct {
	Name         *string   `json:"name"`
	URL          *string   `json:"url"`
	Secret       *string   `json:"secret"`
	TriggerTypes *[]string `json:"trigger_types"`
	IsEnabled    *bool     `json:"is_enabled"`
}

func (h *WebhookHandler) List(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	event, err := h.eventService.GetBySlug(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	eventID, _ := uuid.Parse(event.ID)
	webhooks, err := h.webhookService.ListByEvent(r.Context(), eventID)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, webhooks)
}

func (h *WebhookHandler) Create(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	event, err := h.eventService.GetBySlug(r.Context(), slug)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	var req createWebhookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	eventID, _ := uuid.Parse(event.ID)
	webhook, err := h.webhookService.Create(r.Context(), service.CreateWebhookInput{
		EventID:      eventID,
		Name:         req.Name,
		URL:          req.URL,
		Secret:       req.Secret,
		TriggerTypes: req.TriggerTypes,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, webhook)
}

func (h *WebhookHandler) Update(w http.ResponseWriter, r *http.Request) {
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
		TriggerTypes: req.TriggerTypes,
		IsEnabled:    req.IsEnabled,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, webhook)
}

func (h *WebhookHandler) Delete(w http.ResponseWriter, r *http.Request) {
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
