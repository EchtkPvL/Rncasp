package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/go-chi/chi/v5"
)

func withChiURLParam(r *http.Request, key, value string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestTeamHandler_Create_InvalidJSON(t *testing.T) {
	h := &TeamHandler{} // nil service — handler returns before calling it on bad JSON

	req := httptest.NewRequest(http.MethodPost, "/api/teams", strings.NewReader("not json"))
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp model.APIResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error in response")
	}
	if resp.Error.Code != "invalid_input" {
		t.Errorf("error code = %q, want %q", resp.Error.Code, "invalid_input")
	}
}

func TestTeamHandler_Update_InvalidJSON(t *testing.T) {
	h := &TeamHandler{}

	req := httptest.NewRequest(http.MethodPut, "/api/teams/550e8400-e29b-41d4-a716-446655440000", strings.NewReader("bad"))
	req = withChiURLParam(req, "id", "550e8400-e29b-41d4-a716-446655440000")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestTeamHandler_GetByID_InvalidUUID(t *testing.T) {
	h := &TeamHandler{}

	req := httptest.NewRequest(http.MethodGet, "/api/teams/not-a-uuid", nil)
	req = withChiURLParam(req, "id", "not-a-uuid")
	rec := httptest.NewRecorder()

	h.GetByID(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var resp model.APIResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error in response")
	}
	if resp.Error.Code != "invalid_input" {
		t.Errorf("error code = %q, want %q", resp.Error.Code, "invalid_input")
	}
}

func TestTeamHandler_Delete_InvalidUUID(t *testing.T) {
	h := &TeamHandler{}

	req := httptest.NewRequest(http.MethodDelete, "/api/teams/xyz", nil)
	req = withChiURLParam(req, "id", "xyz")
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestTeamHandler_Update_InvalidUUID(t *testing.T) {
	h := &TeamHandler{}

	req := httptest.NewRequest(http.MethodPut, "/api/teams/bad-id", strings.NewReader(`{"name":"test"}`))
	req = withChiURLParam(req, "id", "bad-id")
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}
