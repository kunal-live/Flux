package hub

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"flux/server/discovery"
	"flux/server/protocol"
	"flux/server/session"
)

const (
	sendBuffer   = 512
	pingInterval = 25 * time.Second
)

type outFrame struct {
	opcode int
	data   []byte
}

// Client is one connected Flux device.
type Client struct {
	ID         string
	IP         string
	Alias      string
	Platform   string
	DeviceType string
	Browser    string
	Scope      string
	Caps       protocol.Capabilities

	conn      *Conn
	out       chan outFrame
	closeOnce sync.Once

	rmu         sync.Mutex
	binaryRoute string // when set, inbound binary frames are forwarded to this client id (relay mode)

	// relay rate limiting (token bucket, bytes) — only used when maxRelayBps > 0
	relayTokens float64
	relayLast   time.Time

	// join-attempt throttle
	jmu       sync.Mutex
	joinTimes []time.Time
}

// Hub ties together the presence registry, the session manager, and the live
// connections. One per process.
type Hub struct {
	registry    *discovery.Registry
	sessions    *session.Manager
	ttl         time.Duration
	sessionTTL  time.Duration
	maxRelayBps float64

	mu      sync.RWMutex
	clients map[string]*Client

	// metrics (atomic)
	connsActive  int64
	connsTotal   int64
	transfers    int64
	relayedBytes int64
}

func NewHub(ttl, sessionTTL time.Duration, maxRelayMBps int) *Hub {
	h := &Hub{
		registry:    discovery.NewRegistry(),
		sessions:    session.NewManager(),
		ttl:         ttl,
		sessionTTL:  sessionTTL,
		maxRelayBps: float64(maxRelayMBps) * 1024 * 1024,
		clients:     make(map[string]*Client),
	}
	go h.sweepPresence()
	return h
}

// ServeConn runs one connection's whole lifetime: register handshake, then
// bidirectional pumps until the socket closes.
func (h *Hub) ServeConn(conn *Conn, scope, clientIP string) {
	msgType, data, err := conn.ReadMessage()
	if err != nil || msgType != TextMessage {
		conn.Close()
		return
	}
	var env protocol.Envelope
	if err := json.Unmarshal(data, &env); err != nil || env.Type != protocol.TypeRegister {
		conn.Close()
		return
	}

	reg := decodeRegister(env.Payload)
	c := &Client{
		ID:         newID(),
		IP:         clientIP,
		Alias:      reg.Alias,
		Platform:   reg.Platform,
		DeviceType: reg.DeviceType,
		Browser:    reg.Browser,
		Scope:      scope,
		Caps:       reg.Capabilities,
		conn:       conn,
		out:        make(chan outFrame, sendBuffer),
	}

	h.registry.Add(&discovery.Device{
		ID: c.ID, Alias: c.Alias, Platform: c.Platform, DeviceType: c.DeviceType,
		Browser: c.Browser, Scope: c.Scope, Capabilities: c.Caps,
		Presence: discovery.PresenceDiscoverable,
	})
	h.mu.Lock()
	h.clients[c.ID] = c
	h.mu.Unlock()
	atomic.AddInt64(&h.connsActive, 1)
	atomic.AddInt64(&h.connsTotal, 1)

	log.Printf("registered %s (%s / %s / %s) scope=%s", c.ID, c.Alias, c.Platform, c.DeviceType, scope)

	// Tell the newcomer its id + who else is in scope.
	h.sendEnv(c, protocol.Envelope{
		Type:    protocol.TypePeerList,
		To:      c.ID,
		Payload: map[string]any{"self": c.ID, "peers": h.activePeersInScope(scope, c.ID)},
	})
	// Announce it to everyone else in scope.
	h.broadcastToScope(scope, c.ID, protocol.Envelope{
		Type: protocol.TypePeerJoined,
		Payload: map[string]any{"peer": protocol.PeerInfo{
			ID: c.ID, Alias: c.Alias, Platform: c.Platform, DeviceType: c.DeviceType,
			Browser: c.Browser, Presence: discovery.PresenceDiscoverable, Capabilities: c.Caps,
		}},
	})

	go h.writePump(c)
	h.readPump(c)
}

