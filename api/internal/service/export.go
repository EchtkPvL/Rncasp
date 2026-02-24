package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/pdf"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ExportService struct {
	queries *repository.Queries
	logger  *slog.Logger
	pdfGen  *pdf.PDFGenerator
}

func NewExportService(queries *repository.Queries, logger *slog.Logger, pdfGen *pdf.PDFGenerator) *ExportService {
	return &ExportService{queries: queries, logger: logger, pdfGen: pdfGen}
}

// ExportCSV generates a CSV export of shifts for an event.
func (s *ExportService) ExportCSV(ctx context.Context, slug string) ([]byte, string, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, "", fmt.Errorf("fetching event: %w", err)
	}

	shifts, err := s.queries.ListShiftsByEvent(ctx, event.ID)
	if err != nil {
		return nil, "", fmt.Errorf("listing shifts: %w", err)
	}

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)

	// Header
	w.Write([]string{"Start Time", "End Time", "Team", "Username", "Full Name", "Display Name"})

	for _, sh := range shifts {
		displayName := ""
		if sh.UserDisplayName != nil {
			displayName = *sh.UserDisplayName
		}
		w.Write([]string{
			sh.StartTime.Format(time.RFC3339),
			sh.EndTime.Format(time.RFC3339),
			sh.TeamName,
			sh.Username,
			sh.UserFullName,
			displayName,
		})
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, "", fmt.Errorf("writing CSV: %w", err)
	}

	filename := fmt.Sprintf("%s-shifts.csv", event.Slug)
	return buf.Bytes(), filename, nil
}

// ExportICalEvent generates an iCal (.ics) file for all shifts in an event.
func (s *ExportService) ExportICalEvent(ctx context.Context, slug string) ([]byte, string, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, "", fmt.Errorf("fetching event: %w", err)
	}

	shifts, err := s.queries.ListShiftsByEvent(ctx, event.ID)
	if err != nil {
		return nil, "", fmt.Errorf("listing shifts: %w", err)
	}

	cal := buildICalFromShifts(event.Name, event.Slug, shifts)
	filename := fmt.Sprintf("%s-shifts.ics", event.Slug)
	return []byte(cal), filename, nil
}

// ExportPDF generates a PDF export of the shift plan for an event.
func (s *ExportService) ExportPDF(ctx context.Context, slug string, opts pdf.PDFOptions) ([]byte, string, error) {
	event, err := s.queries.GetEventBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", model.NewDomainError(model.ErrNotFound, "event not found")
		}
		return nil, "", fmt.Errorf("fetching event: %w", err)
	}

	shifts, err := s.queries.ListShiftsByEvent(ctx, event.ID)
	if err != nil {
		return nil, "", fmt.Errorf("listing shifts: %w", err)
	}

	eventTeams, err := s.queries.ListEventTeams(ctx, event.ID)
	if err != nil {
		return nil, "", fmt.Errorf("listing event teams: %w", err)
	}

	coverage, err := s.queries.ListCoverageRequirements(ctx, event.ID)
	if err != nil {
		return nil, "", fmt.Errorf("listing coverage: %w", err)
	}

	hiddenRanges, err := s.queries.ListEventHiddenRanges(ctx, event.ID)
	if err != nil {
		return nil, "", fmt.Errorf("listing hidden ranges: %w", err)
	}

	data := pdf.PDFData{
		Event:        event,
		Shifts:       shifts,
		EventTeams:   eventTeams,
		Coverage:     coverage,
		HiddenRanges: hiddenRanges,
	}

	pdfBytes, err := s.pdfGen.Generate(ctx, data, opts)
	if err != nil {
		return nil, "", fmt.Errorf("generating PDF: %w", err)
	}

	filename := fmt.Sprintf("%s-shifts.pdf", event.Slug)
	return pdfBytes, filename, nil
}

// iCal Token management

