# Flux

**Share Beyond Boundaries** — Blazing fast, zero-install, device-to-device local file sharing. Transfer unlimited files directly between phones, laptops, and desktops over your local network with zero cloud storage. Works seamlessly across Windows, macOS, Linux, Android, and iPhone in any modern browser.

This is a complete, runnable v4 MVP: control-plane server + web client, verified
end-to-end (two browsers, real WebRTC transfer, integrity checked on both ends).

## What works

- **Capability-based discovery** — devices in the same scope see each other with
  no action; each advertises platform + capabilities (no platform-specific code).
- **QR / code pairing** — pair across networks, or when auto-grouping is wrong.
- **Direct P2P transfer** — WebRTC DataChannel, binary, chunked, with
  backpressure and a bounded in-flight window (memory stays flat on huge files).
- **Automatic relay fallback** — if a direct path can't form (~9 s), the same
  binary frames are relayed through the Go server. UI shows **Direct** / **Relayed**.
- **Receiver approval** per transfer; presence states (discoverable/receiving/…).
- **Streaming to disk** via the File System Access API where available (bounded
  memory for multi-GB files), with a Blob download fallback elsewhere.
- **Integrity** — incremental SHA-256 on both ends; mismatches are flagged.
- **Adaptive chunk size** — negotiates larger DataChannel messages when both
  peers and the channel allow it (64 KiB stays the safe floor for iOS/Safari),
  for higher direct-path throughput.
- **Installable PWA** — add to home screen; a service worker caches the app
  shell so it opens offline (network-first, so it never serves stale code).
- **Ops endpoints** — `/healthz` and `/metrics` (JSON: active/total connections,
  transfers started, relayed bytes); graceful shutdown on SIGINT/SIGTERM.
- **Live speed / ETA**, pause, and a dashboard UI (light + dark).

## Requirements

- **To build the server:** [Go](https://go.dev/dl/) 1.22+. That's the only build
  dependency — the server uses **only the Go standard library** (the small bit
  of WebSocket framing is in `server/hub/websocket.go`), so there is nothing to
  download and it builds offline into one static binary. The web client is
  **embedded** into that binary (`//go:embed`), so `flux-server` runs standalone
  with no `web/` folder next to it (set `FLUX_WEB_DIR` to live-edit the frontend).
- **To use it:** any modern browser. WebRTC needs a secure context — either
  `http://localhost` (fine for a two-tab test on one machine) or **HTTPS** once
  you open it from another device by IP (see below).

## Run it (local, two browser tabs)

```bash
cd server
go run .
# → Flux server on http://:8080  (web: ../web)
```

Open <http://localhost:8080> in two tabs; they'll see each other as nearby
devices. Click one (or drag files onto it), accept on the other, watch it
transfer.

Single static binary instead:

```bash
cd server && go build -o flux . && ./flux
```

## Run it across two devices (same Wi-Fi)

Opening by IP means WebRTC requires HTTPS. Use
[mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install
mkcert 192.168.1.20 localhost          # your machine's LAN IP
cd server
FLUX_CERT_FILE=../192.168.1.20+1.pem \
FLUX_KEY_FILE=../192.168.1.20+1-key.pem \
go run .
# → Flux server on https://:8080
```

Open `https://<that-ip>:8080` on a phone and a laptop. If a direct path can't
form, the transfer automatically switches to **Relayed** and still completes.

> **Exposing Flux publicly (tunnel):** by default the WebSocket upgrade is
> same-origin only and public visitors get their own discovery scope, so a
> tunnel URL won't auto-expose your LAN devices — remote peers must pair with a
> code. Keep it that way in production, and set `FLUX_RELAY_MAX_MBPS` if you want
> to cap relay bandwidth.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `FLUX_ADDR` | `:8080` | Listen address |
| `FLUX_WEB_DIR` | *(embedded)* | Override to serve the frontend from disk; unset serves the copy embedded in the binary |
| `FLUX_STUN` | two Google STUN servers | Comma-separated STUN URLs given to the browser |
| `FLUX_CERT_FILE` / `FLUX_KEY_FILE` | *(unset)* | Set both to enable HTTPS |
| `FLUX_ALLOW_ORIGIN` | *(empty)* | Origin policy for `/ws` + `/api/config`: empty = same-origin only, `*` = any, else comma-separated allowlist |
| `FLUX_PRESENCE_TTL_SEC` | `30` | Presence entry expiry without a heartbeat |
| `FLUX_SESSION_TTL_SEC` | `1800` | Idle pairing-session expiry |
| `FLUX_RELAY_MAX_MBPS` | `0` | Per-connection relay cap in MB/s (`0` = unlimited) |
| `FLUX_TURN` | *(unset)* | Comma-separated TURN URLs (`turn:`/`turns:`) for cross-NAT P2P |
| `FLUX_TURN_USER` / `FLUX_TURN_CRED` | *(unset)* | TURN credentials |

## Layout & protocol

See `docs/architecture.md` for the full design (and two deliberate deviations
from the v4 spec: standard-library WebSocket instead of gorilla, and a
framework-free frontend instead of Next.js — both to keep Flux a single
offline-buildable binary serving a true zero-install page). The wire contract is
in `docs/protocol.md`, mirrored in `server/protocol/messages.go`,
`web/src/protocol.ts`, and `web/src/protocol.js`.

## Notes & limitations (MVP scope)

- **64 KiB chunks** — the universally-safe DataChannel message size (larger
  single messages fail on iOS Safari and overflow Chromium's SCTP cap). Adaptive
  growth is a later step.
- **STUN, not TURN** — same-LAN/rendezvous only; the Go relay covers the
  "WebRTC blocked" case without a TURN server.
- **Transfer is 1 ↔ 1** (discovery already handles many peers); multi-recipient
  is a later step.
- **Resume**: pause works; connection/transfer resume state and messages exist,
  but full reconnect orchestration and durable refresh-resume are follow-ups.
- **Native LAN discovery** (mDNS/UDP) for the true "everything on this LAN"
  experience is a later, native-client phase.
- **Discovery scope is a trust boundary.** Devices auto-discover only within the
  same scope: same LAN /24, or localhost. A visitor arriving over a public
  tunnel gets their own scope and must **pair with a QR/code** — they do not see
  your LAN devices automatically. This is intentional; don't expect a raw tunnel
  URL to make strangers mutually visible.
- **Resume** now recovers a mid-transfer **direct→relay failover** automatically
  (the receiver asks the sender to resend from its last contiguous chunk).
  Durable resume across a full page refresh / socket reconnect is still a
  follow-up.
