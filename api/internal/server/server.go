package server

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/echtkpvl/rncasp/internal/config"
	"github.com/echtkpvl/rncasp/internal/migrate"
	"github.com/echtkpvl/rncasp/internal/service"
	"github.com/echtkpvl/rncasp/internal/sse"
	"github.com/echtkpvl/rncasp/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Server struct {
	cfg            *config.Config
	db             *pgxpool.Pool
	rdb            *redis.Client
	router         http.Handler
	logger         *slog.Logger
	sseBroker      *sse.Broker
	cleanupService *service.CleanupService
}

func New(cfg *config.Config, logger *slog.Logger) (*Server, error) {
	s := &Server{
		cfg:    cfg,
		logger: logger,
	}

	// Connect to PostgreSQL
	dsn := cfg.Database.DSN()
	logger.Info("connecting to PostgreSQL",
		"socket_dir", cfg.Database.SocketDir,
		"host", cfg.Database.Host,
		"dsn_prefix", func() string {
			if len(dsn) > 40 {
				return dsn[:40] + "..."
			}
			return dsn
		}(),
	)
	dbPool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		return nil, fmt.Errorf("connecting to database: %w", err)
	}
	if err := dbPool.Ping(context.Background()); err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}
	s.db = dbPool
	if cfg.Database.SocketDir != "" {
		logger.Info("connected to PostgreSQL", "socket", cfg.Database.SocketDir, "db", cfg.Database.Name)
	} else {
		logger.Info("connected to PostgreSQL", "host", cfg.Database.Host, "db", cfg.Database.Name)
	}

	// Run migrations
	if err := migrate.Run(context.Background(), dbPool, migrations.FS, logger); err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("running migrations: %w", err)
	}

	// Connect to Redis
	rdb := redis.NewClient(&redis.Options{
		Network:  cfg.Redis.Network(),
		Addr:     cfg.Redis.Addr(),
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("connecting to redis: %w", err)
	}
	s.rdb = rdb
	logger.Info("connected to Redis", "network", cfg.Redis.Network(), "addr", cfg.Redis.Addr())

	// Setup routes
	s.router = s.setupRoutes()

	return s, nil
}

func (s *Server) Start() error {
	srv := &http.Server{
		Handler:      s.router,
		ReadTimeout:  s.cfg.Server.ReadTimeout,
		WriteTimeout: s.cfg.Server.WriteTimeout,
		IdleTimeout:  s.cfg.Server.IdleTimeout,
	}

	var listener net.Listener
	var listenErr error
	var listenAddr string

	if s.cfg.Server.SocketPath != "" {
		// Remove stale socket file from previous run
		os.Remove(s.cfg.Server.SocketPath)
		listener, listenErr = net.Listen("unix", s.cfg.Server.SocketPath)
		if listenErr != nil {
			return fmt.Errorf("listen unix %s: %w", s.cfg.Server.SocketPath, listenErr)
		}
		// Allow other containers (nginx) to connect
		if err := os.Chmod(s.cfg.Server.SocketPath, 0777); err != nil {
			listener.Close()
			return fmt.Errorf("chmod socket: %w", err)
		}
		listenAddr = s.cfg.Server.SocketPath
	} else {
		listener, listenErr = net.Listen("tcp", s.cfg.Server.ListenAddr)
		if listenErr != nil {
			return fmt.Errorf("listen tcp %s: %w", s.cfg.Server.ListenAddr, listenErr)
		}
		listenAddr = s.cfg.Server.ListenAddr
	}

	// Graceful shutdown
	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("server starting", "addr", listenAddr)
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
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

	if s.cleanupService != nil {
		s.cleanupService.Stop()
	}
	if s.sseBroker != nil {
		s.sseBroker.Close()
	}
	s.db.Close()
	s.rdb.Close()
	s.logger.Info("server stopped gracefully")

	return nil
}
