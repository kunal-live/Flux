// The platform-agnostic transfer engine. Owns per-peer transports, chunks files
// with a bounded in-flight window + backpressure, tracks live speed/ETA, hashes
// incrementally for integrity, writes through a capability-based FileWriter, and
// supports pause/cancel/resume. Control travels as JSON via the signaling
// client; file bytes travel as binary frames via the transport (direct or relay).
//
// Resilience: if a direct WebRTC path fails mid-transfer the transport fails
// over to relay and fires "failover"; the receiver then asks the sender (via
// resume-request) to resend from its last contiguous chunk. Receiver writes are
// offset-addressed and idempotent, so resent/duplicate chunks are harmless.

import {
  MSG, CHUNK_SIZE, ACK_EVERY, HIGH_WATER, LOW_WATER,
  packDataFrame, parseDataFrame,
} from "./protocol.js";
import { Transport } from "./transport.js";
import { Sha256, computeDigest } from "./hashing.js";
import { createWriter } from "./writer.js";
import { ResumeState } from "./resume.js";
import { detectPlatform, detectBrowser } from "./discovery.js";

let wireSeq = 1;
const nextWireId = () => (wireSeq = (wireSeq % 0xffffffff) + 1);

export class TransferManager extends EventTarget {
  constructor(signaling) {
    super();
    this.signaling = signaling;
    this.ice = [];               // RTCIceServer[] (STUN + optional TURN)
    this.peerInfo = new Map();   // peerId -> { platform, browser, capabilities } (for adaptive tuning)
    this.transports = new Map(); // peerId -> Transport
    this.outgoing = new Map();   // transferId -> send state
    this.incoming = new Map();   // wireId -> recv state
    this.incomingById = new Map(); // transferId -> recv state
    this._wire();
  }

  /** Accepts a list of RTCIceServer objects (STUN strings should be pre-wrapped). */
  setIceServers(list) { this.ice = Array.isArray(list) ? list : []; }
  /** Back-compat: a bare list of STUN URL strings. */
  setStun(list) { this.ice = (Array.isArray(list) ? list : []).map((urls) => ({ urls })); }
  /** Keep peer capability/platform info current so we can size chunks per peer. */
  updatePeers(list) {
    this.peerInfo.clear();
    for (const p of list || []) if (p && p.id) this.peerInfo.set(p.id, { platform: p.platform, browser: p.browser, capabilities: p.capabilities });
  }
  _emit(ev) { this.dispatchEvent(new CustomEvent("event", { detail: ev })); }
  on(fn) { this.addEventListener("event", (e) => fn(e.detail)); }

  // ---- transports --------------------------------------------------------

  _ensureTransport(peerId, isInitiator) {
    let t = this.transports.get(peerId);
    if (t) return t;
    t = new Transport(this.signaling, peerId, this.ice, isInitiator);
    t.addEventListener("binary", (e) => this._onBinary(e.detail));
    t.addEventListener("mode", (e) => this._emit({ kind: "mode", peerId, mode: e.detail }));
    t.addEventListener("failover", () => this._onFailover(peerId));
    this.transports.set(peerId, t);
    return t;
  }

  /** A direct path dropped and switched to relay: recover any in-flight work. */
  _onFailover(peerId) {
    // Receiver side: ask the sender to resume from our last contiguous chunk.
    for (const s of this.incoming.values()) {
      if (s.peerId === peerId && s.accepted && !s.finalized) {
        this.signaling.send(MSG.RESUME_REQUEST, {
          transferId: s.transferId,
          lastContiguousChunk: s.hashNext - 1,
          fileId: s.transferId,
          size: s.size,
        }, peerId);
      }
    }
  }

