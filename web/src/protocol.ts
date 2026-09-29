// Typed mirror of the Flux wire format. Single source of truth alongside
// server/protocol/messages.go and web/src/protocol.js. Change all together.
// Control plane = these JSON envelopes. Data plane = binary frames (below).

export type MessageType =
  | "register"
  | "heartbeat"
  | "peer-list"
  | "peer-joined"
  | "peer-left"
  | "presence"
  | "create-session"
  | "session-created"
  | "join-session"
  | "session-joined"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "transfer-init"
  | "transfer-accept"
  | "transfer-reject"
  | "chunk-ack"
  | "resume-request"
  | "resume-response"
  | "transport-status"
  | "transfer-complete"
  | "transfer-cancel";

export interface Envelope<T = Record<string, unknown>> {
  type: MessageType;
  version?: number;
  sessionId?: string;
  from?: string;
  to?: string;
  payload?: T;
}

export interface Capabilities {
  webrtc: boolean;
  binaryDataChannel: boolean;
  streamingWriter: boolean;
  nativeDiscovery: boolean;
}

export interface RegisterPayload {
  alias: string;
  platform: "windows" | "macos" | "linux" | "android" | "ios" | "web";
  deviceType: "desktop" | "mobile" | "web";
  browser: string;
  capabilities: Capabilities;
}

export interface PeerInfo {
  id: string;
  alias: string;
  platform: string;
  deviceType: string;
  browser: string;
  presence: "discoverable" | "busy" | "receiving" | "sending" | "away" | "invisible";
  capabilities: Capabilities;
}

export interface TransferInitPayload {
  transferId: string;
  wireId: number;
  fileId: string;
  fileName: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  fileType: string;
  sha256: string;
}

export interface ChunkAckPayload {
  transferId: string;
  lastReceivedIndex: number;
}

export interface TransferCompletePayload {
  transferId: string;
  wireId: number;
  sha256: string; // receiver's computed hash
  ok: boolean;
}

export interface TransportStatusPayload {
  mode: "direct" | "relay";
}

/**
 * Binary data-frame layout (length-delimited by the transport):
 *   [version:u8][kind:u8][wireId:u32][chunkIndex:u32][payload...]
 * Header is 10 bytes. kind 1 = data chunk. Never JSON/base64.
 */
export const BINARY_HEADER_LEN = 10;
export const BINARY_VERSION = 1;
export const BINARY_KIND_DATA = 1;
