package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/echtkpvl/rncasp/internal/config"
	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/server/middleware"
	"github.com/echtkpvl/rncasp/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
	authCfg     *config.AuthConfig
	isDev       bool
}

func NewAuthHandler(authService *service.AuthService, authCfg *config.AuthConfig, isDev bool) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		authCfg:     authCfg,
		isDev:       isDev,
	}
}

type registerRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Language string `json:"language"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	ip := r.RemoteAddr
	userAgent := r.UserAgent()

	user, session, err := h.authService.Register(r.Context(), service.RegisterInput{
		Username: req.Username,
		Password: req.Password,
		FullName: req.FullName,
		Email:    req.Email,
		Language: req.Language,
	}, ip, userAgent)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	// Set session cookie so user is logged in immediately
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

	model.JSON(w, http.StatusCreated, user)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	ip := r.RemoteAddr
	userAgent := r.UserAgent()

	user, session, err := h.authService.Login(r.Context(), service.LoginInput{
		Username: req.Username,
		Password: req.Password,
	}, ip, userAgent)
	if err != nil {
		var totpErr *service.TOTPPendingError
		if errors.As(err, &totpErr) {
			model.JSON(w, http.StatusOK, map[string]any{
				"totp_required": true,
				"pending_token": totpErr.PendingToken,
			})
			return
		}
		model.ErrorResponse(w, err)
		return
	}

	// Set session cookie
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

	model.JSON(w, http.StatusOK, user)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.authCfg.CookieName)
	if err != nil {
		model.JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
		return
	}

	if err := h.authService.Logout(r.Context(), cookie.Value); err != nil {
		model.ErrorResponse(w, err)
		return
	}

	// Clear the cookie
	http.SetCookie(w, &http.Cookie{
		Name:     h.authCfg.CookieName,
		Value:    "",
		Path:     "/",
		Domain:   h.authCfg.CookieDomain,
		MaxAge:   -1,
		Secure:   h.authCfg.CookieSecure,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	model.JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

type updateProfileRequest struct {
	FullName    *string `json:"full_name"`
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
	Password    *string `json:"password"`
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	var req updateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	user, err := h.authService.UpdateProfile(r.Context(), *userID, service.UpdateProfileInput{
		FullName:    req.FullName,
		DisplayName: req.DisplayName,
		Email:       req.Email,
		Password:    req.Password,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, user)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	user, err := h.authService.GetCurrentUser(r.Context(), *userID)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, user)
}
