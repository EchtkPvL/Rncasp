package model

import "errors"

// Domain errors - used by services, mapped to HTTP status codes by handlers
var (
	ErrNotFound         = errors.New("not_found")
	ErrAlreadyExists    = errors.New("already_exists")
	ErrUnauthorized     = errors.New("unauthorized")
	ErrForbidden        = errors.New("forbidden")
	ErrInvalidInput     = errors.New("invalid_input")
	ErrEventLocked      = errors.New("event_locked")
	ErrConflict         = errors.New("conflict")
	ErrOverbooking      = errors.New("overbooking_not_allowed")
	ErrInactiveAccount  = errors.New("account_inactive")
	ErrDummyAccount     = errors.New("dummy_account_cannot_login")
	ErrInvalidTOTP      = errors.New("invalid_totp_code")
	ErrTOTPRequired     = errors.New("totp_required")
	ErrTooManyRequests  = errors.New("too_many_requests")
)

// DomainError wraps a domain error with additional context
type DomainError struct {
	Err     error
	Message string
	Field   string
}

func (e *DomainError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return e.Err.Error()
}

func (e *DomainError) Unwrap() error {
	return e.Err
}

func NewDomainError(err error, message string) *DomainError {
	return &DomainError{Err: err, Message: message}
}

func NewFieldError(err error, field, message string) *DomainError {
	return &DomainError{Err: err, Field: field, Message: message}
}
