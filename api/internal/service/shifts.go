package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/echtkpvl/rncasp/internal/sse"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ShiftService struct {
	queries             *repository.Queries
	logger              *slog.Logger
	sseBroker           *sse.Broker
	notificationService *NotificationService
	webhookService      *WebhookService
	auditService        *AuditService
}

func NewShiftService(queries *repository.Queries, logger *slog.Logger, sseBroker *sse.Broker) *ShiftService {
	return &ShiftService{queries: queries, logger: logger, sseBroker: sseBroker}
}

// SetNotificationService sets the notification service for trigger dispatch.
func (s *ShiftService) SetNotificationService(ns *NotificationService) {
	s.notificationService = ns
}

// SetWebhookService sets the webhook service for trigger dispatch.
func (s *ShiftService) SetWebhookService(ws *WebhookService) {
	s.webhookService = ws
}

// SetAuditService sets the audit service for logging changes.
func (s *ShiftService) SetAuditService(as *AuditService) {
	s.auditService = as
}

type CreateShiftInput struct {
	EventSlug string
	TeamID    uuid.UUID
	UserID    uuid.UUID
	StartTime time.Time
	EndTime   time.Time
}

type UpdateShiftInput struct {
	TeamID    *uuid.UUID
	UserID    *uuid.UUID
	StartTime *time.Time
	EndTime   *time.Time
}

type ShiftResponse struct {
	ID               string  `json:"id"`
	EventID          string  `json:"event_id"`
	TeamID           string  `json:"team_id"`
	UserID           string  `json:"user_id"`
	StartTime        string  `json:"start_time"`
	EndTime          string  `json:"end_time"`
	TeamName         string  `json:"team_name"`
	TeamAbbreviation string  `json:"team_abbreviation"`
	TeamColor        string  `json:"team_color"`
	Username         string  `json:"username"`
	UserFullName     string  `json:"user_full_name"`
	UserDisplayName  *string `json:"user_display_name"`
	CreatedAt        string  `json:"created_at"`
}

type ShiftWithWarnings struct {
	Shift    ShiftResponse `json:"shift"`
	Warnings []string      `json:"warnings,omitempty"`
}

// PublicShiftResponse is the public-facing shift representation with sensitive fields removed.
type PublicShiftResponse struct {
	ID               string  `json:"id"`
	EventID          string  `json:"event_id"`
	TeamID           string  `json:"team_id"`
	UserID           string  `json:"user_id"`
	StartTime        string  `json:"start_time"`
	EndTime          string  `json:"end_time"`
	TeamName         string  `json:"team_name"`
	TeamAbbreviation string  `json:"team_abbreviation"`
	TeamColor        string  `json:"team_color"`
	Username         string  `json:"username"`
	UserDisplayName  *string `json:"user_display_name"`
}

type UserShiftResponse struct {
	ID               string `json:"id"`
	EventID          string `json:"event_id"`
	TeamID           string `json:"team_id"`
	UserID           string `json:"user_id"`
	StartTime        string `json:"start_time"`
	EndTime          string `json:"end_time"`
	TeamName         string `json:"team_name"`
	TeamAbbreviation string `json:"team_abbreviation"`
	TeamColor        string `json:"team_color"`
	EventName        string `json:"event_name"`
	EventSlug        string `json:"event_slug"`
	CreatedAt        string `json:"created_at"`
}

type CoverageRequirementResponse struct {
	ID            string `json:"id"`
	EventID       string `json:"event_id"`
	TeamID        string `json:"team_id"`
	StartTime     string `json:"start_time"`
	EndTime       string `json:"end_time"`
	RequiredCount int32  `json:"required_count"`
}

type CreateCoverageInput struct {
	EventSlug     string
	TeamID        uuid.UUID
	StartTime     time.Time
	EndTime       time.Time
	RequiredCount int32
}

type UpdateCoverageInput struct {
	EventSlug     string
	CoverageID    uuid.UUID
	TeamID        uuid.UUID
	StartTime     time.Time
	EndTime       time.Time
	RequiredCount int32
}

