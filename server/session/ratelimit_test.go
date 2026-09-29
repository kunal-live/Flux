package session

import (
	"testing"
	"time"
)

func TestLimiter_InitialAllowed(t *testing.T) {
	l := NewLimiter()
	allowed, wait := l.Check("192.168.1.10", "A1B2C3")
	if !allowed || wait != 0 {
		t.Fatalf("expected allowed on first try, got allowed=%v wait=%v", allowed, wait)
	}
}

func TestLimiter_ExponentialBackoff(t *testing.T) {
	l := NewLimiter()
	ip := "10.0.0.5"
	pin := "XYZ789"

	// Failures 1 and 2: no backoff delay yet
	d1 := l.RecordFailure(ip, pin)
	if d1 != 0 {
		t.Fatalf("expected 0 backoff on failure 1, got %v", d1)
	}
	d2 := l.RecordFailure(ip, pin)
	if d2 != 0 {
		t.Fatalf("expected 0 backoff on failure 2, got %v", d2)
	}

	// Failure 3: 1s backoff
	d3 := l.RecordFailure(ip, pin)
	if d3 != 1*time.Second {
		t.Fatalf("expected 1s backoff on failure 3, got %v", d3)
	}

	// Immediately check: must be rejected
	allowed, wait := l.Check(ip, pin)
	if allowed || wait <= 0 {
		t.Fatalf("expected check to be blocked during backoff, got allowed=%v wait=%v", allowed, wait)
	}

	// Failure 4: 2s backoff
	d4 := l.RecordFailure(ip, pin)
	if d4 != 2*time.Second {
		t.Fatalf("expected 2s backoff on failure 4, got %v", d4)
	}

	// Failure 5: 4s backoff
	d5 := l.RecordFailure(ip, pin)
	if d5 != 4*time.Second {
		t.Fatalf("expected 4s backoff on failure 5, got %v", d5)
	}
}

func TestLimiter_PerPINIsolation(t *testing.T) {
	l := NewLimiter()
	pin := "TARGET"

	// Simulate attacker rotating IPs trying to guess TARGET pin
	for i := 1; i <= 5; i++ {
		fakeIP := "198.51.100." + string(rune('0'+i))
		l.RecordFailure(fakeIP, pin)
	}

	// Even from a brand new IP never seen before, targeting TARGET should be blocked!
	freshIP := "203.0.113.99"
	allowed, _ := l.Check(freshIP, pin)
	if allowed {
		t.Fatal("expected per-PIN limiter to block target PIN even from a new IP")
	}

	// But that brand new IP should still be able to try another pin
	allowedOther, _ := l.Check(freshIP, "OTHER")
	if !allowedOther {
		t.Fatal("expected new IP to be allowed for a different unaffected PIN")
	}
}

func TestLimiter_PerIPIsolation(t *testing.T) {
	l := NewLimiter()
	attackerIP := "192.0.2.1"

	// Attacker tries multiple different PINs from the same IP
	for i := 1; i <= 5; i++ {
		pin := "PIN" + string(rune('0'+i))
		l.RecordFailure(attackerIP, pin)
	}

	// Attacker IP should be blocked even when trying a brand new unprobed PIN
	allowed, _ := l.Check(attackerIP, "BRANDNEW")
	if allowed {
		t.Fatal("expected per-IP limiter to block attacker IP across any PIN")
	}

	// Meanwhile, a legitimate user from a different IP should be allowed for BRANDNEW
	allowedLegit, _ := l.Check("192.168.1.50", "BRANDNEW")
	if !allowedLegit {
		t.Fatal("expected legitimate user to be allowed")
	}
}

func TestLimiter_SuccessResets(t *testing.T) {
	l := NewLimiter()
	ip := "10.0.0.100"
	pin := "SOLVED"

	l.RecordFailure(ip, pin)
	l.RecordFailure(ip, pin)
	l.RecordFailure(ip, pin) // 1s lock

	// Reset via success
	l.RecordSuccess(ip, pin)

	allowed, wait := l.Check(ip, pin)
	if !allowed || wait != 0 {
		t.Fatalf("expected immediate clearance after RecordSuccess, got allowed=%v wait=%v", allowed, wait)
	}
}
