package hub

import (
	"sync/atomic"
	"time"

	"flux/server/discovery"
	"flux/server/protocol"
)

// pointToPoint messages are forwarded to the single peer named in `to`, after
// an authorization check. The server never inspects SDP, ICE, or transfer
// payloads — and file bytes travel as binary frames, not through here.
var pointToPoint = map[protocol.MessageType]bool{
	protocol.TypeOffer:            true,
	protocol.TypeAnswer:           true,
	protocol.TypeICECandidate:     true,
	protocol.TypeTransferInit:     true,
	protocol.TypeTransferAccept:   true,
	protocol.TypeTransferReject:   true,
	protocol.TypeChunkAck:         true,
	protocol.TypeResumeRequest:    true,
	protocol.TypeResumeResponse:   true,
	protocol.TypeTransferComplete: true,
	protocol.TypeTransferCancel:   true,
}

func (h *Hub) dispatch(c *Client, env *protocol.Envelope) {
	env.From = c.ID

	switch {
	case env.Type == protocol.TypeHeartbeat:
		h.registry.Touch(c.ID)

	case env.Type == protocol.TypePresence:
		state, _ := env.Payload["state"].(string)
		h.registry.SetPresence(c.ID, state)
		if d, ok := h.registry.Get(c.ID); ok {
			h.broadcastToScope(c.Scope, c.ID, protocol.Envelope{
				Type:    protocol.TypePeerJoined, // upsert on the client side
				Payload: map[string]any{"peer": peerInfoOf(d)},
			})
		}

	case env.Type == protocol.TypeCreateSession:
		h.handleCreateSession(c)

	case env.Type == protocol.TypeJoinSession:
		h.handleJoinSession(c, env)

	case env.Type == protocol.TypeTransportStatus:
		h.handleTransportStatus(c, env)

	case pointToPoint[env.Type]:
		if env.Type == protocol.TypeTransferInit {
			atomic.AddInt64(&h.transfers, 1)
		}
		h.forward(c, env)
	}
}

func (h *Hub) handleCreateSession(c *Client) {
	s, err := h.sessions.Create(c.ID)
	if err != nil {
		return
	}
	h.sendEnv(c, protocol.Envelope{
		Type:      protocol.TypeSessionCreated,
		To:        c.ID,
		SessionID: s.ID,
		Payload:   map[string]any{"code": s.Code, "sessionId": s.ID},
	})
}

func (h *Hub) handleJoinSession(c *Client, env *protocol.Envelope) {
	code, _ := env.Payload["code"].(string)
	if code == "" {
		return
	}
	if !c.allowJoin() {
		h.sendEnv(c, protocol.Envelope{
			Type:    protocol.TypeSessionJoined,
			To:      c.ID,
			Payload: map[string]any{"error": "too many attempts, slow down", "peers": []protocol.PeerInfo{}},
		})
		return
	}
	allowed, wait := h.sessions.CheckJoin(c.IP, code)
	if !allowed {
		msg := "too many attempts, slow down"
		if wait > 0 {
			msg = "too many attempts, retry in " + wait.Round(100*time.Millisecond).String()
		}
		h.sendEnv(c, protocol.Envelope{
			Type:    protocol.TypeSessionJoined,
			To:      c.ID,
			Payload: map[string]any{"error": msg, "peers": []protocol.PeerInfo{}},
		})
		return
	}
	s, existing, err := h.sessions.Join(c.ID, code)
	if err != nil {
		h.sessions.RecordJoinFailure(c.IP, code)
		h.sendEnv(c, protocol.Envelope{
			Type:    protocol.TypeSessionJoined,
			To:      c.ID,
			Payload: map[string]any{"error": "session not found", "peers": []protocol.PeerInfo{}},
		})
		return
	}
	h.sessions.RecordJoinSuccess(c.IP, code)
	// Peers already in the session (look up their live presence info).
	peers := make([]protocol.PeerInfo, 0, len(existing))
	for _, id := range existing {
		if d, ok := h.registry.Get(id); ok {
			peers = append(peers, peerInfoOf(d))
		}
	}
	h.sendEnv(c, protocol.Envelope{
		Type:      protocol.TypeSessionJoined,
		To:        c.ID,
		SessionID: s.ID,
		Payload:   map[string]any{"self": c.ID, "sessionId": s.ID, "code": code, "peers": peers},
	})
	// Tell the existing members (possibly in another scope) that this peer joined.
	if d, ok := h.registry.Get(c.ID); ok {
		info := peerInfoOf(d)
		for _, id := range existing {
			if target, ok := h.getClient(id); ok {
				h.sendEnv(target, protocol.Envelope{
					Type:      protocol.TypePeerJoined,
					SessionID: s.ID,
					Payload:   map[string]any{"peer": info},
				})
			}
		}
	}
}

// handleTransportStatus records the relay binary route (so raw data frames can
// be forwarded) and passes the Direct/Relayed status on to the peer.
func (h *Hub) handleTransportStatus(c *Client, env *protocol.Envelope) {
	mode, _ := env.Payload["mode"].(string)
	if env.To != "" {
		if mode == "relay" {
			// Only arm the binary relay route if the pair is authorized; the
			// per-frame check in readPump re-verifies, but refusing here avoids
			// arming a route at all for an unauthorized peer.
			if target, ok := h.getClient(env.To); ok && h.sessions.Authorized(c.ID, target.ID, target.Scope == c.Scope) {
				c.setRoute(env.To)
			}
		} else {
			c.setRoute("")
		}
	}
	h.forward(c, env)
}

// forward delivers a point-to-point message to env.To, if authorized.
func (h *Hub) forward(c *Client, env *protocol.Envelope) {
	if env.To == "" {
		return
	}
	target, ok := h.getClient(env.To)
	if !ok {
		return
	}
	sameScope := target.Scope == c.Scope
	if !h.sessions.Authorized(c.ID, target.ID, sameScope) {
		return
	}
	h.sendEnv(target, *env)
}

func peerInfoOf(d *discovery.Device) protocol.PeerInfo {
	return protocol.PeerInfo{
		ID: d.ID, Alias: d.Alias, Platform: d.Platform, DeviceType: d.DeviceType,
		Browser: d.Browser, Presence: d.Presence, Capabilities: d.Capabilities,
	}
}
