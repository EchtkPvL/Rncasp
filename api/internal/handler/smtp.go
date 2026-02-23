package handler

import (
	"encoding/json"
	"net/http"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/service"
)

type SMTPHandler struct {
	smtpService *service.SMTPService
}

func NewSMTPHandler(smtpService *service.SMTPService) *SMTPHandler {
	return &SMTPHandler{smtpService: smtpService}
}

func (h *SMTPHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.smtpService.GetConfig(r.Context())
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	if cfg == nil {
		model.JSON(w, http.StatusOK, nil)
		return
	}
	model.JSON(w, http.StatusOK, cfg)
}

type updateSMTPConfigRequest struct {
	Host        string  `json:"host"`
	Port        int32   `json:"port"`
	Username    *string `json:"username"`
	Password    *string `json:"password"`
	FromAddress string  `json:"from_address"`
	FromName    *string `json:"from_name"`
	UseTLS      bool    `json:"use_tls"`
}

func (h *SMTPHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var req updateSMTPConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	cfg, err := h.smtpService.UpdateConfig(r.Context(), service.UpdateSMTPConfigInput{
		Host:        req.Host,
		Port:        req.Port,
		Username:    req.Username,
		Password:    req.Password,
		FromAddress: req.FromAddress,
		FromName:    req.FromName,
		UseTLS:      req.UseTLS,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, cfg)
}

type testSMTPRequest struct {
	To string `json:"to"`
}

func (h *SMTPHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var req testSMTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	if req.To == "" {
		model.ErrorResponse(w, model.NewFieldError(model.ErrInvalidInput, "to", "recipient email is required"))
		return
	}

	err := h.smtpService.SendEmail(r.Context(), req.To, "Rncasp SMTP Test", "<h1>SMTP Test</h1><p>If you receive this email, your SMTP configuration is working correctly.</p>")
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "SMTP test failed: "+err.Error()))
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "test email sent"})
}
