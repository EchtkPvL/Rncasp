package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type UserHandler struct {
	userService *service.UserService
}

func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

// Request types

type createUserRequest struct {
	AccountType string  `json:"account_type"`
	Username    string  `json:"username"`
	FullName    string  `json:"full_name"`
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
	Password    *string `json:"password"`
	Role        *string `json:"role"`
}

type createDummyRequest struct {
	Username    string  `json:"username"`
	FullName    string  `json:"full_name"`
	DisplayName *string `json:"display_name"`
}

type updateDummyRequest struct {
	FullName    *string `json:"full_name"`
	DisplayName *string `json:"display_name"`
}

type updateUserRequest struct {
	Role        *string `json:"role"`
	IsActive    *bool   `json:"is_active"`
	FullName    *string `json:"full_name"`
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
	Password    *string `json:"password"`
	TimeFormat  *string `json:"time_format"`
	Username    *string `json:"username"`
	AccountType *string `json:"account_type"`
}

// List returns users with optional filters.
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	role := r.URL.Query().Get("role")
	accountType := r.URL.Query().Get("account_type")
	excludeAccountType := r.URL.Query().Get("exclude_account_type")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := int32(50)
	offset := int32(0)
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil {
			limit = int32(v)
		}
	}
	if offsetStr != "" {
		if v, err := strconv.Atoi(offsetStr); err == nil {
			offset = int32(v)
		}
	}

	var rolePtr, accountTypePtr, excludeAccountTypePtr *string
	if role != "" {
		rolePtr = &role
	}
	if accountType != "" {
		accountTypePtr = &accountType
	}
	if excludeAccountType != "" {
		excludeAccountTypePtr = &excludeAccountType
	}

	result, err := h.userService.ListUsers(r.Context(), rolePtr, accountTypePtr, excludeAccountTypePtr, limit, offset)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, result)
}

// Create creates a new user (super-admin only).
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	user, err := h.userService.CreateUser(r.Context(), service.CreateUserInput{
		AccountType: req.AccountType,
		Username:    req.Username,
		FullName:    req.FullName,
		DisplayName: req.DisplayName,
		Email:       req.Email,
		Password:    req.Password,
		Role:        req.Role,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, user)
}

// Search searches users by query string.
func (h *UserHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := int32(50)
	offset := int32(0)
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil {
			limit = int32(v)
		}
	}
	if offsetStr != "" {
		if v, err := strconv.Atoi(offsetStr); err == nil {
			offset = int32(v)
		}
	}

	users, err := h.userService.SearchUsers(r.Context(), query, limit, offset)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, users)
}

// GetByID returns a single user.
func (h *UserHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid user ID"))
		return
	}

	user, err := h.userService.GetByID(r.Context(), id)
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, user)
}

// UpdateUser updates a user's profile (super-admin only).
func (h *UserHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid user ID"))
		return
	}

	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	user, err := h.userService.UpdateUser(r.Context(), id, service.UpdateUserInput{
		Role:        req.Role,
		IsActive:    req.IsActive,
		FullName:    req.FullName,
		DisplayName: req.DisplayName,
		Email:       req.Email,
		Password:    req.Password,
		TimeFormat:  req.TimeFormat,
		Username:    req.Username,
		AccountType: req.AccountType,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, user)
}

// CreateDummy creates a dummy account (super-admin only).
func (h *UserHandler) CreateDummy(w http.ResponseWriter, r *http.Request) {
	var req createDummyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	user, err := h.userService.CreateDummyAccount(r.Context(), service.CreateDummyAccountInput{
		Username:    req.Username,
		FullName:    req.FullName,
		DisplayName: req.DisplayName,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusCreated, user)
}

// UpdateDummy updates a dummy account (super-admin only).
func (h *UserHandler) UpdateDummy(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid user ID"))
		return
	}

	var req updateDummyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid request body"))
		return
	}

	user, err := h.userService.UpdateDummyAccount(r.Context(), id, service.UpdateDummyAccountInput{
		FullName:    req.FullName,
		DisplayName: req.DisplayName,
	})
	if err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, user)
}

// DeleteDummy deletes a dummy account (super-admin only).
func (h *UserHandler) DeleteDummy(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrInvalidInput, "invalid user ID"))
		return
	}

	if err := h.userService.DeleteDummyAccount(r.Context(), id); err != nil {
		model.ErrorResponse(w, err)
		return
	}
	model.JSON(w, http.StatusOK, map[string]string{"message": "dummy account deleted"})
}