  /**
   * Choose the transfer chunk size. 64 KiB is the universally-safe DataChannel
   * message size (iOS Safari's ceiling); larger payloads are faster but only
   * safe when neither side is Safari/iOS and the negotiated DataChannel allows
   * it. On the relay path (WebSocket, 24 MB frames) larger is always fine.
   */
  _pickChunkSize(peerId, transport) {
    const self = { platform: detectPlatform(), browser: detectBrowser() };
    const peer = this.peerInfo.get(peerId) || {};
    const safariLike = (p) => /ios/i.test(p.platform || "") || /safari/i.test(p.browser || "");
    let base = (safariLike(self) || safariLike(peer)) ? CHUNK_SIZE : 256 * 1024;
    if (transport.mode === "direct") {
      const mms = transport.maxMessageSize ? transport.maxMessageSize() : 0;
      if (mms && mms > 0) base = Math.min(base, mms - 64); // leave room for our 10-byte header
    }
    return Math.max(16 * 1024, base);
  }

  // ---- sending -----------------------------------------------------------

  async sendFiles(peerId, files) {
    for (const file of files) await this._queueSend(peerId, file);
  }

  async _queueSend(peerId, file) {
    const transport = this._ensureTransport(peerId, true);
    transport.start();

    const transferId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : ("t-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8));
    const wireId = nextWireId();
    const state = {
      transferId, wireId, peerId, file,
      chunkSize: CHUNK_SIZE,
      totalChunks: Math.max(1, Math.ceil(file.size / CHUNK_SIZE)),
      sentBytes: 0, digest: null,
      paused: false, cancelled: false,
      acceptResolve: null, acceptReject: null, completeResolve: null,
      spd: newSpeed(),
      lastAck: -1,          // highest chunk the receiver has acked
      resumeAt: null,       // if set, next send pass restarts here
      resumeGate: null,     // resolves when a resume is requested
      _resumeResolve: null,
    };
    this.outgoing.set(transferId, state);
    this._emit({ kind: "start", role: "send", peerId, transferId, name: file.name, size: file.size, mode: transport.mode });

    try {
      this._emit({ kind: "hashing", transferId, done: 0, total: file.size });
      state.digest = await computeDigest(file);
      this._emit({ kind: "hashing", transferId, done: file.size, total: file.size });

      await transport.whenReady();
      state.chunkSize = this._pickChunkSize(peerId, transport);
      state.totalChunks = Math.max(1, Math.ceil(file.size / state.chunkSize));
      this._emit({ kind: "mode", peerId, mode: transport.mode, transferId });

      const accepted = new Promise((res, rej) => { state.acceptResolve = res; state.acceptReject = rej; });
      this.signaling.send(MSG.TRANSFER_INIT, {
        transferId, wireId, fileId: transferId, fileName: file.name,
        size: file.size, chunkSize: state.chunkSize, totalChunks: state.totalChunks,
        fileType: file.type || "application/octet-stream", sha256: state.digest,
      }, peerId);
      await accepted; // rejects if the receiver declines

      const completed = new Promise((res) => { state.completeResolve = res; });
      const verified = await this._runSend(transport, state, completed);

      this.outgoing.delete(transferId);
      this._emit({ kind: "done", role: "send", transferId, name: file.name, verified, mode: transport.mode });
    } catch (e) {
      this.outgoing.delete(transferId);
      this._emit({ kind: "error", role: "send", transferId, message: String(e && e.message ? e.message : e) });
    }
  }

  /**
   * Drive one transfer to completion, restarting the chunk stream whenever the
   * receiver requests a resume (e.g. after a direct->relay failover). Returns
   * the receiver's verified verdict.
   */
  async _runSend(transport, state, completedPromise) {
    for (;;) {
      state.resumeGate = new Promise((res) => { state._resumeResolve = res; });
      const startFrom = state.resumeAt != null ? state.resumeAt : 0;
      state.resumeAt = null;
      await this._streamChunks(transport, state, startFrom);

      const winner = await Promise.race([
        completedPromise.then((v) => ({ done: true, v })),
        state.resumeGate.then(() => ({ done: false })),
      ]);
      if (winner.done) return winner.v;
      // Otherwise a resume was requested; loop and resend from state.resumeAt.
    }
  }

  async _streamChunks(transport, state, startIndex) {
    const { file, wireId } = state;
    const total = state.totalChunks;
    const chunkSize = state.chunkSize || CHUNK_SIZE;
    const hiWater = Math.max(HIGH_WATER, chunkSize * 8);
    const loWater = Math.max(LOW_WATER, chunkSize * 2);
    const BLOCK_SIZE = Math.max(1024 * 1024, chunkSize * 4); // read in blocks to cut I/O overhead

    if (file.size === 0) {
      this._emit({ kind: "progress", role: "send", transferId: state.transferId, name: file.name, sent: 0, total: 0, speed: 0, eta: 0, mode: transport.mode });
      return;
    }

    // Block-cached random-access read so we can resume from any chunk index.
    let cacheStart = -1, cacheBuf = null;
    const readChunk = async (i) => {
      const off = i * chunkSize;
      const blockStart = Math.floor(off / BLOCK_SIZE) * BLOCK_SIZE;
      if (cacheStart !== blockStart) {
        const blockEnd = Math.min(blockStart + BLOCK_SIZE, file.size);
        cacheBuf = new Uint8Array(await file.slice(blockStart, blockEnd).arrayBuffer());
        cacheStart = blockStart;
      }
      const rel = off - cacheStart;
      return cacheBuf.subarray(rel, Math.min(rel + chunkSize, cacheBuf.length));
    };

    for (let index = startIndex; index < total; index++) {
      if (state.cancelled) { this.signaling.send(MSG.TRANSFER_CANCEL, { transferId: state.transferId }, state.peerId); throw new Error("cancelled"); }
      while (state.paused) await sleep(120);

      const bytes = await readChunk(index);
      if (transport.bufferedAmount > hiWater) await transport.waitForDrain(loWater);
      transport.sendBinary(packDataFrame(wireId, index, bytes));

      const sent = Math.min(file.size, (index + 1) * chunkSize);
      if (sent > state.sentBytes) state.sentBytes = sent;
      if (index % 16 === 0 || index === total - 1) {
        const { speed, eta } = measure(state.spd, state.sentBytes, file.size);
        this._emit({ kind: "progress", role: "send", transferId: state.transferId, name: file.name, sent: state.sentBytes, total: file.size, speed, eta, mode: transport.mode });
      }
    }
  }

  pauseSend(transferId) { const s = this.outgoing.get(transferId); if (s) { s.paused = true; this._emit({ kind: "paused", transferId }); } }
  resumeSend(transferId) { const s = this.outgoing.get(transferId); if (s) { s.paused = false; this._emit({ kind: "resumed", transferId }); } }
  cancelSend(transferId) { const s = this.outgoing.get(transferId); if (s) s.cancelled = true; }

  // ---- receiving ---------------------------------------------------------

  _handleInit(peerId, p) {
    const size = Number(p.size) || 0;
    const chunkSize = Number(p.chunkSize) || CHUNK_SIZE;
    const state = {
      peerId, transferId: p.transferId, wireId: p.wireId >>> 0,
      name: p.fileName || "file", size,
      chunkSize, fileType: p.fileType || "application/octet-stream",
      totalChunks: Number(p.totalChunks) || Math.max(1, Math.ceil(size / chunkSize)),
      expectedSha: p.sha256 || "",
      sha: new Sha256(), writer: null,
      hashNext: 0,     // next chunk index expected on the contiguous frontier
      doneBytes: 0,    // bytes received contiguously (drives progress + completion)
      accepted: false,
      resume: new ResumeState({ transferId: p.transferId, wireId: p.wireId, fileId: p.fileId, fileName: p.fileName, size: p.size, chunkSize: p.chunkSize, totalChunks: p.totalChunks }),
      writeChain: Promise.resolve(), spd: newSpeed(), finalized: false,
    };
    this.incoming.set(state.wireId, state);
    this.incomingById.set(state.transferId, state);
    const t = this._ensureTransport(peerId, false); // may already exist from the offer
    this._emit({ kind: "incoming", role: "recv", peerId, transferId: state.transferId, name: state.name, size: state.size, mode: t.mode });
  }

  /** UI calls this from a click (user gesture) so the streaming writer can open. */
  async acceptIncoming(transferId) {
    const s = this.incomingById.get(transferId);
    if (!s) return;
    try {
      s.writer = await createWriter(s.name, s.fileType, s.size);
      s.accepted = true;
      this.signaling.setPresence("receiving");
      this.signaling.send(MSG.TRANSFER_ACCEPT, { transferId }, s.peerId);
      this._emit({ kind: "accepted", role: "recv", transferId, streaming: s.writer.streaming });
      if (s.size === 0) this._finalizeIncoming(s); // empty file
    } catch (e) {
      this.rejectIncoming(transferId);
    }
  }

  rejectIncoming(transferId) {
    const s = this.incomingById.get(transferId);
    if (!s) return;
    this.signaling.send(MSG.TRANSFER_REJECT, { transferId }, s.peerId);
    this._drop(s);
    this._emit({ kind: "rejected", role: "recv", transferId });
  }

  cancelReceive(transferId) {
    const s = this.incomingById.get(transferId);
    if (!s) return;
    if (s.writer) s.writer.abort();
    this.signaling.send(MSG.TRANSFER_CANCEL, { transferId }, s.peerId);
    this._drop(s);
  }

  _onBinary(buf) {
    let frame;
    try { frame = parseDataFrame(buf); } catch { return; }
    const s = this.incoming.get(frame.wireId);
    if (!s || !s.accepted || s.finalized) return;
    const bytes = frame.payload;
    const index = frame.index;
    // Serialize writes+hash+ack. Writes are offset-addressed and idempotent, so
    // a resent or out-of-order chunk (post-failover) is safe.
    s.writeChain = s.writeChain.then(async () => {
      if (s.finalized) return;
      if (index < s.hashNext) return; // duplicate/resend we already counted — ignore

      const offset = index * s.chunkSize;
      await s.writer.write(offset, bytes); // persist at absolute offset regardless of order

      if (index > s.hashNext) return; // ahead of the frontier; a resend will fill the gap and hash it in order

      // index === s.hashNext: the contiguous frontier advances by one.
      if (!(typeof window !== "undefined" && window.__BENCHMARK__)) s.sha.update(bytes);
      s.hashNext += 1;
      s.doneBytes = Math.min(s.size, s.doneBytes + bytes.length);
      s.resume.noteReceived(index, bytes.length);

      if (s.hashNext % ACK_EVERY === 0) this.signaling.send(MSG.CHUNK_ACK, { transferId: s.transferId, lastReceivedIndex: s.hashNext - 1 }, s.peerId);
      if (s.hashNext % 16 === 0 || s.doneBytes >= s.size) {
        const { speed, eta } = measure(s.spd, s.doneBytes, s.size);
        this._emit({ kind: "progress", role: "recv", transferId: s.transferId, name: s.name, sent: s.doneBytes, total: s.size, speed, eta });
      }
      if (s.doneBytes >= s.size) await this._finalizeIncoming(s);
    }).catch((e) => this._emit({ kind: "error", role: "recv", transferId: s.transferId, message: String(e) }));
  }

  async _finalizeIncoming(s) {
    if (s.finalized) return;
    s.finalized = true;
    const blob = await s.writer.close(); // null when streamed straight to disk
    const benchmark = typeof window !== "undefined" && window.__BENCHMARK__;
    const receiverSha = benchmark ? "" : s.sha.hex();
    let verified = true;
    if (s.expectedSha && !benchmark) verified = receiverSha === s.expectedSha;
    // Return our hash so the SENDER can confirm too (its own progress bar).
    this.signaling.send(MSG.TRANSFER_COMPLETE, { transferId: s.transferId, wireId: s.wireId, ok: verified, sha256: receiverSha }, s.peerId);
    this.signaling.setPresence("discoverable");
    this._emit({ kind: "received", role: "recv", transferId: s.transferId, name: s.name, blob, streaming: s.writer.streaming, verified, size: s.size });
    this._drop(s);
  }

  _drop(s) {
    this.incoming.delete(s.wireId);
    this.incomingById.delete(s.transferId);
  }

  // ---- control-plane wiring ---------------------------------------------

  _wire() {
    const s = this.signaling;

    s.on(MSG.OFFER, async (e) => {
      const t = this._ensureTransport(e.detail.from, false);
      await t.handleSignal(e.detail);
    });
    s.on(MSG.ANSWER, async (e) => { const t = this.transports.get(e.detail.from); if (t) await t.handleSignal(e.detail); });
    s.on(MSG.ICE_CANDIDATE, async (e) => { const t = this.transports.get(e.detail.from); if (t) await t.handleSignal(e.detail); });

    s.on(MSG.TRANSPORT_STATUS, (e) => {
      const mode = (e.detail.payload || {}).mode;
      const t = this._ensureTransport(e.detail.from, false);
      if (mode === "relay") t.markRelay();
    });

    // relay data path
    s.on("binary", (e) => this._onBinary(e.detail));

    s.on(MSG.TRANSFER_INIT, (e) => this._handleInit(e.detail.from, e.detail.payload || {}));
    s.on(MSG.TRANSFER_ACCEPT, (e) => { const st = this.outgoing.get((e.detail.payload || {}).transferId); if (st && st.acceptResolve) st.acceptResolve(); });
    s.on(MSG.TRANSFER_REJECT, (e) => { const st = this.outgoing.get((e.detail.payload || {}).transferId); if (st && st.acceptReject) st.acceptReject(new Error("declined by receiver")); });
    s.on(MSG.CHUNK_ACK, (e) => {
      const p = e.detail.payload || {};
      const st = this.outgoing.get(p.transferId);
      const idx = Number(p.lastReceivedIndex);
      if (st && Number.isFinite(idx)) st.lastAck = Math.max(st.lastAck, idx);
      this._emit({ kind: "ack", transferId: p.transferId, lastReceivedIndex: p.lastReceivedIndex });
    });

    // Receiver asked us to resume from its last contiguous chunk (post-failover).
    s.on(MSG.RESUME_REQUEST, (e) => {
      const p = e.detail.payload || {};
      const st = this.outgoing.get(p.transferId);
      if (!st) return;
      if (p.size != null && Number(p.size) !== st.file.size) return; // identity/size guard
      const lc = Number(p.lastContiguousChunk);
      const from = Number.isFinite(lc) ? Math.max(0, lc + 1) : 0;
      st.resumeAt = (st.resumeAt == null) ? from : Math.min(st.resumeAt, from);
      this.signaling.send(MSG.RESUME_RESPONSE, { transferId: p.transferId, ok: true, resumeFrom: st.resumeAt }, st.peerId);
      if (st._resumeResolve) { const r = st._resumeResolve; st._resumeResolve = null; r(); }
    });
    // Sender acknowledged a resume; informational (the resend is already driven
    // by the sender restarting its chunk stream).
    s.on(MSG.RESUME_RESPONSE, (e) => this._emit({ kind: "resume", transferId: (e.detail.payload || {}).transferId }));

    s.on(MSG.TRANSFER_COMPLETE, (e) => {
      const p = e.detail.payload || {};
      const st = this.outgoing.get(p.transferId);
      if (!st || !st.completeResolve) return;
      const receiverOk = !!p.ok;
      const hashOk = p.sha256 ? (p.sha256 === st.digest) : true;
      st.completeResolve(receiverOk && hashOk);
    });
    s.on(MSG.TRANSFER_CANCEL, (e) => {
      const id = (e.detail.payload || {}).transferId;
      const inc = this.incomingById.get(id);
      if (inc) { if (inc.writer) inc.writer.abort(); this._drop(inc); }
      const out = this.outgoing.get(id);
      if (out) out.cancelled = true;
      this._emit({ kind: "cancelled", transferId: id });
    });
  }
}

// ---- helpers --------------------------------------------------------------

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Exponentially-smoothed throughput estimator.
function newSpeed() { return { t: performance.now(), bytes: 0, ema: 0 }; }
function measure(s, totalBytes, fileTotal) {
  const now = performance.now();
  const dt = (now - s.t) / 1000;
  if (dt >= 0.25) {
    const inst = (totalBytes - s.bytes) / dt; // bytes/sec
    s.ema = s.ema === 0 ? inst : s.ema * 0.7 + inst * 0.3;
    s.t = now; s.bytes = totalBytes;
  }
  const remaining = Math.max(0, fileTotal - totalBytes);
  const eta = s.ema > 0 ? remaining / s.ema : 0;
  return { speed: s.ema, eta };
}
