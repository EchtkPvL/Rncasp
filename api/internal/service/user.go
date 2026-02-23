package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

type UserService struct {
	queries *repository.Queries
	logger  *slog.Logger
}

func NewUserService(queries *repository.Queries, logger *slog.Logger) *UserService {
	return &UserService{queries: queries, logger: logger}
}

type CreateDummyAccountInput struct {
	Username    string
	FullName    string
	DisplayName *string
}

type UpdateDummyAccountInput struct {
	FullName    *string
	DisplayName *string
}

// ListUsers returns users with optional filters.
func (s *UserService) ListUsers(ctx context.Context, role *string, accountType *string, limit, offset int32) ([]UserResponse, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	users, err := s.queries.ListUsers(ctx, repository.ListUsersParams{
		Role:        role,
		AccountType: accountType,
		Limit:       limit,
		Offset:      offset,
	})
	if err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}

	result := make([]UserResponse, len(users))
	for i, u := range users {
		result[i] = userToResponse(u)
	}
	return result, nil
}

// SearchUsers searches users by query string.
func (s *UserService) SearchUsers(ctx context.Context, query string, limit, offset int32) ([]UserResponse, error) {
	if limit <= 0 {
		limit = 50
	}
	if query == "" {
		return nil, model.NewFieldError(model.ErrInvalidInput, "query", "query is required")
	}

	users, err := s.queries.SearchUsers(ctx, repository.SearchUsersParams{
		Query:  query,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, fmt.Errorf("searching users: %w", err)
	}

	result := make([]UserResponse, len(users))
	for i, u := range users {
		result[i] = userToResponse(u)
	}
	return result, nil
}

// GetByID returns a single user.
func (s *UserService) GetByID(ctx context.Context, id uuid.UUID) (UserResponse, error) {
	user, err := s.queries.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return UserResponse{}, fmt.Errorf("fetching user: %w", err)
	}
	return userToResponse(user), nil
}

type UpdateUserInput struct {
	Role        *string
	IsActive    *bool
	FullName    *string
	DisplayName *string
	Email       *string
	Password    *string
}

// UpdateUser updates a user's profile (super-admin only).
func (s *UserService) UpdateUser(ctx context.Context, id uuid.UUID, input UpdateUserInput) (UserResponse, error) {
	_, err := s.queries.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return UserResponse{}, fmt.Errorf("fetching user: %w", err)
	}

	if input.Role != nil {
		validRoles := map[string]bool{"super_admin": true, "user": true, "read_only": true}
		if !validRoles[*input.Role] {
			return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "role", "invalid role")
		}
	}

	// Hash password if provided
	if input.Password != nil && *input.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*input.Password), 12)
		if err != nil {
			return UserResponse{}, fmt.Errorf("hashing password: %w", err)
		}
		if err := s.queries.UpdateUserPassword(ctx, id, strPtr(string(hash))); err != nil {
			return UserResponse{}, fmt.Errorf("updating password: %w", err)
		}
	}

	updated, err := s.queries.UpdateUser(ctx, repository.UpdateUserParams{
		ID:          id,
		Role:        input.Role,
		IsActive:    input.IsActive,
		FullName:    input.FullName,
		DisplayName: input.DisplayName,
		Email:       input.Email,
	})
	if err != nil {
		return UserResponse{}, fmt.Errorf("updating user: %w", err)
	}

	s.logger.Info("user updated", "user_id", id)
	return userToResponse(updated), nil
}

func strPtr(s string) *string { return &s }

// CreateDummyAccount creates a dummy (placeholder) account that cannot log in.
func (s *UserService) CreateDummyAccount(ctx context.Context, input CreateDummyAccountInput) (UserResponse, error) {
	if input.Username == "" {
		return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "username", "username is required")
	}
	if input.FullName == "" {
		return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "full_name", "full name is required")
	}

	// Check for duplicate username
	_, err := s.queries.GetUserByUsername(ctx, input.Username)
	if err == nil {
		return UserResponse{}, model.NewDomainError(model.ErrConflict, "username already taken")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return UserResponse{}, fmt.Errorf("checking username: %w", err)
	}

	user, err := s.queries.CreateUser(ctx, repository.CreateUserParams{
		Username:    input.Username,
		FullName:    input.FullName,
		DisplayName: input.DisplayName,
		Role:        "user",
		Language:    "en",
		AccountType: "dummy",
	})
	if err != nil {
		return UserResponse{}, fmt.Errorf("creating dummy account: %w", err)
	}

	s.logger.Info("dummy account created", "user_id", user.ID, "username", user.Username)
	return userToResponse(user), nil
}

// UpdateDummyAccount updates a dummy account's profile.
func (s *UserService) UpdateDummyAccount(ctx context.Context, id uuid.UUID, input UpdateDummyAccountInput) (UserResponse, error) {
	existing, err := s.queries.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return UserResponse{}, fmt.Errorf("fetching user: %w", err)
	}

	if existing.AccountType != "dummy" {
		return UserResponse{}, model.NewDomainError(model.ErrForbidden, "can only update dummy accounts via this endpoint")
	}

	updated, err := s.queries.UpdateUser(ctx, repository.UpdateUserParams{
		ID:          id,
		FullName:    input.FullName,
		DisplayName: input.DisplayName,
	})
	if err != nil {
		return UserResponse{}, fmt.Errorf("updating dummy account: %w", err)
	}

	s.logger.Info("dummy account updated", "user_id", id)
	return userToResponse(updated), nil
}

// DeleteDummyAccount deletes a dummy account.
func (s *UserService) DeleteDummyAccount(ctx context.Context, id uuid.UUID) error {
	existing, err := s.queries.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return fmt.Errorf("fetching user: %w", err)
	}

	if existing.AccountType != "dummy" {
		return model.NewDomainError(model.ErrForbidden, "can only delete dummy accounts via this endpoint")
	}

	if err := s.queries.DeleteUser(ctx, id); err != nil {
		return fmt.Errorf("deleting dummy account: %w", err)
	}

	s.logger.Info("dummy account deleted", "user_id", id)
	return nil
}