type ICalTokenResponse struct {
	ID         string  `json:"id"`
	Label      string  `json:"label"`
	Scope      string  `json:"scope"`
	EventID    *string `json:"event_id"`
	TeamID     *string `json:"team_id"`
	CreatedAt  string  `json:"created_at"`
	LastUsedAt *string `json:"last_used_at"`
	URL        string  `json:"url"`
}

type CreateICalTokenInput struct {
	Label   string
	Scope   string // "user", "event", "team"
	EventID *uuid.UUID
	TeamID  *uuid.UUID
}

// CreateToken generates a new iCal subscription token for a user.
func (s *ExportService) CreateToken(ctx context.Context, userID uuid.UUID, input CreateICalTokenInput, baseURL string) (ICalTokenResponse, error) {
	if input.Label == "" {
		return ICalTokenResponse{}, model.NewFieldError(model.ErrInvalidInput, "label", "label is required")
	}

	validScopes := map[string]bool{"user": true, "event": true, "team": true}
	if !validScopes[input.Scope] {
		return ICalTokenResponse{}, model.NewFieldError(model.ErrInvalidInput, "scope", "scope must be user, event, or team")
	}

	if input.Scope == "event" && input.EventID == nil {
		return ICalTokenResponse{}, model.NewFieldError(model.ErrInvalidInput, "event_id", "event_id required for event scope")
	}
	if input.Scope == "team" && (input.EventID == nil || input.TeamID == nil) {
		return ICalTokenResponse{}, model.NewFieldError(model.ErrInvalidInput, "team_id", "event_id and team_id required for team scope")
	}

	// Generate random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return ICalTokenResponse{}, fmt.Errorf("generating token: %w", err)
	}
	rawToken := hex.EncodeToString(tokenBytes)

	// Store SHA-256 hash for lookup + raw token for URL display
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])

	token, err := s.queries.CreateICalToken(ctx, repository.CreateICalTokenParams{
		UserID:    userID,
		TokenHash: tokenHash,
		Token:     rawToken,
		Label:     input.Label,
		Scope:     input.Scope,
		EventID:   input.EventID,
		TeamID:    input.TeamID,
	})
	if err != nil {
		return ICalTokenResponse{}, fmt.Errorf("creating token: %w", err)
	}

	// Build URL using the event/team info we already have
	var eventSlug, teamAbbr string
	if input.EventID != nil {
		if event, err := s.queries.GetEventByID(ctx, *input.EventID); err == nil {
			eventSlug = event.Slug
		}
	}
	if input.TeamID != nil {
		if team, err := s.queries.GetTeamByID(ctx, *input.TeamID); err == nil {
			teamAbbr = team.Abbreviation
		}
	}

	url := buildICalURL(baseURL, token.Scope, rawToken, userID.String(), eventSlug, teamAbbr)

	s.logger.Info("iCal token created", "token_id", token.ID, "user_id", userID, "scope", input.Scope)
	return toICalTokenResponse(token.ID, token.Label, token.Scope, token.EventID, token.TeamID, token.CreatedAt, token.LastUsedAt, url), nil
}

// ListTokens returns all active iCal tokens for a user.
func (s *ExportService) ListTokens(ctx context.Context, userID uuid.UUID, baseURL string) ([]ICalTokenResponse, error) {
	tokens, err := s.queries.ListICalTokensByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("listing tokens: %w", err)
	}

	result := make([]ICalTokenResponse, len(tokens))
	for i, t := range tokens {
		var eventSlug, teamAbbr string
		if t.EventSlug != nil {
			eventSlug = *t.EventSlug
		}
		if t.TeamAbbreviation != nil {
			teamAbbr = *t.TeamAbbreviation
		}
		url := buildICalURL(baseURL, t.Scope, t.Token, t.UserID.String(), eventSlug, teamAbbr)
		result[i] = toICalTokenResponse(t.ID, t.Label, t.Scope, t.EventID, t.TeamID, t.CreatedAt, t.LastUsedAt, url)
	}
	return result, nil
}

