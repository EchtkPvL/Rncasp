package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"time"

	"github.com/echtkpvl/rncasp/internal/config"
	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	queries     *repository.Queries
	rdb         *redis.Client
	cfg         *config.AuthConfig
	logger      *slog.Logger
	smtpService *SMTPService
}

func (s *AuthService) SetSMTPService(ss *SMTPService) {
	s.smtpService = ss
}

func NewAuthService(
	queries *repository.Queries,
	rdb *redis.Client,
	cfg *config.AuthConfig,
	logger *slog.Logger,
) *AuthService {
	return &AuthService{
		queries: queries,
		rdb:     rdb,
		cfg:     cfg,
		logger:  logger,
	}
}

type RegisterInput struct {
	Username string
	Password string
	FullName string
	Email    string
	Language string
}

type LoginInput struct {
	Username string
	Password string
}

type SessionInfo struct {
	Token     string
	ExpiresAt time.Time
}

type UserResponse struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	FullName    string  `json:"full_name"`
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
	Role        string  `json:"role"`
	Language    string  `json:"language"`
	AccountType string  `json:"account_type"`
	TimeFormat  string  `json:"time_format"`
	TotpEnabled bool    `json:"totp_enabled"`
	IsActive    bool    `json:"is_active"`
	CreatedAt   string  `json:"created_at"`
}

func userToResponse(u repository.User) UserResponse {
	return UserResponse{
		ID:          u.ID.String(),
		Username:    u.Username,
		FullName:    u.FullName,
		DisplayName: u.DisplayName,
		Email:       u.Email,
		Role:        u.Role,
		Language:    u.Language,
		AccountType: u.AccountType,
		TimeFormat:  u.TimeFormat,
		TotpEnabled: u.TotpEnabled,
		IsActive:    u.IsActive,
		CreatedAt:   u.CreatedAt.Format(time.RFC3339),
	}
}

func (s *AuthService) Register(ctx context.Context, input RegisterInput, ip, userAgent string) (UserResponse, SessionInfo, error) {
	if !getAppSettingBool(ctx, s.queries, "registration_enabled", true) {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrForbidden, "registration is disabled")
	}

	if err := validateRegisterInput(input); err != nil {
		return UserResponse{}, SessionInfo{}, err
	}

	// Check for existing username
	_, err := s.queries.GetUserByUsername(ctx, input.Username)
	if err == nil {
		return UserResponse{}, SessionInfo{}, model.NewFieldError(model.ErrAlreadyExists, "username", "username already taken")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("checking username: %w", err)
	}

	// Check for existing email if provided
	if input.Email != "" {
		_, err := s.queries.GetUserByEmail(ctx, &input.Email)
		if err == nil {
			return UserResponse{}, SessionInfo{}, model.NewFieldError(model.ErrAlreadyExists, "email", "email already in use")
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, SessionInfo{}, fmt.Errorf("checking email: %w", err)
		}
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), s.cfg.BcryptCost)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("hashing password: %w", err)
	}
	hashStr := string(hash)

	// Determine role: first user becomes super_admin, others default to read_only
	role := "read_only"
	count, err := s.queries.CountUsers(ctx)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("counting users: %w", err)
	}
	if count == 0 {
		role = "super_admin"
		s.logger.Info("first user registered, promoting to super_admin", "username", input.Username)
	}

	lang := input.Language
	if lang == "" {
		lang = getAppSettingString(ctx, s.queries, "default_language", "en")
	}

	var email *string
	if input.Email != "" {
		email = &input.Email
	}

	user, err := s.queries.CreateUser(ctx, repository.CreateUserParams{
		Username:     input.Username,
		FullName:     input.FullName,
		DisplayName:  nil,
		Email:        email,
		PasswordHash: &hashStr,
		Role:         role,
		Language:     lang,
		AccountType:  "local",
	})
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("creating user: %w", err)
	}

	// Create session so the user is logged in immediately after registration
	session, err := s.createSession(ctx, user.ID, ip, userAgent)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("creating session: %w", err)
	}

	s.logger.Info("user registered", "user_id", user.ID, "username", user.Username, "role", role)

	if role != "super_admin" && s.smtpService != nil {
		go s.notifySuperAdminsOfRegistration(user.Username, user.Email, user.FullName)
	}

	return userToResponse(user), session, nil
}

