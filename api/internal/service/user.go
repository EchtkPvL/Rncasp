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
	queries        *repository.Queries
	logger         *slog.Logger
	webhookService *WebhookService
	auditService   *AuditService
}

func NewUserService(queries *repository.Queries, logger *slog.Logger) *UserService {
	return &UserService{queries: queries, logger: logger}
}

func (s *UserService) SetWebhookService(ws *WebhookService) {
	s.webhookService = ws
}

func (s *UserService) SetAuditService(as *AuditService) {
	s.auditService = as
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

type ListUsersResult struct {
	Users []UserResponse `json:"users"`
	Total int64          `json:"total"`
}

// ListUsers returns users with optional filters and total count for pagination.
func (s *UserService) ListUsers(ctx context.Context, role *string, accountType *string, excludeAccountType *string, limit, offset int32) (ListUsersResult, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	users, err := s.queries.ListUsers(ctx, repository.ListUsersParams{
		Role:               role,
		AccountType:        accountType,
		Limit:              limit,
		Offset:             offset,
		ExcludeAccountType: excludeAccountType,
	})
	if err != nil {
		return ListUsersResult{}, fmt.Errorf("listing users: %w", err)
	}

	total, err := s.queries.CountUsers(ctx, repository.CountUsersParams{
		Role:               role,
		AccountType:        accountType,
		ExcludeAccountType: excludeAccountType,
	})
	if err != nil {
		return ListUsersResult{}, fmt.Errorf("counting users: %w", err)
	}

	result := make([]UserResponse, len(users))
	for i, u := range users {
		result[i] = userToResponse(u)
	}
	return ListUsersResult{Users: result, Total: total}, nil
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
	TimeFormat  *string
	Username    *string
	AccountType *string
}

// UpdateUser updates a user's profile (super-admin only).
func (s *UserService) UpdateUser(ctx context.Context, id uuid.UUID, input UpdateUserInput) (UserResponse, error) {
	existing, err := s.queries.GetUserByID(ctx, id)
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

	// Validate account_type conversion
	if input.AccountType != nil {
		validTypes := map[string]bool{"local": true, "dummy": true}
		if !validTypes[*input.AccountType] {
			return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "account_type", "can only convert between local and dummy")
		}
		// Converting dummy -> local requires a password
		if *input.AccountType == "local" && existing.AccountType == "dummy" {
			if input.Password == nil || *input.Password == "" {
				return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "password", "password is required when converting to a local account")
			}
		}
	}

	// Validate username uniqueness if changed
	if input.Username != nil && *input.Username != existing.Username {
		if *input.Username == "" {
			return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "username", "username is required")
		}
		other, err := s.queries.GetUserByUsername(ctx, *input.Username)
		if err == nil && other.ID != id {
			return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "username", "username already taken")
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, fmt.Errorf("checking username: %w", err)
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

	// If converting local -> dummy, clear password
	if input.AccountType != nil && *input.AccountType == "dummy" && existing.AccountType != "dummy" {
		if err := s.queries.UpdateUserPassword(ctx, id, nil); err != nil {
			return UserResponse{}, fmt.Errorf("clearing password: %w", err)
		}
	}

	updated, err := s.queries.UpdateUser(ctx, repository.UpdateUserParams{
		ID:          id,
		Role:        input.Role,
		IsActive:    input.IsActive,
		FullName:    input.FullName,
		DisplayName: input.DisplayName,
		Email:       input.Email,
		TimeFormat:  input.TimeFormat,
		Username:    input.Username,
		AccountType: input.AccountType,
	})
	if err != nil {
		return UserResponse{}, fmt.Errorf("updating user: %w", err)
	}

	s.logger.Info("user updated", "user_id", id)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, nil, "update", "user", &id, userToResponse(existing), userToResponse(updated), nil)
	}

	if s.webhookService != nil {
		data := map[string]string{
			"user_id":  id.String(),
			"username": updated.Username,
		}
		if input.Role != nil {
			data["old_role"] = existing.Role
			data["new_role"] = updated.Role
		}
		if input.IsActive != nil {
			data["is_active"] = fmt.Sprintf("%v", updated.IsActive)
		}
		if input.AccountType != nil {
			data["old_account_type"] = existing.AccountType
			data["new_account_type"] = updated.AccountType
		}
		go s.webhookService.DispatchGlobal(context.Background(), "user.updated", data)
	}

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

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, nil, "create", "user", &user.ID, nil, userToResponse(user), nil)
	}

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

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, nil, "delete", "user", &id, userToResponse(existing), nil, nil)
	}

	return nil
}

type CreateUserInput struct {
	AccountType string
	Username    string
	FullName    string
	DisplayName *string
	Email       *string
	Password    *string
	Role        *string
}

// CreateUser creates a new user (local or dummy).
func (s *UserService) CreateUser(ctx context.Context, input CreateUserInput) (UserResponse, error) {
	if input.Username == "" {
		return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "username", "username is required")
	}
	if input.FullName == "" {
		return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "full_name", "full name is required")
	}

	validTypes := map[string]bool{"local": true, "dummy": true}
	if !validTypes[input.AccountType] {
		return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "account_type", "account_type must be local or dummy")
	}

	role := "user"
	if input.Role != nil {
		validRoles := map[string]bool{"super_admin": true, "user": true, "read_only": true}
		if !validRoles[*input.Role] {
			return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "role", "invalid role")
		}
		role = *input.Role
	}

	if input.AccountType == "local" {
		if input.Password == nil || *input.Password == "" {
			return UserResponse{}, model.NewFieldError(model.ErrInvalidInput, "password", "password is required for local accounts")
		}
	}

	// Check for duplicate username
	_, err := s.queries.GetUserByUsername(ctx, input.Username)
	if err == nil {
		return UserResponse{}, model.NewDomainError(model.ErrConflict, "username already taken")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return UserResponse{}, fmt.Errorf("checking username: %w", err)
	}

	var passwordHash *string
	if input.AccountType == "local" && input.Password != nil && *input.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*input.Password), 12)
		if err != nil {
			return UserResponse{}, fmt.Errorf("hashing password: %w", err)
		}
		h := string(hash)
		passwordHash = &h
	}

	user, err := s.queries.CreateUser(ctx, repository.CreateUserParams{
		Username:     input.Username,
		FullName:     input.FullName,
		DisplayName:  input.DisplayName,
		Email:        input.Email,
		PasswordHash: passwordHash,
		Role:         role,
		Language:     "en",
		AccountType:  input.AccountType,
	})
	if err != nil {
		return UserResponse{}, fmt.Errorf("creating user: %w", err)
	}

	s.logger.Info("user created", "user_id", user.ID, "username", user.Username, "account_type", input.AccountType)

	if s.auditService != nil {
		go s.auditService.Log(context.Background(), nil, nil, "create", "user", &user.ID, nil, userToResponse(user), nil)
	}

	if s.webhookService != nil {
		go s.webhookService.DispatchGlobal(context.Background(), "user.created", map[string]string{
			"user_id":      user.ID.String(),
			"username":     user.Username,
			"account_type": user.AccountType,
		})
	}

	return userToResponse(user), nil
}
