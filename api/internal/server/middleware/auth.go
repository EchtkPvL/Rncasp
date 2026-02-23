package middleware

import (
	"context"
	"net/http"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	userIDKey   contextKey = "user_id"
	usernameKey contextKey = "username"
	roleKey     contextKey = "role"
)

// Authenticate extracts the session token from the cookie and validates it.
// If valid, it injects user info into the request context.
// It does NOT reject unauthenticated requests - use RequireAuth for that.
func Authenticate(authService *service.AuthService, cookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(cookieName)
			if err != nil {
				// No cookie = anonymous request, continue without user context
				next.ServeHTTP(w, r)
				return
			}

			session, err := authService.ValidateSession(r.Context(), cookie.Value)
			if err != nil {
				// Invalid session = treat as anonymous
				next.ServeHTTP(w, r)
				return
			}

			// Inject user info into context
			ctx := r.Context()
			ctx = context.WithValue(ctx, userIDKey, session.UserID)
			ctx = context.WithValue(ctx, usernameKey, session.Username)
			ctx = context.WithValue(ctx, roleKey, session.Role)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAuth rejects unauthenticated requests with 401.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if GetUserID(r.Context()) == nil {
			model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "authentication required"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireSuperAdmin rejects requests from non-super-admin users with 403.
func RequireSuperAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role := GetRole(r.Context())
		if role != "super_admin" {
			model.ErrorResponse(w, model.NewDomainError(model.ErrForbidden, "super admin access required"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireRole rejects requests from users without one of the specified roles.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	roleSet := make(map[string]bool, len(roles))
	for _, r := range roles {
		roleSet[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := GetRole(r.Context())
			if !roleSet[role] {
				model.ErrorResponse(w, model.NewDomainError(model.ErrForbidden, "insufficient permissions"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireEventAdminOrSuperAdmin allows super-admins and event admins for the event
// identified by the {slug} URL parameter. Other users get 403.
func RequireEventAdminOrSuperAdmin(eventService EventAdminChecker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := GetRole(r.Context())
			if role == "super_admin" {
				next.ServeHTTP(w, r)
				return
			}

			userID := GetUserID(r.Context())
			if userID == nil {
				model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "authentication required"))
				return
			}

			slug := chi.URLParam(r, "slug")
			isAdmin, err := eventService.IsEventAdmin(r.Context(), slug, *userID)
			if err != nil || !isAdmin {
				model.ErrorResponse(w, model.NewDomainError(model.ErrForbidden, "event admin access required"))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// EventAdminChecker is an interface for checking event admin status.
type EventAdminChecker interface {
	IsEventAdmin(ctx context.Context, slug string, userID uuid.UUID) (bool, error)
}

// GetUserID returns the authenticated user's ID from context, or nil if not authenticated.
func GetUserID(ctx context.Context) *uuid.UUID {
	v, ok := ctx.Value(userIDKey).(uuid.UUID)
	if !ok {
		return nil
	}
	return &v
}

// GetUsername returns the authenticated user's username from context.
func GetUsername(ctx context.Context) string {
	v, _ := ctx.Value(usernameKey).(string)
	return v
}

// GetRole returns the authenticated user's role from context.
func GetRole(ctx context.Context) string {
	v, _ := ctx.Value(roleKey).(string)
	return v
}
