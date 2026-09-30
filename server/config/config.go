// Package config centralizes runtime settings, all overridable by environment
// variable so one binary serves local two-tab testing and LAN HTTPS alike.
package config

import (
	"os"
	"strings"
	"time"
)

type Config struct {
	Addr         string
	WebDir       string
	STUNServers  []string
	CertFile     string
	KeyFile      string
	AllowOrigins string
	PresenceTTL  time.Duration // presence entry expires after this without a heartbeat
	SessionTTL   time.Duration // idle pairing session expires after this
	RelayMaxMBps int           // 0 = unlimited; else per-connection relay cap (MB/s)
	TURNServers  []string      // optional TURN URLs (turn:/turns:) for cross-NAT P2P
	TURNUser     string        // TURN username (shared credential)
	TURNCred     string        // TURN credential
}

// Load reads configuration from the environment with sensible defaults:
//
//	FLUX_ADDR         (":8080")
//	FLUX_WEB_DIR      ("../web")
//	FLUX_STUN         (two Google STUN servers, comma-separated)
//	FLUX_CERT_FILE    (optional; set with key to enable HTTPS)
//	FLUX_KEY_FILE     (optional)
//	FLUX_ALLOW_ORIGIN ("")  "" = same-origin only, "*" = any, else comma list
//	FLUX_PRESENCE_TTL_SEC ("30")
//	FLUX_SESSION_TTL_SEC  ("1800")  idle pairing session expiry
//	FLUX_RELAY_MAX_MBPS   ("0")     per-connection relay cap; 0 = unlimited
//	FLUX_TURN             (optional; comma-separated turn:/turns: URLs)
//	FLUX_TURN_USER        (optional TURN username)
//	FLUX_TURN_CRED        (optional TURN credential)
func Load() Config {
	c := Config{
		Addr:         env("FLUX_ADDR", ":8080"),
		WebDir:       env("FLUX_WEB_DIR", defaultWebDir()),
		CertFile:     os.Getenv("FLUX_CERT_FILE"),
		KeyFile:      os.Getenv("FLUX_KEY_FILE"),
		AllowOrigins: os.Getenv("FLUX_ALLOW_ORIGIN"), // "" = same-origin only; "*" = allow all; else comma list
		PresenceTTL:  time.Duration(atoi(env("FLUX_PRESENCE_TTL_SEC", "30"), 30)) * time.Second,
		SessionTTL:   time.Duration(atoi(env("FLUX_SESSION_TTL_SEC", "1800"), 1800)) * time.Second,
		RelayMaxMBps: atoi(env("FLUX_RELAY_MAX_MBPS", "0"), 0),
	}
	stun := env("FLUX_STUN", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
	for _, s := range strings.Split(stun, ",") {
		if s = strings.TrimSpace(s); s != "" {
			c.STUNServers = append(c.STUNServers, s)
		}
	}
	for _, s := range strings.Split(os.Getenv("FLUX_TURN"), ",") {
		if s = strings.TrimSpace(s); s != "" {
			c.TURNServers = append(c.TURNServers, s)
		}
	}
	c.TURNUser = os.Getenv("FLUX_TURN_USER")
	c.TURNCred = os.Getenv("FLUX_TURN_CRED")
	return c
}

func (c Config) TLSEnabled() bool { return c.CertFile != "" && c.KeyFile != "" }

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func atoi(s string, d int) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return d
		}
		n = n*10 + int(r-'0')
	}
	if s == "" {
		return d
	}
	return n
}

func defaultWebDir() string {
	if fi, err := os.Stat("web"); err == nil && fi.IsDir() {
		return "web"
	}
	return "../web"
}