// ListByEvent returns all shifts for an event.
func (s *ShiftService) ListByEvent(ctx context.Context, slug string) ([]ShiftResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	shifts, err := s.queries.ListShiftsByEvent(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing shifts: %w", err)
	}

	result := make([]ShiftResponse, len(shifts))
	for i, sh := range shifts {
		result[i] = shiftRowToResponse(sh)
	}
	return result, nil
}

// ListByEventAndTeam returns shifts for a specific team in an event.
func (s *ShiftService) ListByEventAndTeam(ctx context.Context, slug string, teamID uuid.UUID) ([]ShiftResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	shifts, err := s.queries.ListShiftsByEventAndTeam(ctx, repository.ListShiftsByEventAndTeamParams{
		EventID: event.ID,
		TeamID:  teamID,
	})
	if err != nil {
		return nil, fmt.Errorf("listing shifts: %w", err)
	}

	result := make([]ShiftResponse, len(shifts))
	for i, sh := range shifts {
		result[i] = shiftTeamRowToResponse(sh)
	}
	return result, nil
}

// GetByID returns a single shift.
func (s *ShiftService) GetByID(ctx context.Context, id uuid.UUID) (ShiftResponse, error) {
	shift, err := s.queries.GetShiftByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ShiftResponse{}, model.NewDomainError(model.ErrNotFound, "shift not found")
		}
		return ShiftResponse{}, fmt.Errorf("fetching shift: %w", err)
	}
	return shiftDetailToResponse(shift), nil
}

