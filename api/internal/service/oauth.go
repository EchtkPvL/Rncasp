package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/echtkpvl/rncasp/internal/config"
	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
)

type OAuthService struct {
	queries *repository.Queries
	rdb     *redis.Client
	appCfg  *config.AppConfig
	authCfg *config.AuthConfig
	logger  *slog.Logger
}

func NewOAuthService(
	queries *repository.Queries,
	rdb *redis.Client,
	appCfg *config.AppConfig,
	authCfg *config.AuthConfig,
	logger *slog.Logger,
) *OAuthService {
	return &OAuthService{
		queries: queries,
		rdb:     rdb,
		appCfg:  appCfg,
		authCfg: authCfg,
		logger:  logger,
	}
}

// --- Provider CRUD (super-admin only, enforced at handler/middleware level) ---

type ProviderResponse struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ClientID     string `json:"client_id"`
	AuthorizeURL string `json:"authorize_url"`
	TokenURL     string `json:"token_url"`
	UserinfoURL  string `json:"userinfo_url"`
	Scopes       string `json:"scopes"`
	IsEnabled    bool   `json:"is_enabled"`
	CreatedAt    string `json:"created_at"`
}

// PublicProviderResponse is the lightweight version shown to all users (no secrets)
type PublicProviderResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func providerToResponse(p repository.OauthProvider) ProviderResponse {
	return ProviderResponse{
		ID:           p.ID.String(),
		Name:         p.Name,
		ClientID:     p.ClientID,
		AuthorizeURL: p.AuthorizeUrl,
		TokenURL:     p.TokenUrl,
		UserinfoURL:  p.UserinfoUrl,
		Scopes:       p.Scopes,
		IsEnabled:    p.IsEnabled,
		CreatedAt:    p.CreatedAt.Format(time.RFC3339),
	}
}

type CreateProviderInput struct {
	Name         string
	ClientID     string
	ClientSecret string
	AuthorizeURL string
	TokenURL     string
	UserinfoURL  string
	Scopes       string
}

type UpdateProviderInput struct {
	Name         *string
	ClientID     *string
	ClientSecret *string
	AuthorizeURL *string
	TokenURL     *string
	UserinfoURL  *string
	Scopes       *string
	IsEnabled    *bool
}

func (s *OAuthService) ListProviders(ctx context.Context) ([]ProviderResponse, error) {
	providers, err := s.queries.ListOAuthProviders(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing providers: %w", err)
	}
	result := make([]ProviderResponse, len(providers))
	for i, p := range providers {
		result[i] = providerToResponse(p)
	}
	return result, nil
}

func (s *OAuthService) ListEnabledProviders(ctx context.Context) ([]PublicProviderResponse, error) {
	providers, err := s.queries.ListEnabledOAuthProviders(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing enabled providers: %w", err)
	}
	result := make([]PublicProviderResponse, len(providers))
	for i, p := range providers {
		result[i] = PublicProviderResponse{
			ID:   p.ID.String(),
			Name: p.Name,
		}
	}
	return result, nil
}

func (s *OAuthService) GetProvider(ctx context.Context, id uuid.UUID) (ProviderResponse, error) {
	provider, err := s.queries.GetOAuthProviderByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProviderResponse{}, model.NewDomainError(model.ErrNotFound, "provider not found")
		}
		return ProviderResponse{}, fmt.Errorf("fetching provider: %w", err)
	}
	return providerToResponse(provider), nil
}

func (s *OAuthService) CreateProvider(ctx context.Context, input CreateProviderInput) (ProviderResponse, error) {
	if err := validateProviderInput(input); err != nil {
		return ProviderResponse{}, err
	}

	// Check for existing name
	_, err := s.queries.GetOAuthProviderByName(ctx, input.Name)
	if err == nil {
		return ProviderResponse{}, model.NewFieldError(model.ErrAlreadyExists, "name", "provider name already exists")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ProviderResponse{}, fmt.Errorf("checking provider name: %w", err)
	}

	provider, err := s.queries.CreateOAuthProvider(ctx, repository.CreateOAuthProviderParams{
		Name:         input.Name,
		ClientID:     input.ClientID,
		ClientSecret: input.ClientSecret,
		AuthorizeUrl: input.AuthorizeURL,
		TokenUrl:     input.TokenURL,
		UserinfoUrl:  input.UserinfoURL,
		Scopes:       input.Scopes,
	})
	if err != nil {
		return ProviderResponse{}, fmt.Errorf("creating provider: %w", err)
	}

	s.logger.Info("oauth provider created", "provider_id", provider.ID, "name", provider.Name)
	return providerToResponse(provider), nil
}

