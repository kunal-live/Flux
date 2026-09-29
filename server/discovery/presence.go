package discovery

// Presence states a device can advertise. A device may be visible without
// being trusted; presence is deliberately scoped and expires on disconnect.
const (
	PresenceDiscoverable = "discoverable"
	PresenceBusy         = "busy"
	PresenceReceiving    = "receiving"
	PresenceSending      = "sending"
	PresenceAway         = "away"
	PresenceInvisible    = "invisible"
)

// NormalizePresence maps an arbitrary client-supplied value onto a known state,
// defaulting to discoverable.
func NormalizePresence(s string) string {
	switch s {
	case PresenceDiscoverable, PresenceBusy, PresenceReceiving, PresenceSending, PresenceAway, PresenceInvisible:
		return s
	default:
		return PresenceDiscoverable
	}
}