// Create creates a new shift with permission and overlap checks.
// callerID is the authenticated user. callerRole is their role.
// Users can only create shifts for themselves (unless admin/super-admin).
func (s *ShiftService) Create(ctx context.Context, input CreateShiftInput, callerID uuid.UUID, callerRole string) (ShiftWithWarnings, error) {
	// Read-only users cannot create shifts
	if callerRole == "read_only" {
		return ShiftWithWarnings{}, model.NewDomainError(model.ErrForbidden, "read-only users cannot create shifts")
	}

	// Resolve event
	event, err := s.queries.GetEventBySlug(ctx, input.EventSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ShiftWithWarnings{}, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return ShiftWithWarnings{}, fmt.Errorf("fetching event: %w", err)
	}

	// Locked event enforcement: only super-admin can modify locked events
	if event.IsLocked && callerRole != "super_admin" {
		return ShiftWithWarnings{}, model.NewDomainError(model.ErrForbidden, "event is locked")
	}

	// Self-signup: users can only create shifts for themselves (unless event admin)
	isAdmin := false
	if callerRole == "user" {
		isAdmin, _ = s.queries.IsEventAdmin(ctx, event.ID, callerID)
		if input.UserID != callerID && !isAdmin {
			return ShiftWithWarnings{}, model.NewDomainError(model.ErrForbidden, "users can only create their own shifts")
		}
	}

	// Validate time range
	if !input.EndTime.After(input.StartTime) {
		return ShiftWithWarnings{}, model.NewFieldError(model.ErrInvalidInput, "end_time", "end time must be after start time")
	}

	// Validate shift is within event time range
	if input.StartTime.Before(event.StartTime) || input.EndTime.After(event.EndTime) {
		return ShiftWithWarnings{}, model.NewDomainError(model.ErrInvalidInput, "shift must be within event time range")
	}

	// Check for overlapping shifts (warn but allow)
	var warnings []string
	overlapping, err := s.queries.GetOverlappingShifts(ctx, repository.GetOverlappingShiftsParams{
		UserID:    input.UserID,
		EventID:   event.ID,
		StartTime: input.StartTime,
		EndTime:   input.EndTime,
		ExcludeID: nil,
	})
	if err != nil {
		return ShiftWithWarnings{}, fmt.Errorf("checking overlaps: %w", err)
	}
	if len(overlapping) > 0 {
		warnings = append(warnings, fmt.Sprintf("user has %d overlapping shift(s) in this time range", len(overlapping)))
	}

	// Overbooking check: users cannot exceed coverage; admins can
	if callerRole == "user" && !isAdmin {
		coverageReqs, err := s.queries.ListCoverageRequirementsByTeam(ctx, event.ID, input.TeamID)
		if err != nil {
			return ShiftWithWarnings{}, fmt.Errorf("checking coverage: %w", err)
		}
		for _, cov := range coverageReqs {
			// Check if this shift overlaps with the coverage requirement
			if input.StartTime.Before(cov.EndTime) && input.EndTime.After(cov.StartTime) {
				count, err := s.queries.CountShiftsInTimeRange(ctx, repository.CountShiftsInTimeRangeParams{
					EventID:   event.ID,
					TeamID:    input.TeamID,
					StartTime: cov.StartTime,
					EndTime:   cov.EndTime,
				})
				if err != nil {
					return ShiftWithWarnings{}, fmt.Errorf("counting shifts: %w", err)
				}
				if count >= int64(cov.RequiredCount) {
					return ShiftWithWarnings{}, model.NewDomainError(model.ErrConflict, "team is fully staffed for this time period")
				}
			}
		}
	}

	createdBy := callerID
	shift, err := s.queries.CreateShift(ctx, repository.CreateShiftParams{
		EventID:   event.ID,
		TeamID:    input.TeamID,
		UserID:    input.UserID,
		StartTime: input.StartTime,
		EndTime:   input.EndTime,
		CreatedBy: &createdBy,
	})
	if err != nil {
		return ShiftWithWarnings{}, fmt.Errorf("creating shift: %w", err)
	}

	// Fetch the full shift data with joins
	fullShift, err := s.queries.GetShiftByID(ctx, shift.ID)
	if err != nil {
		return ShiftWithWarnings{}, fmt.Errorf("fetching created shift: %w", err)
	}

	resp := shiftDetailToResponse(fullShift)
	s.logger.Info("shift created", "shift_id", shift.ID, "event", input.EventSlug, "user", input.UserID)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), &input.UserID, &event.ID, "create", "shift", &shift.ID, nil, resp, nil)
	}

	if s.sseBroker != nil {
		s.sseBroker.Publish(ctx, sse.Event{Type: sse.TypeShiftCreated, EventID: event.ID.String(), Slug: event.Slug, Payload: resp})
	}

	// Trigger notifications and webhooks asynchronously
	go func() {
		bgCtx := context.Background()
		if s.notificationService != nil {
			title := fmt.Sprintf("%s: New shift", event.Name)
			body := fmt.Sprintf("%s signed up for %s (%s)", resp.Username, resp.TeamName, formatTimeRange(input.StartTime, input.EndTime))
			s.notificationService.NotifyEventUsers(bgCtx, event.ID, callerID, TriggerShiftCreated, title, &body)
		}
		if s.webhookService != nil {
			s.webhookService.Dispatch(bgCtx, event.ID, TriggerShiftCreated, resp)
		}
	}()

	return ShiftWithWarnings{
		Shift:    resp,
		Warnings: warnings,
	}, nil
}

