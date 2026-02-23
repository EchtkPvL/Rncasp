package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type AvailabilityService struct {
	queries *repository.Queries
	logger  *slog.Logger
}

func NewAvailabilityService(queries *repository.Queries, logger *slog.Logger) *AvailabilityService {
	return &AvailabilityService{queries: queries, logger: logger}
}

type AvailabilityResponse struct {
	ID        string  `json:"id"`
	EventID   string  `json:"event_id"`
	UserID    string  `json:"user_id"`
	StartTime string  `json:"start_time"`
	EndTime   string  `json:"end_time"`
	Status    string  `json:"status"`
	Note      *string `json:"note"`
}

type AvailabilityWithUserResponse struct {
	AvailabilityResponse
	Username     string `json:"username"`
	UserFullName string `json:"user_full_name"`
}

type SetAvailabilityInput struct {
	EventSlug string
	UserID    uuid.UUID
	Entries   []AvailabilityEntry
}

type AvailabilityEntry struct {
	StartTime time.Time
	EndTime   time.Time
	Status    string
	Note      *string
}

var validStatuses = map[string]bool{
	"available":   true,
	"preferred":   true,
	"unavailable": true,
}

// ListByEvent returns all availability entries for an event with user info.
func (s *AvailabilityService) ListByEvent(ctx context.Context, slug string) ([]AvailabilityWithUserResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	rows, err := s.queries.ListAvailabilityByEvent(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing availability: %w", err)
	}

	result := make([]AvailabilityWithUserResponse, len(rows))
	for i, r := range rows {
		result[i] = AvailabilityWithUserResponse{
			AvailabilityResponse: AvailabilityResponse{
				ID:        r.ID.String(),
				EventID:   r.EventID.String(),
				UserID:    r.UserID.String(),
				StartTime: r.StartTime.Format(time.RFC3339),
				EndTime:   r.EndTime.Format(time.RFC3339),
				Status:    r.Status,
				Note:      r.Note,
			},
			Username:     r.Username,
			UserFullName: r.UserFullName,
		}
	}
	return result, nil
}

// ListByEventAndUser returns a single user's availability for an event.
func (s *AvailabilityService) ListByEventAndUser(ctx context.Context, slug string, userID uuid.UUID) ([]AvailabilityResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	rows, err := s.queries.ListAvailabilityByEventAndUser(ctx, event.ID, userID)
	if err != nil {
		return nil, fmt.Errorf("listing availability: %w", err)
	}

	result := make([]AvailabilityResponse, len(rows))
	for i, r := range rows {
		result[i] = availabilityToResponse(r)
	}
	return result, nil
}

// SetAvailability replaces all availability entries for a user in an event.
// This is a "replace all" operation: delete existing, then insert new entries.
func (s *AvailabilityService) SetAvailability(ctx context.Context, input SetAvailabilityInput, callerID uuid.UUID, callerRole string) ([]AvailabilityResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, input.EventSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	// Users can only set their own availability, admins can set for anyone
	if callerRole == "user" && input.UserID != callerID {
		return nil, model.NewDomainError(model.ErrForbidden, "users can only set their own availability")
	}

	// Read-only users cannot set availability
	if callerRole == "read_only" {
		return nil, model.NewDomainError(model.ErrForbidden, "read-only users cannot set availability")
	}

	// Validate entries
	for i, entry := range input.Entries {
		if !entry.EndTime.After(entry.StartTime) {
			return nil, model.NewFieldError(model.ErrInvalidInput, "end_time", fmt.Sprintf("entry %d: end time must be after start time", i))
		}
		if !validStatuses[entry.Status] {
			return nil, model.NewFieldError(model.ErrInvalidInput, "status", fmt.Sprintf("entry %d: status must be available, preferred, or unavailable", i))
		}
		if entry.StartTime.Before(event.StartTime) || entry.EndTime.After(event.EndTime) {
			return nil, model.NewDomainError(model.ErrInvalidInput, fmt.Sprintf("entry %d: availability must be within event time range", i))
		}
	}

	// Delete existing availability for this user/event
	if err := s.queries.DeleteAvailabilityByEventAndUser(ctx, event.ID, input.UserID); err != nil {
		return nil, fmt.Errorf("deleting existing availability: %w", err)
	}

	// Insert new entries
	result := make([]AvailabilityResponse, len(input.Entries))
	for i, entry := range input.Entries {
		avail, err := s.queries.CreateAvailability(ctx, repository.CreateAvailabilityParams{
			EventID:   event.ID,
			UserID:    input.UserID,
			StartTime: entry.StartTime,
			EndTime:   entry.EndTime,
			Status:    entry.Status,
			Note:      entry.Note,
		})
		if err != nil {
			return nil, fmt.Errorf("creating availability entry %d: %w", i, err)
		}
		result[i] = availabilityToResponse(avail)
	}

	s.logger.Info("availability set", "event", input.EventSlug, "user", input.UserID, "entries", len(input.Entries))
	return result, nil
}

func availabilityToResponse(a repository.UserAvailability) AvailabilityResponse {
	return AvailabilityResponse{
		ID:        a.ID.String(),
		EventID:   a.EventID.String(),
		UserID:    a.UserID.String(),
		StartTime: a.StartTime.Format(time.RFC3339),
		EndTime:   a.EndTime.Format(time.RFC3339),
		Status:    a.Status,
		Note:      a.Note,
	}
}