func (s *AuthService) Login(ctx context.Context, input LoginInput, ip, userAgent string) (UserResponse, SessionInfo, error) {
	if input.Username == "" || input.Password == "" {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInvalidInput, "username and password are required")
	}

	user, err := s.queries.GetUserByUsername(ctx, input.Username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrUnauthorized, "invalid credentials")
		}
		return UserResponse{}, SessionInfo{}, fmt.Errorf("fetching user: %w", err)
	}

	if user.AccountType == "dummy" {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrDummyAccount, "dummy accounts cannot log in")
	}

	if !user.IsActive {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInactiveAccount, "account is deactivated")
	}

	if user.PasswordHash == nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrUnauthorized, "invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(input.Password)); err != nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrUnauthorized, "invalid credentials")
	}

	// Check if TOTP is enabled - require second factor
	if user.TotpEnabled {
		pendingToken, err := s.CreateTOTPPendingToken(ctx, user.ID, ip, userAgent)
		if err != nil {
			return UserResponse{}, SessionInfo{}, fmt.Errorf("creating TOTP pending token: %w", err)
		}
		return UserResponse{}, SessionInfo{}, &TOTPPendingError{PendingToken: pendingToken}
	}

	// Create session
	session, err := s.createSession(ctx, user.ID, ip, userAgent)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("creating session: %w", err)
	}

	s.logger.Info("user logged in", "user_id", user.ID, "username", user.Username)
	return userToResponse(user), session, nil
}

func (s *AuthService) Logout(ctx context.Context, token string) error {
	tokenHash := hashToken(token)

	// Delete from DB
	if err := s.queries.DeleteSession(ctx, tokenHash); err != nil {
		return fmt.Errorf("deleting session: %w", err)
	}

	// Delete from Redis cache
	s.rdb.Del(ctx, redisSessionKey(tokenHash))

	return nil
}

func (s *AuthService) ValidateSession(ctx context.Context, token string) (*repository.GetSessionByTokenHashRow, error) {
	tokenHash := hashToken(token)

	session, err := s.queries.GetSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrUnauthorized, "invalid or expired session")
		}
		return nil, fmt.Errorf("fetching session: %w", err)
	}

	if !session.IsActive {
		return nil, model.NewDomainError(model.ErrInactiveAccount, "account is deactivated")
	}

	// Refresh Redis cache
	ttl := time.Until(session.ExpiresAt)
	if ttl > 0 {
		s.rdb.Set(ctx, redisSessionKey(tokenHash), "valid", ttl)
	}

	return &session, nil
}

func (s *AuthService) GetCurrentUser(ctx context.Context, userID uuid.UUID) (UserResponse, error) {
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return UserResponse{}, fmt.Errorf("fetching user: %w", err)
	}

	return userToResponse(user), nil
}

type UpdateProfileInput struct {
	FullName    *string
	DisplayName *string
	Email       *string
	Password    *string
	TimeFormat  *string
}

// UpdateProfile lets an authenticated user update their own profile fields.
func (s *AuthService) UpdateProfile(ctx context.Context, userID uuid.UUID, input UpdateProfileInput) (UserResponse, error) {
	// Hash password if provided
	if input.Password != nil && *input.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*input.Password), s.cfg.BcryptCost)
		if err != nil {
			return UserResponse{}, fmt.Errorf("hashing password: %w", err)
		}
		hashStr := string(hash)
		if err := s.queries.UpdateUserPassword(ctx, userID, &hashStr); err != nil {
			return UserResponse{}, fmt.Errorf("updating password: %w", err)
		}
	}

	updated, err := s.queries.UpdateUser(ctx, repository.UpdateUserParams{
		ID:          userID,
		FullName:    input.FullName,
		DisplayName: input.DisplayName,
		Email:       input.Email,
		TimeFormat:  input.TimeFormat,
	})
	if err != nil {
		return UserResponse{}, fmt.Errorf("updating profile: %w", err)
	}

	s.logger.Info("user updated own profile", "user_id", userID)
	return userToResponse(updated), nil
}

