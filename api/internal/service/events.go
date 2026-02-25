package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/echtkpvl/rncasp/internal/sse"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type EventService struct {
	queries             *repository.Queries
	logger              *slog.Logger
	sseBroker           *sse.Broker
	notificationService *NotificationService
	webhookService      *WebhookService
	auditService        *AuditService
}

func NewEventService(queries *repository.Queries, logger *slog.Logger, sseBroker *sse.Broker) *EventService {
	return &EventService{queries: queries, logger: logger, sseBroker: sseBroker}
}

// SetNotificationService sets the notification service for trigger dispatch.
func (s *EventService) SetNotificationService(ns *NotificationService) {
	s.notificationService = ns
}

// SetWebhookService sets the webhook service for trigger dispatch.
func (s *EventService) SetWebhookService(ws *WebhookService) {
	s.webhookService = ws
}

// SetAuditService sets the audit service for logging changes.
func (s *EventService) SetAuditService(as *AuditService) {
	s.auditService = as
}

type CreateEventInput struct {
	Name             string
	Slug             string
	Description      *string
	Location         *string
	ParticipantCount *int32
	StartTime        time.Time
	EndTime          time.Time
	TimeGranularity  string
	CreatedBy        uuid.UUID
}

type UpdateEventInput struct {
	Name             *string
	Slug             *string
	Description      *string
	Location         *string
	ParticipantCount *int32
	StartTime        *time.Time
	EndTime          *time.Time
	TimeGranularity  *string
}

type SetEventTeamInput struct {
	TeamID    uuid.UUID
	IsVisible bool
}

type HiddenRangeInput struct {
	HideStartHour int32
	HideEndHour   int32
}

