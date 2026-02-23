package service

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/jackc/pgx/v5"
)

type SMTPService struct {
	queries *repository.Queries
	logger  *slog.Logger
}

func NewSMTPService(queries *repository.Queries, logger *slog.Logger) *SMTPService {
	return &SMTPService{queries: queries, logger: logger}
}

type SMTPConfigResponse struct {
	Host        string  `json:"host"`
	Port        int32   `json:"port"`
	Username    *string `json:"username"`
	FromAddress string  `json:"from_address"`
	FromName    *string `json:"from_name"`
	UseTLS      bool    `json:"use_tls"`
	UpdatedAt   string  `json:"updated_at"`
}

type UpdateSMTPConfigInput struct {
	Host        string
	Port        int32
	Username    *string
	Password    *string
	FromAddress string
	FromName    *string
	UseTLS      bool
}

func (s *SMTPService) GetConfig(ctx context.Context) (*SMTPConfigResponse, error) {
	cfg, err := s.queries.GetSMTPConfig(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting SMTP config: %w", err)
	}

	return &SMTPConfigResponse{
		Host:        cfg.Host,
		Port:        cfg.Port,
		Username:    cfg.Username,
		FromAddress: cfg.FromAddress,
		FromName:    cfg.FromName,
		UseTLS:      cfg.UseTls,
		UpdatedAt:   cfg.UpdatedAt.Format(time.RFC3339),
	}, nil
}

func (s *SMTPService) UpdateConfig(ctx context.Context, input UpdateSMTPConfigInput) (*SMTPConfigResponse, error) {
	if input.Host == "" {
		return nil, model.NewFieldError(model.ErrInvalidInput, "host", "host is required")
	}
	if input.Port <= 0 || input.Port > 65535 {
		return nil, model.NewFieldError(model.ErrInvalidInput, "port", "port must be between 1 and 65535")
	}
	if input.FromAddress == "" {
		return nil, model.NewFieldError(model.ErrInvalidInput, "from_address", "from_address is required")
	}

	cfg, err := s.queries.UpsertSMTPConfig(ctx, repository.UpsertSMTPConfigParams{
		Host:        input.Host,
		Port:        input.Port,
		Username:    input.Username,
		Password:    input.Password,
		FromAddress: input.FromAddress,
		FromName:    input.FromName,
		UseTls:      input.UseTLS,
	})
	if err != nil {
		return nil, fmt.Errorf("upserting SMTP config: %w", err)
	}

	s.logger.Info("SMTP config updated", "host", cfg.Host, "port", cfg.Port)

	return &SMTPConfigResponse{
		Host:        cfg.Host,
		Port:        cfg.Port,
		Username:    cfg.Username,
		FromAddress: cfg.FromAddress,
		FromName:    cfg.FromName,
		UseTLS:      cfg.UseTls,
		UpdatedAt:   cfg.UpdatedAt.Format(time.RFC3339),
	}, nil
}

// SendEmail sends an HTML email using the configured SMTP server.
// Returns nil without error if SMTP is not configured.
func (s *SMTPService) SendEmail(ctx context.Context, to, subject, htmlBody string) error {
	cfg, err := s.queries.GetSMTPConfig(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.logger.Debug("SMTP not configured, skipping email", "to", to)
			return nil
		}
		return fmt.Errorf("getting SMTP config: %w", err)
	}

	fromHeader := cfg.FromAddress
	if cfg.FromName != nil && *cfg.FromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", *cfg.FromName, cfg.FromAddress)
	}

	msg := strings.Join([]string{
		"From: " + fromHeader,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"",
		htmlBody,
	}, "\r\n")

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	var auth smtp.Auth
	if cfg.Username != nil && *cfg.Username != "" && cfg.Password != nil {
		auth = smtp.PlainAuth("", *cfg.Username, *cfg.Password, cfg.Host)
	}

	if cfg.UseTls {
		return s.sendTLS(addr, cfg.Host, cfg.FromAddress, to, auth, []byte(msg))
	}

	return smtp.SendMail(addr, auth, cfg.FromAddress, []string{to}, []byte(msg))
}

func (s *SMTPService) sendTLS(addr, host, from, to string, auth smtp.Auth, msg []byte) error {
	tlsConfig := &tls.Config{ServerName: host}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("TLS dial failed: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("SMTP client creation failed: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP auth failed: %w", err)
		}
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("SMTP MAIL FROM failed: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("SMTP RCPT TO failed: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA failed: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("SMTP write failed: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("SMTP close failed: %w", err)
	}

	return client.Quit()
}
