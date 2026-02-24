package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pquerna/otp/totp"
)

// TOTPPendingError is returned by Login when TOTP verification is required.
// The handler should catch this and return the pending token to the client.
type TOTPPendingError struct {
	PendingToken string
}

func (e *TOTPPendingError) Error() string { return "totp_required" }
func (e *TOTPPendingError) Unwrap() error { return model.ErrTOTPRequired }

type totpPendingData struct {
	UserID    string `json:"user_id"`
	IP        string `json:"ip"`
	UserAgent string `json:"user_agent"`
}

type SetupTOTPResult struct {
	Secret        string   `json:"secret"`
	ProvisionURI  string   `json:"provision_uri"`
	RecoveryCodes []string `json:"recovery_codes"`
}

const (
	totpPendingTTL     = 5 * time.Minute
	totpPendingPrefix  = "totp_pending:"
	recoveryCodeCount  = 10
	recoveryCodeLength = 8
)

// SetupTOTP generates a new TOTP secret, stores it (not yet enabled),
// and generates recovery codes.
func (s *AuthService) SetupTOTP(ctx context.Context, userID uuid.UUID) (SetupTOTPResult, error) {
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return SetupTOTPResult{}, model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return SetupTOTPResult{}, fmt.Errorf("fetching user: %w", err)
	}

	if user.TotpEnabled {
		return SetupTOTPResult{}, model.NewDomainError(model.ErrConflict, "TOTP is already enabled")
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      getAppSettingString(ctx, s.queries, "app_name", "Rncasp"),
		AccountName: user.Username,
	})
	if err != nil {
		return SetupTOTPResult{}, fmt.Errorf("generating TOTP key: %w", err)
	}

	secret := key.Secret()
	if err := s.queries.SetTOTPSecret(ctx, userID, &secret, false); err != nil {
		return SetupTOTPResult{}, fmt.Errorf("storing TOTP secret: %w", err)
	}

	plainCodes, hashedCodes, err := generateRecoveryCodes(userID)
	if err != nil {
		return SetupTOTPResult{}, fmt.Errorf("generating recovery codes: %w", err)
	}

	if err := s.queries.DeleteRecoveryCodes(ctx, userID); err != nil {
		return SetupTOTPResult{}, fmt.Errorf("deleting old recovery codes: %w", err)
	}
	if _, err := s.queries.CreateRecoveryCodes(ctx, hashedCodes); err != nil {
		return SetupTOTPResult{}, fmt.Errorf("creating recovery codes: %w", err)
	}

	s.logger.Info("TOTP setup initiated", "user_id", userID)

	return SetupTOTPResult{
		Secret:        secret,
		ProvisionURI:  key.URL(),
		RecoveryCodes: plainCodes,
	}, nil
}

// EnableTOTP verifies the TOTP code and enables TOTP for the user.
func (s *AuthService) EnableTOTP(ctx context.Context, userID uuid.UUID, code string) error {
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return fmt.Errorf("fetching user: %w", err)
	}

	if user.TotpEnabled {
		return model.NewDomainError(model.ErrConflict, "TOTP is already enabled")
	}

	if user.TotpSecret == nil {
		return model.NewDomainError(model.ErrInvalidInput, "TOTP has not been set up yet")
	}

	if !totp.Validate(code, *user.TotpSecret) {
		return model.NewDomainError(model.ErrInvalidTOTP, "invalid TOTP code")
	}

	if err := s.queries.SetTOTPSecret(ctx, userID, user.TotpSecret, true); err != nil {
		return fmt.Errorf("enabling TOTP: %w", err)
	}

	s.logger.Info("TOTP enabled", "user_id", userID)
	return nil
}

// DisableTOTP verifies the TOTP code and disables TOTP for the user.
func (s *AuthService) DisableTOTP(ctx context.Context, userID uuid.UUID, code string) error {
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return fmt.Errorf("fetching user: %w", err)
	}

	if !user.TotpEnabled {
		return model.NewDomainError(model.ErrInvalidInput, "TOTP is not enabled")
	}

	if !totp.Validate(code, *user.TotpSecret) {
		return model.NewDomainError(model.ErrInvalidTOTP, "invalid TOTP code")
	}

	if err := s.queries.SetTOTPSecret(ctx, userID, nil, false); err != nil {
		return fmt.Errorf("disabling TOTP: %w", err)
	}

	if err := s.queries.DeleteRecoveryCodes(ctx, userID); err != nil {
		return fmt.Errorf("deleting recovery codes: %w", err)
	}

	s.logger.Info("TOTP disabled", "user_id", userID)
	return nil
}

// CreateTOTPPendingToken creates a pending token for two-step TOTP login.
func (s *AuthService) CreateTOTPPendingToken(ctx context.Context, userID uuid.UUID, ip, userAgent string) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("generating pending token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	data := totpPendingData{
		UserID:    userID.String(),
		IP:        ip,
		UserAgent: userAgent,
	}
	dataJSON, _ := json.Marshal(data)
	s.rdb.Set(ctx, totpPendingPrefix+token, string(dataJSON), totpPendingTTL)

	return token, nil
}

