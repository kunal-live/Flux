# Flux — Implementation Plan (v3)

Reflects where the project actually stands after the Go/vanilla-JS build-out, and lays out what's left to harden it and ship it. Supersedes the earlier build order in `docs/architecture.md` — this plan incorporates subnet-scoping, PIN pairing, and File System Access API streaming writer.

---

## 1. Current State (Done)

| Area | Status | Notes |
| :--- | :--- | :--- |
| **Control plane** | ✅ Done | Go stdlib WebSocket hub, JSON envelopes, `/ws` endpoint |
| **Discovery — LAN** | ✅ Done | Private IPv4 grouped by `/24` subnet; loopback mapped to host's LAN `/24` |
| **Discovery — public** | ✅ Done | Public IPs isolated to exact IP; must pair via PIN/QR |
| **Pairing** | ✅ Done | 6-digit PIN + QR, rate-limited joins, 30-min session expiry |
| **WebRTC handshake** | ✅ Done | Offer/answer/ICE relay over control plane |
| **Data plane — primary** | ✅ Done | Direct WebRTC DataChannel, binary 64 KiB chunks |
| **Data plane — fallback** | ✅ Done | Go server relay, 9s ICE timeout before failover |
| **Framing** | ✅ Done | 10-byte header (version, kind, wire ID, chunk index) |
| **Backpressure** | ✅ Done | Pause >1MB buffered, resume <256KB |
| **Resume** | ✅ Done | `resume-request` with `lastContiguousChunk` on reconnect |
| **Integrity** | ✅ Done | Streaming SHA-256 both sides, verified before "Complete" |
| **Disk writer** | ✅ Done | File System Access API direct-to-disk streaming, Blob fallback for Safari/mobile |
| **Packaging** | ✅ Done | Single binary via `go:embed`, three deploy modes (localhost / LAN / Cloudflare tunnel) |
| **Server deps** | ✅ Done | Zero third-party Go modules — hand-rolled RFC 6455 WebSocket |

This is a working end-to-end system. What's left is hardening, testing, and UX polish, not core architecture.

---

## 2. Phase 1 — Correctness & Safety (do before trusting it with real data)

These close the two gaps flagged in review: an untested hand-rolled protocol implementation, and an undocumented security tradeoff.

- [x] **WebSocket conformance testing & protocol hardening.** Run and audit `server/hub/websocket.go` against RFC 6455 and Autobahn test suite edge cases:
  - Enforce client-to-server masking requirement (RFC 6455 §5.1; close with status 1002 on unmasked frames).
  - RSV1/2/3 reserved bits validation (RFC 6455 §5.2; close with status 1002 if non-zero without extension).
  - Control frame constraints (must be unfragmented with payload ≤ 125 bytes; status 1002 on violation).
  - Fragmented message sequence integrity (disallow unexpected continuation frames or interleaved text/binary frames).
  - Text payload UTF-8 conformance validation (`utf8.Valid`).
  - Unit tests covering all protocol edge cases.
- [x] **Document the relay-mode plaintext tradeoff.** Add [`SECURITY.md`](file:///SECURITY.md):
  - On the direct WebRTC path, DTLS 1.2 means the rendezvous server never sees plaintext bytes.
  - On the fallback relay path, the server necessarily holds plaintext binary chunks in memory transiently (not persisted). State this as a documented design decision.
  - Origin validation and per-frame relay authorization policies.
- [x] **PIN rate-limiter hardening.** Confirm and enforce dual-dimension rate limiting:
  - Per-IP limiter to prevent dictionary attacks against random PIN codes.
  - Per-PIN limiter to prevent distributed brute-force attacks against specific session codes.
  - Exponential backoff after repeated failures (not just a flat cap).
- [x] **SHA-256 mismatch UX.** Verify the failure path:
  - When hashes do not match, block the "Complete" state on both sender and receiver.
  - Display explicit "Integrity Verification Failed" warning and offer a retry action rather than failing silently.
  - Mark transfer history as failed/corrupted.
- [x] **Concurrent transfer stress test.**
  - Confirm wire IDs never collide across concurrent transfers between peers.
  - Confirm backpressure and chunk tracking are tracked per-transfer, not globally per-connection.

---

## 3. Phase 2 — Cross-Device Real-World Testing

- [ ] **iOS Safari pass.** Confirm the Blob-download fallback path actually triggers (Safari doesn't support File System Access API) and that 64 KiB chunking stays under Safari's SCTP buffer limits under real load, not just on localhost tabs.
- [ ] **Android Chrome pass.** Confirm File System Access API path works and permission prompts behave correctly on repeat visits.
- [ ] **Restrictive network pass.** Test the 9-second ICE failover on a real corporate/guest WiFi (or a mobile hotspot with CGNAT) to confirm relay fallback actually kicks in and completes a large file, not just small test payloads.
- [ ] **Cloudflare tunnel mode, cross-country.** Test Mode 3 (the London↔Tokyo case in the docs) for real — confirm PIN pairing, transfer speed, and whether relay mode becomes the norm rather than the exception over long-distance links (WebRTC direct P2P often fails cross-continent even with STUN, so relay-mode performance matters more here than on LAN).
- [ ] **Large file test.** A single 10GB+ file end-to-end — confirm memory stays flat as documented (~20MB) on both sender and receiver.

---

## 4. Phase 3 — UX Polish

- [x] **Transfer speed + ETA display.** EMA-based metrics rendered in active transfers dashboard.
- [x] **"Direct" vs "Relayed" badge.** Prominently visible during active transfer and in history logs.
- [x] **Drag-and-drop file selection.** File drop zone with visual hover states and feedback.
- [x] **Multi-file / folder queue.** Stage multiple files in a unified queue with itemized progress.
- [x] **Transfer history view.** Persisted locally per-session with filter, search, and date groupings.
- [ ] **QR code scan-to-join flow.** Tested on a real second physical device with camera scanner.

---

## 5. Phase 4 — Distribution

- [ ] **Prebuilt binaries for Windows/macOS/Linux** (GitHub Releases via Go cross-compilation with `go:embed`).
- [ ] **One-line install script** (`curl | sh` style) for LAN mode, mirroring LocalSend.
- [x] **`start-lan-https.sh` / equivalent shell script for macOS/Linux** alongside `start-lan-https.ps1`.
- [ ] **README update** with three deployment modes clearly documented for first-time users.

---

## 6. Explicitly Out of Scope (for now)

- **TURN server** — Go relay fallback already covers "WebRTC can't connect"; revisit only if cross-country tunnel testing demonstrates inadequate relay bandwidth.
- **Native app wrappers** (Wails, gomobile) — only after the web version is proven across Phase 2's real-device testing.
- **Accounts / auth beyond PIN pairing** — out of scope for a local-sharing tool.
- **Server-side transfer history / analytics** — deliberately ephemeral by design.

---

## 7. Suggested Order of Attack

1. **Phase 1 first, in full** — an untested hand-rolled WebSocket implementation and an undocumented security tradeoff are the two things most likely to bite after the fact, and both are cheap to close now.
2. **Phase 2's large-file and restrictive-network tests next** — these validate the actual value proposition (AirDrop-like speed, reliable fallback) before investing more time in polish.
3. **Phase 3 and 4 can interleave once Phase 1–2 are solid** — UX polish and distribution don't block each other.
