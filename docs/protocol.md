# Flux Protocol (v4)

Authoritative contract between the Go server and the web client. Mirrored in
`server/protocol/messages.go`, `web/src/protocol.ts`, and `web/src/protocol.js`
— change all together. Two planes: a JSON **control plane** and a binary **data
plane**.

## Control plane — JSON envelope

```json
{ "version": 1, "type": "<type>", "sessionId": "...", "from": "...", "to": "...", "payload": { } }
```

`sessionId`, `from`, `to` are present as needed. The server stamps `from` with
the sender's real id and forwards point-to-point messages to `to` only when the
two peers share a discovery scope or a session.

| Type | Direction | Purpose |
|---|---|---|
| `register` | client → server | First message: alias, platform, deviceType, browser, capabilities |
| `heartbeat` | client → server | Presence keepalive (every 10 s); entries expire after the TTL |
| `peer-list` | server → client | Your id (`self`) + peers currently in your scope |
| `peer-joined` | server → client | A peer appeared / updated (also used as presence upsert) |
| `peer-left` | server → client | A peer disconnected or expired |
| `presence` | client → server | Announce a new presence state (discoverable/busy/receiving/…) |
| `create-session` | client → server | Request a pairing code |
| `session-created` | server → client | The generated `code` + `sessionId` |
| `join-session` | client → server | Join an existing `code` |
| `session-joined` | server → client | Session peers (works across scopes) |
| `offer` / `answer` | relayed | WebRTC SDP |
| `ice-candidate` | relayed | WebRTC ICE candidate |
| `transfer-init` | sender → receiver | Announce a file (see payload below) |
| `transfer-accept` | receiver → sender | Receiver approved (after a user gesture) |
| `transfer-reject` | receiver → sender | Receiver declined |
| `chunk-ack` | receiver → sender | `lastReceivedIndex` — progress / resume driver |
| `resume-request` | receiver → sender | `lastContiguousChunk` to resume from |
| `resume-response` | sender → receiver | Sender validated identity/size, will resume |
| `transport-status` | either ↔ either | `{ mode: "direct" \| "relay" }`; relay sets the server's binary route |
| `transfer-complete` | receiver → sender | Receiver's SHA-256 + `ok` verdict |
| `transfer-cancel` | either → either | Abort a transfer |

### `transfer-init` payload

```json
{ "transferId": "...", "wireId": 2, "fileId": "...", "fileName": "video.mp4",
  "size": 5368709120, "chunkSize": 65536, "totalChunks": 81920,
  "fileType": "video/mp4", "sha256": "<sender hash>" }
```

`wireId` (uint32) ties this transfer to its binary frames.

## Data plane — binary frames only

File bytes are never JSON/base64. Each chunk is a length-delimited binary frame
(the WebSocket/DataChannel delimits length, so no explicit length field):

```
┌───────────┬────────┬───────────────┬────────────────┬───────────────┐
│ version u8 │ kind u8 │ wireId  u32be │ chunkIndex u32be │ payload …    │
│    1      │   1    │      4        │       4        │  ≤ 64 KiB     │
└───────────┴────────┴───────────────┴────────────────┴───────────────┘
```

`kind = 1` is a data chunk. Header is 10 bytes. Payload is at most 64 KiB (the
universally-safe DataChannel message size). On the direct path the frame rides
the WebRTC DataChannel; on the relay path the server forwards the identical
frame between the two WebSocket connections — it never parses or stores it.

## Notes

- **Auto scope vs sessions**: a client is always in one discovery scope (by
  observed address — public IPs isolate by whole IP, private IPv4 groups by /24,
  loopback maps to the LAN /24) and may also join code-sessions. Point-to-point
  messages are authorized only when the two peers share a scope or a session.
  `transport-status{relay}` tells the server to forward a sender's binary frames
  to the peer — armed and then re-checked per frame against that same
  authorization.
- **Integrity**: `sha256` in `transfer-init` is the sender's whole-file hash
  (computed incrementally). The receiver recomputes incrementally and returns
  its hash in `transfer-complete`; a mismatch is surfaced, not trusted.
- **Resume**: the receiver keeps its last contiguous chunk. On a direct->relay
  failover it sends `resume-request{lastContiguousChunk,size}`; the sender
  validates size, replies `resume-response`, and resends from the next chunk.
  Receiver writes are offset-addressed/idempotent so duplicates are harmless.
  `transfer-complete` carries the receiver's `sha256` so the sender can confirm
  the verdict too. Durable resume across a full reconnect/refresh is a follow-up.
