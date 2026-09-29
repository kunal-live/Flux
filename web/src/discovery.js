// Client-side discovery: builds this device's capability advertisement and
// maintains the live map of peers in the current discovery scope from the
// server's presence messages.

import { MSG } from "./protocol.js";
import { streamingSupported } from "./writer.js";

export function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return "web";
}

export function detectDeviceType() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

export function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/OPR\//.test(ua)) return "opera";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "chrome";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "safari";
  return "browser";
}

export function detectCapabilities() {
  const webrtc = typeof RTCPeerConnection !== "undefined";
  return {
    webrtc,
    binaryDataChannel: webrtc,
    streamingWriter: streamingSupported(),
    nativeDiscovery: false,
  };
}

export function buildRegistration(alias) {
  return {
    alias,
    platform: detectPlatform(),
    deviceType: detectDeviceType(),
    browser: detectBrowser(),
    capabilities: detectCapabilities(),
  };
}

/** Live peer map, kept in sync with the server's presence broadcasts. */
export class Discovery extends EventTarget {
  constructor(signaling) {
    super();
    this.signaling = signaling;
    this.peers = new Map();
    this.selfId = null;

    signaling.on(MSG.PEER_LIST, (e) => {
      const pl = e.detail.payload || {};
      if (pl.self) this.selfId = pl.self;
      if (pl.error) { this.peers.clear(); this._emit(); return; }
      const newMap = new Map();
      for (const p of pl.peers || []) {
        if (p && p.id && p.id !== this.selfId) {
          newMap.set(p.id, p);
        }
      }
      this.peers = newMap;
      this._emit();
    });
    signaling.on(MSG.SESSION_JOINED, (e) => {
      const pl = e.detail.payload || {};
      if (pl.error) { this.dispatchEvent(new CustomEvent("join-error", { detail: pl.error })); return; }
      this._upsert(pl.peers);
    });
    signaling.on(MSG.PEER_JOINED, (e) => {
      const peer = (e.detail.payload || {}).peer;
      if (peer && peer.id && peer.id !== this.selfId) {
        this.peers.set(peer.id, peer);
        this._emit();
      }
    });
    signaling.on(MSG.PEER_LEFT, (e) => {
      const id = (e.detail.payload || {}).peerId;
      if (id && this.peers.delete(id)) this._emit();
    });
    signaling.on("disconnected", () => {
      this.peers.clear();
      this._emit();
    });
  }

  _upsert(list) {
    let changed = false;
    for (const p of list || []) {
      if (p && p.id && p.id !== this.selfId) { this.peers.set(p.id, p); changed = true; }
    }
    if (changed) this._emit();
  }

  _emit() {
    this.dispatchEvent(new CustomEvent("change", { detail: [...this.peers.values()] }));
  }

  list() { return [...this.peers.values()]; }
  get(id) { return this.peers.get(id); }
}
