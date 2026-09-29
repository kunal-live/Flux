package session

import (
	"testing"
	"time"
)

func TestCreateJoinContains(t *testing.T) {
	m := NewManager()
	s, err := m.Create("alice")
	if err != nil {
		t.Fatal(err)
	}
	if m.Contains("alice", "bob") {
		t.Fatal("bob not in session yet")
	}
	if _, existing, err := m.Join("bob", s.Code); err != nil {
		t.Fatal(err)
	} else if len(existing) != 1 || existing[0] != "alice" {
		t.Fatalf("join should report alice as existing peer, got %v", existing)
	}
	if !m.Contains("alice", "bob") {
		t.Fatal("alice and bob should now share a session")
	}
}

func TestJoinUnknownCode(t *testing.T) {
	m := NewManager()
	if _, _, err := m.Join("x", "NOPE12"); err != ErrNotFound {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestExpireIdle(t *testing.T) {
	m := NewManager()
	s, _ := m.Create("alice")
	m.Join("bob", s.Code)
	// Force the session to look idle.
	m.mu.Lock()
	m.byCode[s.Code].LastActive = time.Now().Add(-time.Hour)
	m.mu.Unlock()

	dropped := m.ExpireIdle(30 * time.Minute)
	if len(dropped) != 1 {
		t.Fatalf("expected 1 dropped session, got %d", len(dropped))
	}
	if len(dropped[0]) != 2 {
		t.Fatalf("dropped session should list 2 members, got %v", dropped[0])
	}
	if m.Contains("alice", "bob") {
		t.Fatal("session should be gone after expiry")
	}
}

func TestExpireIdleDisabled(t *testing.T) {
	m := NewManager()
	m.Create("alice")
	if got := m.ExpireIdle(0); got != nil {
		t.Fatalf("ttl=0 disables expiry, got %v", got)
	}
}

func TestAuthorized(t *testing.T) {
	m := NewManager()
	if !m.Authorized("a", "b", true) {
		t.Fatal("same scope should authorize")
	}
	if m.Authorized("a", "b", false) {
		t.Fatal("different scope + no session should NOT authorize")
	}
	s, _ := m.Create("a")
	m.Join("b", s.Code)
	if !m.Authorized("a", "b", false) {
		t.Fatal("shared session should authorize across scopes")
	}
}