func (s *OAuthService) UpdateProvider(ctx context.Context, id uuid.UUID, input UpdateProviderInput) (ProviderResponse, error) {
	// Verify provider exists
	_, err := s.queries.GetOAuthProviderByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProviderResponse{}, model.NewDomainError(model.ErrNotFound, "provider not found")
		}
		return ProviderResponse{}, fmt.Errorf("fetching provider: %w", err)
	}

	// Check name uniqueness if changing name
	if input.Name != nil {
		existing, err := s.queries.GetOAuthProviderByName(ctx, *input.Name)
		if err == nil && existing.ID != id {
			return ProviderResponse{}, model.NewFieldError(model.ErrAlreadyExists, "name", "provider name already exists")
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return ProviderResponse{}, fmt.Errorf("checking provider name: %w", err)
		}
	}

	provider, err := s.queries.UpdateOAuthProvider(ctx, repository.UpdateOAuthProviderParams{
		ID:           id,
		Name:         input.Name,
		ClientID:     input.ClientID,
		ClientSecret: input.ClientSecret,
		AuthorizeUrl: input.AuthorizeURL,
		TokenUrl:     input.TokenURL,
		UserinfoUrl:  input.UserinfoURL,
		Scopes:       input.Scopes,
		IsEnabled:    input.IsEnabled,
	})
	if err != nil {
		return ProviderResponse{}, fmt.Errorf("updating provider: %w", err)
	}

	s.logger.Info("oauth provider updated", "provider_id", provider.ID, "name", provider.Name)
	return providerToResponse(provider), nil
}

func (s *OAuthService) DeleteProvider(ctx context.Context, id uuid.UUID) error {
	_, err := s.queries.GetOAuthProviderByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "provider not found")
		}
		return fmt.Errorf("fetching provider: %w", err)
	}

	if err := s.queries.DeleteOAuthProvider(ctx, id); err != nil {
		return fmt.Errorf("deleting provider: %w", err)
	}

	s.logger.Info("oauth provider deleted", "provider_id", id)
	return nil
}

// --- OAuth2 Flow ---

// OAuthState stores the state for CSRF protection during the OAuth flow
type OAuthState struct {
	ProviderID string `json:"provider_id"`
	UserID     string `json:"user_id,omitempty"` // Set when linking an existing account
}

// GetAuthorizeURL generates the OAuth2 authorization URL for a provider
func (s *OAuthService) GetAuthorizeURL(ctx context.Context, providerName string, linkUserID *uuid.UUID) (string, error) {
	provider, err := s.queries.GetOAuthProviderByName(ctx, providerName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", model.NewDomainError(model.ErrNotFound, "provider not found")
		}
		return "", fmt.Errorf("fetching provider: %w", err)
	}

	if !provider.IsEnabled {
		return "", model.NewDomainError(model.ErrForbidden, "provider is disabled")
	}

	// Generate random state for CSRF protection
	stateBytes := make([]byte, 16)
	if _, err := rand.Read(stateBytes); err != nil {
		return "", fmt.Errorf("generating state: %w", err)
	}
	stateToken := hex.EncodeToString(stateBytes)

	// Store state in Redis with 10-minute TTL
	stateData := OAuthState{
		ProviderID: provider.ID.String(),
	}
	if linkUserID != nil {
		stateData.UserID = linkUserID.String()
	}
	stateJSON, _ := json.Marshal(stateData)
	s.rdb.Set(ctx, oauthStateKey(stateToken), string(stateJSON), 10*time.Minute)

	// Build authorize URL
	redirectURI := fmt.Sprintf("%s/api/auth/oauth/%s/callback", s.appCfg.BaseURL, url.PathEscape(providerName))

	u, err := url.Parse(provider.AuthorizeUrl)
	if err != nil {
		return "", fmt.Errorf("parsing authorize URL: %w", err)
	}
	q := u.Query()
	q.Set("client_id", provider.ClientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", provider.Scopes)
	q.Set("state", stateToken)
	q.Set("response_type", "code")
	u.RawQuery = q.Encode()

	return u.String(), nil
}

