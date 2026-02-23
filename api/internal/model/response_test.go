package model

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDomainErrorToStatus(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected int
	}{
		{"not found", ErrNotFound, http.StatusNotFound},
		{"already exists", ErrAlreadyExists, http.StatusConflict},
		{"conflict", ErrConflict, http.StatusConflict},
		{"unauthorized", ErrUnauthorized, http.StatusUnauthorized},
		{"forbidden", ErrForbidden, http.StatusForbidden},
		{"invalid input", ErrInvalidInput, http.StatusBadRequest},
		{"event locked", ErrEventLocked, http.StatusForbidden},
		{"overbooking", ErrOverbooking, http.StatusConflict},
		{"inactive account", ErrInactiveAccount, http.StatusForbidden},
		{"dummy account", ErrDummyAccount, http.StatusForbidden},
		{"invalid totp", ErrInvalidTOTP, http.StatusUnauthorized},
		{"totp required", ErrTOTPRequired, http.StatusUnauthorized},
		{"too many requests", ErrTooManyRequests, http.StatusTooManyRequests},
		{"unknown error", errors.New("unknown"), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status := domainErrorToStatus(tt.err)
			if status != tt.expected {
				t.Errorf("domainErrorToStatus(%v) = %d, want %d", tt.err, status, tt.expected)
			}
		})
	}
}

func TestDomainErrorWrapping(t *testing.T) {
	err := NewDomainError(ErrNotFound, "user not found")

	if err.Error() != "user not found" {
		t.Errorf("Error() = %q, want %q", err.Error(), "user not found")
	}

	if !errors.Is(err, ErrNotFound) {
		t.Error("should unwrap to ErrNotFound")
	}

	status := domainErrorToStatus(err.Unwrap())
	if status != http.StatusNotFound {
		t.Errorf("expected 404, got %d", status)
	}
}

func TestFieldError(t *testing.T) {
	err := NewFieldError(ErrInvalidInput, "email", "invalid format")

	if err.Field != "email" {
		t.Errorf("Field = %q, want %q", err.Field, "email")
	}
	if err.Message != "invalid format" {
		t.Errorf("Message = %q, want %q", err.Message, "invalid format")
	}
	if !errors.Is(err, ErrInvalidInput) {
		t.Error("should unwrap to ErrInvalidInput")
	}
}

func TestJSONResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	JSON(rec, http.StatusOK, map[string]string{"hello": "world"})

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/json")
	}

	var resp APIResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Error != nil {
		t.Error("expected no error in response")
	}
}

func TestJSONListResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	JSONList(rec, []string{"a", "b"}, 100, 10, 0)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp APIResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Meta == nil {
		t.Fatal("expected meta in response")
	}
	if resp.Meta.Total != 100 {
		t.Errorf("meta.total = %d, want 100", resp.Meta.Total)
	}
	if resp.Meta.Limit != 10 {
		t.Errorf("meta.limit = %d, want 10", resp.Meta.Limit)
	}
}

func TestErrorResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	ErrorResponse(rec, NewDomainError(ErrNotFound, "event not found"))

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}

	var resp APIResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Error == nil {
		t.Fatal("expected error in response")
	}
	if resp.Error.Code != "not_found" {
		t.Errorf("error.code = %q, want %q", resp.Error.Code, "not_found")
	}
	if resp.Error.Message != "event not found" {
		t.Errorf("error.message = %q, want %q", resp.Error.Message, "event not found")
	}
}

func TestErrorResponseWithFieldError(t *testing.T) {
	rec := httptest.NewRecorder()
	ErrorResponse(rec, NewFieldError(ErrInvalidInput, "email", "invalid email format"))

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp APIResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Error.Field != "email" {
		t.Errorf("error.field = %q, want %q", resp.Error.Field, "email")
	}
}
