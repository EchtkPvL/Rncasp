package service

import (
	"errors"
	"testing"

	"github.com/echtkpvl/rncasp/internal/model"
)

func TestValidateTeamInput(t *testing.T) {
	tests := []struct {
		name         string
		teamName     string
		abbreviation string
		color        string
		wantErr      bool
		wantField    string
	}{
		{
			name:         "valid input",
			teamName:     "Bar",
			abbreviation: "B",
			color:        "#3B82F6",
			wantErr:      false,
		},
		{
			name:         "empty name",
			teamName:     "",
			abbreviation: "B",
			color:        "#3B82F6",
			wantErr:      true,
			wantField:    "name",
		},
		{
			name:         "name too long",
			teamName:     string(make([]byte, 101)),
			abbreviation: "B",
			color:        "#3B82F6",
			wantErr:      true,
			wantField:    "name",
		},
		{
			name:         "empty abbreviation",
			teamName:     "Bar",
			abbreviation: "",
			color:        "#3B82F6",
			wantErr:      true,
			wantField:    "abbreviation",
		},
		{
			name:         "abbreviation too long",
			teamName:     "Bar",
			abbreviation: "12345678901",
			color:        "#3B82F6",
			wantErr:      true,
			wantField:    "abbreviation",
		},
		{
			name:         "empty color",
			teamName:     "Bar",
			abbreviation: "B",
			color:        "",
			wantErr:      true,
			wantField:    "color",
		},
		{
			name:         "invalid color format - no hash",
			teamName:     "Bar",
			abbreviation: "B",
			color:        "3B82F6",
			wantErr:      true,
			wantField:    "color",
		},
		{
			name:         "invalid color format - short",
			teamName:     "Bar",
			abbreviation: "B",
			color:        "#FFF",
			wantErr:      true,
			wantField:    "color",
		},
		{
			name:         "invalid color format - non-hex",
			teamName:     "Bar",
			abbreviation: "B",
			color:        "#GGGGGG",
			wantErr:      true,
			wantField:    "color",
		},
		{
			name:         "valid lowercase hex color",
			teamName:     "Bar",
			abbreviation: "B",
			color:        "#ff5733",
			wantErr:      false,
		},
		{
			name:         "max length abbreviation",
			teamName:     "Bar",
			abbreviation: "1234567890",
			color:        "#FF5733",
			wantErr:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTeamInput(tt.teamName, tt.abbreviation, tt.color)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				var domainErr *model.DomainError
				if !errors.As(err, &domainErr) {
					t.Fatalf("expected DomainError, got %T", err)
				}
				if tt.wantField != "" && domainErr.Field != tt.wantField {
					t.Errorf("field = %q, want %q", domainErr.Field, tt.wantField)
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			}
		})
	}
}
