package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/echtkpvl/rncasp/internal/config"
	"github.com/echtkpvl/rncasp/internal/sse"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Server struct {
	cfg       *config.Config
	db        *pgxpool.Pool
	rdb       *redis.Client
	router    http.Handler
	logger    *slog.Logger
	sseBroker *sse.Broker
}

func New(cfg *config.Config, logger *slog.Logger) (*Server, error) {
	s := &Server{
		cfg:    cfg,
		logger: logger,
	}

	// Connect to PostgreSQL
	dbPool, err := pgxpool.New(context.Background(), cfg.Database.DSN())
	if err != nil {
		return nil, fmt.Errorf("connecting to database: %w", err)
	}
	if err := dbPool.Ping(context.Background()); err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}
	s.db = dbPool
	logger.Info("connected to PostgreSQL", "host", cfg.Database.Host, "db", cfg.Database.Name)

	// Connect to Redis
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.Addr(),
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("connecting to redis: %w", err)
	}
	s.rdb = rdb
	logger.Info("connected to Redis", "addr", cfg.Redis.Addr())

	// Setup routes
	s.router = s.setupRoutes()

	return s, nil
}

func (s *Server) Start() error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Server.Host, s.cfg.Server.Port)

	srv := &http.Server{
		Addr:         addr,
		Handler:      s.router,
		ReadTimeout:  s.cfg.Server.ReadTimeout,
		WriteTimeout: s.cfg.Server.WriteTimeout,
		IdleTimeout:  s.cfg.Server.IdleTimeout,
	}

	// Graceful shutdown
	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("server starting", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		return fmt.Errorf("server error: %w", err)
	case sig := <-quit:
		s.logger.Info("shutting down server", "signal", sig.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		return fmt.Errorf("server shutdown: %w", err)
	}

	if s.sseBroker != nil {
		s.sseBroker.Close()
	}
	s.db.Close()
	s.rdb.Close()
	s.logger.Info("server stopped gracefully")

	return nil
}