// Update updates a shift with permission checks.
func (s *ShiftService) Update(ctx context.Context, shiftID uuid.UUID, input UpdateShiftInput, callerID uuid.UUID, callerRole string) (ShiftResponse, error) {
	existing, err := s.queries.GetShiftByID(ctx, shiftID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ShiftResponse{}, model.NewDomainError(model.ErrNotFound, "shift not found")
		}
		return ShiftResponse{}, fmt.Errorf("fetching shift: %w", err)
	}

	// Read-only users cannot update shifts
	if callerRole == "read_only" {
		return ShiftResponse{}, model.NewDomainError(model.ErrForbidden, "read-only users cannot modify shifts")
	}

	// Get the event for lock checks
	event, err := s.queries.GetEventByID(ctx, existing.EventID)
	if err != nil {
		return ShiftResponse{}, fmt.Errorf("fetching event: %w", err)
	}

	// Locked event enforcement
	if event.IsLocked && callerRole != "super_admin" {
		return ShiftResponse{}, model.NewDomainError(model.ErrForbidden, "event is locked")
	}

	// Users can only update their own shifts (unless event admin)
	isEventAdmin := false
	if callerRole == "user" && existing.UserID != callerID {
		isEventAdmin, _ = s.queries.IsEventAdmin(ctx, event.ID, callerID)
		if !isEventAdmin {
			return ShiftResponse{}, model.NewDomainError(model.ErrForbidden, "users can only modify their own shifts")
		}
	} else if callerRole != "user" {
		isEventAdmin, _ = s.queries.IsEventAdmin(ctx, event.ID, callerID)
	}

	// Only admins can reassign shifts to a different user
	if input.UserID != nil && *input.UserID != existing.UserID {
		if callerRole != "super_admin" && !isEventAdmin {
			return ShiftResponse{}, model.NewDomainError(model.ErrForbidden, "only admins can reassign shifts")
		}
	}

	// Validate time range if being changed
	startTime := existing.StartTime
	if input.StartTime != nil {
		startTime = *input.StartTime
	}
	endTime := existing.EndTime
	if input.EndTime != nil {
		endTime = *input.EndTime
	}
	if !endTime.After(startTime) {
		return ShiftResponse{}, model.NewFieldError(model.ErrInvalidInput, "end_time", "end time must be after start time")
	}

	// Validate shift is within event time range
	if startTime.Before(event.StartTime) || endTime.After(event.EndTime) {
		return ShiftResponse{}, model.NewDomainError(model.ErrInvalidInput, "shift must be within event time range")
	}

	shift, err := s.queries.UpdateShift(ctx, repository.UpdateShiftParams{
		ID:        shiftID,
		TeamID:    input.TeamID,
		UserID:    input.UserID,
		StartTime: input.StartTime,
		EndTime:   input.EndTime,
	})
	if err != nil {
		return ShiftResponse{}, fmt.Errorf("updating shift: %w", err)
	}

	fullShift, err := s.queries.GetShiftByID(ctx, shift.ID)
	if err != nil {
		return ShiftResponse{}, fmt.Errorf("fetching updated shift: %w", err)
	}

	oldResp := shiftDetailToResponse(existing)
	resp := shiftDetailToResponse(fullShift)
	s.logger.Info("shift updated", "shift_id", shiftID)

	if s.auditService != nil {
		eventID := existing.EventID
		go s.auditService.Log(context.Background(), &callerID, &eventID, "update", "shift", &shiftID, oldResp, resp, nil)
	}

	if s.sseBroker != nil {
		s.sseBroker.Publish(ctx, sse.Event{Type: sse.TypeShiftUpdated, EventID: existing.EventID.String(), Slug: event.Slug, Payload: resp})
	}

	go func() {
		bgCtx := context.Background()
		if s.notificationService != nil {
			title := fmt.Sprintf("%s: Shift updated", event.Name)
			body := fmt.Sprintf("%s's %s shift was updated (%s)", resp.Username, resp.TeamName, formatTimeRange(shift.StartTime, shift.EndTime))
			s.notificationService.NotifyEventUsers(bgCtx, existing.EventID, callerID, TriggerShiftUpdated, title, &body)
		}
		if s.webhookService != nil {
			s.webhookService.Dispatch(bgCtx, existing.EventID, TriggerShiftUpdated, resp)
		}
	}()

	return resp, nil
}