// RevokeToken revokes an iCal token.
func (s *ExportService) RevokeToken(ctx context.Context, tokenID, userID uuid.UUID) error {
	if err := s.queries.RevokeICalToken(ctx, tokenID, userID); err != nil {
		return fmt.Errorf("revoking token: %w", err)
	}
	s.logger.Info("iCal token revoked", "token_id", tokenID, "user_id", userID)
	return nil
}

// ServeICalSubscription serves an iCal feed for a subscription token.
func (s *ExportService) ServeICalSubscription(ctx context.Context, rawToken string) ([]byte, error) {
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])

	tokenRow, err := s.queries.GetICalTokenByHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "invalid or expired token")
		}
		return nil, fmt.Errorf("fetching token: %w", err)
	}

	// Update last_used_at
	go func() {
		s.queries.UpdateICalTokenLastUsed(context.Background(), tokenRow.ID)
	}()

	var cal string

	switch tokenRow.Scope {
	case "user":
		shifts, err := s.queries.ListShiftsByUser(ctx, tokenRow.UserID)
		if err != nil {
			return nil, fmt.Errorf("listing user shifts: %w", err)
		}
		cal = buildICalFromUserShifts(tokenRow.Username, shifts)

	case "event":
		if tokenRow.EventID == nil {
			return nil, model.NewDomainError(model.ErrInvalidInput, "token missing event_id")
		}
		event, err := s.queries.GetEventByID(ctx, *tokenRow.EventID)
		if err != nil {
			return nil, fmt.Errorf("fetching event: %w", err)
		}
		shifts, err := s.queries.ListShiftsByEvent(ctx, *tokenRow.EventID)
		if err != nil {
			return nil, fmt.Errorf("listing event shifts: %w", err)
		}
		cal = buildICalFromShifts(event.Name, event.Slug, shifts)

	case "team":
		if tokenRow.EventID == nil || tokenRow.TeamID == nil {
			return nil, model.NewDomainError(model.ErrInvalidInput, "token missing event_id or team_id")
		}
		event, err := s.queries.GetEventByID(ctx, *tokenRow.EventID)
		if err != nil {
			return nil, fmt.Errorf("fetching event: %w", err)
		}
		shifts, err := s.queries.ListShiftsByEventAndTeam(ctx, repository.ListShiftsByEventAndTeamParams{
			EventID: *tokenRow.EventID,
			TeamID:  *tokenRow.TeamID,
		})
		if err != nil {
			return nil, fmt.Errorf("listing team shifts: %w", err)
		}
		cal = buildICalFromTeamShifts(event.Name, event.Slug, shifts)

	default:
		return nil, model.NewDomainError(model.ErrInvalidInput, "unknown token scope")
	}

	return []byte(cal), nil
}

// iCal generation helpers

func buildICalFromShifts(eventName, eventSlug string, shifts []repository.ListShiftsByEventRow) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString(fmt.Sprintf("PRODID:-//Rncasp//%s//EN\r\n", eventSlug))
	b.WriteString(fmt.Sprintf("X-WR-CALNAME:%s Shifts\r\n", eventName))

	for _, sh := range shifts {
		b.WriteString("BEGIN:VEVENT\r\n")
		b.WriteString(fmt.Sprintf("UID:%s@rncasp\r\n", sh.ID.String()))
		b.WriteString(fmt.Sprintf("DTSTART:%s\r\n", sh.StartTime.UTC().Format("20060102T150405Z")))
		b.WriteString(fmt.Sprintf("DTEND:%s\r\n", sh.EndTime.UTC().Format("20060102T150405Z")))
		b.WriteString(fmt.Sprintf("SUMMARY:%s - %s\r\n", sh.TeamName, sh.Username))
		b.WriteString(fmt.Sprintf("DESCRIPTION:%s (%s)\r\n", sh.UserFullName, sh.TeamAbbreviation))
		b.WriteString("END:VEVENT\r\n")
	}

	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

