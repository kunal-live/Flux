package session

import (
	"sync"
	"time"
)

type attemptEntry struct {
	failures    int
	lastAttempt time.Time
	lockedUntil time.Time
	windowHits  []time.Time
}

// Limiter provides two-dimensional rate limiting (per-IP and per-PIN) with
// exponential backoff to protect 6-character session PINs against brute-force attacks.
type Limiter struct {
	mu    sync.Mutex
	byIP  map[string]*attemptEntry
	byPIN map[string]*attemptEntry
}

func NewLimiter() *Limiter {
	return &Limiter{
		byIP:  make(map[string]*attemptEntry),
		byPIN: make(map[string]*attemptEntry),
	}
}

// Check verifies whether an attempt from the given client IP for the given PIN code
// is permitted. If throttled, it returns allowed=false and the required wait duration.
func (l *Limiter) Check(ip, code string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()

	// 1. Check IP dimension
	if ip != "" {
		if e, ok := l.byIP[ip]; ok {
			if now.Before(e.lockedUntil) {
				return false, e.lockedUntil.Sub(now)
			}
			if isWindowThrottled(e, now, 10, time.Minute) {
				e.lockedUntil = now.Add(15 * time.Second)
				return false, 15 * time.Second
			}
		}
	}

	// 2. Check PIN dimension
	if code != "" {
		if e, ok := l.byPIN[code]; ok {
			if now.Before(e.lockedUntil) {
				return false, e.lockedUntil.Sub(now)
			}
			if isWindowThrottled(e, now, 15, time.Minute) {
				e.lockedUntil = now.Add(15 * time.Second)
				return false, 15 * time.Second
			}
		}
	}

	return true, 0
}

// RecordFailure notes a failed join attempt, incrementing failure counts and
// computing exponential backoff delays across both the client IP and targeted PIN.
func (l *Limiter) RecordFailure(ip, code string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	var maxDelay time.Duration

	update := func(m map[string]*attemptEntry, key string) time.Duration {
		if key == "" {
			return 0
		}
		e, ok := m[key]
		if !ok {
			e = &attemptEntry{}
			m[key] = e
		}
		e.failures++
		e.lastAttempt = now
		e.windowHits = append(e.windowHits, now)

		// Exponential backoff curve:
		// 1-2 failures: 0s (typos permitted)
		// 3 failures: 1s
		// 4 failures: 2s
		// 5 failures: 4s
		// 6 failures: 8s
		// 7 failures: 16s
		// 8+ failures: 30s cap
		var delay time.Duration
		if e.failures >= 3 {
			shift := e.failures - 3
			if shift > 5 {
				delay = 30 * time.Second
			} else {
				delay = (1 << shift) * time.Second
			}
		}
		if delay > 0 {
			e.lockedUntil = now.Add(delay)
		}
		return delay
	}

	d1 := update(l.byIP, ip)
	d2 := update(l.byPIN, code)
	if d1 > maxDelay {
		maxDelay = d1
	}
	if d2 > maxDelay {
		maxDelay = d2
	}
	return maxDelay
}

// RecordSuccess clears failure counters and locks upon a successful join.
func (l *Limiter) RecordSuccess(ip, code string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if ip != "" {
		delete(l.byIP, ip)
	}
	if code != "" {
		delete(l.byPIN, code)
	}
}

// Sweep removes stale limiter entries that have had no attempts for over ttl.
func (l *Limiter) Sweep(ttl time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-ttl)

	for k, e := range l.byIP {
		if e.lastAttempt.Before(cutoff) && now.After(e.lockedUntil) {
			delete(l.byIP, k)
		}
	}
	for k, e := range l.byPIN {
		if e.lastAttempt.Before(cutoff) && now.After(e.lockedUntil) {
			delete(l.byPIN, k)
		}
	}
}

func isWindowThrottled(e *attemptEntry, now time.Time, maxAttempts int, window time.Duration) bool {
	cutoff := now.Add(-window)
	kept := e.windowHits[:0]
	for _, t := range e.windowHits {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	e.windowHits = kept
	return len(e.windowHits) >= maxAttempts
}
