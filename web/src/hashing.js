// Incremental SHA-256 in pure JS.
//
// crypto.subtle.digest is one-shot — it needs the whole file buffered. Flux
// streams multi-gigabyte files chunk by chunk, so both sender and receiver
// hash incrementally (update per chunk) to verify integrity without ever
// holding the whole file in memory.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export class Sha256 {
  constructor() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ]);
    this.buffer = new Uint8Array(64);
    this.bufLen = 0;
    this.totalLen = 0;
    this.w = new Uint32Array(64);
  }

  update(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.totalLen += bytes.length;
    let offset = 0;
    if (this.bufLen > 0) {
      while (this.bufLen < 64 && offset < bytes.length) this.buffer[this.bufLen++] = bytes[offset++];
      if (this.bufLen === 64) { this._block(this.buffer, 0); this.bufLen = 0; }
    }
    while (offset + 64 <= bytes.length) { this._block(bytes, offset); offset += 64; }
    while (offset < bytes.length) this.buffer[this.bufLen++] = bytes[offset++];
    return this;
  }

  hex() {
    const bitLen = this.totalLen * 8;
    const pad = this.bufLen < 56 ? 56 - this.bufLen : 120 - this.bufLen;
    const tail = new Uint8Array(pad + 8);
    tail[0] = 0x80;
    const dv = new DataView(tail.buffer);
    dv.setUint32(pad, Math.floor(bitLen / 0x100000000));
    dv.setUint32(pad + 4, bitLen >>> 0);
    this.update(tail);
    let out = "";
    for (let i = 0; i < 8; i++) out += this.h[i].toString(16).padStart(8, "0");
    return out;
  }

  _block(p, off) {
    const w = this.w;
    for (let i = 0; i < 16; i++)
      w[i] = (p[off + i * 4] << 24) | (p[off + i * 4 + 1] << 16) | (p[off + i * 4 + 2] << 8) | p[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = this.h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    this.h[0] = (this.h[0] + a) | 0; this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0; this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0; this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0; this.h[7] = (this.h[7] + h) | 0;
  }
}

export function sha256Hex(data) {
  return new Sha256().update(data).hex();
}

/**
 * Fast SHA-256 computation using native Web Crypto hardware acceleration.
 * Falls back to chunked Sha256 for large files or non-secure contexts.
 */
export async function computeDigest(fileOrBlob) {
  if (fileOrBlob && fileOrBlob._digest) return fileOrBlob._digest;
  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    try {
      if (fileOrBlob.size <= 256 * 1024 * 1024) {
        const buf = await fileOrBlob.arrayBuffer();
        const hashBuf = await crypto.subtle.digest("SHA-256", buf);
        const arr = new Uint8Array(hashBuf);
        let hex = "";
        for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
        return hex;
      }
    } catch (e) {
      console.warn("subtle.digest fallback", e);
    }
  }
  const sha = new Sha256();
  const BLOCK = 1024 * 1024;
  for (let off = 0; off < fileOrBlob.size; off += BLOCK) {
    const buf = await fileOrBlob.slice(off, Math.min(off + BLOCK, fileOrBlob.size)).arrayBuffer();
    sha.update(new Uint8Array(buf));
  }
  return sha.hex();
}
