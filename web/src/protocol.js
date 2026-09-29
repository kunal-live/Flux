// Runtime protocol constants + binary data-frame codec for the browser.
// Mirrors server/protocol/messages.go and web/src/protocol.ts. Change together.

export const MSG = Object.freeze({
  REGISTER: "register",
  HEARTBEAT: "heartbeat",
  PEER_LIST: "peer-list",
  PEER_JOINED: "peer-joined",
  PEER_LEFT: "peer-left",
  PRESENCE: "presence",

  CREATE_SESSION: "create-session",
  SESSION_CREATED: "session-created",
  JOIN_SESSION: "join-session",
  SESSION_JOINED: "session-joined",

  OFFER: "offer",
  ANSWER: "answer",
  ICE_CANDIDATE: "ice-candidate",

  TRANSFER_INIT: "transfer-init",
  TRANSFER_ACCEPT: "transfer-accept",
  TRANSFER_REJECT: "transfer-reject",
  CHUNK_ACK: "chunk-ack",
  RESUME_REQUEST: "resume-request",
  RESUME_RESPONSE: "resume-response",
  TRANSPORT_STATUS: "transport-status",
  TRANSFER_COMPLETE: "transfer-complete",
  TRANSFER_CANCEL: "transfer-cancel",
});

// Transfer tuning. 64 KiB is the universally-safe DataChannel message size:
// it stays well under the 256 KiB SCTP cap (even with our 10-byte header) and
// within iOS Safari's tighter limit. Larger single messages can fail the send
// and tear down the channel. Throughput comes from the in-flight window /
// backpressure, not from oversized messages. Adaptive growth is a later step.
export const CHUNK_SIZE = 64 * 1024;
export const FALLBACK_TIMEOUT_MS = 9000;
export const ACK_EVERY = 64; // receiver acks every N chunks
export const HIGH_WATER = 1024 * 1024; // 1 MB (safe SCTP in-flight window)
export const LOW_WATER = 256 * 1024;  // 256 KB

// Binary data-frame layout: [ver:1][kind:1][wireId:u32][index:u32][payload].
export const BINARY_VERSION = 1;
export const BINARY_KIND_DATA = 1;
export const BINARY_HEADER_LEN = 10;

/** Pack a data chunk into a length-delimited binary frame (ArrayBuffer). */
export function packDataFrame(wireId, index, bytes) {
  const frame = new Uint8Array(BINARY_HEADER_LEN + bytes.length);
  const dv = new DataView(frame.buffer);
  dv.setUint8(0, BINARY_VERSION);
  dv.setUint8(1, BINARY_KIND_DATA);
  dv.setUint32(2, wireId >>> 0);
  dv.setUint32(6, index >>> 0);
  frame.set(bytes, BINARY_HEADER_LEN);
  return frame.buffer;
}

/** Parse a binary frame (ArrayBuffer) into its header fields + payload view. */
export function parseDataFrame(buf) {
  const dv = new DataView(buf);
  return {
    version: dv.getUint8(0),
    kind: dv.getUint8(1),
    wireId: dv.getUint32(2),
    index: dv.getUint32(6),
    payload: new Uint8Array(buf, BINARY_HEADER_LEN),
  };
}
