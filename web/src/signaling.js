// WebSocket control-plane client + relay data path.
//
// Control messages are small JSON envelopes routed by the server. On the relay
// fallback, file bytes travel as raw binary WebSocket frames (the server
// forwards them verbatim to the routed peer) — never base64/JSON.

import { MSG } from "./protocol.js";

export class Signaling extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.selfId = null;
    this.connected = false;
    this._hb = null;
    this._registration = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 1000;
    this._autoReconnect = true;
  }

  /** Open the socket and register. Resolves with our id once peer-list arrives. */
  connect(registration) {
    this._registration = registration;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws`;
    return new Promise((resolve, reject) => {
      let settled = false;
      if (this._hb) clearInterval(this._hb);
      if (this._reconnectTimer) clearTimeout(this._reconnectTimer);

      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this._reconnectDelay = 1000;
        this._send(MSG.REGISTER, this._registration);
        this._hb = setInterval(() => this._send(MSG.HEARTBEAT, {}), 10000);
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") {
          // Relay data-plane frame.
          this.dispatchEvent(new CustomEvent("binary", { detail: ev.data }));
          return;
        }
        let env;
        try { env = JSON.parse(ev.data); } catch { return; }
        if (env.type === MSG.PEER_LIST && env.payload && env.payload.self) {
          const isInitial = !this.selfId;
          this.selfId = env.payload.self;
          if (isInitial && !settled) { settled = true; resolve(this.selfId); }
          this.dispatchEvent(new CustomEvent("connected", { detail: { selfId: this.selfId } }));
        }
        this.dispatchEvent(new CustomEvent(env.type, { detail: env }));
      };

      ws.onclose = () => {
        this.connected = false;
        if (this._hb) clearInterval(this._hb);
        this.dispatchEvent(new CustomEvent("disconnected"));
        if (!settled) { settled = true; reject(new Error("socket closed before registration")); }

        if (this._autoReconnect) {
          this._scheduleReconnect();
        }
      };
      ws.onerror = () => this.dispatchEvent(new CustomEvent("socket-error"));
    });
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this.dispatchEvent(new CustomEvent("reconnecting", { detail: { delay: this._reconnectDelay } }));
    this._reconnectTimer = setTimeout(() => {
      if (this._registration && !this.connected) {
        this.connect(this._registration).catch(() => {});
        this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 8000);
      }
    }, this._reconnectDelay);
  }

  updateRegistration(newReg) {
    this._registration = { ...(this._registration || {}), ...newReg };
    if (this.connected) {
      this._send(MSG.REGISTER, this._registration);
    }
  }

  on(type, handler) { this.addEventListener(type, handler); }

  send(type, payload = {}, to) { this._send(type, payload, to); }

  /** Send raw file bytes over the relay path. */
  sendBinary(arrayBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(arrayBuffer);
  }

  get bufferedAmount() {
    return this.ws ? this.ws.bufferedAmount : 0;
  }

  createSession() { this._send(MSG.CREATE_SESSION, {}); }
  joinSession(code) { this._send(MSG.JOIN_SESSION, { code }); }
  setPresence(state) { this._send(MSG.PRESENCE, { state }); }

  _send(type, payload, to) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const env = { version: 1, type, payload };
    if (to) env.to = to;
    if (this.selfId) env.from = this.selfId;
    this.ws.send(JSON.stringify(env));
  }
}
