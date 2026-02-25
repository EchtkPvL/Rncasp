package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
)

type AuditService struct {
	queries *repository.Queries
	logger  *slog.Logger
}

func NewAuditService(queries *repository.Queries, logger *slog.Logger) *AuditService {
	return &AuditService{queries: queries, logger: logger}
}

type AuditLogEntry struct {
	ID         string          `json:"id"`
	UserID     *string         `json:"user_id"`
	Username   *string         `json:"username"`
	EventID    *string         `json:"event_id"`
	EventSlug  *string         `json:"event_slug"`
	Action     string          `json:"action"`
	EntityType string          `json:"entity_type"`
	EntityID   *string         `json:"entity_id"`
	OldValue   json.RawMessage `json:"old_value"`
	NewValue   json.RawMessage `json:"new_value"`
	IPAddress  *string         `json:"ip_address"`
	CreatedAt  string          `json:"created_at"`
}

type AuditLogFilter struct {
	EventID    *uuid.UUID
	UserID     *uuid.UUID
	Action     *string
	EntityType *string
	Limit      int32
	Offset     int32
}

// ListAuditLog returns filtered audit log entries.
func (s *AuditService) ListAuditLog(ctx context.Context, filter AuditLogFilter) ([]AuditLogEntry, error) {
	if filter.Limit <= 0 || filter.Limit > 100 {
		filter.Limit = 50
	}

	rows, err := s.queries.ListAuditLog(ctx, repository.ListAuditLogParams{
		EventID:    filter.EventID,
		UserID:     filter.UserID,
		Action:     filter.Action,
		EntityType: filter.EntityType,
		Limit:      filter.Limit,
		Offset:     filter.Offset,
	})
	if err != nil {
		return nil, fmt.Errorf("listing audit log: %w", err)
	}

	result := make([]AuditLogEntry, len(rows))
	for i, r := range rows {
		entry := AuditLogEntry{
			ID:         r.ID.String(),
			Action:     r.Action,
			EntityType: r.EntityType,
			OldValue:   r.OldValue,
			NewValue:   r.NewValue,
			IPAddress:  r.IpAddress,
			CreatedAt:  r.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
		if r.UserID != nil {
			s := r.UserID.String()
			entry.UserID = &s
		}
		if r.Username != nil {
			entry.Username = r.Username
		}
		if r.EventID != nil {
			s := r.EventID.String()
			entry.EventID = &s
		}
		if r.EventSlug != nil {
			entry.EventSlug = r.EventSlug
		}
		if r.EntityID != nil {
			s := r.EntityID.String()
			entry.EntityID = &s
		}
		result[i] = entry
	}

	return result, nil
}

// Log creates an audit log entry. This is a fire-and-forget helper used by other services.
func (s *AuditService) Log(ctx context.Context, userID *uuid.UUID, eventID *uuid.UUID, action, entityType string, entityID *uuid.UUID, oldValue, newValue any, ipAddress *string) {
	oldJSON, _ := json.Marshal(oldValue)
	newJSON, _ := json.Marshal(newValue)

	_, err := s.queries.CreateAuditLogEntry(ctx, repository.CreateAuditLogEntryParams{
		UserID:     userID,
		EventID:    eventID,
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		OldValue:   oldJSON,
		NewValue:   newJSON,
		IpAddress:  ipAddress,
	})
	if err != nil {
		s.logger.Error("failed to create audit log entry", "error", err, "action", action, "entity_type", entityType)
	}
}