// Delete removes a shift with permission checks.
func (s *ShiftService) Delete(ctx context.Context, shiftID uuid.UUID, callerID uuid.UUID, callerRole string) error {
	existing, err := s.queries.GetShiftByID(ctx, shiftID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "shift not found")
		}
		return fmt.Errorf("fetching shift: %w", err)
	}

	// Read-only users cannot delete shifts
	if callerRole == "read_only" {
		return model.NewDomainError(model.ErrForbidden, "read-only users cannot delete shifts")
	}

	// Get event for lock checks
	event, err := s.queries.GetEventByID(ctx, existing.EventID)
	if err != nil {
		return fmt.Errorf("fetching event: %w", err)
	}

	// Locked event enforcement
	if event.IsLocked && callerRole != "super_admin" {
		return model.NewDomainError(model.ErrForbidden, "event is locked")
	}

	// Users can only delete their own shifts (unless event admin)
	if callerRole == "user" && existing.UserID != callerID {
		isAdmin, _ := s.queries.IsEventAdmin(ctx, event.ID, callerID)
		if !isAdmin {
			return model.NewDomainError(model.ErrForbidden, "users can only delete their own shifts")
		}
	}

	if err := s.queries.DeleteShift(ctx, shiftID); err != nil {
		return fmt.Errorf("deleting shift: %w", err)
	}

	s.logger.Info("shift deleted", "shift_id", shiftID)

	if s.auditService != nil {
		eventID := existing.EventID
		go s.auditService.Log(context.Background(), &callerID, &eventID, "delete", "shift", &shiftID, shiftDetailToResponse(existing), nil, nil)
	}

	if s.sseBroker != nil {
		s.sseBroker.Publish(ctx, sse.Event{Type: sse.TypeShiftDeleted, EventID: existing.EventID.String(), Slug: event.Slug, Payload: map[string]string{"id": shiftID.String()}})
	}

	go func() {
		bgCtx := context.Background()
		if s.notificationService != nil {
			title := fmt.Sprintf("%s: Shift deleted", event.Name)
			body := fmt.Sprintf("%s's %s shift was removed (%s)", existing.Username, existing.TeamName, formatTimeRange(existing.StartTime, existing.EndTime))
			s.notificationService.NotifyEventUsers(bgCtx, existing.EventID, callerID, TriggerShiftDeleted, title, &body)
		}
		if s.webhookService != nil {
			s.webhookService.Dispatch(bgCtx, existing.EventID, TriggerShiftDeleted, map[string]string{"id": shiftID.String()})
		}
	}()

	return nil
}

// Coverage requirement methods

func (s *ShiftService) ListCoverage(ctx context.Context, slug string) ([]CoverageRequirementResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	reqs, err := s.queries.ListCoverageRequirements(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing coverage: %w", err)
	}

	result := make([]CoverageRequirementResponse, len(reqs))
	for i, r := range reqs {
		result[i] = coverageToResponse(r)
	}
	return result, nil
}

func (s *ShiftService) CreateCoverage(ctx context.Context, input CreateCoverageInput) (CoverageRequirementResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, input.EventSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CoverageRequirementResponse{}, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return CoverageRequirementResponse{}, fmt.Errorf("fetching event: %w", err)
	}

	if !input.EndTime.After(input.StartTime) {
		return CoverageRequirementResponse{}, model.NewFieldError(model.ErrInvalidInput, "end_time", "end time must be after start time")
	}
	if input.RequiredCount < 1 {
		return CoverageRequirementResponse{}, model.NewFieldError(model.ErrInvalidInput, "required_count", "required count must be at least 1")
	}

	cov, err := s.queries.CreateCoverageRequirement(ctx, repository.CreateCoverageRequirementParams{
		EventID:       event.ID,
		TeamID:        input.TeamID,
		StartTime:     input.StartTime,
		EndTime:       input.EndTime,
		RequiredCount: input.RequiredCount,
	})
	if err != nil {
		return CoverageRequirementResponse{}, fmt.Errorf("creating coverage: %w", err)
	}

	resp := coverageToResponse(cov)
	s.logger.Info("coverage requirement created", "event", input.EventSlug, "team", input.TeamID)

	if s.sseBroker != nil {
		s.sseBroker.Publish(ctx, sse.Event{Type: sse.TypeCoverageUpdated, EventID: event.ID.String(), Slug: event.Slug, Payload: resp})
	}

	return resp, nil
}

