// Transport Manager for one peer. Presents a single interface to the transfer
// engine regardless of whether bytes flow over the direct WebRTC DataChannel or
// the server relay. It runs the WebRTC handshake, and if a direct path isn't
// established within the fallback window, it switches to relay and tells the
// peer (so the server routes the binary frames).
//
//   connect()      -> start()
//   sendBinary()   -> DataChannel.send | relay WS binary frame
//   onBinary       -> "binary" event
//   onControl      -> control stays on the signaling client (not here)
//   close()

import { MSG, FALLBACK_TIMEOUT_MS } from "./protocol.js";
import { PeerConnection } from "./webrtc.js";
import { RelaySender } from "./relay.js";

export class Transport extends EventTarget {
  constructor(signaling, peerId, iceServers, isInitiator) {
    super();
    this.signaling = signaling;
    this.peerId = peerId;
    this.mode = "connecting"; // connecting -> direct | relay
    this.started = false;
    this._timer = null;

    this.pc = new PeerConnection(signaling, peerId, iceServers, isInitiator);
    this.relaySender = new RelaySender(signaling);
    this.pc.onChannelOpen = () => { if (this.mode === "connecting") this._setMode("direct"); };
    this.pc.onBinary = (buf) => this.dispatchEvent(new CustomEvent("binary", { detail: buf }));
    this.pc.onStateChange = (st) => this._onPeerState(st);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.pc.start().catch((e) => console.error("offer failed", e));
    this._timer = setTimeout(() => {
      if (this.mode === "connecting") {
        this.signaling.send(MSG.TRANSPORT_STATUS, { mode: "relay" }, this.peerId);
        this._setMode("relay");
      }
    }, FALLBACK_TIMEOUT_MS);
  }

  handleSignal(env) { return this.pc.handleSignal(env); }

  /** Negotiated max DataChannel message size (bytes) on the direct path. */
  maxMessageSize() { return this.pc.maxMessageSize ? this.pc.maxMessageSize() : 0; }

  /** Called when the peer told us (via transport-status) that it's relaying. */
  markRelay() { if (this.mode !== "relay") this._setMode("relay"); }

  /**
   * React to the WebRTC connection state. If a direct path fails or drops
   * mid-transfer (e.g. Wi-Fi -> cellular, AP roam), switch to relay and tell
   * the peer so bytes keep flowing. The transfer engine listens for the
   * resulting "failover" event to resend anything the receiver is missing.
   */
  _onPeerState(st) {
    if ((st === "failed" || st === "disconnected" || st === "closed") && this.mode === "direct") {
      this.signaling.send(MSG.TRANSPORT_STATUS, { mode: "relay" }, this.peerId);
      this._setMode("relay");
    }
  }

  ready() { return this.mode === "direct" || this.mode === "relay"; }

  whenReady() {
    if (this.ready()) return Promise.resolve(this.mode);
    return new Promise((resolve) => {
      const h = (e) => { this.removeEventListener("mode", h); resolve(e.detail); };
      this.addEventListener("mode", h);
    });
  }

  get bufferedAmount() {
    return this.mode === "direct" ? this.pc.bufferedAmount : this.relaySender.bufferedAmount;
  }

  async waitForDrain(low) {
    if (this.mode === "direct") return this.pc.waitForBufferedAmountLow(low);
    return this.relaySender.waitForDrain(low);
  }

  sendBinary(frameBuffer) {
    if (this.mode === "direct") this.pc.send(frameBuffer);
    else this.relaySender.send(frameBuffer);
  }

  close() {
    if (this._timer) clearTimeout(this._timer);
    this.pc.close();
  }

  _setMode(m) {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const prev = this.mode;
    this.mode = m;
    this.dispatchEvent(new CustomEvent("mode", { detail: m }));
    // A direct path that has already carried bytes and then flips to relay is a
    // failover: some in-flight chunks may have been lost with the dead channel.
    if (prev === "direct" && m === "relay") {
      this.dispatchEvent(new CustomEvent("failover", { detail: { peerId: this.peerId } }));
    }
  }
}
