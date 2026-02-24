package sse

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/redis/go-redis/v9"
)

// Event represents an SSE event to broadcast to clients.
type Event struct {
	Type    string `json:"type"`
	EventID string `json:"event_id,omitempty"`
	Slug    string `json:"-"` // used for routing to per-event subscribers, not serialized
	Payload any    `json:"payload,omitempty"`
}

// Event types
const (
	TypeShiftCreated    = "shift.created"
	TypeShiftUpdated    = "shift.updated"
	TypeShiftDeleted    = "shift.deleted"
	TypeEventLocked     = "event.locked"
	TypeEventUnlocked   = "event.unlocked"
	TypeCoverageUpdated = "coverage.updated"
)

const redisPubSubChannel = "sse:events"

// client represents a connected SSE client.
type client struct {
	ch   chan []byte
	slug string // event slug filter; empty string means subscribed to all events
}

// Broker manages SSE client connections and event broadcasting.
// It uses Redis Pub/Sub so events are distributed across multiple server instances.
type Broker struct {
	rdb    *redis.Client
	logger *slog.Logger

	mu      sync.RWMutex
	clients map[*client]struct{}

	ctx    context.Context
	cancel context.CancelFunc
}

// NewBroker creates a new SSE broker backed by Redis Pub/Sub.
func NewBroker(rdb *redis.Client, logger *slog.Logger) *Broker {
	ctx, cancel := context.WithCancel(context.Background())
	b := &Broker{
		rdb:     rdb,
		logger:  logger,
		clients: make(map[*client]struct{}),
		ctx:     ctx,
		cancel:  cancel,
	}
	go b.subscribe()
	return b
}

// Close shuts down the broker and disconnects all clients.
func (b *Broker) Close() {
	b.cancel()
	b.mu.Lock()
	defer b.mu.Unlock()
	for c := range b.clients {
		close(c.ch)
		delete(b.clients, c)
	}
}

// Subscribe registers a new client to receive SSE events.
// If slug is empty, the client receives all events.
// Returns a channel that delivers serialized SSE data and a cleanup function.
func (b *Broker) Subscribe(slug string) (<-chan []byte, func()) {
	c := &client{
		ch:   make(chan []byte, 64),
		slug: slug,
	}

	b.mu.Lock()
	b.clients[c] = struct{}{}
	b.mu.Unlock()

	b.logger.Debug("sse client subscribed", "slug", slug, "total_clients", b.clientCount())

	cleanup := func() {
		b.mu.Lock()
		delete(b.clients, c)
		close(c.ch)
		b.mu.Unlock()
		b.logger.Debug("sse client unsubscribed", "slug", slug, "total_clients", b.clientCount())
	}

	return c.ch, cleanup
}

// Publish sends an event to all connected clients via Redis Pub/Sub.
// This ensures the event reaches clients on all server instances.
func (b *Broker) Publish(ctx context.Context, evt Event) {
	inner, err := json.Marshal(evt)
	if err != nil {
		b.logger.Error("failed to marshal SSE event", "error", err)
		return
	}

	// Wrap in envelope with slug for per-event routing
	envelope, err := json.Marshal(struct {
		Slug  string `json:"slug"`
		Inner string `json:"inner"`
	}{Slug: evt.Slug, Inner: string(inner)})
	if err != nil {
		b.logger.Error("failed to marshal SSE envelope", "error", err)
		return
	}

	if err := b.rdb.Publish(ctx, redisPubSubChannel, envelope).Err(); err != nil {
		b.logger.Error("failed to publish SSE event to Redis", "error", err)
		// Fall back to local-only broadcast
		b.broadcast(formatSSE(inner), evt.Slug)
	}
}

// subscribe listens on the Redis Pub/Sub channel and broadcasts to local clients.
func (b *Broker) subscribe() {
	pubsub := b.rdb.Subscribe(b.ctx, redisPubSubChannel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-b.ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var envelope struct {
				Slug  string `json:"slug"`
				Inner string `json:"inner"`
			}
			if err := json.Unmarshal([]byte(msg.Payload), &envelope); err != nil {
				b.logger.Error("failed to unmarshal SSE envelope from Redis", "error", err)
				continue
			}

			sseData := formatSSE([]byte(envelope.Inner))
			b.broadcast(sseData, envelope.Slug)
		}
	}
}

// broadcast sends serialized SSE data to matching local clients.
func (b *Broker) broadcast(data []byte, slug string) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for c := range b.clients {
		// Send to clients subscribed to this specific event or to all events
		if c.slug == "" || c.slug == slug {
			select {
			case c.ch <- data:
			default:
				// Client buffer full, skip this message
				b.logger.Warn("sse client buffer full, dropping message")
			}
		}
	}
}

func (b *Broker) clientCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.clients)
}

// formatSSE formats data as an SSE message: "data: <json>\n\n"
// No named "event:" field — all messages arrive via EventSource.onmessage.
func formatSSE(data []byte) []byte {
	return []byte(fmt.Sprintf("data: %s\n\n", data))
}
