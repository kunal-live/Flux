# Flux — Cross-Platform Nearby File Share (Web v4)

A zero-install, cross-platform file/photo/video sharing system that makes nearby
transfer feel as simple as AirDrop, across **Windows, macOS, Linux, Android, and
iPhone**. Files travel **device → device** at the best available network path;
the Go server is a control-plane/rendezvous service and never stores file bytes
(and never sees them at all on the direct path).

This document describes what is **actually built and tested** in this repo. It
follows the v4 design; two deliberate deviations from that spec are called out
in §0.

---

## 0. What shipped, and two deviations

**Shipped and verified end-to-end** (two browsers, real transfer, integrity
checked on both sides): capability-based presence/discovery, automatic
same-scope grouping, QR/code pairing sessions, WebRTC DataChannel direct
transfer, automatic relay fallback through the Go server, receiver approval per
transfer, chunked binary transfer with backpressure and live speed/ETA,
incremental SHA-256 integrity verification, a capability-based file writer
(streaming-to-disk or Blob fallback), pause, and the dashboard UI.

**Deviation 1 — WebSocket library.** The v4 stack lists `gorilla/websocket`.
This build uses the **Go standard library only**, with a small RFC 6455
implementation in `server/hub/websocket.go`. Rationale: Flux ships as a single
self-contained static binary that builds offline with no module downloads —
which also matters because the target machine has no Go toolchain preinstalled.

**Deviation 2 — Frontend framework.** The v4 stack lists Next.js/React/TS. This
build uses **framework-free ES modules + CSS, no build step**. Rationale: it
keeps Flux a true zero-install app served directly by the single Go binary (a
Next.js app would need a separate build/deploy pipeline and couldn't be served
by the binary as-is). The module boundaries still match the v4 layering
(discovery / signaling / session / transport / transfer / writer / hashing /
resume). `web/src/protocol.ts` remains the typed source of truth;
`web/src/protocol.js` is the runtime mirror.

Everything else follows the v4 document.

---

## 1. Core experience

```
Open Flux → see nearby Flux devices → choose a device → receiver accepts
          → transfer directly at the best available path (relay if needed)
```

Every supported platform is a peer; there is no platform-specific
sender/receiver code. A device advertises **capabilities** and Flux selects the
transport and file-writing method from those, not from the OS name.

## 2. Discovery scope (the honest boundary)

A browser cannot enumerate arbitrary LAN devices. Flux therefore shows **all
Flux-enabled devices discoverable in the current scope**, not every network
device. Scope is derived from the observed address (`server/discovery/scope.go`,
honoring `X-Forwarded-For`/`X-Real-IP` behind a trusted proxy/tunnel):

- **Loopback** (localhost two-tab testing) is mapped to this host's LAN /24, so
  a local dev instance still auto-discovers real LAN peers.
- **Private IPv4** (10/8, 172.16/12, 192.168/16) groups by **/24** — one subnet,
  one scope. (Private IPv6 groups by /64.)
- **Public IPs** use the **whole IP**. A visitor arriving through a public tunnel
  gets their *own* scope and does **not** auto-appear alongside the LAN devices;
  they must pair with a QR/code. This is the intended security boundary: a public
  tunnel URL must never silently expose LAN devices to strangers.

Explicit QR/code pairing works across scopes.

## 3. Layers

```
Flux client
  ├── discovery   presence advertisement + live peer map
  ├── session     explicit QR/code pairing
  ├── transport   WebRTC direct  |  server relay  (one interface)
  ├── transfer    chunking, window/backpressure, speed/ETA, hashing, resume
  └── writer      streaming-to-disk (File System Access) | Blob fallback
```

The only platform-specific part is the capability layer (does this browser have
`showSaveFilePicker`, WebRTC, etc.). The transfer protocol is common.

## 4. Control plane vs data plane

- **Control plane** — small versioned JSON envelopes over WebSocket (register,
  heartbeat, peer-list, peer-joined/left, presence, create/join-session,
  offer/answer/ice-candidate, transfer-init/accept/reject, chunk-ack,
  resume-request/response, transport-status, transfer-complete/cancel). Routed
  by the server; authorized when peers share a discovery scope or a session.
- **Data plane** — **binary only**. File bytes are compact length-delimited
  frames: `[version:u8][kind:u8][wireId:u32][chunkIndex:u32][payload]`. On the
  direct path they ride the WebRTC DataChannel; on relay the server forwards the
  exact same frames verbatim between the two WebSocket connections (never
  JSON/base64). See `docs/protocol.md`.

```
Device A ============ WebRTC DataChannel (PRIMARY) ============ Device B
Device A ── WSS ──►  Flux relay (forwards binary frames)  ──► WSS ── Device B
```

The UI shows **Direct** or **Relayed** per transfer.

## 5. Transfer engine (`web/src/transfer.js`)

- **Chunking**: 64 KiB payloads. This is the universally-safe DataChannel
  message size — under the 256 KiB SCTP cap (with header) and within iOS
  Safari's tighter limit. A 256 KiB message + header overflows Chromium's
  negotiated max and tears down the channel; 64 KiB is the safe default, with
  adaptive growth left as a later step.
- **Backpressure / in-flight window**: the sender pauses when
  `bufferedAmount` exceeds a high-water mark and resumes below the low-water
  mark, keeping memory bounded while keeping the pipe full.
