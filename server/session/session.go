// Package session manages explicit pairing sessions (QR / short code). Auto
// discovery (package discovery) lets same-scope peers see each other with no
// action; a session is the explicit alternative for when that isn't possible
// or wanted. A session is a small, short-lived membership set.
package session

import (
	"errors"
	"sync"
	"time"
)

var ErrNotFound = errors.New("session not found")

type Session struct {
	ID         string
	Code       string
	Members    map[string]bool
	Created    time.Time
	LastActive time.Time // refreshed on create/join; drives idle expiry
}

type Manager struct {
	mu      sync.RWMutex
	byCode  map[string]*Session
	byID    map[string]*Session
	limiter *Limiter
}

func NewManager() *Manager {
	return &Manager{
		byCode:  make(map[string]*Session),
		byID:    make(map[string]*Session),
		limiter: NewLimiter(),
	}
}

// CheckJoin checks if an attempt by client IP for PIN code is rate-limited.
func (m *Manager) CheckJoin(ip, code string) (bool, time.Duration) {
	return m.limiter.Check(ip, code)
}

// RecordJoinFailure notes a failed join attempt and triggers exponential backoff.
func (m *Manager) RecordJoinFailure(ip, code string) time.Duration {
	return m.limiter.RecordFailure(ip, code)
}

// RecordJoinSuccess clears failure counters upon successful pairing.
func (m *Manager) RecordJoinSuccess(ip, code string) {
	m.limiter.RecordSuccess(ip, code)
}

// Create makes a new code session with the creator as its first member.
func (m *Manager) Create(clientID string) (*Session, error) {
	code, err := generateCode()
	if err != nil {
		return nil, err
	}
	id, err := generateID()
	if err != nil {
		return nil, err
	}
	s := &Session{
		ID:         id,
		Code:       code,
		Members:    map[string]bool{clientID: true},
		Created:    time.Now(),
		LastActive: time.Now(),
	}
	m.mu.Lock()
	m.byCode[code] = s
	m.byID[id] = s
	m.mu.Unlock()
	return s, nil
}

// Join adds a client to an existing code session and returns the peers that
// were already in it.
func (m *Manager) Join(clientID, code string) (*Session, []string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.byCode[code]
	if !ok {
		return nil, nil, ErrNotFound
	}
	existing := make([]string, 0, len(s.Members))
	for id := range s.Members {
		if id != clientID {
			existing = append(existing, id)
		}
	}
	s.Members[clientID] = true
	s.LastActive = time.Now()
	return s, existing, nil
}

// Contains reports whether two clients share at least one session (used for
// authorizing relayed signaling between explicitly-paired peers).
func (m *Manager) Contains(a, b string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, s := range m.byCode {
		if s.Members[a] && s.Members[b] {
			return true
		}
	}
	return false
}

// MembersExcept returns a session's members except one id.
func (m *Manager) MembersExcept(code, exclude string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.byCode[code]
	if !ok {
		return nil
	}
	out := make([]string, 0, len(s.Members))
	for id := range s.Members {
		if id != exclude {
			out = append(out, id)
		}
	}
	return out
}

// ExpireIdle removes sessions with no create/join activity within ttl and
// returns the member ids of every session it dropped (so the hub can notify
// them). A ttl of 0 disables expiry.
func (m *Manager) ExpireIdle(ttl time.Duration) [][]string {
	if ttl <= 0 {
		return nil
	}
	cutoff := time.Now().Add(-ttl)
	m.mu.Lock()
	defer m.mu.Unlock()
	var dropped [][]string
	for code, s := range m.byCode {
		if s.LastActive.Before(cutoff) {
			members := make([]string, 0, len(s.Members))
			for id := range s.Members {
				members = append(members, id)
			}
			dropped = append(dropped, members)
			delete(m.byCode, code)
			delete(m.byID, s.ID)
		}
	}
	m.limiter.Sweep(ttl)
	return dropped
}

// Leave removes a client from every session, discarding any that become empty.
func (m *Manager) Leave(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for code, s := range m.byCode {
		if s.Members[clientID] {
			delete(s.Members, clientID)
			if len(s.Members) == 0 {
				delete(m.byCode, code)
				delete(m.byID, s.ID)
			}
		}
	}
}
