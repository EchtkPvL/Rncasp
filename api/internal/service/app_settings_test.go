package service

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/echtkpvl/rncasp/internal/repository"
)

func TestAppSettingToResponse(t *testing.T) {
	now := time.Date(2025, 6, 15, 12, 0, 0, 0, time.UTC)
	setting := repository.AppSetting{
		Key:       "app_name",
		Value:     json.RawMessage(`"Rncasp"`),
		UpdatedAt: now,
	}

	resp := appSettingToResponse(setting)

	if resp.Key != "app_name" {
		t.Errorf("Key = %q, want %q", resp.Key, "app_name")
	}
	if resp.UpdatedAt != "2025-06-15T12:00:00Z" {
		t.Errorf("UpdatedAt = %q, want %q", resp.UpdatedAt, "2025-06-15T12:00:00Z")
	}

	var value string
	if err := json.Unmarshal(resp.Value, &value); err != nil {
		t.Fatalf("failed to unmarshal value: %v", err)
	}
	if value != "Rncasp" {
		t.Errorf("value = %q, want %q", value, "Rncasp")
	}
}

func TestAppSettingToResponseBoolean(t *testing.T) {
	now := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	setting := repository.AppSetting{
		Key:       "registration_enabled",
		Value:     json.RawMessage(`true`),
		UpdatedAt: now,
	}

	resp := appSettingToResponse(setting)

	var value bool
	if err := json.Unmarshal(resp.Value, &value); err != nil {
		t.Fatalf("failed to unmarshal value: %v", err)
	}
	if !value {
		t.Error("expected true")
	}
}

func TestAppSettingToResponseObject(t *testing.T) {
	now := time.Now()
	palette := map[string]string{
		"primary":    "#e26729",
		"background": "#303030",
	}
	paletteJSON, _ := json.Marshal(palette)

	setting := repository.AppSetting{
		Key:       "color_palette",
		Value:     paletteJSON,
		UpdatedAt: now,
	}

	resp := appSettingToResponse(setting)

	var result map[string]string
	if err := json.Unmarshal(resp.Value, &result); err != nil {
		t.Fatalf("failed to unmarshal value: %v", err)
	}
	if result["primary"] != "#e26729" {
		t.Errorf("primary = %q, want %q", result["primary"], "#e26729")
	}
}

func TestDashboardStatsFields(t *testing.T) {
	stats := DashboardStats{
		TotalUsers:   42,
		TotalEvents:  5,
		ActiveEvents: 2,
		TotalShifts:  150,
		TotalTeams:   8,
	}

	data, err := json.Marshal(stats)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var result map[string]int64
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	expected := map[string]int64{
		"total_users":   42,
		"total_events":  5,
		"active_events": 2,
		"total_shifts":  150,
		"total_teams":   8,
	}

	for key, want := range expected {
		if got := result[key]; got != want {
			t.Errorf("%s = %d, want %d", key, got, want)
		}
	}
}
