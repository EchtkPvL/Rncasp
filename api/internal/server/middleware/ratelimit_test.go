package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterAllowsWithinLimit(t *testing.T) {
	rl := newRateLimiter(5, 1*time.Minute)

	for i := 0; i < 5; i++ {
		if !rl.allow("192.168.1.1") {
			t.Fatalf("request %d should be allowed within limit", i+1)
		}
	}
}

func TestRateLimiterBlocksOverLimit(t *testing.T) {
	rl := newRateLimiter(3, 1*time.Minute)

	for i := 0; i < 3; i++ {
		rl.allow("192.168.1.1")
	}

	if rl.allow("192.168.1.1") {
		t.Fatal("4th request should be blocked")
	}
}

func TestRateLimiterTracksIPsSeparately(t *testing.T) {
	rl := newRateLimiter(2, 1*time.Minute)

	rl.allow("10.0.0.1")
	rl.allow("10.0.0.1")

	// Different IP should still be allowed
	if !rl.allow("10.0.0.2") {
		t.Fatal("different IP should not be affected")
	}
}

func TestRateLimiterResetsAfterWindow(t *testing.T) {
	rl := newRateLimiter(2, 50*time.Millisecond)

	rl.allow("10.0.0.1")
	rl.allow("10.0.0.1")

	if rl.allow("10.0.0.1") {
		t.Fatal("3rd request within window should be blocked")
	}

	time.Sleep(60 * time.Millisecond)

	if !rl.allow("10.0.0.1") {
		t.Fatal("request after window expiry should be allowed")
	}
}

func TestRateLimitMiddlewareReturns429(t *testing.T) {
	handler := RateLimit(1, 1*time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request should succeed
	req1 := httptest.NewRequest("POST", "/api/auth/login", nil)
	req1.Header.Set("X-Real-IP", "1.2.3.4")
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Fatalf("first request expected 200, got %d", rec1.Code)
	}

	// Second request should be rate limited
	req2 := httptest.NewRequest("POST", "/api/auth/login", nil)
	req2.Header.Set("X-Real-IP", "1.2.3.4")
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("second request expected 429, got %d", rec2.Code)
	}

	retryAfter := rec2.Header().Get("Retry-After")
	if retryAfter != "60" {
		t.Fatalf("expected Retry-After: 60, got %q", retryAfter)
	}
}

func TestRateLimitMiddlewareUsesXRealIP(t *testing.T) {
	handler := RateLimit(1, 1*time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request from IP A
	req1 := httptest.NewRequest("POST", "/test", nil)
	req1.Header.Set("X-Real-IP", "5.5.5.5")
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec1.Code)
	}

	// Request from different IP should succeed
	req2 := httptest.NewRequest("POST", "/test", nil)
	req2.Header.Set("X-Real-IP", "6.6.6.6")
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("different IP expected 200, got %d", rec2.Code)
	}
}
