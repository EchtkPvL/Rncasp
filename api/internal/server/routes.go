package server

import (
	"net/http"
	"time"

	"github.com/echtkpvl/rncasp/internal/handler"
	"github.com/echtkpvl/rncasp/internal/pdf"
	"github.com/echtkpvl/rncasp/internal/repository"
	"github.com/echtkpvl/rncasp/internal/server/middleware"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/echtkpvl/rncasp/internal/sse"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func (s *Server) setupRoutes() http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger(s.logger))
	r.Use(chimiddleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.cfg.App.CORSAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Initialize repository
	queries := repository.New(s.db)

	// Initialize SSE broker (Redis Pub/Sub for multi-instance support)
	sseBroker := sse.NewBroker(s.rdb, s.logger)
	s.sseBroker = sseBroker

	// Initialize services
	authService := service.NewAuthService(queries, s.rdb, &s.cfg.Auth, &s.cfg.App, s.logger)
	oauthService := service.NewOAuthService(queries, s.rdb, &s.cfg.App, &s.cfg.Auth, s.logger)
	teamService := service.NewTeamService(queries, s.logger)
	notificationService := service.NewNotificationService(queries, s.logger)
	webhookService := service.NewWebhookService(queries, s.logger)
	smtpService := service.NewSMTPService(queries, s.logger)
	availabilityService := service.NewAvailabilityService(queries, s.logger)
	userService := service.NewUserService(queries, s.logger)
	pdfGen := pdf.NewPDFGenerator(s.logger)
	exportService := service.NewExportService(queries, s.logger, pdfGen)
	auditService := service.NewAuditService(queries, s.logger)
	appSettingsService := service.NewAppSettingsService(queries, s.logger)
	eventService := service.NewEventService(queries, s.logger, sseBroker)
	shiftService := service.NewShiftService(queries, s.logger, sseBroker)

	// Wire notification, webhook, and audit triggers into event/shift services
	eventService.SetNotificationService(notificationService)
	eventService.SetWebhookService(webhookService)
	eventService.SetAuditService(auditService)
	shiftService.SetNotificationService(notificationService)
	shiftService.SetWebhookService(webhookService)
	shiftService.SetAuditService(auditService)

	// Initialize handlers
	healthHandler := handler.NewHealthHandler(s.db, s.rdb)
	authHandler := handler.NewAuthHandler(authService, &s.cfg.Auth, s.cfg.IsDev())
	oauthHandler := handler.NewOAuthHandler(oauthService, &s.cfg.Auth, &s.cfg.App)
	teamHandler := handler.NewTeamHandler(teamService)
	eventHandler := handler.NewEventHandler(eventService)
	shiftHandler := handler.NewShiftHandler(shiftService)
	sseHandler := handler.NewSSEHandler(sseBroker)
	notificationHandler := handler.NewNotificationHandler(notificationService)
	webhookHandler := handler.NewWebhookHandler(webhookService, eventService)
	smtpHandler := handler.NewSMTPHandler(smtpService)
	availabilityHandler := handler.NewAvailabilityHandler(availabilityService)
	userHandler := handler.NewUserHandler(userService)
	exportHandler := handler.NewExportHandler(exportService, s.cfg.App.BaseURL)
	auditHandler := handler.NewAuditHandler(auditService)
	adminHandler := handler.NewAdminHandler(appSettingsService)
	publicHandler := handler.NewPublicHandler(eventService, shiftService, exportService)

	// Authentication middleware (extracts user from cookie, does not reject)
	r.Use(middleware.Authenticate(authService, s.cfg.Auth.CookieName))

	r.Route("/api", func(r chi.Router) {
		// Public endpoints
		r.Get("/health", healthHandler.Health)

		// SSE endpoint (authenticated)
		r.With(middleware.RequireAuth).Get("/sse", sseHandler.Subscribe)

		// Rate limiter for auth endpoints (20 attempts per minute per IP)
		authRateLimit := middleware.RateLimit(20, 1*time.Minute)

		// Auth endpoints
		r.Route("/auth", func(r chi.Router) {
			r.With(authRateLimit).Post("/register", authHandler.Register)
			r.With(authRateLimit).Post("/login", authHandler.Login)
			r.Post("/logout", authHandler.Logout)
			r.With(middleware.RequireAuth).Get("/me", authHandler.Me)
		r.With(middleware.RequireAuth).Put("/me", authHandler.UpdateProfile)

			// TOTP 2FA
			r.With(authRateLimit).Post("/totp/verify", authHandler.VerifyTOTP)
			r.With(middleware.RequireAuth).Post("/totp/setup", authHandler.SetupTOTP)
			r.With(middleware.RequireAuth).Post("/totp/enable", authHandler.EnableTOTP)
			r.With(middleware.RequireAuth).Post("/totp/disable", authHandler.DisableTOTP)
			r.With(middleware.RequireAuth).Get("/totp/recovery-codes", authHandler.GetRecoveryCodeCount)
			r.With(middleware.RequireAuth).Post("/totp/recovery-codes", authHandler.RegenerateRecoveryCodes)

			// OAuth2 flow (public endpoints - no auth required for authorize/callback)
			r.Get("/oauth/providers", oauthHandler.ListEnabledProviders)
			r.Get("/oauth/{provider}/authorize", oauthHandler.Authorize)
			r.Get("/oauth/{provider}/callback", oauthHandler.Callback)

			// OAuth connection management (requires auth)
			r.With(middleware.RequireAuth).Get("/oauth/connections", oauthHandler.ListConnections)
			r.With(middleware.RequireAuth).Delete("/oauth/connections/{connectionId}", oauthHandler.UnlinkConnection)
		})

		// OAuth provider management (super-admin only)
		r.Route("/oauth/providers", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Use(middleware.RequireSuperAdmin)
			r.Get("/", oauthHandler.ListProviders)
			r.Post("/", oauthHandler.CreateProvider)
			r.Get("/{providerId}", oauthHandler.GetProvider)
			r.Put("/{providerId}", oauthHandler.UpdateProvider)
			r.Delete("/{providerId}", oauthHandler.DeleteProvider)
		})

		// Teams endpoints
		r.Route("/teams", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", teamHandler.List)
			r.Get("/{id}", teamHandler.GetByID)

			// CUD operations require super-admin
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireSuperAdmin)
				r.Post("/", teamHandler.Create)
				r.Put("/{id}", teamHandler.Update)
				r.Delete("/{id}", teamHandler.Delete)
			})
		})

		// Notifications endpoints (authenticated)
		r.Route("/notifications", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", notificationHandler.List)
			r.Get("/unread-count", notificationHandler.CountUnread)
			r.Post("/{notificationId}/read", notificationHandler.MarkRead)
			r.Post("/read-all", notificationHandler.MarkAllRead)
			r.Get("/preferences", notificationHandler.GetPreferences)
			r.Put("/preferences", notificationHandler.UpdatePreference)
		})

		// SMTP configuration (super-admin only)
		r.Route("/smtp", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Use(middleware.RequireSuperAdmin)
			r.Get("/", smtpHandler.GetConfig)
			r.Put("/", smtpHandler.UpdateConfig)
			r.Post("/test", smtpHandler.TestConnection)
		})

		// Users endpoints (authenticated)
		r.Route("/users", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", userHandler.List)
			r.Get("/search", userHandler.Search)
			r.Get("/me/shifts", shiftHandler.ListByUser)
			r.Get("/{userId}", userHandler.GetByID)

			// User management: super-admin only
			r.With(middleware.RequireSuperAdmin).Put("/{userId}", userHandler.UpdateUser)

			// Dummy accounts: super-admin only
			r.With(middleware.RequireSuperAdmin).Post("/dummy", userHandler.CreateDummy)
			r.With(middleware.RequireSuperAdmin).Put("/dummy/{userId}", userHandler.UpdateDummy)
			r.With(middleware.RequireSuperAdmin).Delete("/dummy/{userId}", userHandler.DeleteDummy)
		})

		// iCal token management (authenticated)
		r.Route("/ical-tokens", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", exportHandler.ListTokens)
			r.Post("/", exportHandler.CreateToken)
			r.Delete("/{tokenId}", exportHandler.RevokeToken)
		})

		// Audit log (super-admin only)
		r.With(middleware.RequireAuth, middleware.RequireSuperAdmin).Get("/audit-log", auditHandler.List)

		// Admin: app settings + dashboard (super-admin only)
		r.Route("/admin", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Use(middleware.RequireSuperAdmin)
			r.Get("/settings", adminHandler.ListSettings)
			r.Get("/settings/{key}", adminHandler.GetSetting)
			r.Put("/settings/{key}", adminHandler.SetSetting)
			r.Delete("/settings/{key}", adminHandler.DeleteSetting)
			r.Get("/stats", adminHandler.DashboardStats)
		})

		// Public app settings (no auth - needed for login page, color palette, etc.)
		r.Get("/settings/public", adminHandler.ListSettings)

		// Public event access (no auth required)
		r.Route("/public/events/{slug}", func(r chi.Router) {
			r.Get("/", publicHandler.GetEvent)
			r.Get("/grid", publicHandler.GetGrid)
			r.Get("/export/csv", publicHandler.ExportCSV)
			r.Get("/export/ical", publicHandler.ExportICal)
			r.Get("/export/pdf", publicHandler.ExportPDF)
		})

		// Events endpoints
		r.Route("/events", func(r chi.Router) {
			r.Use(middleware.RequireAuth)
			r.Get("/", eventHandler.List)
			// Create/delete events: super-admin only
			r.With(middleware.RequireSuperAdmin).Post("/", eventHandler.Create)

			// Per-event management
			r.Route("/{slug}", func(r chi.Router) {
				r.Get("/", eventHandler.GetBySlug)
				r.With(middleware.RequireSuperAdmin).Delete("/", eventHandler.Delete)
				r.With(middleware.RequireEventAdminOrSuperAdmin(eventService)).Put("/", eventHandler.Update)

				// SSE for this event
				r.Get("/sse", sseHandler.Subscribe)

				// Lock/public toggles: super-admin only
				r.With(middleware.RequireSuperAdmin).Put("/lock", eventHandler.SetLocked)
				r.With(middleware.RequireSuperAdmin).Put("/public", eventHandler.SetPublic)

				// Team visibility: any authenticated user can read, admins can modify
				r.Get("/teams", eventHandler.ListTeams)
				r.With(middleware.RequireEventAdminOrSuperAdmin(eventService)).Post("/teams", eventHandler.SetTeam)
				r.With(middleware.RequireEventAdminOrSuperAdmin(eventService)).Delete("/teams/{teamId}", eventHandler.RemoveTeam)

				// Admin management: super-admin only
				r.With(middleware.RequireSuperAdmin).Get("/admins", eventHandler.ListAdmins)
				r.With(middleware.RequireSuperAdmin).Post("/admins", eventHandler.AddAdmin)
				r.With(middleware.RequireSuperAdmin).Delete("/admins/{userId}", eventHandler.RemoveAdmin)

				// Hidden hours: any authenticated user can read, admins can modify
				r.Get("/hidden-ranges", eventHandler.ListHiddenRanges)
				r.With(middleware.RequireEventAdminOrSuperAdmin(eventService)).Put("/hidden-ranges", eventHandler.SetHiddenRanges)

				// Shifts: any authenticated user can read, create (with permission checks in service)
				r.Get("/shifts", shiftHandler.ListByEvent)
				r.Post("/shifts", shiftHandler.Create)
				r.Get("/shifts/{shiftId}", shiftHandler.GetByID)
				r.Put("/shifts/{shiftId}", shiftHandler.Update)
				r.Delete("/shifts/{shiftId}", shiftHandler.Delete)

				// Grid data: optimized endpoint for grid rendering
				r.Get("/grid", shiftHandler.GridData)

				// Coverage requirements: event admin or super-admin for CUD
				r.Get("/coverage", shiftHandler.ListCoverage)
				r.With(middleware.RequireEventAdminOrSuperAdmin(shiftService)).Post("/coverage", shiftHandler.CreateCoverage)
				r.With(middleware.RequireEventAdminOrSuperAdmin(shiftService)).Put("/coverage/{coverageId}", shiftHandler.UpdateCoverage)
				r.With(middleware.RequireEventAdminOrSuperAdmin(shiftService)).Delete("/coverage/{coverageId}", shiftHandler.DeleteCoverage)
				r.With(middleware.RequireEventAdminOrSuperAdmin(shiftService)).Delete("/coverage/team/{teamId}", shiftHandler.DeleteCoverageByTeam)

				// Availability: users manage own, admins manage all
				r.Get("/availability", availabilityHandler.ListByEvent)
				r.Get("/availability/mine", availabilityHandler.ListMine)
				r.Put("/availability/mine", availabilityHandler.SetMine)
				r.With(middleware.RequireEventAdminOrSuperAdmin(eventService)).Put("/availability/{userId}", availabilityHandler.SetForUser)

				// Export: CSV and iCal downloads
				r.Get("/export/csv", exportHandler.ExportCSV)
				r.Get("/export/ical", exportHandler.ExportICal)
				r.Get("/export/pdf", exportHandler.ExportPDF)

				// Webhooks: event admin or super-admin
				r.Route("/webhooks", func(r chi.Router) {
					r.Use(middleware.RequireEventAdminOrSuperAdmin(eventService))
					r.Get("/", webhookHandler.List)
					r.Post("/", webhookHandler.Create)
					r.Put("/{webhookId}", webhookHandler.Update)
					r.Delete("/{webhookId}", webhookHandler.Delete)
				})
			})
		})
	})

	// iCal subscription feeds — outside /api for clean calendar URLs
	r.Get("/ical/{tokenId}/{token}", exportHandler.ServeICalFeed)
	r.Get("/ical/user/{uuid}/{token}", exportHandler.ServeICalFeed)
	r.Get("/ical/event/{slug}/all/{token}", exportHandler.ServeICalFeed)
	r.Get("/ical/event/{slug}/{teamAbbr}/{token}", exportHandler.ServeICalFeed)

	return r
}
