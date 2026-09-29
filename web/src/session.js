// Explicit pairing sessions (QR / short code) — the alternative to automatic
// same-scope discovery. Thin wrapper over the signaling client.

import { MSG } from "./protocol.js";

export class SessionController extends EventTarget {
  constructor(signaling) {
    super();
    this.signaling = signaling;
    this.code = null;
    this.sessionId = null;

    signaling.on(MSG.SESSION_CREATED, (e) => {
      const pl = e.detail.payload || {};
      this.code = pl.code || null;
      this.sessionId = pl.sessionId || null;
      this.dispatchEvent(new CustomEvent("created", { detail: { code: this.code, sessionId: this.sessionId } }));
    });
    signaling.on(MSG.SESSION_JOINED, (e) => {
      const pl = e.detail.payload || {};
      if (pl.error) { this.dispatchEvent(new CustomEvent("join-error", { detail: pl.error })); return; }
      this.sessionId = pl.sessionId || null;
      this.dispatchEvent(new CustomEvent("joined", { detail: pl }));
    });
  }

  create() { this.signaling.createSession(); }
  join(code) { this.signaling.joinSession(code); }
}