// VerifyTOTPLogin verifies a TOTP code (or recovery code) and creates a session.
func (s *AuthService) VerifyTOTPLogin(ctx context.Context, pendingToken, code string) (UserResponse, SessionInfo, error) {
	// Use Get (not GetDel) so the token survives failed attempts
	key := totpPendingPrefix + pendingToken
	dataJSON, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrUnauthorized, "invalid or expired pending token")
	}

	var data totpPendingData
	if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrUnauthorized, "invalid pending token data")
	}

	userID, err := uuid.Parse(data.UserID)
	if err != nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrUnauthorized, "invalid user in pending token")
	}

	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return UserResponse{}, SessionInfo{}, fmt.Errorf("fetching user: %w", err)
	}

	if !user.TotpEnabled || user.TotpSecret == nil {
		return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInvalidInput, "TOTP is not enabled for this user")
	}

	// Try TOTP code first
	if totp.Validate(code, *user.TotpSecret) {
		s.rdb.Del(ctx, key) // consume token on success
		session, err := s.createSession(ctx, user.ID, data.IP, data.UserAgent)
		if err != nil {
			return UserResponse{}, SessionInfo{}, err
		}
		s.logger.Info("TOTP login successful", "user_id", user.ID)
		return userToResponse(user), session, nil
	}

	// Try recovery code
	if s.tryRecoveryCode(ctx, user.ID, code) {
		s.rdb.Del(ctx, key) // consume token on success
		session, err := s.createSession(ctx, user.ID, data.IP, data.UserAgent)
		if err != nil {
			return UserResponse{}, SessionInfo{}, err
		}
		s.logger.Info("recovery code login", "user_id", user.ID)
		return userToResponse(user), session, nil
	}

	return UserResponse{}, SessionInfo{}, model.NewDomainError(model.ErrInvalidTOTP, "invalid TOTP code or recovery code")
}

// GetRecoveryCodeCount returns the number of unused recovery codes.
func (s *AuthService) GetRecoveryCodeCount(ctx context.Context, userID uuid.UUID) (int, error) {
	codes, err := s.queries.ListRecoveryCodes(ctx, userID)
	if err != nil {
		return 0, fmt.Errorf("listing recovery codes: %w", err)
	}
	return len(codes), nil
}

// RegenerateRecoveryCodes verifies TOTP and generates new recovery codes.
func (s *AuthService) RegenerateRecoveryCodes(ctx context.Context, userID uuid.UUID, code string) ([]string, error) {
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, model.NewDomainError(model.ErrNotFound, "user not found")
		}
		return nil, fmt.Errorf("fetching user: %w", err)
	}

	if !user.TotpEnabled || user.TotpSecret == nil {
		return nil, model.NewDomainError(model.ErrInvalidInput, "TOTP is not enabled")
	}

	if !totp.Validate(code, *user.TotpSecret) {
		return nil, model.NewDomainError(model.ErrInvalidTOTP, "invalid TOTP code")
	}

	plainCodes, hashedCodes, err := generateRecoveryCodes(userID)
	if err != nil {
		return nil, fmt.Errorf("generating recovery codes: %w", err)
	}

	if err := s.queries.DeleteRecoveryCodes(ctx, userID); err != nil {
		return nil, fmt.Errorf("deleting old recovery codes: %w", err)
	}
	if _, err := s.queries.CreateRecoveryCodes(ctx, hashedCodes); err != nil {
		return nil, fmt.Errorf("creating recovery codes: %w", err)
	}

	s.logger.Info("recovery codes regenerated", "user_id", userID)
	return plainCodes, nil
}

func (s *AuthService) tryRecoveryCode(ctx context.Context, userID uuid.UUID, code string) bool {
	codes, err := s.queries.ListRecoveryCodes(ctx, userID)
	if err != nil || len(codes) == 0 {
		return false
	}

	codeHash := hashRecoveryCode(code)
	for _, rc := range codes {
		if rc.CodeHash == codeHash {
			_ = s.queries.UseRecoveryCode(ctx, rc.ID, userID)
			return true
		}
	}
	return false
}

func generateRecoveryCodes(userID uuid.UUID) ([]string, []repository.CreateRecoveryCodesParams, error) {
	plainCodes := make([]string, recoveryCodeCount)
	hashedCodes := make([]repository.CreateRecoveryCodesParams, recoveryCodeCount)

	for i := 0; i < recoveryCodeCount; i++ {
		code, err := generateRandomCode(recoveryCodeLength)
		if err != nil {
			return nil, nil, err
		}
		plainCodes[i] = code
		hashedCodes[i] = repository.CreateRecoveryCodesParams{
			UserID:   userID,
			CodeHash: hashRecoveryCode(code),
		}
	}

	return plainCodes, hashedCodes, nil
}

func generateRandomCode(length int) (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	mid := length / 2
	return string(b[:mid]) + "-" + string(b[mid:]), nil
}

func hashRecoveryCode(code string) string {
	normalized := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(code)), "-", "")
	h := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(h[:])
}
