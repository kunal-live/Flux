// Package discovery maintains the short-lived registry of Flux-enabled peers
// and the "discovery scope" that groups devices which can reasonably reach each
// other. A browser cannot enumerate arbitrary LAN devices, so Flux shows all
// Flux-enabled devices within the current scope — not every network device.
package discovery

import (
	"net"
	"net/http"
	"strings"
)

// ScopeKey derives the discovery scope for a connection from its network
// address. Devices sharing a key are shown to each other automatically; devices
// in different scopes must pair with an explicit QR/code.
//
// Rationale for the boundary: auto-discovery is an implicit trust decision, so
// it must be scoped to "networks that already share a trust domain". We use:
//
//   - Loopback (localhost two-tab testing) → mapped to this host's LAN /24 so a
//     local dev instance can still see real LAN peers automatically.
//   - Private IPv4 (10/8, 172.16/12, 192.168/16) → masked to /24: one subnet is
//     one scope.
//   - Everything else (public IPs, e.g. visitors arriving through a public
//     tunnel) → the whole IP. A remote visitor therefore gets their OWN scope
//     and does NOT auto-appear alongside the LAN devices; they must pair with a
//     code. This is the intended security boundary — a public tunnel URL must
//     not silently expose LAN devices to strangers.
//
// Behind a trusted reverse proxy / tunnel the real client address is taken from
// X-Forwarded-For / X-Real-IP.
func ScopeKey(r *http.Request) string {
	ip := net.ParseIP(clientIP(r))
	if ip == nil {
		return "addr:" + clientIP(r)
	}
	if ip.IsLoopback() {
		if lan := PrimaryLANIP(); lan != "" {
			if v4 := net.ParseIP(lan).To4(); v4 != nil {
				return "net:" + v4.Mask(net.CIDRMask(24, 32)).String() + "/24"
			}
		}
		return "net:loopback"
	}
	if v4 := ip.To4(); v4 != nil {
		if ip.IsPrivate() || ip.IsLinkLocalUnicast() {
			return "net:" + v4.Mask(net.CIDRMask(24, 32)).String() + "/24"
		}
		return "ip:" + v4.String()
	}
	// IPv6: private/ULA groups by /64; else whole address.
	if ip.IsPrivate() || ip.IsLinkLocalUnicast() {
		return "net6:" + ip.Mask(net.CIDRMask(64, 128)).String() + "/64"
	}
	return "ip:" + ip.String()
}

// PrimaryLANIP returns this machine's outbound LAN IP address on the local network.
func PrimaryLANIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err == nil {
		defer conn.Close()
		if localAddr, ok := conn.LocalAddr().(*net.UDPAddr); ok {
			return localAddr.IP.String()
		}
	}
	// Fallback to interface scan
	addrs, err := net.InterfaceAddrs()
	if err == nil {
		for _, addr := range addrs {
			if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
				if v4 := ipNet.IP.To4(); v4 != nil && ipNet.IP.IsPrivate() {
					return v4.String()
				}
			}
		}
	}
	return ""
}

// clientIP extracts the real client IP, honoring a trusted proxy's forwarding
// headers first (Flux is designed to sit behind localhost, a LAN address, or a
// tunnel such as cloudflared, all of which set these).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if first := strings.TrimSpace(strings.Split(xff, ",")[0]); first != "" {
			return first
		}
	}
	if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
		return strings.TrimSpace(xrip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
