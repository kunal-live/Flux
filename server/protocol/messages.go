// Package protocol is the single source of truth for the Flux wire format,
// shared between the Go server and the web client. Mirrored in
// web/src/protocol.ts (types) and web/src/protocol.js (runtime constants) and
// documented in docs/protocol.md — change all of them together.
//
// Two planes:
//   - Control plane: versioned JSON envelopes (this file).
//   - Data plane: compact binary frames (see BinaryHeader) carried on the
//     WebRTC DataChannel directly, or forwarded verbatim by the relay. File
//     bytes are NEVER JSON/base64.
package protocol

// MessageType enumerates every control-plane message.
type MessageType string

const (
	// presence / discovery
	TypeRegister   MessageType = "register"
	TypeHeartbeat  MessageType = "heartbeat"
	TypePeerList   MessageType = "peer-list"
	TypePeerJoined MessageType = "peer-joined"
	TypePeerLeft   MessageType = "peer-left"
	TypePresence   MessageType = "presence" // client announces a new presence state

	// explicit pairing sessions (QR / code)
	TypeCreateSession  MessageType = "create-session"
	TypeSessionCreated MessageType = "session-created"
	TypeJoinSession    MessageType = "join-session"
	TypeSessionJoined  MessageType = "session-joined"

	// WebRTC handshake (relayed as-is between two peers)
	TypeOffer        MessageType = "offer"
	TypeAnswer       MessageType = "answer"
	TypeICECandidate MessageType = "ice-candidate"

	// transfer lifecycle
	TypeTransferInit     MessageType = "transfer-init"
	TypeTransferAccept   MessageType = "transfer-accept"
	TypeTransferReject   MessageType = "transfer-reject"
	TypeChunkAck         MessageType = "chunk-ack"
	TypeResumeRequest    MessageType = "resume-request"
	TypeResumeResponse   MessageType = "resume-response"
	TypeTransportStatus  MessageType = "transport-status" // Direct vs Relayed + relay routing
	TypeTransferComplete MessageType = "transfer-complete"
	TypeTransferCancel   MessageType = "transfer-cancel"
)

// Envelope is the outer shape of every control message.
type Envelope struct {
	Type      MessageType    `json:"type"`
	Version   int            `json:"version,omitempty"`
	SessionID string         `json:"sessionId,omitempty"`
	From      string         `json:"from,omitempty"`
	To        string         `json:"to,omitempty"`
	Payload   map[string]any `json:"payload,omitempty"`
}

// Capabilities is what a device advertises so the session manager can choose a
// transport/writer without any platform-specific branching.
type Capabilities struct {
	WebRTC            bool `json:"webrtc"`
	BinaryDataChannel bool `json:"binaryDataChannel"`
	StreamingWriter   bool `json:"streamingWriter"`
	NativeDiscovery   bool `json:"nativeDiscovery"`
}

// RegisterPayload is the first message a client sends.
type RegisterPayload struct {
	Alias        string       `json:"alias"`
	Platform     string       `json:"platform"`   // windows | macos | linux | android | ios | web
	DeviceType   string       `json:"deviceType"` // desktop | mobile | web
	Browser      string       `json:"browser"`
	Capabilities Capabilities `json:"capabilities"`
}

// PeerInfo is what other clients see about a device in their discovery scope.
type PeerInfo struct {
	ID           string       `json:"id"`
	Alias        string       `json:"alias"`
	Platform     string       `json:"platform"`
	DeviceType   string       `json:"deviceType"`
	Browser      string       `json:"browser"`
	Presence     string       `json:"presence"` // discoverable | busy | receiving | sending | away
	Capabilities Capabilities `json:"capabilities"`
}

// TransferInitPayload announces an incoming file. `wireId` ties the JSON
// control message to the compact numeric id used in binary frame headers.
type TransferInitPayload struct {
	TransferID  string `json:"transferId"`
	WireID      uint32 `json:"wireId"`
	FileID      string `json:"fileId"`
	FileName    string `json:"fileName"`
	Size        int64  `json:"size"`
	ChunkSize   int    `json:"chunkSize"`
	TotalChunks int    `json:"totalChunks"`
	FileType    string `json:"fileType"`
	SHA256      string `json:"sha256"`
}

// BinaryHeader documents the fixed 10-byte prefix on every data-plane frame.
// The frame is length-delimited by the transport (WebSocket/DataChannel), so
// no explicit payload length is needed.
//
//	┌─────────┬──────┬──────────────┬──────────────┬───────────────┐
//	│ version │ kind │ wireId (u32) │ index  (u32) │ binary payload │
//	│  1 byte │ 1 b  │   4 bytes    │   4 bytes    │      ...        │
//	└─────────┴──────┴──────────────┴──────────────┴───────────────┘
type BinaryHeader struct {
	Version byte
	Kind    byte // 1 = data chunk
	WireID  uint32
	Index   uint32
}

const (
	BinaryVersion   = 1
	BinaryKindData  = 1
	BinaryHeaderLen = 10
)
