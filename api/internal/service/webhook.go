package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type WebhookService struct {
	queries    *repository.Queries
	logger     *slog.Logger
	httpClient *http.Client
}

func NewWebhookService(queries *repository.Queries, logger *slog.Logger) *WebhookService {
	return &WebhookService{
		queries: queries,
		logger:  logger,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

type WebhookResponse struct {
	ID           string   `json:"id"`
	EventID      string   `json:"event_id"`
	Name         string   `json:"name"`
	URL          string   `json:"url"`
	TriggerTypes []string `json:"trigger_types"`
	IsEnabled    bool     `json:"is_enabled"`
	CreatedAt    string   `json:"created_at"`
}

type CreateWebhookInput struct {
	EventID      uuid.UUID
	Name         string
	URL          string
	Secret       string
	TriggerTypes []string
}

type UpdateWebhookInput struct {
	Name         *string
	URL          *string
	Secret       *string
	TriggerTypes *[]string
	IsEnabled    *bool
}

func webhookToResponse(w repository.WebhookConfig) WebhookResponse {
	return WebhookResponse{
		ID:           w.ID.String(),
		EventID:      w.EventID.String(),
		Name:         w.Name,
		URL:          w.Url,
		TriggerTypes: w.TriggerTypes,
		IsEnabled:    w.IsEnabled,
		CreatedAt:    w.CreatedAt.Format(time.RFC3339),
	}
}

func (s *WebhookService) ListByEvent(ctx context.Context, eventID uuid.UUID) ([]WebhookResponse, error) {
	webhooks, err := s.queries.ListWebhooksByEvent(ctx, eventID)
	if err != nil {
		return nil, fmt.Errorf("listing webhooks: %w", err)
	}

	result := make([]WebhookResponse, len(webhooks))
	for i, w := range webhooks {
		result[i] = webhookToResponse(w)
	}
	return result, nil
}

func (s *WebhookService) GetByID(ctx context.Context, webhookID uuid.UUID) (WebhookResponse, error) {
	webhook, err := s.queries.GetWebhookByID(ctx, webhookID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return WebhookResponse{}, model.NewDomainError(model.ErrNotFound, "webhook not found")
		}
		return WebhookResponse{}, fmt.Errorf("getting webhook: %w", err)
	}
	return webhookToResponse(webhook), nil
}

func (s *WebhookService) Create(ctx context.Context, input CreateWebhookInput) (WebhookResponse, error) {
	if input.Name == "" {
		return WebhookResponse{}, model.NewFieldError(model.ErrInvalidInput, "name", "name is required")
	}
	if input.URL == "" {
		return WebhookResponse{}, model.NewFieldError(model.ErrInvalidInput, "url", "url is required")
	}
	if input.Secret == "" {
		return WebhookResponse{}, model.NewFieldError(model.ErrInvalidInput, "secret", "secret is required")
	}
	if len(input.TriggerTypes) == 0 {
		return WebhookResponse{}, model.NewFieldError(model.ErrInvalidInput, "trigger_types", "at least one trigger type is required")
	}

	webhook, err := s.queries.CreateWebhook(ctx, repository.CreateWebhookParams{
		EventID:      input.EventID,
		Name:         input.Name,
		Url:          input.URL,
		Secret:       input.Secret,
		TriggerTypes: input.TriggerTypes,
	})
	if err != nil {
		return WebhookResponse{}, fmt.Errorf("creating webhook: %w", err)
	}

	s.logger.Info("webhook created", "webhook_id", webhook.ID, "event_id", input.EventID)
	return webhookToResponse(webhook), nil
}

func (s *WebhookService) Update(ctx context.Context, webhookID uuid.UUID, input UpdateWebhookInput) (WebhookResponse, error) {
	_, err := s.queries.GetWebhookByID(ctx, webhookID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return WebhookResponse{}, model.NewDomainError(model.ErrNotFound, "webhook not found")
		}
		return WebhookResponse{}, fmt.Errorf("getting webhook: %w", err)
	}

	updated, err := s.queries.UpdateWebhook(ctx, repository.UpdateWebhookParams{
		ID:           webhookID,
		Name:         input.Name,
		Url:          input.URL,
		Secret:       input.Secret,
		TriggerTypes: input.TriggerTypes,
		IsEnabled:    input.IsEnabled,
	})
	if err != nil {
		return WebhookResponse{}, fmt.Errorf("updating webhook: %w", err)
	}

	s.logger.Info("webhook updated", "webhook_id", webhookID)
	return webhookToResponse(updated), nil
}

func (s *WebhookService) Delete(ctx context.Context, webhookID uuid.UUID) error {
	_, err := s.queries.GetWebhookByID(ctx, webhookID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "webhook not found")
		}
		return fmt.Errorf("getting webhook: %w", err)
	}

	if err := s.queries.DeleteWebhook(ctx, webhookID); err != nil {
		return fmt.Errorf("deleting webhook: %w", err)
	}

	s.logger.Info("webhook deleted", "webhook_id", webhookID)
	return nil
}

// WebhookPayload is the body sent to webhook URLs.
type WebhookPayload struct {
	Type      string    `json:"type"`
	EventID   string    `json:"event_id"`
	Timestamp string    `json:"timestamp"`
	Data      any       `json:"data"`
}

// Dispatch sends a webhook event to all active webhooks matching the trigger type
// for the given event. Dispatches are fire-and-forget in goroutines.
func (s *WebhookService) Dispatch(ctx context.Context, eventID uuid.UUID, triggerType string, data any) {
	webhooks, err := s.queries.ListActiveWebhooksForTrigger(ctx, repository.ListActiveWebhooksForTriggerParams{
		EventID:     eventID,
		TriggerType: triggerType,
	})
	if err != nil {
		s.logger.Error("failed to list webhooks for dispatch", "error", err, "event_id", eventID)
		return
	}

	if len(webhooks) == 0 {
		return
	}

	payload := WebhookPayload{
		Type:      triggerType,
		EventID:   eventID.String(),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Data:      data,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		s.logger.Error("failed to marshal webhook payload", "error", err)
		return
	}

	for _, wh := range webhooks {
		go s.deliver(wh, body)
	}
}

func (s *WebhookService) deliver(wh repository.WebhookConfig, body []byte) {
	sig := computeHMAC(body, wh.Secret)

	req, err := http.NewRequest(http.MethodPost, wh.Url, bytes.NewReader(body))
	if err != nil {
		s.logger.Error("failed to create webhook request", "error", err, "webhook_id", wh.ID)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Signature", "sha256="+sig)
	req.Header.Set("X-Webhook-ID", wh.ID.String())

	resp, err := s.httpClient.Do(req)
	if err != nil {
		s.logger.Error("webhook delivery failed", "error", err, "webhook_id", wh.ID, "url", wh.Url)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		s.logger.Warn("webhook returned error status", "webhook_id", wh.ID, "url", wh.Url, "status", resp.StatusCode)
	} else {
		s.logger.Debug("webhook delivered", "webhook_id", wh.ID, "url", wh.Url, "status", resp.StatusCode)
	}
}

func computeHMAC(data []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(data)
	return hex.EncodeToString(mac.Sum(nil))
}