func buildICalFromUserShifts(username string, shifts []repository.ListShiftsByUserRow) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString(fmt.Sprintf("PRODID:-//Rncasp//%s//EN\r\n", username))
	b.WriteString(fmt.Sprintf("X-WR-CALNAME:%s's Shifts\r\n", username))

	for _, sh := range shifts {
		b.WriteString("BEGIN:VEVENT\r\n")
		b.WriteString(fmt.Sprintf("UID:%s@rncasp\r\n", sh.ID.String()))
		b.WriteString(fmt.Sprintf("DTSTART:%s\r\n", sh.StartTime.UTC().Format("20060102T150405Z")))
		b.WriteString(fmt.Sprintf("DTEND:%s\r\n", sh.EndTime.UTC().Format("20060102T150405Z")))
		b.WriteString(fmt.Sprintf("SUMMARY:%s - %s\r\n", sh.EventName, sh.TeamName))
		b.WriteString(fmt.Sprintf("DESCRIPTION:Event: %s, Team: %s (%s)\r\n", sh.EventName, sh.TeamName, sh.TeamAbbreviation))
		b.WriteString("END:VEVENT\r\n")
	}

	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

func buildICalFromTeamShifts(eventName, eventSlug string, shifts []repository.ListShiftsByEventAndTeamRow) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString(fmt.Sprintf("PRODID:-//Rncasp//%s//EN\r\n", eventSlug))

	teamName := "Team"
	if len(shifts) > 0 {
		teamName = shifts[0].TeamName
	}
	b.WriteString(fmt.Sprintf("X-WR-CALNAME:%s - %s Shifts\r\n", eventName, teamName))

	for _, sh := range shifts {
		b.WriteString("BEGIN:VEVENT\r\n")
		b.WriteString(fmt.Sprintf("UID:%s@rncasp\r\n", sh.ID.String()))
		b.WriteString(fmt.Sprintf("DTSTART:%s\r\n", sh.StartTime.UTC().Format("20060102T150405Z")))
		b.WriteString(fmt.Sprintf("DTEND:%s\r\n", sh.EndTime.UTC().Format("20060102T150405Z")))
		b.WriteString(fmt.Sprintf("SUMMARY:%s - %s\r\n", sh.TeamName, sh.Username))
		b.WriteString(fmt.Sprintf("DESCRIPTION:%s (%s)\r\n", sh.UserFullName, sh.TeamAbbreviation))
		b.WriteString("END:VEVENT\r\n")
	}

	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

func buildICalURL(baseURL, scope, token, userUUID, eventSlug, teamAbbr string) string {
	switch scope {
	case "user":
		return fmt.Sprintf("%s/ical/user/%s/%s", baseURL, userUUID, token)
	case "event":
		return fmt.Sprintf("%s/ical/event/%s/all/%s", baseURL, eventSlug, token)
	case "team":
		return fmt.Sprintf("%s/ical/event/%s/%s/%s", baseURL, eventSlug, teamAbbr, token)
	default:
		return ""
	}
}

func toICalTokenResponse(id uuid.UUID, label, scope string, eventID, teamID *uuid.UUID, createdAt time.Time, lastUsedAt *time.Time, url string) ICalTokenResponse {
	var eventIDStr *string
	if eventID != nil {
		s := eventID.String()
		eventIDStr = &s
	}
	var teamIDStr *string
	if teamID != nil {
		s := teamID.String()
		teamIDStr = &s
	}
	var lastUsed *string
	if lastUsedAt != nil {
		s := lastUsedAt.Format(time.RFC3339)
		lastUsed = &s
	}

	return ICalTokenResponse{
		ID:         id.String(),
		Label:      label,
		Scope:      scope,
		EventID:    eventIDStr,
		TeamID:     teamIDStr,
		CreatedAt:  createdAt.Format(time.RFC3339),
		LastUsedAt: lastUsed,
		URL:        url,
	}
}