func (s *ShiftService) UpdateCoverage(ctx context.Context, input UpdateCoverageInput) (CoverageRequirementResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, input.EventSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CoverageRequirementResponse{}, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return CoverageRequirementResponse{}, fmt.Errorf("fetching event: %w", err)
	}

	if !input.EndTime.After(input.StartTime) {
		return CoverageRequirementResponse{}, model.NewFieldError(model.ErrInvalidInput, "end_time", "end time must be after start time")
	}
	if input.RequiredCount < 1 {
		return CoverageRequirementResponse{}, model.NewFieldError(model.ErrInvalidInput, "required_count", "required count must be at least 1")
	}

	cov, err := s.queries.UpdateCoverageRequirement(ctx, repository.UpdateCoverageRequirementParams{
		ID:            input.CoverageID,
		TeamID:        input.TeamID,
		StartTime:     input.StartTime,
		EndTime:       input.EndTime,
		RequiredCount: input.RequiredCount,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CoverageRequirementResponse{}, model.NewDomainError(model.ErrNotFound, "coverage requirement not found")
		}
		return CoverageRequirementResponse{}, fmt.Errorf("updating coverage: %w", err)
	}

	resp := coverageToResponse(cov)
	s.logger.Info("coverage requirement updated", "event", input.EventSlug, "id", input.CoverageID)

	if s.sseBroker != nil {
		s.sseBroker.Publish(ctx, sse.Event{Type: sse.TypeCoverageUpdated, EventID: event.ID.String(), Slug: event.Slug, Payload: resp})
	}

	return resp, nil
}

func (s *ShiftService) DeleteCoverage(ctx context.Context, slug string, coverageID uuid.UUID) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	if err := s.queries.DeleteCoverageRequirementByID(ctx, coverageID); err != nil {
		return fmt.Errorf("deleting coverage: %w", err)
	}

	s.logger.Info("coverage requirement deleted", "event", slug, "id", coverageID)

	if s.sseBroker != nil {
		s.sseBroker.Publish(ctx, sse.Event{Type: sse.TypeCoverageUpdated, EventID: event.ID.String(), Slug: event.Slug, Payload: map[string]string{"id": coverageID.String(), "action": "deleted"}})
	}

	return nil
}

func (s *ShiftService) DeleteCoverageByTeam(ctx context.Context, slug string, teamID uuid.UUID) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	if err := s.queries.DeleteCoverageRequirementsByEventAndTeam(ctx, event.ID, teamID); err != nil {
		return fmt.Errorf("deleting coverage: %w", err)
	}

	s.logger.Info("coverage requirements deleted", "event", slug, "team", teamID)

	if s.sseBroker != nil {
		s.sseBroker.Publish(ctx, sse.Event{Type: sse.TypeCoverageUpdated, EventID: event.ID.String(), Slug: event.Slug, Payload: map[string]string{"team_id": teamID.String(), "action": "deleted"}})
	}

	return nil
}

type AvailabilityGridResponse struct {
	ID              string  `json:"id"`
	UserID          string  `json:"user_id"`
	StartTime       string  `json:"start_time"`
	EndTime         string  `json:"end_time"`
	Status          string  `json:"status"`
	Note            *string `json:"note"`
	Username        string  `json:"username"`
	UserFullName    string  `json:"user_full_name"`
	UserDisplayName *string `json:"user_display_name"`
}

