package discovery

import (
	"sync"
	"time"

	"flux/server/protocol"
)

// Device is one registered, currently-connected Flux client.
type Device struct {
	ID           string
	Alias        string
	Platform     string
	DeviceType   string
	Browser      string
	Presence     string
	Scope        string
	Capabilities protocol.Capabilities
	LastSeen     time.Time
}

// Registry is the in-memory presence store. One per server process.
type Registry struct {
	mu      sync.RWMutex
	devices map[string]*Device
}

func NewRegistry() *Registry {
	return &Registry{devices: make(map[string]*Device)}
}

// Add inserts or replaces a device.
func (r *Registry) Add(d *Device) {
	d.LastSeen = time.Now()
	if d.Presence == "" {
		d.Presence = PresenceDiscoverable
	}
	r.mu.Lock()
	r.devices[d.ID] = d
	r.mu.Unlock()
}

// Remove deletes a device and returns it (for peer-left broadcasts).
func (r *Registry) Remove(id string) *Device {
	r.mu.Lock()
	defer r.mu.Unlock()
	d := r.devices[id]
	delete(r.devices, id)
	return d
}

// Touch refreshes a device's heartbeat timestamp.
func (r *Registry) Touch(id string) {
	r.mu.Lock()
	if d, ok := r.devices[id]; ok {
		d.LastSeen = time.Now()
	}
	r.mu.Unlock()
}

// SetPresence updates a device's advertised presence.
func (r *Registry) SetPresence(id, presence string) {
	r.mu.Lock()
	if d, ok := r.devices[id]; ok {
		d.Presence = NormalizePresence(presence)
		d.LastSeen = time.Now()
	}
	r.mu.Unlock()
}

// Get returns a device by id.
func (r *Registry) Get(id string) (*Device, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	d, ok := r.devices[id]
	return d, ok
}

// PeersInScope returns every discoverable device sharing scope, excluding one
// id (usually the caller). Invisible devices are omitted.
func (r *Registry) PeersInScope(scope, exclude string) []protocol.PeerInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	peers := make([]protocol.PeerInfo, 0)
	for id, d := range r.devices {
		if id == exclude || d.Scope != scope || d.Presence == PresenceInvisible {
			continue
		}
		peers = append(peers, d.toPeerInfo())
	}
	return peers
}

// Expired removes and returns devices whose last heartbeat is older than ttl.
func (r *Registry) Expired(ttl time.Duration) []*Device {
	cutoff := time.Now().Add(-ttl)
	r.mu.Lock()
	defer r.mu.Unlock()
	var gone []*Device
	for id, d := range r.devices {
		if d.LastSeen.Before(cutoff) {
			gone = append(gone, d)
			delete(r.devices, id)
		}
	}
	return gone
}

func (d *Device) toPeerInfo() protocol.PeerInfo {
	return protocol.PeerInfo{
		ID:           d.ID,
		Alias:        d.Alias,
		Platform:     d.Platform,
		DeviceType:   d.DeviceType,
		Browser:      d.Browser,
		Presence:     d.Presence,
		Capabilities: d.Capabilities,
	}
}