- **Live throughput**: an EMA speed estimate drives the MB/s and ETA shown in
  the UI.
- **Integrity**: incremental SHA-256 on both ends (`web/src/hashing.js`); the
  sender's hash rides in `transfer-init`, the receiver recomputes and returns
  its hash in `transfer-complete`. A mismatch is surfaced, not trusted.
- **Writer** (`web/src/writer.js`): if `showSaveFilePicker` exists, bytes stream
  straight to disk at the correct offset (bounded memory for any file size);
  otherwise a Blob is assembled and downloaded.
- **Pause** is implemented. **Transport-failover resume** is implemented: if a
  direct WebRTC path drops mid-transfer, the transport fails over to relay and
  the receiver asks the sender (via `resume-request`) to resend from its last
  contiguous chunk (`resume-response`). Receiver writes are offset-addressed and
  idempotent, so resent/duplicate chunks are safe. Durable resume across a full
  WebSocket reconnect or page refresh (needs a stable identity across reconnects
  + durable storage) is still a follow-up.

## 6. Pairing & security

Visible ≠ trusted. A transfer is authorized by an explicit receiver **Accept**
per transfer. Session/device IDs and pairing codes are cryptographically random;
idle pairing sessions expire (`FLUX_SESSION_TTL_SEC`, default 30 min) and join
attempts are rate-limited per connection (anti-brute-force on the code space).
No raw IP is used as identity, and the relay never persists file bytes.

Additional server-side guards:

- **Origin check** on the WebSocket upgrade and `/api/config`: same-origin only
  by default, so another website cannot silently open a socket to a Flux
  instance on localhost/LAN (CSRF-style). `FLUX_ALLOW_ORIGIN` opts into `*` or a
  specific allowlist.
- **Relay authorization** is re-checked on *every* forwarded binary frame, not
  just when the route is armed — an unauthorized peer cannot stream bytes at a
  victim through the server.
- **Relay backpressure**: the server no longer silently drops frames to a slow
  receiver (which would corrupt a file with no retransmit). It blocks the sender
  via TCP instead, and an optional `FLUX_RELAY_MAX_MBPS` caps per-connection
  relay throughput.

HTTPS/WSS is required in production (see README).

## 7. Repository layout

```
flux/
├── go.mod                         # module: flux (standard library only)
├── server/
│   ├── main.go                    # HTTP + WS bootstrap, serves /web, /api/config
│   ├── protocol/messages.go       # wire contract (Go)
│   ├── hub/
│   │   ├── websocket.go           # minimal RFC 6455 (no deps), text + binary
│   │   ├── hub.go                 # connection lifecycle, presence, pumps
│   │   └── relay.go               # control routing + verbatim binary relay
│   ├── discovery/
│   │   ├── scope.go               # discovery-scope key from the address
│   │   ├── registry.go            # presence registry (capabilities + TTL)
│   │   └── presence.go            # presence states
│   ├── session/
│   │   ├── session.go             # code-session membership
│   │   ├── pairing.go             # code / id generation
│   │   └── authorization.go       # scope-or-session authorization
│   └── config/config.go           # env-driven config
├── web/
│   ├── index.html
│   ├── styles.css
│   └── src/
│       ├── protocol.ts / protocol.js  # typed spec + runtime mirror + frame codec
│       ├── hashing.js             # incremental SHA-256
│       ├── writer.js              # streaming / Blob FileWriter
│       ├── resume.js              # resume state
│       ├── signaling.js           # WS control client + relay binary
│       ├── discovery.js           # capabilities + live peer map
│       ├── session.js             # pairing controller
│       ├── webrtc.js              # RTCPeerConnection + binary DataChannel
│       ├── relay.js               # relay send adapter
│       ├── transport.js           # direct/relay transport manager + fallback
│       ├── transfer.js            # the transfer engine
│       ├── ui.js                  # dashboard rendering
│       └── app.js                 # wiring / entry point
└── docs/
    ├── architecture.md            # this file
    └── protocol.md                # the message + frame contract
```

## 8. Capability model

Each device registers capabilities instead of platform-specific behavior:

```json
{ "platform": "macos", "browser": "safari",
  "capabilities": { "webrtc": true, "binaryDataChannel": true,
                    "streamingWriter": true, "nativeDiscovery": false } }
```

The session/transport logic reads these, so the same code path serves
Windows↔Windows, Android↔macOS, iPhone↔Windows, and every other combination.

## 9. Performance principles (applied)

No arbitrary bandwidth cap; direct P2P is the default path; binary payloads with
control kept separate; bounded buffering + transport backpressure; memory scales
with the in-flight window, not file size; the UI exposes Direct vs Relayed so a
slower relayed transfer is understood. **Adaptive chunk size** is now negotiated
per transfer (64 KiB safe floor for iOS/Safari, larger when both peers and the
DataChannel's `maxMessageSize` allow it; the in-flight window scales with it).
Optional **TURN** (`FLUX_TURN`) keeps more transfers on a direct P2P path across
NATs. Native high-performance transports remain later-version work.

## 10. Not in v4 web (later)

Native LAN discovery (mDNS/UDP) for desktop/mobile clients, multi-recipient
transfer (discovery already supports many peers; transfer is 1↔1), durable
resume across a full reconnect/refresh, and TURN for cross-internet relay (the Go
relay already covers the "WebRTC blocked" case on a LAN/rendezvous).