// GridData returns shifts, coverage, and availability data optimized for grid rendering.
func (s *ShiftService) GridData(ctx context.Context, slug string) (map[string]interface{}, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	shifts, err := s.queries.ListShiftsByEvent(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing shifts: %w", err)
	}

	coverage, err := s.queries.ListCoverageRequirements(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing coverage: %w", err)
	}

	availability, err := s.queries.ListAvailabilityByEvent(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing availability: %w", err)
	}

	shiftResponses := make([]ShiftResponse, len(shifts))
	for i, sh := range shifts {
		shiftResponses[i] = shiftRowToResponse(sh)
	}

	coverageResponses := make([]CoverageRequirementResponse, len(coverage))
	for i, c := range coverage {
		coverageResponses[i] = coverageToResponse(c)
	}

	availabilityResponses := make([]AvailabilityGridResponse, len(availability))
	for i, a := range availability {
		availabilityResponses[i] = AvailabilityGridResponse{
			ID:              a.ID.String(),
			UserID:          a.UserID.String(),
			StartTime:       a.StartTime.Format(time.RFC3339),
			EndTime:         a.EndTime.Format(time.RFC3339),
			Status:          a.Status,
			Note:            a.Note,
			Username:        a.Username,
			UserFullName:    a.UserFullName,
			UserDisplayName: a.UserDisplayName,
		}
	}

	return map[string]interface{}{
		"event": EventResponse{
			ID:               event.ID.String(),
			Name:             event.Name,
			Slug:             event.Slug,
			Description:      event.Description,
			Location:         event.Location,
			ParticipantCount: event.ParticipantCount,
			StartTime:        event.StartTime.Format(time.RFC3339),
			EndTime:          event.EndTime.Format(time.RFC3339),
			TimeGranularity:  event.TimeGranularity,
			IsLocked:         event.IsLocked,
			IsPublic:         event.IsPublic,
			CreatedAt:        event.CreatedAt.Format(time.RFC3339),
		},
		"shifts":       shiftResponses,
		"coverage":     coverageResponses,
		"availability": availabilityResponses,
	}, nil
}

// PublicGridData returns a sanitized version of grid data for unauthenticated public access.
// It excludes availability data entirely and strips sensitive user fields (full_name, created_at).
func (s *ShiftService) PublicGridData(ctx context.Context, slug string) (map[string]interface{}, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	if !event.IsPublic {
		return nil, model.NewDomainError(model.ErrNotFound, "event not found")
	}

	shifts, err := s.queries.ListShiftsByEvent(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing shifts: %w", err)
	}

	coverage, err := s.queries.ListCoverageRequirements(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing coverage: %w", err)
	}

	publicShifts := make([]PublicShiftResponse, len(shifts))
	for i, sh := range shifts {
		publicShifts[i] = PublicShiftResponse{
			ID:               sh.ID.String(),
			EventID:          sh.EventID.String(),
			TeamID:           sh.TeamID.String(),
			UserID:           sh.UserID.String(),
			StartTime:        sh.StartTime.Format(time.RFC3339),
			EndTime:          sh.EndTime.Format(time.RFC3339),
			TeamName:         sh.TeamName,
			TeamAbbreviation: sh.TeamAbbreviation,
			TeamColor:        sh.TeamColor,
			Username:         sh.Username,
			UserDisplayName:  sh.UserDisplayName,
		}
	}

	coverageResponses := make([]CoverageRequirementResponse, len(coverage))
	for i, c := range coverage {
		coverageResponses[i] = coverageToResponse(c)
	}

	return map[string]interface{}{
		"event": EventResponse{
			ID:              event.ID.String(),
			Name:            event.Name,
			Slug:            event.Slug,
			Description:     event.Description,
			Location:        event.Location,
			StartTime:       event.StartTime.Format(time.RFC3339),
			EndTime:         event.EndTime.Format(time.RFC3339),
			TimeGranularity: event.TimeGranularity,
			IsLocked:        event.IsLocked,
			IsPublic:        event.IsPublic,
		},
		"shifts":       publicShifts,
		"coverage":     coverageResponses,
		"availability": []struct{}{},
	}, nil
}

// IsEventAdmin checks if a user is an admin for the event identified by slug.
func (s *ShiftService) IsEventAdmin(ctx context.Context, slug string, userID uuid.UUID) (bool, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("fetching event: %w", err)
	}

	isAdmin, err := s.queries.IsEventAdmin(ctx, event.ID, userID)
	if err != nil {
		return false, fmt.Errorf("checking admin status: %w", err)
	}
	return isAdmin, nil
}

