package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/server/middleware"
)

type totpCodeRequest struct {
	Code string `json:"code"`
}

type totpVerifyRequest struct {
	PendingToken string `json:"pending_token"`
	Code         string `json:"code"`
}

// SetupTOTP initiates TOTP setup, returning the secret, provisioning URI and recovery codes.
func (h *AuthHandler) SetupTOTP(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	result, err := h.authService.SetupTOTP(r.Context(), *userID)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, result)
}

// EnableTOTP verifies a TOTP code and enables TOTP for the user.
func (h *AuthHandler) EnableTOTP(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	var req totpCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	if req.Code == "" {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "code is required"))
		return
	}

	if err := h.authService.EnableTOTP(r.Context(), *userID, req.Code); err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, map[string]string{"message": "TOTP enabled"})
}

// DisableTOTP verifies a TOTP code and disables TOTP for the user.
func (h *AuthHandler) DisableTOTP(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	var req totpCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	if req.Code == "" {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "code is required"))
		return
	}

	if err := h.authService.DisableTOTP(r.Context(), *userID, req.Code); err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, map[string]string{"message": "TOTP disabled"})
}

// VerifyTOTP handles the second step of TOTP login.
func (h *AuthHandler) VerifyTOTP(w http.ResponseWriter, r *http.Request) {
	var req totpVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	if req.PendingToken == "" || req.Code == "" {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "pending_token and code are required"))
		return
	}

	user, session, err := h.authService.VerifyTOTPLogin(r.Context(), req.PendingToken, req.Code)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

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

// GetRecoveryCodeCount returns the number of unused recovery codes.
func (h *AuthHandler) GetRecoveryCodeCount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	count, err := h.authService.GetRecoveryCodeCount(r.Context(), *userID)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, map[string]int{"remaining": count})
}

// RegenerateRecoveryCodes creates new recovery codes after verifying a TOTP code.
func (h *AuthHandler) RegenerateRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	var req totpCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	if req.Code == "" {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "code is required"))
		return
	}

	codes, err := h.authService.RegenerateRecoveryCodes(r.Context(), *userID, req.Code)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}

	model.JSON(w, http.StatusOK, map[string][]string{"recovery_codes": codes})
}
