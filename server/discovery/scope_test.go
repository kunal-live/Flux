package discovery

import (
	"net/http"
	"testing"
)

func req(remote string, headers map[string]string) *http.Request {
	r := &http.Request{RemoteAddr: remote, Header: http.Header{}}
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	return r
}

func TestScopeKey_PrivateGroupsBySubnet(t *testing.T) {
	a := ScopeKey(req("192.168.1.20:5555", nil))
	b := ScopeKey(req("192.168.1.99:6666", nil))
	if a != b {
		t.Fatalf("same /24 should share scope: %q vs %q", a, b)
	}
	c := ScopeKey(req("192.168.2.20:5555", nil))
	if a == c {
		t.Fatalf("different /24 should NOT share scope: %q == %q", a, c)
	}
}

func TestScopeKey_PublicIsolatesByWholeIP(t *testing.T) {
	a := ScopeKey(req("203.0.113.7:443", nil))
	b := ScopeKey(req("203.0.113.8:443", nil))
	if a == b {
		t.Fatalf("distinct public IPs must not auto-group: %q == %q", a, b)
	}
}

func TestScopeKey_HonorsXForwardedFor(t *testing.T) {
	// A tunnel/proxy connection: RemoteAddr is the proxy, real client in XFF.
	got := ScopeKey(req("10.0.0.1:1", map[string]string{"X-Forwarded-For": "203.0.113.7, 10.0.0.1"}))
	want := ScopeKey(req("203.0.113.7:443", nil))
	if got != want {
		t.Fatalf("XFF client should drive scope: %q vs %q", got, want)
	}
}

func TestScopeKey_PublicNotEqualPrivate(t *testing.T) {
	pub := ScopeKey(req("203.0.113.7:443", nil))
	priv := ScopeKey(req("192.168.1.20:5555", nil))
	if pub == priv {
		t.Fatal("a public visitor must not land in the LAN scope")
	}
}