// ListByUser returns all shifts for a specific user, with event metadata.
func (s *ShiftService) ListByUser(ctx context.Context, userID uuid.UUID) ([]UserShiftResponse, error) {
	shifts, err := s.queries.ListShiftsByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("listing user shifts: %w", err)
	}

	result := make([]UserShiftResponse, len(shifts))
	for i, sh := range shifts {
		result[i] = UserShiftResponse{
			ID:               sh.ID.String(),
			EventID:          sh.EventID.String(),
			TeamID:           sh.TeamID.String(),
			UserID:           sh.UserID.String(),
			StartTime:        sh.StartTime.Format(time.RFC3339),
			EndTime:          sh.EndTime.Format(time.RFC3339),
			TeamName:         sh.TeamName,
			TeamAbbreviation: sh.TeamAbbreviation,
			TeamColor:        sh.TeamColor,
			EventName:        sh.EventName,
			EventSlug:        sh.EventSlug,
			CreatedAt:        sh.CreatedAt.Format(time.RFC3339),
		}
	}
	return result, nil
}

// Response converters

func shiftRowToResponse(sh repository.ListShiftsByEventRow) ShiftResponse {
	return ShiftResponse{
		ID:               sh.ID.String(),
		EventID:          sh.EventID.String(),
		TeamID:           sh.TeamID.String(),
		UserID:           sh.UserID.String(),
		StartTime:        sh.StartTime.Format(time.RFC3339),
		EndTime:          sh.EndTime.Format(time.RFC3339),
		TeamName:         sh.TeamName,
		TeamAbbreviation: sh.TeamAbbreviation,
		TeamColor:        sh.TeamColor,
		Username:         sh.Username,
		UserFullName:     sh.UserFullName,
		UserDisplayName:  sh.UserDisplayName,
		CreatedAt:        sh.CreatedAt.Format(time.RFC3339),
	}
}

func shiftTeamRowToResponse(sh repository.ListShiftsByEventAndTeamRow) ShiftResponse {
	return ShiftResponse{
		ID:               sh.ID.String(),
		EventID:          sh.EventID.String(),
		TeamID:           sh.TeamID.String(),
		UserID:           sh.UserID.String(),
		StartTime:        sh.StartTime.Format(time.RFC3339),
		EndTime:          sh.EndTime.Format(time.RFC3339),
		TeamName:         sh.TeamName,
		TeamAbbreviation: sh.TeamAbbreviation,
		TeamColor:        sh.TeamColor,
		Username:         sh.Username,
		UserFullName:     sh.UserFullName,
		UserDisplayName:  sh.UserDisplayName,
		CreatedAt:        sh.CreatedAt.Format(time.RFC3339),
	}
}

func shiftDetailToResponse(sh repository.GetShiftByIDRow) ShiftResponse {
	return ShiftResponse{
		ID:               sh.ID.String(),
		EventID:          sh.EventID.String(),
		TeamID:           sh.TeamID.String(),
		UserID:           sh.UserID.String(),
		StartTime:        sh.StartTime.Format(time.RFC3339),
		EndTime:          sh.EndTime.Format(time.RFC3339),
		TeamName:         sh.TeamName,
		TeamAbbreviation: sh.TeamAbbreviation,
		TeamColor:        sh.TeamColor,
		Username:         sh.Username,
		UserFullName:     sh.UserFullName,
		UserDisplayName:  sh.UserDisplayName,
		CreatedAt:        sh.CreatedAt.Format(time.RFC3339),
	}
}

func coverageToResponse(c repository.CoverageRequirement) CoverageRequirementResponse {
	return CoverageRequirementResponse{
		ID:            c.ID.String(),
		EventID:       c.EventID.String(),
		TeamID:        c.TeamID.String(),
		StartTime:     c.StartTime.Format(time.RFC3339),
		EndTime:       c.EndTime.Format(time.RFC3339),
		RequiredCount: c.RequiredCount,
	}
}