type EventResponse struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Slug             string  `json:"slug"`
	Description      *string `json:"description"`
	Location         *string `json:"location"`
	ParticipantCount *int32  `json:"participant_count"`
	StartTime        string  `json:"start_time"`
	EndTime          string  `json:"end_time"`
	TimeGranularity  string  `json:"time_granularity"`
	IsLocked         bool    `json:"is_locked"`
	IsPublic         bool    `json:"is_public"`
	IsEventAdmin     bool    `json:"is_event_admin"`
	CreatedBy        *string `json:"created_by"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

type EventTeamResponse struct {
	TeamID       string `json:"team_id"`
	TeamName     string `json:"team_name"`
	Abbreviation string `json:"team_abbreviation"`
	Color        string `json:"team_color"`
	SortOrder    int32  `json:"sort_order"`
	IsVisible    bool   `json:"is_visible"`
}

type EventAdminResponse struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	FullName    string  `json:"full_name"`
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
}

type HiddenRangeResponse struct {
	ID            string `json:"id"`
	HideStartHour int32  `json:"hide_start_hour"`
	HideEndHour   int32  `json:"hide_end_hour"`
}

func eventToResponse(e repository.Event) EventResponse {
	var createdBy *string
	if e.CreatedBy != nil {
		s := e.CreatedBy.String()
		createdBy = &s
	}
	return EventResponse{
		ID:               e.ID.String(),
		Name:             e.Name,
		Slug:             e.Slug,
		Description:      e.Description,
		Location:         e.Location,
		ParticipantCount: e.ParticipantCount,
		StartTime:        e.StartTime.Format(time.RFC3339),
		EndTime:          e.EndTime.Format(time.RFC3339),
		TimeGranularity:  e.TimeGranularity,
		IsLocked:         e.IsLocked,
		IsPublic:         e.IsPublic,
		CreatedBy:        createdBy,
		CreatedAt:        e.CreatedAt.Format(time.RFC3339),
		UpdatedAt:        e.UpdatedAt.Format(time.RFC3339),
	}
}

var slugRegex = regexp.MustCompile(`^[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$`)
var validGranularities = map[string]bool{"15min": true, "30min": true, "1hour": true}

func (s *EventService) List(ctx context.Context) ([]EventResponse, error) {
	events, err := s.queries.ListEvents(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing events: %w", err)
	}

	result := make([]EventResponse, len(events))
	for i, e := range events {
		result[i] = eventToResponse(e)
	}
	return result, nil
}

func (s *EventService) GetBySlug(ctx context.Context, slug string) (EventResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return EventResponse{}, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return EventResponse{}, fmt.Errorf("fetching event: %w", err)
	}
	return eventToResponse(event), nil
}

func (s *EventService) Create(ctx context.Context, input CreateEventInput) (EventResponse, error) {
	if err := validateEventInput(input); err != nil {
		return EventResponse{}, err
	}

	// Check slug uniqueness
	_, err := s.queries.GetEventBySlug(ctx, input.Slug)
	if err == nil {
		return EventResponse{}, model.NewFieldError(model.ErrAlreadyExists, "slug", "slug already in use")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return EventResponse{}, fmt.Errorf("checking slug: %w", err)
	}

	event, err := s.queries.CreateEvent(ctx, repository.CreateEventParams{
		Name:             input.Name,
		Slug:             input.Slug,
		Description:      input.Description,
		Location:         input.Location,
		ParticipantCount: input.ParticipantCount,
		StartTime:        input.StartTime,
		EndTime:          input.EndTime,
		TimeGranularity:  input.TimeGranularity,
		CreatedBy:        &input.CreatedBy,
	})
	if err != nil {
		return EventResponse{}, fmt.Errorf("creating event: %w", err)
	}

	s.logger.Info("event created", "event_id", event.ID, "slug", event.Slug)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), &input.CreatedBy, &event.ID, "create", "event", &event.ID, nil, eventToResponse(event), nil)
	}

	if s.webhookService != nil {
		go s.webhookService.DispatchGlobal(context.Background(), "event.created", map[string]string{
			"event_id": event.ID.String(),
			"name":     event.Name,
			"slug":     event.Slug,
		})
	}

	return eventToResponse(event), nil
}

func (s *EventService) Update(ctx context.Context, slug string, input UpdateEventInput) (EventResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return EventResponse{}, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return EventResponse{}, fmt.Errorf("fetching event: %w", err)
	}

	// Validate and check slug uniqueness if changing
	if input.Slug != nil && *input.Slug != event.Slug {
		if !slugRegex.MatchString(*input.Slug) {
			return EventResponse{}, model.NewFieldError(model.ErrInvalidInput, "slug", "slug must contain only letters, numbers, hyphens, and underscores")
		}
		_, err := s.queries.GetEventBySlug(ctx, *input.Slug)
		if err == nil {
			return EventResponse{}, model.NewFieldError(model.ErrAlreadyExists, "slug", "slug already in use")
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return EventResponse{}, fmt.Errorf("checking slug: %w", err)
		}
	}

	// Validate granularity if changing
	if input.TimeGranularity != nil && !validGranularities[*input.TimeGranularity] {
		return EventResponse{}, model.NewFieldError(model.ErrInvalidInput, "time_granularity", "must be 15min, 30min, or 1hour")
	}

	// Validate time range if changing
	startTime := event.StartTime
	endTime := event.EndTime
	if input.StartTime != nil {
		startTime = *input.StartTime
	}
	if input.EndTime != nil {
		endTime = *input.EndTime
	}
	if !endTime.After(startTime) {
		return EventResponse{}, model.NewFieldError(model.ErrInvalidInput, "end_time", "end time must be after start time")
	}

	updated, err := s.queries.UpdateEvent(ctx, repository.UpdateEventParams{
		ID:               event.ID,
		Name:             input.Name,
		Slug:             input.Slug,
		Description:      input.Description,
		Location:         input.Location,
		ParticipantCount: input.ParticipantCount,
		StartTime:        input.StartTime,
		EndTime:          input.EndTime,
		TimeGranularity:  input.TimeGranularity,
	})
	if err != nil {
		return EventResponse{}, fmt.Errorf("updating event: %w", err)
	}

	s.logger.Info("event updated", "event_id", updated.ID, "slug", updated.Slug)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, &updated.ID, "update", "event", &updated.ID, eventToResponse(event), eventToResponse(updated), nil)
	}

	if s.webhookService != nil {
		go s.webhookService.Dispatch(context.Background(), updated.ID, "event.updated", map[string]string{
			"event_id": updated.ID.String(),
			"name":     updated.Name,
			"slug":     updated.Slug,
		})
	}

	return eventToResponse(updated), nil
}

func (s *EventService) Delete(ctx context.Context, slug string) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	if err := s.queries.DeleteEvent(ctx, event.ID); err != nil {
		return fmt.Errorf("deleting event: %w", err)
	}

	s.logger.Info("event deleted", "event_id", event.ID, "slug", slug)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, &event.ID, "delete", "event", &event.ID, eventToResponse(event), nil, nil)
	}

	if s.webhookService != nil {
		go s.webhookService.DispatchGlobal(context.Background(), "event.deleted", map[string]string{
			"event_id": event.ID.String(),
			"name":     event.Name,
			"slug":     slug,
		})
	}

	return nil
}

func (s *EventService) SetLocked(ctx context.Context, slug string, locked bool) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	if err := s.queries.SetEventLocked(ctx, event.ID, locked); err != nil {
		return fmt.Errorf("setting lock: %w", err)
	}

	s.logger.Info("event lock toggled", "event_id", event.ID, "locked", locked)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, &event.ID, "lock_toggle", "event", &event.ID, map[string]bool{"is_locked": event.IsLocked}, map[string]bool{"is_locked": locked}, nil)
	}

	if s.sseBroker != nil {
		evtType := sse.TypeEventLocked
		if !locked {
			evtType = sse.TypeEventUnlocked
		}
		s.sseBroker.Publish(ctx, sse.Event{Type: evtType, EventID: event.ID.String(), Slug: slug, Payload: map[string]any{"slug": slug, "locked": locked}})
	}

	go func() {
		bgCtx := context.Background()
		triggerType := TriggerEventLocked
		title := fmt.Sprintf("%s: Locked", event.Name)
		body := fmt.Sprintf("Event \"%s\" has been locked — shifts can no longer be edited", event.Name)
		if !locked {
			triggerType = TriggerEventUnlocked
			title = fmt.Sprintf("%s: Unlocked", event.Name)
			body = fmt.Sprintf("Event \"%s\" has been unlocked — shifts can be edited again", event.Name)
		}
		if s.notificationService != nil {
			s.notificationService.NotifyEventUsers(bgCtx, event.ID, uuid.Nil, triggerType, title, &body)
		}
		if s.webhookService != nil {
			s.webhookService.Dispatch(bgCtx, event.ID, triggerType, map[string]any{"slug": slug, "locked": locked})
		}
	}()

	return nil
}

func (s *EventService) SetPublic(ctx context.Context, slug string, public bool) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	if err := s.queries.SetEventPublic(ctx, event.ID, public); err != nil {
		return fmt.Errorf("setting public: %w", err)
	}

	s.logger.Info("event public toggled", "event_id", event.ID, "public", public)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, &event.ID, "public_toggle", "event", &event.ID, map[string]bool{"is_public": event.IsPublic}, map[string]bool{"is_public": public}, nil)
	}

	return nil
}

// Team visibility management

func (s *EventService) ListTeams(ctx context.Context, slug string) ([]EventTeamResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	teams, err := s.queries.ListEventTeams(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing event teams: %w", err)
	}

	result := make([]EventTeamResponse, len(teams))
	for i, t := range teams {
		result[i] = EventTeamResponse{
			TeamID:       t.ID.String(),
			TeamName:     t.Name,
			Abbreviation: t.Abbreviation,
			Color:        t.Color,
			SortOrder:    t.SortOrder,
			IsVisible:    t.IsVisible,
		}
	}
	return result, nil
}

func (s *EventService) SetTeam(ctx context.Context, slug string, input SetEventTeamInput) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	// Verify team exists
	_, err = s.queries.GetTeamByID(ctx, input.TeamID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "team not found")
		}
		return fmt.Errorf("fetching team: %w", err)
	}

	if err := s.queries.SetEventTeam(ctx, repository.SetEventTeamParams{
		EventID:   event.ID,
		TeamID:    input.TeamID,
		IsVisible: input.IsVisible,
	}); err != nil {
		return fmt.Errorf("setting event team: %w", err)
	}

	return nil
}

func (s *EventService) RemoveTeam(ctx context.Context, slug string, teamID uuid.UUID) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	if err := s.queries.RemoveEventTeam(ctx, event.ID, teamID); err != nil {
		return fmt.Errorf("removing event team: %w", err)
	}

	return nil
}

// Admin management

func (s *EventService) ListAdmins(ctx context.Context, slug string) ([]EventAdminResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	admins, err := s.queries.ListEventAdmins(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing event admins: %w", err)
	}

	result := make([]EventAdminResponse, len(admins))
	for i, a := range admins {
		result[i] = EventAdminResponse{
			ID:          a.ID.String(),
			Username:    a.Username,
			FullName:    a.FullName,
			DisplayName: a.DisplayName,
			Email:       a.Email,
		}
	}
	return result, nil
}

func (s *EventService) AddAdmin(ctx context.Context, slug string, userID uuid.UUID) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	// Verify user exists
	_, err = s.queries.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return fmt.Errorf("fetching user: %w", err)
	}

	if err := s.queries.AddEventAdmin(ctx, event.ID, userID); err != nil {
		return fmt.Errorf("adding event admin: %w", err)
	}

	s.logger.Info("event admin added", "event_id", event.ID, "user_id", userID)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, &event.ID, "create", "event_admin", nil, nil, map[string]string{"user_id": userID.String(), "event_slug": slug}, nil)
	}

	if s.webhookService != nil {
		go s.webhookService.Dispatch(context.Background(), event.ID, "event.admin_added", map[string]string{
			"event_id": event.ID.String(),
			"slug":     slug,
			"user_id":  userID.String(),
		})
	}

	return nil
}

func (s *EventService) RemoveAdmin(ctx context.Context, slug string, userID uuid.UUID) error {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return fmt.Errorf("fetching event: %w", err)
	}

	if err := s.queries.RemoveEventAdmin(ctx, event.ID, userID); err != nil {
		return fmt.Errorf("removing event admin: %w", err)
	}

	s.logger.Info("event admin removed", "event_id", event.ID, "user_id", userID)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, &event.ID, "delete", "event_admin", nil, map[string]string{"user_id": userID.String(), "event_slug": slug}, nil, nil)
	}

	if s.webhookService != nil {
		go s.webhookService.Dispatch(context.Background(), event.ID, "event.admin_removed", map[string]string{
			"event_id": event.ID.String(),
			"slug":     slug,
			"user_id":  userID.String(),
		})
	}

	return nil
}

func (s *EventService) IsEventAdmin(ctx context.Context, slug string, userID uuid.UUID) (bool, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("fetching event: %w", err)
	}

	return s.queries.IsEventAdmin(ctx, event.ID, userID)
}

// Hidden hours management

func (s *EventService) ListHiddenRanges(ctx context.Context, slug string) ([]HiddenRangeResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	ranges, err := s.queries.ListEventHiddenRanges(ctx, event.ID)
	if err != nil {
		return nil, fmt.Errorf("listing hidden ranges: %w", err)
	}

	result := make([]HiddenRangeResponse, len(ranges))
	for i, r := range ranges {
		result[i] = HiddenRangeResponse{
			ID:            r.ID.String(),
			HideStartHour: r.HideStartHour,
			HideEndHour:   r.HideEndHour,
		}
	}
	return result, nil
}

func (s *EventService) SetHiddenRanges(ctx context.Context, slug string, ranges []HiddenRangeInput) ([]HiddenRangeResponse, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, fmt.Errorf("fetching event: %w", err)
	}

	// Validate ranges
	for _, r := range ranges {
		if r.HideStartHour < 0 || r.HideStartHour > 23 {
			return nil, model.NewFieldError(model.ErrInvalidInput, "hide_start_hour", "must be 0-23")
		}
		if r.HideEndHour < 0 || r.HideEndHour > 23 {
			return nil, model.NewFieldError(model.ErrInvalidInput, "hide_end_hour", "must be 0-23")
		}
		if r.HideStartHour >= r.HideEndHour {
			return nil, model.NewFieldError(model.ErrInvalidInput, "hide_end_hour", "end hour must be after start hour")
		}
	}

	// Replace: delete all existing, then insert new
	if err := s.queries.DeleteEventHiddenRanges(ctx, event.ID); err != nil {
		return nil, fmt.Errorf("deleting hidden ranges: %w", err)
	}

	result := make([]HiddenRangeResponse, len(ranges))
	for i, r := range ranges {
		created, err := s.queries.SetEventHiddenRange(ctx, repository.SetEventHiddenRangeParams{
			EventID:       event.ID,
			HideStartHour: r.HideStartHour,
			HideEndHour:   r.HideEndHour,
		})
		if err != nil {
			return nil, fmt.Errorf("creating hidden range: %w", err)
		}
		result[i] = HiddenRangeResponse{
			ID:            created.ID.String(),
			HideStartHour: created.HideStartHour,
			HideEndHour:   created.HideEndHour,
		}
	}

	return result, nil
}

func validateEventInput(input CreateEventInput) error {
	if input.Name == "" {
		return model.NewFieldError(model.ErrInvalidInput, "name", "name is required")
	}
	if input.Slug == "" {
		return model.NewFieldError(model.ErrInvalidInput, "slug", "slug is required")
	}
	if !slugRegex.MatchString(input.Slug) {
		return model.NewFieldError(model.ErrInvalidInput, "slug", "slug must contain only letters, numbers, hyphens, and underscores")
	}
	if input.StartTime.IsZero() {
		return model.NewFieldError(model.ErrInvalidInput, "start_time", "start time is required")
	}
	if input.EndTime.IsZero() {
		return model.NewFieldError(model.ErrInvalidInput, "end_time", "end time is required")
	}
	if !input.EndTime.After(input.StartTime) {
		return model.NewFieldError(model.ErrInvalidInput, "end_time", "end time must be after start time")
	}
	if !validGranularities[input.TimeGranularity] {
		return model.NewFieldError(model.ErrInvalidInput, "time_granularity", "must be 15min, 30min, or 1hour")
	}
	return nil
}
