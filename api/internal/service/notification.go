package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
)

// Trigger types for notifications
const (
	TriggerShiftCreated  = "shift.created"
	TriggerShiftUpdated  = "shift.updated"
	TriggerShiftDeleted  = "shift.deleted"
	TriggerEventLocked   = "event.locked"
	TriggerEventUnlocked = "event.unlocked"
)

// Notification channels
const (
	ChannelInApp = "in_app"
	ChannelEmail = "email"
)

type NotificationService struct {
	queries *repository.Queries
	logger  *slog.Logger
}

func NewNotificationService(queries *repository.Queries, logger *slog.Logger) *NotificationService {
	return &NotificationService{queries: queries, logger: logger}
}

type NotificationResponse struct {
	ID          string  `json:"id"`
	EventID     *string `json:"event_id"`
	Title       string  `json:"title"`
	Body        *string `json:"body"`
	TriggerType string  `json:"trigger_type"`
	IsRead      bool    `json:"is_read"`
	CreatedAt   string  `json:"created_at"`
}

type NotificationPreferenceResponse struct {
	TriggerType string `json:"trigger_type"`
	Channel     string `json:"channel"`
	IsEnabled   bool   `json:"is_enabled"`
}

type UpdatePreferenceInput struct {
	TriggerType string
	Channel     string
	IsEnabled   bool
}

func notificationToResponse(n repository.Notification) NotificationResponse {
	var eventID *string
	if n.EventID != nil {
		s := n.EventID.String()
		eventID = &s
	}
	return NotificationResponse{
		ID:          n.ID.String(),
		EventID:     eventID,
		Title:       n.Title,
		Body:        n.Body,
		TriggerType: n.TriggerType,
		IsRead:      n.IsRead,
		CreatedAt:   n.CreatedAt.Format(time.RFC3339),
	}
}

func (s *NotificationService) List(ctx context.Context, userID uuid.UUID, limit, offset int32) ([]NotificationResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	notifications, err := s.queries.ListNotifications(ctx, repository.ListNotificationsParams{
		UserID: userID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, fmt.Errorf("listing notifications: %w", err)
	}

	result := make([]NotificationResponse, len(notifications))
	for i, n := range notifications {
		result[i] = notificationToResponse(n)
	}
	return result, nil
}

func (s *NotificationService) CountUnread(ctx context.Context, userID uuid.UUID) (int64, error) {
	count, err := s.queries.CountUnreadNotifications(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("counting unread notifications: %w", err)
	}
	return count, nil
}

func (s *NotificationService) MarkRead(ctx context.Context, userID uuid.UUID, notificationID uuid.UUID) error {
	if err := s.queries.MarkNotificationRead(ctx, notificationID, userID); err != nil {
		return fmt.Errorf("marking notification read: %w", err)
	}
	return nil
}

func (s *NotificationService) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	if err := s.queries.MarkAllNotificationsRead(ctx, userID); err != nil {
		return fmt.Errorf("marking all notifications read: %w", err)
	}
	return nil
}

func (s *NotificationService) GetPreferences(ctx context.Context, userID uuid.UUID) ([]NotificationPreferenceResponse, error) {
	prefs, err := s.queries.GetNotificationPreferences(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("getting notification preferences: %w", err)
	}

	result := make([]NotificationPreferenceResponse, len(prefs))
	for i, p := range prefs {
		result[i] = NotificationPreferenceResponse{
			TriggerType: p.TriggerType,
			Channel:     p.Channel,
			IsEnabled:   p.IsEnabled,
		}
	}
	return result, nil
}

func (s *NotificationService) UpdatePreference(ctx context.Context, userID uuid.UUID, input UpdatePreferenceInput) error {
	validTriggers := map[string]bool{
		TriggerShiftCreated:  true,
		TriggerShiftUpdated:  true,
		TriggerShiftDeleted:  true,
		TriggerEventLocked:   true,
		TriggerEventUnlocked: true,
	}
	if !validTriggers[input.TriggerType] {
		return model.NewFieldError(model.ErrInvalidInput, "trigger_type", "invalid trigger type")
	}

	validChannels := map[string]bool{ChannelInApp: true, ChannelEmail: true}
	if !validChannels[input.Channel] {
		return model.NewFieldError(model.ErrInvalidInput, "channel", "invalid channel, must be in_app or email")
	}

	if err := s.queries.UpsertNotificationPreference(ctx, repository.UpsertNotificationPreferenceParams{
		UserID:      userID,
		TriggerType: input.TriggerType,
		Channel:     input.Channel,
		IsEnabled:   input.IsEnabled,
	}); err != nil {
		return fmt.Errorf("upserting notification preference: %w", err)
	}
	return nil
}

// formatTimeRange formats a time range for notification display.
// Same day: "Jan 15, 14:00 – 18:00", cross-day: "Jan 15, 14:00 – Jan 16, 02:00".
func formatTimeRange(start, end time.Time) string {
	if start.Year() == end.Year() && start.YearDay() == end.YearDay() {
		return fmt.Sprintf("%s, %s – %s",
			start.Format("Jan 2"),
			start.Format("15:04"),
			end.Format("15:04"))
	}
	return fmt.Sprintf("%s, %s – %s, %s",
		start.Format("Jan 2"),
		start.Format("15:04"),
		end.Format("Jan 2"),
		end.Format("15:04"))
}

// Notify creates an in-app notification for a user. It checks the user's
// preference for the given trigger and in_app channel before creating it.
func (s *NotificationService) Notify(ctx context.Context, userID uuid.UUID, eventID *uuid.UUID, triggerType, title string, body *string) error {
	// Check if user has disabled in-app notifications for this trigger
	prefs, err := s.queries.GetNotificationPreferences(ctx, userID)
	if err != nil {
		s.logger.Error("failed to get notification preferences", "error", err, "user_id", userID)
		// Continue anyway - default to sending
	} else {
		for _, p := range prefs {
			if p.TriggerType == triggerType && p.Channel == ChannelInApp && !p.IsEnabled {
				return nil // User has disabled this notification
			}
		}
	}

	_, err = s.queries.CreateNotification(ctx, repository.CreateNotificationParams{
		UserID:      userID,
		EventID:     eventID,
		Title:       title,
		Body:        body,
		TriggerType: triggerType,
	})
	if err != nil {
		return fmt.Errorf("creating notification: %w", err)
	}
	return nil
}

// NotifyEventUsers creates notifications for all users who have shifts in the given event,
// except the actor who triggered the change.
func (s *NotificationService) NotifyEventUsers(ctx context.Context, eventID uuid.UUID, actorID uuid.UUID, triggerType, title string, body *string) {
	shifts, err := s.queries.ListShiftsByEvent(ctx, eventID)
	if err != nil {
		s.logger.Error("failed to list shifts for notification", "error", err, "event_id", eventID)
		return
	}

	// Deduplicate user IDs
	notified := make(map[uuid.UUID]bool)
	for _, shift := range shifts {
		if shift.UserID == actorID || notified[shift.UserID] {
			continue
		}
		notified[shift.UserID] = true

		if err := s.Notify(ctx, shift.UserID, &eventID, triggerType, title, body); err != nil {
			s.logger.Error("failed to create notification", "error", err, "user_id", shift.UserID)
		}
	}
}
