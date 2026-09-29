// One RTCPeerConnection to a single peer, plus one reliable, ordered, binary
// DataChannel for file bytes. Handles the offer/answer/ICE dance over the
// signaling channel, buffering ICE candidates that arrive before the remote
// description is set. Control messages do NOT go here — only binary chunks do.

import { MSG } from "./protocol.js";

export class PeerConnection {
  constructor(signaling, remoteId, iceServers, isInitiator) {
    this.signaling = signaling;
    this.remoteId = remoteId;
    this.isInitiator = isInitiator;
    this.pc = new RTCPeerConnection({ iceServers: iceServers || [] });
    this.channel = null;
    this.pending = [];
    this.remoteSet = false;

    this.onChannelOpen = () => {};
    this.onBinary = () => {};
    this.onStateChange = () => {};

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.signaling.send(MSG.ICE_CANDIDATE, { candidate: ev.candidate }, this.remoteId);
    };
    this.pc.onconnectionstatechange = () => this.onStateChange(this.pc.connectionState);
    this.pc.ondatachannel = (ev) => this._bind(ev.channel);
  }

  async start() {
    if (!this.isInitiator) return;
    const dc = this.pc.createDataChannel("flux", { ordered: true });
    this._bind(dc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signaling.send(MSG.OFFER, { sdp: this.pc.localDescription }, this.remoteId);
  }

  async handleSignal(env) {
    switch (env.type) {
      case MSG.OFFER:
        await this.pc.setRemoteDescription(env.payload.sdp);
        this.remoteSet = true;
        await this._drain();
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        this.signaling.send(MSG.ANSWER, { sdp: this.pc.localDescription }, this.remoteId);
        break;
      case MSG.ANSWER:
        await this.pc.setRemoteDescription(env.payload.sdp);
        this.remoteSet = true;
        await this._drain();
        break;
      case MSG.ICE_CANDIDATE:
        if (!this.remoteSet) this.pending.push(env.payload.candidate);
        else { try { await this.pc.addIceCandidate(env.payload.candidate); } catch (e) { console.warn("ICE add failed", e); } }
        break;
    }
  }

  isOpen() { return this.channel && this.channel.readyState === "open"; }
  /** Negotiated max DataChannel message size (bytes), or 0 if unknown. */
  maxMessageSize() { try { return this.pc.sctp ? this.pc.sctp.maxMessageSize : 0; } catch { return 0; } }
  send(buf) { this.channel.send(buf); }
  get bufferedAmount() { return this.channel ? this.channel.bufferedAmount : 0; }

  waitForBufferedAmountLow(threshold) {
    return new Promise((resolve) => {
      if (!this.channel || this.channel.bufferedAmount <= threshold) return resolve();
      this.channel.bufferedAmountLowThreshold = threshold;
      let timer = null;
      const done = () => {
        if (timer) clearInterval(timer);
        if (this.channel) this.channel.removeEventListener("bufferedamountlow", done);
        resolve();
      };
      this.channel.addEventListener("bufferedamountlow", done);
      timer = setInterval(() => {
        if (!this.channel || this.channel.bufferedAmount <= threshold) {
          done();
        }
      }, 10);
    });
  }

  close() {
    try { if (this.channel) this.channel.close(); } catch {}
    try { this.pc.close(); } catch {}
  }

  _bind(dc) {
    this.channel = dc;
    dc.binaryType = "arraybuffer";
    dc.onopen = () => this.onChannelOpen();
    dc.onmessage = (ev) => this.onBinary(ev.data);
  }

  async _drain() {
    const pending = this.pending; this.pending = [];
    for (const c of pending) { try { await this.pc.addIceCandidate(c); } catch (e) { console.warn("ICE drain failed", e); } }
  }
}
