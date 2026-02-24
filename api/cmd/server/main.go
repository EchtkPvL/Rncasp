package main

import (
	"log/slog"
	"os"

	"github.com/echtkpvl/rncasp/internal/config"
	"github.com/echtkpvl/rncasp/internal/server"
)

func main() {
	// Setup structured logger
	logLevel := new(slog.LevelVar)
	logLevel.Set(slog.LevelInfo)
	if os.Getenv("APP_ENV") == "development" {
		logLevel.Set(slog.LevelDebug)
	}
	if lvl := os.Getenv("LOG_LEVEL"); lvl != "" {
		var l slog.Level
		if err := l.UnmarshalText([]byte(lvl)); err != nil {
			slog.Error("invalid LOG_LEVEL, using default", "value", lvl, "error", err)
		} else {
			logLevel.Set(l)
		}
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
	}))

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	if cfg.IsDev() {
		logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: logLevel,
		}))
	}

	logger.Info("starting rncasp server",
		"environment", cfg.App.Environment,
		"version", "0.1.0",
	)

	// Create and start server
	srv, err := server.New(cfg, logger)
	if err != nil {
		logger.Error("failed to create server", "error", err)
		os.Exit(1)
	}

	if err := srv.Start(); err != nil {
		logger.Error("server error", "error", err)
		os.Exit(1)
	}
}