func (h *Hub) readPump(c *Client) {
	defer h.teardown(c)
	for {
		msgType, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		switch msgType {
		case BinaryMessage:
			// Data-plane frame on the relay path: forward verbatim, no parsing.
			route := c.getRoute()
			if route == "" {
				continue
			}
			target, ok := h.getClient(route)
			if !ok {
				continue
			}
			// Re-authorize on every frame: a client must not be able to blast
			// bytes at a peer it is not in-scope with / paired with, even if it
			// managed to set a route earlier.
			if !h.sessions.Authorized(c.ID, target.ID, target.Scope == c.Scope) {
				c.setRoute("")
				continue
			}
			// Optional per-connection rate cap (anti-abuse; unlimited by default).
			if !c.allowRelay(len(data), h.maxRelayBps) {
				continue
			}
			// Blocking hand-off: if the target is congested this blocks THIS
			// reader, which propagates backpressure to the sender over TCP —
			// far better than silently dropping a file chunk with no retransmit.
			atomic.AddInt64(&h.relayedBytes, int64(len(data)))
			target.enqueueBlocking(outFrame{opcode: BinaryMessage, data: data})
		case TextMessage:
			var env protocol.Envelope
			if err := json.Unmarshal(data, &env); err != nil {
				continue
			}
			h.dispatch(c, &env)
		}
	}
}

func (h *Hub) writePump(c *Client) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case f, ok := <-c.out:
			if !ok {
				return
			}
			if err := c.conn.WriteMessage(f.opcode, f.data); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.conn.Ping(); err != nil {
				return
			}
		}
	}
}

func (h *Hub) teardown(c *Client) {
	h.registry.Remove(c.ID)
	h.sessions.Leave(c.ID)
	h.mu.Lock()
	_, exists := h.clients[c.ID]
	delete(h.clients, c.ID)
	h.mu.Unlock()

	c.closeOnce.Do(func() {
		close(c.out)
		c.conn.Close()
	})

	if exists {
		atomic.AddInt64(&h.connsActive, -1)
		h.broadcastToScope(c.Scope, c.ID, protocol.Envelope{
			Type:    protocol.TypePeerLeft,
			Payload: map[string]any{"peerId": c.ID},
		})
		log.Printf("unregistered %s", c.ID)
	}
}

// sweepPresence expires devices whose heartbeats stopped, as a backstop to the
// socket-close path.
func (h *Hub) sweepPresence() {
	tick := h.ttl / 2
	if tick < time.Second {
		tick = time.Second
	}
	t := time.NewTicker(tick)
	defer t.Stop()
	for range t.C {
		for _, members := range h.sessions.ExpireIdle(h.sessionTTL) {
			for _, id := range members {
				if c, ok := h.getClient(id); ok {
					h.sendEnv(c, protocol.Envelope{
						Type:    protocol.TypePeerLeft,
						Payload: map[string]any{"peerId": "", "sessionExpired": true},
					})
				}
			}
		}
		for _, d := range h.registry.Expired(h.ttl) {
			h.broadcastToScope(d.Scope, d.ID, protocol.Envelope{
				Type:    protocol.TypePeerLeft,
				Payload: map[string]any{"peerId": d.ID},
			})
			if c, ok := h.getClient(d.ID); ok {
				h.teardown(c)
			}
			log.Printf("expired %s (no heartbeat)", d.ID)
		}
	}
}

func (h *Hub) activePeersInScope(scope, exclude string) []protocol.PeerInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	peers := make([]protocol.PeerInfo, 0)
	for id, client := range h.clients {
		if id == exclude || client.Scope != scope {
			continue
		}
		if d, ok := h.registry.Get(id); ok && d.Presence != discovery.PresenceInvisible {
			peers = append(peers, protocol.PeerInfo{
				ID:           client.ID,
				Alias:        client.Alias,
				Platform:     client.Platform,
				DeviceType:   client.DeviceType,
				Browser:      client.Browser,
				Presence:     d.Presence,
				Capabilities: client.Caps,
			})
		}
	}
	return peers
}

// Metrics returns a snapshot of operational counters for the /metrics endpoint.
func (h *Hub) Metrics() map[string]any {
	return map[string]any{
		"connectionsActive": atomic.LoadInt64(&h.connsActive),
		"connectionsTotal":  atomic.LoadInt64(&h.connsTotal),
		"transfersStarted":  atomic.LoadInt64(&h.transfers),
		"relayedBytes":      atomic.LoadInt64(&h.relayedBytes),
	}
}

// --- helpers -------------------------------------------------------------

func (h *Hub) getClient(id string) (*Client, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	c, ok := h.clients[id]
	return c, ok
}

