package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type HealthHandler struct {
	db  *pgxpool.Pool
	rdb *redis.Client
}

func NewHealthHandler(db *pgxpool.Pool, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{db: db, rdb: rdb}
}

type healthResponse struct {
	Status   string            `json:"status"`
	Services map[string]string `json:"services"`
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp := healthResponse{
		Status:   "ok",
		Services: make(map[string]string),
	}

	// Check PostgreSQL
	if err := h.db.Ping(ctx); err != nil {
		resp.Status = "degraded"
		resp.Services["postgres"] = "unhealthy"
	} else {
		resp.Services["postgres"] = "healthy"
	}

	// Check Redis
	if err := h.rdb.Ping(ctx).Err(); err != nil {
		resp.Status = "degraded"
		resp.Services["redis"] = "unhealthy"
	} else {
		resp.Services["redis"] = "healthy"
	}

	status := http.StatusOK
	if resp.Status != "ok" {
		status = http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(resp)
}
