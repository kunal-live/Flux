// Command flux is the Flux control-plane server: presence/discovery registry,
// session pairing, WebRTC signaling relay, and a binary data relay for when a
// direct P2P path can't be established. It also serves the web client. It never
// stores file bytes, and on the direct path never sees them at all.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	flux "flux"
	"flux/server/config"
	"flux/server/discovery"
	"flux/server/hub"
)

func main() {
	cfg := config.Load()
	h := hub.NewHub(cfg.PresenceTTL, cfg.SessionTTL, cfg.RelayMaxMBps)

	mux := http.NewServeMux()

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		if !originAllowed(r, cfg.AllowOrigins) {
			http.Error(w, "forbidden origin", http.StatusForbidden)
			log.Printf("ws upgrade rejected: origin %q not allowed", r.Header.Get("Origin"))
			return
		}
		conn, err := hub.Upgrade(w, r)
		if err != nil {
			log.Printf("ws upgrade failed: %v", err)
			return
		}
		go h.ServeConn(conn, discovery.ScopeKey(r), discovery.ClientIP(r))
	})

	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && originAllowed(r, cfg.AllowOrigins) {
			if cfg.AllowOrigins == "*" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
			}
		}
		w.Header().Set("Content-Type", "application/json")
		tunnelURL := ""
		if data, err := os.ReadFile("tunnel.txt"); err == nil {
			tunnelURL = strings.TrimSpace(string(data))
			tunnelURL = strings.TrimPrefix(tunnelURL, "\ufeff")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"stunServers": cfg.STUNServers,
			"turnServers": turnICEServers(cfg),
			"lanIP":       discovery.PrimaryLANIP(),
			"port":        cfg.Addr,
			"tunnelURL":   tunnelURL,
		})
	})

	// Liveness/readiness for anything sitting in front of Flux (a tunnel, a
	// load balancer, a uptime check).
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok"))
	})

	// Lightweight operational metrics (no external deps; JSON, not Prometheus).
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		m := h.Metrics()
		_ = json.NewEncoder(w).Encode(m)
	})

	mux.Handle("/", noCache(http.FileServer(webFileSystem(cfg.WebDir))))

	scheme := "http"
	if cfg.TLSEnabled() {
		scheme = "https"
	}
	log.Printf("Flux server on %s%s", scheme, cfg.Addr)
	log.Printf("STUN: %v  TURN: %d server(s)  presence TTL: %s  session TTL: %s", cfg.STUNServers, len(cfg.TURNServers), cfg.PresenceTTL, cfg.SessionTTL)

	srv := &http.Server{Addr: cfg.Addr, Handler: mux}

	// Graceful shutdown: stop accepting, let in-flight requests/relays drain.
	idleClosed := make(chan struct{})
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		log.Printf("shutting down…")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("graceful shutdown error: %v", err)
		}
		close(idleClosed)
	}()

	var err error
	if cfg.TLSEnabled() {
		err = srv.ListenAndServeTLS(cfg.CertFile, cfg.KeyFile)
	} else {
		err = srv.ListenAndServe()
	}
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	<-idleClosed
	log.Printf("stopped")
}

// turnICEServers builds the RTCIceServer entries the browser needs for TURN.
func turnICEServers(cfg config.Config) []map[string]any {
	if len(cfg.TURNServers) == 0 {
		return nil
	}
	e := map[string]any{"urls": cfg.TURNServers}
	if cfg.TURNUser != "" {
		e["username"] = cfg.TURNUser
	}
	if cfg.TURNCred != "" {
		e["credential"] = cfg.TURNCred
	}
	return []map[string]any{e}
}

// webFileSystem serves the frontend. It prefers an on-disk directory when
// FLUX_WEB_DIR points at one (live frontend editing); otherwise it serves the
// copy embedded in the binary, so a lone flux-server(.exe) still works.
func webFileSystem(dir string) http.FileSystem {
	if abs, err := filepath.Abs(dir); err == nil {
		if fi, err := os.Stat(abs); err == nil && fi.IsDir() {
			log.Printf("web: serving from disk %s", abs)
			return http.Dir(abs)
		}
	}
	sub, err := fs.Sub(flux.WebFS, "web")
	if err != nil {
		log.Printf("warning: embedded web assets unavailable: %v", err)
		return http.Dir(dir)
	}
	log.Printf("web: serving embedded assets")
	return http.FS(sub)
}

// originAllowed decides whether a browser Origin may open a WebSocket / read
// /api/config. Policy:
//   - No Origin header (non-browser client, e.g. a native app) → allowed.
//   - allow == "*" → any origin (opt-in permissive, for open kiosk setups).
//   - allow == "" (default) → same-origin only: the Origin's host must match the
//     request Host. Since the Flux page is served by this same server, legitimate
//     use is always same-origin; this blocks other websites from silently opening
//     a socket to a Flux instance on localhost/LAN (CSRF-style).
//   - otherwise → Origin must be one of the comma-separated entries in allow.
func originAllowed(r *http.Request, allow string) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if allow == "*" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	if allow == "" {
		return strings.EqualFold(u.Host, r.Host)
	}
	for _, a := range strings.Split(allow, ",") {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		if strings.EqualFold(a, origin) || strings.EqualFold(a, u.Host) {
			return true
		}
	}
	return false
}

func noCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
