package handler

import (
	"net/http"

	"github.com/echtkpvl/rncasp/internal/model"
	"github.com/echtkpvl/rncasp/internal/server/middleware"
	"github.com/echtkpvl/rncasp/internal/sse"
	"github.com/go-chi/chi/v5"
)

type SSEHandler struct {
	broker *sse.Broker
}

func NewSSEHandler(broker *sse.Broker) *SSEHandler {
	return &SSEHandler{broker: broker}
}

// Subscribe handles SSE connections. Clients can subscribe to a specific
// event's updates via the slug URL parameter, or receive all updates
// if no slug is provided.
func (h *SSEHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == nil {
		model.ErrorResponse(w, model.NewDomainError(model.ErrUnauthorized, "not authenticated"))
		return
	}

	// Use ResponseController to handle middleware-wrapped writers
	rc := http.NewResponseController(w)

	// Optional: subscribe to a specific event's updates
	eventSlug := chi.URLParam(r, "slug")

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

	// Send initial connection confirmation
	w.Write([]byte("event: connected\ndata: {}\n\n"))
	if err := rc.Flush(); err != nil {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	ch, cleanup := h.broker.Subscribe(eventSlug)
	defer cleanup()

	for {
		select {
		case <-r.Context().Done():
			return
		case data, ok := <-ch:
			if !ok {
				return
			}
			w.Write(data)
			rc.Flush()
		}
	}
}