func (h *Hub) sendEnv(c *Client, env protocol.Envelope) {
	data, err := json.Marshal(env)
	if err != nil {
		return
	}
	c.enqueue(outFrame{opcode: TextMessage, data: data})
}

func (h *Hub) broadcastToScope(scope, exclude string, env protocol.Envelope) {
	data, err := json.Marshal(env)
	if err != nil {
		return
	}
	h.mu.RLock()
	targets := make([]*Client, 0)
	for id, c := range h.clients {
		if id != exclude && c.Scope == scope {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()
	for _, c := range targets {
		c.enqueue(outFrame{opcode: TextMessage, data: data})
	}
}

func (c *Client) enqueue(f outFrame) {
	defer func() { _ = recover() }() // out may be closed concurrently on teardown
	select {
	case c.out <- f:
	case <-time.After(500 * time.Millisecond):
		// Slow/dead client — drop rather than deadlock the hub.
	}
}

// enqueueBlocking hands a frame to the client's write pump, blocking until
// there is room (relay backpressure) rather than dropping. It gives up only if
// the client stays wedged far longer than any healthy peer would, to avoid a
// permanently stuck reader goroutine on a dead socket.
func (c *Client) enqueueBlocking(f outFrame) {
	defer func() { _ = recover() }() // out may be closed on teardown
	select {
	case c.out <- f:
	case <-time.After(30 * time.Second):
		// Target has been unable to accept for 30s — treat as dead; the frame
		// is lost and the transfer will fail its integrity check, which is the
		// correct signal (vs. a silent partial success).
	}
}

// allowRelay applies an optional token-bucket rate cap to relayed bytes.
// maxBps <= 0 means unlimited. Returns false if this frame would exceed the cap
// (caller drops it; a legitimate transfer never hits a sanely-configured cap).
func (c *Client) allowRelay(n int, maxBps float64) bool {
	if maxBps <= 0 {
		return true
	}
	c.rmu.Lock()
	defer c.rmu.Unlock()
	now := time.Now()
	if c.relayLast.IsZero() {
		c.relayLast = now
		c.relayTokens = maxBps // allow a one-second burst
	}
	c.relayTokens += now.Sub(c.relayLast).Seconds() * maxBps
	if c.relayTokens > maxBps {
		c.relayTokens = maxBps
	}
	c.relayLast = now
	if c.relayTokens < float64(n) {
		return false
	}
	c.relayTokens -= float64(n)
	return true
}

// allowJoin rate-limits pairing-code join attempts (anti-brute-force on the
// 6-char code space): at most maxJoins within joinWindow per connection.
func (c *Client) allowJoin() bool {
	const maxJoins = 10
	const joinWindow = time.Minute
	c.jmu.Lock()
	defer c.jmu.Unlock()
	now := time.Now()
	cutoff := now.Add(-joinWindow)
	kept := c.joinTimes[:0]
	for _, t := range c.joinTimes {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	c.joinTimes = kept
	if len(c.joinTimes) >= maxJoins {
		return false
	}
	c.joinTimes = append(c.joinTimes, now)
	return true
}

func (c *Client) setRoute(id string) { c.rmu.Lock(); c.binaryRoute = id; c.rmu.Unlock() }
func (c *Client) getRoute() string   { c.rmu.Lock(); defer c.rmu.Unlock(); return c.binaryRoute }

func decodeRegister(p map[string]any) protocol.RegisterPayload {
	var reg protocol.RegisterPayload
	if p == nil {
		reg.Alias, reg.DeviceType, reg.Platform = "Anonymous", "web", "web"
		return reg
	}
	str := func(k string) string { v, _ := p[k].(string); return v }
	reg.Alias = str("alias")
	reg.Platform = str("platform")
	reg.DeviceType = str("deviceType")
	reg.Browser = str("browser")
	if caps, ok := p["capabilities"].(map[string]any); ok {
		b := func(k string) bool { v, _ := caps[k].(bool); return v }
		reg.Capabilities = protocol.Capabilities{
			WebRTC: b("webrtc"), BinaryDataChannel: b("binaryDataChannel"),
			StreamingWriter: b("streamingWriter"), NativeDiscovery: b("nativeDiscovery"),
		}
	}
	if reg.Alias == "" {
		reg.Alias = "Anonymous"
	}
	if reg.DeviceType == "" {
		reg.DeviceType = "web"
	}
	if reg.Platform == "" {
		reg.Platform = "web"
	}
	return reg
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