// HandleCallback processes the OAuth2 callback, returning user info and session
func (s *OAuthService) HandleCallback(ctx context.Context, providerName, code, state, ip, userAgent string) (UserResponse, SessionInfo, error) {
	// Verify state from Redis
	stateJSON, err := s.rdb.GetDel(ctx, oauthStateKey(state)).Result()
	if err != nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInvalidInput, "invalid or expired OAuth state")
	}

	var stateData OAuthState
	if err := json.Unmarshal([]byte(stateJSON), &stateData); err != nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInvalidInput, "invalid OAuth state data")
	}

	providerID, err := uuid.Parse(stateData.ProviderID)
	if err != nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInvalidInput, "invalid provider in state")
	}

	provider, err := s.queries.GetOAuthProviderByID(ctx, providerID)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("fetching provider: %w", err)
	}

	// Exchange code for access token
	accessToken, refreshToken, err := s.exchangeCode(provider, providerName, code)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("exchanging code: %w", err)
	}

	// Fetch user info from provider
	userInfo, err := s.fetchUserInfo(provider.UserinfoUrl, accessToken)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("fetching user info: %w", err)
	}

	if userInfo.ExternalID == "" {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInvalidInput, "provider did not return a user ID")
	}

	// If this is a link operation (user is already logged in)
	if stateData.UserID != "" {
		linkUserID, err := uuid.Parse(stateData.UserID)
		if err != nil {
			return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInvalidInput, "invalid user ID in state")
		}
		return s.linkAccount(ctx, linkUserID, provider.ID, userInfo, accessToken, refreshToken, ip, userAgent)
	}

	// Login or auto-create flow
	return s.loginOrCreateUser(ctx, provider.ID, userInfo, accessToken, refreshToken, ip, userAgent)
}

// ListConnections returns all OAuth connections for a user
func (s *OAuthService) ListConnections(ctx context.Context, userID uuid.UUID) ([]ConnectionResponse, error) {
	connections, err := s.queries.ListOAuthConnectionsByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("listing connections: %w", err)
	}
	result := make([]ConnectionResponse, len(connections))
	for i, c := range connections {
		result[i] = ConnectionResponse{
			ID:           c.ID.String(),
			ProviderID:   c.ProviderID.String(),
			ProviderName: c.ProviderName,
			ExternalID:   c.ExternalID,
			CreatedAt:    c.CreatedAt.Format(time.RFC3339),
		}
	}
	return result, nil
}

// UnlinkConnection removes an OAuth connection for a user
func (s *OAuthService) UnlinkConnection(ctx context.Context, userID uuid.UUID, connectionID uuid.UUID) error {
	if err := s.queries.DeleteOAuthConnection(ctx, connectionID, userID); err != nil {
		return fmt.Errorf("deleting connection: %w", err)
	}
	s.logger.Info("oauth connection unlinked", "user_id", userID, "connection_id", connectionID)
	return nil
}

type ConnectionResponse struct {
	ID           string `json:"id"`
	ProviderID   string `json:"provider_id"`
	ProviderName string `json:"provider_name"`
	ExternalID   string `json:"external_id"`
	CreatedAt    string `json:"created_at"`
}

// --- Internal helpers ---

type oauthUserInfo struct {
	ExternalID string
	Email      string
	Name       string
	Username   string
}

