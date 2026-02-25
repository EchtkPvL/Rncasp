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
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type TeamService struct {
	queries      *repository.Queries
	logger       *slog.Logger
	auditService *AuditService
}

func NewTeamService(queries *repository.Queries, logger *slog.Logger) *TeamService {
	return &TeamService{queries: queries, logger: logger}
}

func (s *TeamService) SetAuditService(as *AuditService) {
	s.auditService = as
}

type CreateTeamInput struct {
	Name         string
	Abbreviation string
	Color        string
	SortOrder    int32
}

type UpdateTeamInput struct {
	Name         *string
	Abbreviation *string
	Color        *string
	SortOrder    *int32
	IsActive     *bool
}

type TeamResponse struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Abbreviation string `json:"abbreviation"`
	Color        string `json:"color"`
	SortOrder    int32  `json:"sort_order"`
	IsActive     bool   `json:"is_active"`
	CreatedAt    string `json:"created_at"`
}

func teamToResponse(t repository.Team) TeamResponse {
	return TeamResponse{
		ID:           t.ID.String(),
		Name:         t.Name,
		Abbreviation: t.Abbreviation,
		Color:        t.Color,
		SortOrder:    t.SortOrder,
		IsActive:     t.IsActive,
		CreatedAt:    t.CreatedAt.Format(time.RFC3339),
	}
}

var hexColorRegex = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (s *TeamService) List(ctx context.Context, role string) ([]TeamResponse, error) {
	var teams []repository.Team
	var err error

	// Super-admins see all teams; others see only active
	if role == "super_admin" {
		teams, err = s.queries.ListTeams(ctx)
	} else {
		teams, err = s.queries.ListActiveTeams(ctx)
	}
	if err != nil {
		return nil, fmt.Errorf("listing teams: %w", err)
	}

	result := make([]TeamResponse, len(teams))
	for i, t := range teams {
		result[i] = teamToResponse(t)
	}
	return result, nil
}

func (s *TeamService) GetByID(ctx context.Context, id uuid.UUID) (TeamResponse, error) {
	team, err := s.queries.GetTeamByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TeamResponse{}, model.NewDomainError(model.ErrNotFound, "team not found")
		}
		return TeamResponse{}, fmt.Errorf("fetching team: %w", err)
	}
	return teamToResponse(team), nil
}

func (s *TeamService) Create(ctx context.Context, input CreateTeamInput) (TeamResponse, error) {
	if err := validateTeamInput(input.Name, input.Abbreviation, input.Color); err != nil {
		return TeamResponse{}, err
	}

	// Check name uniqueness
	if err := s.checkNameUnique(ctx, input.Name, uuid.Nil); err != nil {
		return TeamResponse{}, err
	}

	// Check abbreviation uniqueness
	if err := s.checkAbbreviationUnique(ctx, input.Abbreviation, uuid.Nil); err != nil {
		return TeamResponse{}, err
	}

	team, err := s.queries.CreateTeam(ctx, repository.CreateTeamParams{
		Name:         input.Name,
		Abbreviation: input.Abbreviation,
		Color:        input.Color,
		SortOrder:    input.SortOrder,
	})
	if err != nil {
		return TeamResponse{}, fmt.Errorf("creating team: %w", err)
	}

	s.logger.Info("team created", "team_id", team.ID, "name", team.Name)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, nil, "create", "team", &team.ID, nil, teamToResponse(team), nil)
	}

	return teamToResponse(team), nil
}

func (s *TeamService) Update(ctx context.Context, id uuid.UUID, input UpdateTeamInput) (TeamResponse, error) {
	// Verify team exists
	existing, err := s.queries.GetTeamByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TeamResponse{}, model.NewDomainError(model.ErrNotFound, "team not found")
		}
		return TeamResponse{}, fmt.Errorf("fetching team: %w", err)
	}

	// Validate changed fields
	name := existing.Name
	if input.Name != nil {
		name = *input.Name
	}
	abbr := existing.Abbreviation
	if input.Abbreviation != nil {
		abbr = *input.Abbreviation
	}
	color := existing.Color
	if input.Color != nil {
		color = *input.Color
	}

	if err := validateTeamInput(name, abbr, color); err != nil {
		return TeamResponse{}, err
	}

	// Check name uniqueness if changed
	if input.Name != nil && *input.Name != existing.Name {
		if err := s.checkNameUnique(ctx, *input.Name, id); err != nil {
			return TeamResponse{}, err
		}
	}

	// Check abbreviation uniqueness if changed
	if input.Abbreviation != nil && *input.Abbreviation != existing.Abbreviation {
		if err := s.checkAbbreviationUnique(ctx, *input.Abbreviation, id); err != nil {
			return TeamResponse{}, err
		}
	}

	team, err := s.queries.UpdateTeam(ctx, repository.UpdateTeamParams{
		ID:           id,
		Name:         input.Name,
		Abbreviation: input.Abbreviation,
		Color:        input.Color,
		SortOrder:    input.SortOrder,
		IsActive:     input.IsActive,
	})
	if err != nil {
		return TeamResponse{}, fmt.Errorf("updating team: %w", err)
	}

	s.logger.Info("team updated", "team_id", team.ID, "name", team.Name)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, nil, "update", "team", &id, teamToResponse(existing), teamToResponse(team), nil)
	}

	return teamToResponse(team), nil
}

func (s *TeamService) Delete(ctx context.Context, id uuid.UUID) error {
	existing, err := s.queries.GetTeamByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "team not found")
		}
		return fmt.Errorf("fetching team: %w", err)
	}

	if err := s.queries.DeleteTeam(ctx, id); err != nil {
		return fmt.Errorf("deleting team: %w", err)
	}

	s.logger.Info("team deleted", "team_id", id)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, nil, "delete", "team", &id, teamToResponse(existing), nil, nil)
	}

	return nil
}

func (s *TeamService) checkNameUnique(ctx context.Context, name string, excludeID uuid.UUID) error {
	teams, err := s.queries.ListTeams(ctx)
	if err != nil {
		return fmt.Errorf("checking name uniqueness: %w", err)
	}
	for _, t := range teams {
		if t.Name == name && t.ID != excludeID {
			return model.NewFieldError(model.ErrAlreadyExists, "name", "team name already exists")
		}
	}
	return nil
}

func (s *TeamService) checkAbbreviationUnique(ctx context.Context, abbr string, excludeID uuid.UUID) error {
	existing, err := s.queries.GetTeamByAbbreviation(ctx, abbr)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // not found = unique
		}
		return fmt.Errorf("checking abbreviation uniqueness: %w", err)
	}
	if existing.ID != excludeID {
		return model.NewFieldError(model.ErrAlreadyExists, "abbreviation", "abbreviation already in use")
	}
	return nil
}

func validateTeamInput(name, abbreviation, color string) error {
	if name == "" {
		return model.NewFieldError(model.ErrInvalidInput, "name", "name is required")
	}
	if len(name) > 100 {
		return model.NewFieldError(model.ErrInvalidInput, "name", "name must be at most 100 characters")
	}
	if abbreviation == "" {
		return model.NewFieldError(model.ErrInvalidInput, "abbreviation", "abbreviation is required")
	}
	if len(abbreviation) > 10 {
		return model.NewFieldError(model.ErrInvalidInput, "abbreviation", "abbreviation must be at most 10 characters")
	}
	if color == "" {
		return model.NewFieldError(model.ErrInvalidInput, "color", "color is required")
	}
	if !hexColorRegex.MatchString(color) {
		return model.NewFieldError(model.ErrInvalidInput, "color", "color must be a valid hex color (e.g. #FF5733)")
	}
	return nil
}
