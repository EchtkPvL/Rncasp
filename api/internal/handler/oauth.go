package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/echtkpvl/rncasp/internal/config"
	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/server/middleware"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type OAuthHandler struct {
	oauthService *service.OAuthService
	authCfg      *config.AuthConfig
	appCfg       *config.AppConfig
}

func NewOAuthHandler(oauthService *service.OAuthService, authCfg *config.AuthConfig, appCfg *config.AppConfig) *OAuthHandler {
	return &OAuthHandler{
		oauthService: oauthService,
		authCfg:      authCfg,
		appCfg:       appCfg,
	}
}

// --- Provider CRUD (super-admin only) ---

type createProviderRequest struct {
	Name         string `json:"name"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	AuthorizeURL string `json:"authorize_url"`
	TokenURL     string `json:"token_url"`
	UserinfoURL  string `json:"userinfo_url"`
	Scopes       string `json:"scopes"`
}

type updateProviderRequest struct {
	Name         *string `json:"name"`
	ClientID     *string `json:"client_id"`
	ClientSecret *string `json:"client_secret"`
	AuthorizeURL *string `json:"authorize_url"`
	TokenURL     *string `json:"token_url"`
	UserinfoURL  *string `json:"userinfo_url"`
	Scopes       *string `json:"scopes"`
	IsEnabled    *bool   `json:"is_enabled"`
}

func (h *OAuthHandler) ListProviders(w http.ResponseWriter, r *http.Request) {
	providers, err := h.oauthService.ListProviders(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, providers)
}

func (h *OAuthHandler) ListEnabledProviders(w http.ResponseWriter, r *http.Request) {
	providers, err := h.oauthService.ListEnabledProviders(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, providers)
}

func (h *OAuthHandler) GetProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerId")
	id, err := uuid.Parse(idStr)
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid provider ID"))
		return
	}

	provider, err := h.oauthService.GetProvider(r.Context(), id)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, provider)
}

func (h *OAuthHandler) CreateProvider(w http.ResponseWriter, r *http.Request) {
	var req createProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	provider, err := h.oauthService.CreateProvider(r.Context(), service.CreateProviderInput{
		Name:         req.Name,
		ClientID:     req.ClientID,
		ClientSecret: req.ClientSecret,
		AuthorizeURL: req.AuthorizeURL,
		TokenURL:     req.TokenURL,
		UserinfoURL:  req.UserinfoURL,
		Scopes:       req.Scopes,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, provider)
}

func (h *OAuthHandler) UpdateProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerId")
	id, err := uuid.Parse(idStr)
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid provider ID"))
		return
	}

	var req updateProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	provider, err := h.oauthService.UpdateProvider(r.Context(), id, service.UpdateProviderInput{
		Name:         req.Name,
		ClientID:     req.ClientID,
		ClientSecret: req.ClientSecret,
		AuthorizeURL: req.AuthorizeURL,
		TokenURL:     req.TokenURL,
		UserinfoURL:  req.UserinfoURL,
		Scopes:       req.Scopes,
		IsEnabled:    req.IsEnabled,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, provider)
}

func (h *OAuthHandler) DeleteProvider(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "providerId")
	id, err := uuid.Parse(idStr)
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid provider ID"))
		return
	}

	if err := h.oauthService.DeleteProvider(r.Context(), id); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "provider deleted"})
}

// --- OAuth2 Flow ---

// Authorize redirects the user to the OAuth provider's authorization page
func (h *OAuthHandler) Authorize(w http.ResponseWriter, r *http.Request) {
	providerName := chi.URLParam(r, "provider")

	// Check if user is logged in (for account linking)
	var linkUserID *uuid.UUID
	if uid := middleware.GetUserID(r.Context()); uid != nil {
		linkUserID = uid
	}

	authorizeURL, err := h.oauthService.GetAuthorizeURL(r.Context(), providerName, linkUserID)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	http.Redirect(w, r, authorizeURL, http.StatusTemporaryRedirect)
}

// Callback handles the OAuth provider's redirect back to our app
func (h *OAuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	providerName := chi.URLParam(r, "provider")
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	if code == "" {
		// Check for error from provider
		oauthErr := r.URL.Query().Get("error")
		errDesc := r.URL.Query().Get("error_description")
		if oauthErr != "" {
			h.redirectWithError(w, r, "OAuth error: "+oauthErr+": "+errDesc)
			return
		}
		h.redirectWithError(w, r, "missing authorization code")
		return
	}

	if state == "" {
		h.redirectWithError(w, r, "missing state parameter")
		return
	}

	user, session, err := h.oauthService.HandleCallback(
		r.Context(),
		providerName,
		code,
		state,
		r.RemoteAddr,
		r.UserAgent(),
	)
	if err != nil {
		h.redirectWithError(w, r, err.Error())
		return
	}

	// Set session cookie (same as regular login)
	http.SetCookie(w, &http.Cookie{
		Name:     h.authCfg.CookieName,
		Value:    session.Token,
		Path:     "/",
		Domain:   h.authCfg.CookieDomain,
		Expires:  session.ExpiresAt,
		MaxAge:   int(time.Until(session.ExpiresAt).Seconds()),
		Secure:   h.authCfg.CookieSecure,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	// Redirect to frontend
	_ = user // user data is accessible via /api/auth/me after redirect
	http.Redirect(w, r, h.appCfg.BaseURL+"/", http.StatusTemporaryRedirect)
}

// --- User Connection Management ---

// ListConnections returns OAuth connections for the authenticated user
func (h *OAuthHandler) ListConnections(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	connections, err := h.oauthService.ListConnections(r.Context(), *userID)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, connections)
}

// UnlinkConnection removes an OAuth connection for the authenticated user
func (h *OAuthHandler) UnlinkConnection(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	connIDStr := chi.URLParam(r, "connectionId")
	connID, err := uuid.Parse(connIDStr)
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid connection ID"))
		return
	}

	if err := h.oauthService.UnlinkConnection(r.Context(), *userID, connID); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "connection removed"})
}

func (h *OAuthHandler) redirectWithError(w http.ResponseWriter, r *http.Request, msg string) {
	// Redirect to frontend login page with error
	http.Redirect(w, r, h.appCfg.BaseURL+"/login?oauth_error="+msg, http.StatusTemporaryRedirect)
}