func (s *OAuthService) exchangeCode(provider repository.OauthProvider, providerName, code string) (string, string, error) {
	redirectURI := fmt.Sprintf("%s/api/auth/oauth/%s/callback", s.appCfg.BaseURL, url.PathEscape(providerName))

	data := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"client_id":     {provider.ClientID},
		"client_secret": {provider.ClientSecret},
	}

	resp, err := http.PostForm(provider.TokenUrl, data)
	if err != nil {
		return "", "", fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB limit
	if err != nil {
		return "", "", fmt.Errorf("reading token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		s.logger.Error("oauth token exchange failed", "status", resp.StatusCode, "body", string(body))
		return "", "", model.NewDomainError(model.ErrUnauthorized, "failed to exchange authorization code")
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		TokenType    string `json:"token_type"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", "", fmt.Errorf("parsing token response: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", "", model.NewDomainError(model.ErrUnauthorized, "no access token in response")
	}

	return tokenResp.AccessToken, tokenResp.RefreshToken, nil
}

func (s *OAuthService) fetchUserInfo(userinfoURL, accessToken string) (oauthUserInfo, error) {
	req, err := http.NewRequest("GET", userinfoURL, nil)
	if err != nil {
		return oauthUserInfo{}, fmt.Errorf("creating userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return oauthUserInfo{}, fmt.Errorf("userinfo request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return oauthUserInfo{}, fmt.Errorf("reading userinfo response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		s.logger.Error("oauth userinfo request failed", "status", resp.StatusCode, "body", string(body))
		return oauthUserInfo{}, model.NewDomainError(model.ErrUnauthorized, "failed to fetch user info")
	}

	// Parse common fields from various providers
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return oauthUserInfo{}, fmt.Errorf("parsing userinfo response: %w", err)
	}

	info := oauthUserInfo{}

	// External ID: try "sub" (OIDC), "id" (GitHub, GitLab), "user_id"
	if v, ok := raw["sub"]; ok {
		info.ExternalID = fmt.Sprint(v)
	} else if v, ok := raw["id"]; ok {
		info.ExternalID = fmt.Sprint(v)
	} else if v, ok := raw["user_id"]; ok {
		info.ExternalID = fmt.Sprint(v)
	}

	// Email
	if v, ok := raw["email"].(string); ok {
		info.Email = v
	}

	// Display name: try "name", "display_name"
	if v, ok := raw["name"].(string); ok {
		info.Name = v
	} else if v, ok := raw["display_name"].(string); ok {
		info.Name = v
	}

	// Username: try "preferred_username" (OIDC), "login" (GitHub), "username"
	if v, ok := raw["preferred_username"].(string); ok {
		info.Username = v
	} else if v, ok := raw["login"].(string); ok {
		info.Username = v
	} else if v, ok := raw["username"].(string); ok {
		info.Username = v
	}

	return info, nil
}

func (s *OAuthService) loginOrCreateUser(
	ctx context.Context,
	providerID uuid.UUID,
	info oauthUserInfo,
	accessToken, refreshToken string,
	ip, userAgent string,
) (UserResponse, SessionInfo, error) {
	// Check if this external ID already has a connection
	conn, err := s.queries.GetOAuthConnectionByExternalID(ctx, providerID, info.ExternalID)
	if err == nil {
		// Existing connection found - log in as that user
		user, err := s.queries.GetUserByID(ctx, conn.UserID)
		if err != nil {
			return UserResponse{}, SessionInfo{}, fmt.Errorf("fetching linked user: %w", err)
		}
		if !user.IsActive {
			return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInactiveAccount, "account is deactivated")
		}

		session, err := s.createSession(ctx, user.ID, ip, userAgent)
		if err != nil {
			return UserResponse{}, SessionInfo{}, err
		}

		s.logger.Info("oauth login", "user_id", user.ID, "provider_id", providerID)
		return userToResponse(user), session, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("checking oauth connection: %w", err)
	}

	// No existing connection - try to find user by email
	if info.Email != "" {
		existingUser, err := s.queries.GetUserByEmail(ctx, &info.Email)
		if err == nil {
			// Found user with matching email - create connection and log in
			if !existingUser.IsActive {
				return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInactiveAccount, "account is deactivated")
			}

			var atPtr, rtPtr *string
			if accessToken != "" {
				atPtr = &accessToken
			}
			if refreshToken != "" {
				rtPtr = &refreshToken
			}

			_, err = s.queries.CreateOAuthConnection(ctx, repository.CreateOAuthConnectionParams{
				UserID:       existingUser.ID,
				ProviderID:   providerID,
				ExternalID:   info.ExternalID,
				AccessToken:  atPtr,
				RefreshToken: rtPtr,
			})
			if err != nil {
				return UserResponse{}, SessionInfo{}, fmt.Errorf("creating oauth connection: %w", err)
			}

			session, err := s.createSession(ctx, existingUser.ID, ip, userAgent)
			if err != nil {
				return UserResponse{}, SessionInfo{}, err
			}

			s.logger.Info("oauth login (email match)", "user_id", existingUser.ID, "provider_id", providerID)
			return userToResponse(existingUser), session, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, SessionInfo{}, fmt.Errorf("checking email: %w", err)
		}
	}

	// No existing user - auto-create new account
	username := s.generateUniqueUsername(ctx, info)
	fullName := info.Name
	if fullName == "" {
		fullName = username
	}

	var email *string
	if info.Email != "" {
		email = &info.Email
	}

	// First user gets super_admin
	role := "user"
	count, err := s.queries.CountUsers(ctx, repository.CountUsersParams{})
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("counting users: %w", err)
	}
	if count == 0 {
		role = "super_admin"
		s.logger.Info("first user via oauth, promoting to super_admin", "username", username)
	}

	user, err := s.queries.CreateUser(ctx, repository.CreateUserParams{
		Username:     username,
		FullName:     fullName,
		DisplayName:  nil,
		Email:        email,
		PasswordHash: nil, // OAuth users have no password
		Role:         role,
		Language:     getAppSettingString(ctx, s.queries, "default_language", "en"),
		AccountType:  "oauth",
	})
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("creating user: %w", err)
	}

	// Create OAuth connection
	var atPtr, rtPtr *string
	if accessToken != "" {
		atPtr = &accessToken
	}
	if refreshToken != "" {
		rtPtr = &refreshToken
	}

	_, err = s.queries.CreateOAuthConnection(ctx, repository.CreateOAuthConnectionParams{
		UserID:       user.ID,
		ProviderID:   providerID,
		ExternalID:   info.ExternalID,
		AccessToken:  atPtr,
		RefreshToken: rtPtr,
	})
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("creating oauth connection: %w", err)
	}

	session, err := s.createSession(ctx, user.ID, ip, userAgent)
	if err != nil {
		return UserResponse{}, SessionInfo{}, err
	}

	s.logger.Info("oauth user created", "user_id", user.ID, "username", username, "provider_id", providerID)
	return userToResponse(user), session, nil
}

func (s *OAuthService) linkAccount(
	ctx context.Context,
	userID uuid.UUID,
	providerID uuid.UUID,
	info oauthUserInfo,
	accessToken, refreshToken string,
	ip, userAgent string,
) (UserResponse, SessionInfo, error) {
	// Verify the user exists
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("fetching user: %w", err)
	}

	// Check if this external ID is already linked to another account
	existingConn, err := s.queries.GetOAuthConnectionByExternalID(ctx, providerID, info.ExternalID)
	if err == nil && existingConn.UserID != userID {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrConflict, "this OAuth account is already linked to another user")
	}
	if err == nil && existingConn.UserID == userID {
		// Already linked to this user, just log in
		session, err := s.createSession(ctx, user.ID, ip, userAgent)
		if err != nil {
			return UserResponse{}, SessionInfo{}, err
		}
		return userToResponse(user), session, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("checking existing connection: %w", err)
	}

	// Create new connection
	var atPtr, rtPtr *string
	if accessToken != "" {
		atPtr = &accessToken
	}
	if refreshToken != "" {
		rtPtr = &refreshToken
	}

	_, err = s.queries.CreateOAuthConnection(ctx, repository.CreateOAuthConnectionParams{
		UserID:       userID,
		ProviderID:   providerID,
		ExternalID:   info.ExternalID,
		AccessToken:  atPtr,
		RefreshToken: rtPtr,
	})
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("creating oauth connection: %w", err)
	}

	session, err := s.createSession(ctx, user.ID, ip, userAgent)
	if err != nil {
		return UserResponse{}, SessionInfo{}, err
	}

	s.logger.Info("oauth account linked", "user_id", userID, "provider_id", providerID)
	return userToResponse(user), session, nil
}

// createSession delegates to the same pattern as AuthService
func (s *OAuthService) createSession(ctx context.Context, userID uuid.UUID, ip, userAgent string) (SessionInfo, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return SessionInfo{}, fmt.Errorf("generating token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	h := oauthHashToken(token)
	expiresAt := time.Now().Add(s.authCfg.SessionTTL)

	var ipPtr, uaPtr *string
	if ip != "" {
		ipPtr = &ip
	}
	if userAgent != "" {
		uaPtr = &userAgent
	}

	_, err := s.queries.CreateSession(ctx, repository.CreateSessionParams{
		UserID:    userID,
		TokenHash: h,
		IpAddress: ipPtr,
		UserAgent: uaPtr,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return SessionInfo{}, fmt.Errorf("storing session: %w", err)
	}

	s.rdb.Set(ctx, "session:"+h, "valid", time.Until(expiresAt))
	return SessionInfo{Token: token, ExpiresAt: expiresAt}, nil
}

func oauthHashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func (s *OAuthService) generateUniqueUsername(ctx context.Context, info oauthUserInfo) string {
	// Try preferred username first, then email prefix, then external ID
	candidates := []string{}
	if info.Username != "" {
		candidates = append(candidates, info.Username)
	}
	if info.Email != "" {
		parts := strings.SplitN(info.Email, "@", 2)
		if len(parts) > 0 && parts[0] != "" {
			candidates = append(candidates, parts[0])
		}
	}
	if info.Name != "" {
		// Normalize: lowercase, replace spaces with underscore
		normalized := strings.ToLower(strings.ReplaceAll(info.Name, " ", "_"))
		candidates = append(candidates, normalized)
	}
	candidates = append(candidates, "oauth_user")

	for _, candidate := range candidates {
		// Clean the candidate
		candidate = cleanUsername(candidate)
		if len(candidate) < 3 {
			continue
		}

		// Try the candidate as-is
		_, err := s.queries.GetUserByUsername(ctx, candidate)
		if errors.Is(err, pgx.ErrNoRows) {
			return candidate
		}

		// Try with numeric suffix
		for i := 1; i < 100; i++ {
			suffixed := fmt.Sprintf("%s_%d", candidate, i)
			_, err := s.queries.GetUserByUsername(ctx, suffixed)
			if errors.Is(err, pgx.ErrNoRows) {
				return suffixed
			}
		}
	}

	// Fallback: use UUID-based username
	return fmt.Sprintf("user_%s", uuid.New().String()[:8])
}

func cleanUsername(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else if r >= 'A' && r <= 'Z' {
			b.WriteRune(r - 'A' + 'a')
		}
	}
	result := b.String()
	if len(result) > 50 {
		result = result[:50]
	}
	return result
}

func validateProviderInput(input CreateProviderInput) error {
	if input.Name == "" {
		return model.NewFieldError(model.ErrInvalidInput, "name", "name is required")
	}
	if input.ClientID == "" {
		return model.NewFieldError(model.ErrInvalidInput, "client_id", "client_id is required")
	}
	if input.ClientSecret == "" {
		return model.NewFieldError(model.ErrInvalidInput, "client_secret", "client_secret is required")
	}
	if input.AuthorizeURL == "" {
		return model.NewFieldError(model.ErrInvalidInput, "authorize_url", "authorize_url is required")
	}
	if input.TokenURL == "" {
		return model.NewFieldError(model.ErrInvalidInput, "token_url", "token_url is required")
	}
	if input.UserinfoURL == "" {
		return model.NewFieldError(model.ErrInvalidInput, "userinfo_url", "userinfo_url is required")
	}
	return nil
}

func oauthStateKey(state string) string {
	return "oauth_state:" + state
}
