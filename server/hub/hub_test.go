package hub

import (
	"testing"
	"time"
)

func TestDecodeRegisterDefaults(t *testing.T) {
	r := decodeRegister(nil)
	if r.Alias != "Anonymous" || r.Platform != "web" || r.DeviceType != "web" {
		t.Fatalf("bad defaults: %+v", r)
	}
	r2 := decodeRegister(map[string]any{
		"alias": "Teal Fox", "platform": "linux", "deviceType": "desktop",
		"capabilities": map[string]any{"webrtc": true, "streamingWriter": true},
	})
	if r2.Alias != "Teal Fox" || !r2.Capabilities.WebRTC || !r2.Capabilities.StreamingWriter {
		t.Fatalf("bad decode: %+v", r2)
	}
}

func TestAllowJoinThrottle(t *testing.T) {
	c := &Client{}
	allowed := 0
	for i := 0; i < 15; i++ {
		if c.allowJoin() {
			allowed++
		}
	}
	if allowed != 10 {
		t.Fatalf("throttle should allow 10 of 15, got %d", allowed)
	}
}

func TestAllowRelayUnlimited(t *testing.T) {
	c := &Client{}
	if !c.allowRelay(1<<20, 0) {
		t.Fatal("maxBps=0 must be unlimited")
	}
}

func TestAllowRelayCap(t *testing.T) {
	c := &Client{}
	max := 1.0 * 1024 * 1024 // 1 MB/s
	// First call gets a full-second burst budget of ~1MB.
	if !c.allowRelay(500*1024, max) {
		t.Fatal("first 500KB within burst should pass")
	}
	if !c.allowRelay(500*1024, max) {
		t.Fatal("second 500KB within burst should pass")
	}
	// Budget now ~empty; a big immediate frame should be refused.
	if c.allowRelay(900*1024, max) {
		t.Fatal("should be rate-limited once burst budget is spent")
	}
	_ = time.Now
}
