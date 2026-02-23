package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/echtkpvl/rncasp/internal/model"
)

type visitor struct {
	count    int
	lastSeen time.Time
}

type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	limit    int
	window   time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{
		visitors: make(map[string]*visitor),
		limit:    limit,
		window:   window,
	}
	// Cleanup stale entries periodically
	go rl.cleanup()
	return rl
}

func (rl *rateLimiter) cleanup() {
	for {
		time.Sleep(rl.window)
		rl.mu.Lock()
		for ip, v := range rl.visitors {
			if time.Since(v.lastSeen) > rl.window {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, ok := rl.visitors[ip]
	if !ok {
		rl.visitors[ip] = &visitor{count: 1, lastSeen: time.Now()}
		return true
	}

	if time.Since(v.lastSeen) > rl.window {
		v.count = 1
		v.lastSeen = time.Now()
		return true
	}

	v.count++
	v.lastSeen = time.Now()
	return v.count <= rl.limit
}

// RateLimit returns middleware that limits requests per IP within a time window.
// limit: max requests per window, window: time duration for the window.
func RateLimit(limit int, window time.Duration) func(http.Handler) http.Handler {
	rl := newRateLimiter(limit, window)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			// Use X-Real-IP if available (set by nginx/proxy)
			if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
				ip = realIP
			}

			if !rl.allow(ip) {
				w.Header().Set("Retry-After", "60")
				model.ErrorResponse(w, model.NewDomainError(model.ErrTooManyRequests, "too many requests, please try again later"))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
