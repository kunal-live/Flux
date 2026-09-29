# Security Model & Policy — Flux

This document describes the security architecture, trust boundaries, threat model, and explicit tradeoffs in Flux.

---

## 1. Threat Model & Trust Boundaries

Flux is designed for zero-install, nearby and ad-hoc file transfers across heterogeneous devices without centralized accounts or servers.

### 1.1 Discovery Boundaries

| Network Context | Scope Resolution | Discovery Visibility |
| :--- | :--- | :--- |
| **Local Subnet (Private IPv4)** | Masked to `/24` subnet (e.g. `192.168.1.0/24`) | Same-subnet devices automatically discover each other |
| **Localhost / Loopback** | Mapped to host's LAN `/24` | Local dev instances discover real LAN peers |
| **Public IP / Remote Tunnel** | Exact IP (e.g. `ip:203.0.113.45`) | Remote visitors get an isolated scope; **never** see LAN peers |

**Design Decision:** Remote visitors arriving through a Cloudflare Tunnel or public URL are placed in an isolated single-IP scope. A public URL can never silently enumerate or expose private LAN devices to strangers. Cross-scope transfers require explicit PIN or QR code pairing.

---

## 2. Data Transport Security & The Relay-Mode Tradeoff

Flux supports two distinct data plane modes:

```
Sender ═════════════════════[ Direct WebRTC DataChannel (DTLS 1.2) ]═════════════════════> Receiver
                         (Zero Server Insight — True End-to-End)

                                       - OR -

Sender ─────[ TLS 1.3 / WSS ]─────> [ Flux Go Hub ] ─────[ TLS 1.3 / WSS ]─────> Receiver
                                 (Transient in-memory relay)
```

### 2.1 Direct WebRTC Path (Primary)
- **Encryption:** Direct peer-to-peer data channels use DTLS 1.2 / SRTP.
- **Key Exchange:** DTLS keys and certificates are negotiated directly between the two browser instances.
- **Server Visibility:** **Zero.** The Flux Go server acts solely as a signaling relay for SDP offers/answers and ICE candidates. The server never observes, decrypts, or processes file content.

### 2.2 Fallback Relay Path (Tradeoff & Rationale)
When direct WebRTC cannot establish a connection within 9 seconds (e.g., symmetric NATs, restrictive enterprise firewalls, or CGNAT mobile hotspots without TURN), Flux automatically falls back to binary chunk relaying through the Go server.

> [!IMPORTANT]
> **Relay-Mode Plaintext Tradeoff (Documented Decision):**
> On the fallback relay path, transport encryption exists between Client ↔ Server and Server ↔ Client (via TLS 1.3 / HTTPS / WSS). Because the server must route raw binary frames between connections, **the Go server process holds binary chunks (64 KiB) transiently in volatile system memory.**

#### Mitigation & Guarantees:
1. **Zero Disk Persistence:** Relayed chunks are never saved to disk, scratch directories, or temporary files.
2. **Zero In-Memory Buffering:** Chunks are read from the incoming WebSocket connection and immediately queued to the target peer's buffered write queue; once transmitted, memory is reclaimed by the Go garbage collector.
3. **Zero Content Logging:** The server logs transfer operational metrics (e.g., total bytes transferred) but never logs frame headers, filenames, or payload contents.
4. **Per-Frame Authorization:** On every single relayed binary frame, the hub re-validates that the sender is authorized to talk to the recipient (either in the same subnet scope or in an active pairing session). An unauthenticated client cannot inject or hijack relayed traffic.
5. **Backpressure & Rate Limiting:** A token-bucket bandwidth limiter (`--relay-max-mbps`) prevents abusive relay consumption.

---

## 3. Session Pairing & PIN Security

When devices are in different scopes, they pair using a 6-character alphanumeric PIN code or a QR code encoding the session URL.

### 3.1 Two-Dimensional Rate Limiting
The 6-character alphanumeric space (~36⁶ ≈ 2.17 billion combinations) is hardened against brute-force attacks via dual-dimension rate limiting with exponential backoff:
1. **Per-IP Limiter:** Prevents a single client IP from performing dictionary or sequential brute-force sweeps across multiple PIN codes.
2. **Per-PIN Limiter:** Prevents distributed botnets or multi-IP attackers from coordinating brute-force attempts against a single session code.
3. **Exponential Backoff:** Repeated failed join attempts escalate required delay periods:
   - Attempts 1–3: Immediate response.
   - Attempts 4–5: 2-second enforcement delay.
   - Attempts 6–7: 8-second enforcement delay.
   - Attempts 8+: 30-second lock with session throttling.
4. **Session Expiry:** Sessions expire and are purged after 30 minutes of inactivity.

---

## 4. Integrity Verification

Every file transferred via Flux is protected by end-to-end cryptographic hashing:
- **Streaming SHA-256:** Sender and receiver incrementally compute the SHA-256 hash using streaming chunks (without loading entire multi-gigabyte files into RAM).
- **Pre-Completion Handshake:** After the final chunk is received and written, the receiver returns its computed SHA-256 digest to the sender via `TRANSFER_COMPLETE`.
- **Integrity Enforcement:** The UI blocks the "Complete" status unless the hashes match exactly. If a checksum mismatch occurs:
  - The transfer is flagged as corrupted.
  - The recipient is warned and the file is marked unverified.
  - An explicit retry option is presented.

---

## 5. Web Application Security

- **Origin Validation:** The WebSocket `/ws` endpoint verifies the `Origin` header against allowed origins (`FLUX_ALLOW_ORIGINS`) to prevent Cross-Site WebSocket Hijacking (CSWSH).
- **Secure File System Access:** Browser file picker APIs (`showSaveFilePicker`) require direct user gesture authorization and grant permission strictly to the destination file.
- **Dependency-Free Architecture:** The server is implemented entirely with Go's standard library with zero third-party dependencies, eliminating supply-chain vulnerabilities.

---

## 6. Reporting a Vulnerability

If you discover a security vulnerability in Flux, please report it responsibly by contacting the maintainers or opening a private security advisory on GitHub.
