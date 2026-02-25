package model

import (
	"encoding/json"
	"errors"
	"net/http"
)

// APIResponse is the standard JSON response wrapper
type APIResponse struct {
	Data    any            `json:"data,omitempty"`
	Error   *APIError      `json:"error,omitempty"`
	Meta    *PaginationMeta `json:"meta,omitempty"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

type PaginationMeta struct {
	Total  int64 `json:"total"`
	Limit  int   `json:"limit"`
	Offset int   `json:"offset"`
}

// JSON writes a JSON response with the given status code
func JSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIResponse{Data: data})
}

// JSONList writes a JSON list response with pagination metadata
func JSONList(w http.ResponseWriter, data any, total int64, limit, offset int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(APIResponse{
		Data: data,
		Meta: &PaginationMeta{Total: total, Limit: limit, Offset: offset},
	})
}

// ErrorResponse writes a JSON error response, mapping domain errors to HTTP status codes
func ErrorResponse(w http.ResponseWriter, err error) {
	var domainErr *DomainError
	if errors.As(err, &domainErr) {
		status := domainErrorToStatus(domainErr.Err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(APIResponse{
			Error: &APIError{
				Code:    domainErr.Err.Error(),
				Message: domainErr.Message,
				Field:   domainErr.Field,
			},
		})
		return
	}

	status := domainErrorToStatus(err)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	// Do not expose internal error details on 5xx responses
	msg := err.Error()
	if status >= 500 {
		msg = "internal server error"
	}

	json.NewEncoder(w).Encode(APIResponse{
		Error: &APIError{
			Code:    "internal_error",
			Message: msg,
		},
	})
}

func domainErrorToStatus(err error) int {
	switch {
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrAlreadyExists):
		return http.StatusConflict
	case errors.Is(err, ErrConflict):
		return http.StatusConflict
	case errors.Is(err, ErrUnauthorized):
		return http.StatusUnauthorized
	case errors.Is(err, ErrForbidden):
		return http.StatusForbidden
	case errors.Is(err, ErrInvalidInput):
		return http.StatusBadRequest
	case errors.Is(err, ErrEventLocked):
		return http.StatusForbidden
	case errors.Is(err, ErrOverbooking):
		return http.StatusConflict
	case errors.Is(err, ErrInactiveAccount):
		return http.StatusForbidden
	case errors.Is(err, ErrDummyAccount):
		return http.StatusForbidden
	case errors.Is(err, ErrInvalidTOTP):
		return http.StatusUnauthorized
	case errors.Is(err, ErrTOTPRequired):
		return http.StatusUnauthorized
	case errors.Is(err, ErrTooManyRequests):
		return http.StatusTooManyRequests
	default:
		return http.StatusInternalServerError
	}
}
