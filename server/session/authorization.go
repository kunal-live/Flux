package session

// Authorization policy for who may exchange signaling / transfer control.
//
// Flux keeps this permissive-but-explicit: a message from A to B is allowed
// when the two are in the same discovery scope (checked by the hub) OR share an
// explicit pairing session (checked here). Actual transfer consent is a
// per-transfer receiver approval enforced by the clients (transfer-accept /
// transfer-reject); the server never sees file bytes on the direct path.

// Authorized reports whether client `a` may address client `b` given their
// shared-session state and whether the hub already found them in-scope.
func (m *Manager) Authorized(a, b string, sameScope bool) bool {
	if sameScope {
		return true
	}
	return m.Contains(a, b)
}