func (s *AuthService) createSession(ctx context.Context, userID uuid.UUID, ip, userAgent string) (SessionInfo, error) {
	// Generate random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return SessionInfo{}, fmt.Errorf("generating token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)
	tokenHash := hashToken(token)

	expiresAt := time.Now().Add(s.cfg.SessionTTL)

	var ipPtr, uaPtr *string
	if ip != "" {
		ipPtr = &ip
	}
	if userAgent != "" {
		uaPtr = &userAgent
	}

	_, err := s.queries.CreateSession(ctx, repository.CreateSessionParams{
		UserID:    userID,
		TokenHash: tokenHash,
		IpAddress: ipPtr,
		UserAgent: uaPtr,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return SessionInfo{}, fmt.Errorf("storing session: %w", err)
	}

	// Cache in Redis for fast validation
	ttl := time.Until(expiresAt)
	s.rdb.Set(ctx, redisSessionKey(tokenHash), "valid", ttl)

	return SessionInfo{Token: token, ExpiresAt: expiresAt}, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func redisSessionKey(tokenHash string) string {
	return "session:" + tokenHash
}

func getAppSettingString(ctx context.Context, q *repository.Queries, key, fallback string) string {
	setting, err := q.GetAppSetting(ctx, key)
	if err != nil {
		return fallback
	}
	var val string
	if json.Unmarshal(setting.Value, &val) != nil {
		return fallback
	}
	return val
}

func getAppSettingBool(ctx context.Context, q *repository.Queries, key string, fallback bool) bool {
	setting, err := q.GetAppSetting(ctx, key)
	if err != nil {
		return fallback
	}
	var val bool
	if json.Unmarshal(setting.Value, &val) != nil {
		return fallback
	}
	return val
}

func (s *AuthService) notifySuperAdminsOfRegistration(username string, email *string, fullName string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	emails, err := s.queries.ListSuperAdminEmails(ctx)
	if err != nil {
		s.logger.Error("failed to list super-admin emails for registration notification", "error", err)
		return
	}
	if len(emails) == 0 {
		return
	}

	appName := getAppSettingString(ctx, s.queries, "app_name", "Rncasp")

	emailStr := "-"
	if email != nil {
		emailStr = html.EscapeString(*email)
	}

	subject := fmt.Sprintf("[%s] New user registered: %s", appName, username)
	body := fmt.Sprintf(`<h3>New User Registration</h3>
<p>A new user has registered and needs role assignment:</p>
<table>
<tr><td><strong>Username:</strong></td><td>%s</td></tr>
<tr><td><strong>Full Name:</strong></td><td>%s</td></tr>
<tr><td><strong>Email:</strong></td><td>%s</td></tr>
</table>
<p>The user has been assigned the default <strong>read_only</strong> role. Log in to the admin panel to adjust their role if needed.</p>`,
		html.EscapeString(username),
		html.EscapeString(fullName),
		emailStr,
	)

	for _, adminEmail := range emails {
		if adminEmail == nil {
			continue
		}
		if err := s.smtpService.SendEmail(ctx, *adminEmail, subject, body); err != nil {
			s.logger.Error("failed to send registration notification to admin", "admin_email", *adminEmail, "error", err)
		}
	}
}

func validateRegisterInput(input RegisterInput) error {
	if input.Username == "" {
		return model.NewFieldError(model.ErrInvalidInput, "username", "username is required")
	}
	if len(input.Username) < 3 || len(input.Username) > 50 {
		return model.NewFieldError(model.ErrInvalidInput, "username", "username must be 3-50 characters")
	}
	if input.Password == "" {
		return model.NewFieldError(model.ErrInvalidInput, "password", "password is required")
	}
	if input.FullName == "" {
		return model.NewFieldError(model.ErrInvalidInput, "full_name", "full name is required")
	}
	if input.Language != "" && input.Language != "en" && input.Language != "de" {
		return model.NewFieldError(model.ErrInvalidInput, "language", "language must be 'en' or 'de'")
	}
	return nil
}
