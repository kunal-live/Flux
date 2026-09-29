// FileWriter abstracts where received bytes land, so the transfer engine never
// cares about the platform. Two implementations, chosen by capability:
//
//   1. StreamingWriter — File System Access API. Writes straight to disk at the
//      chosen offset; memory stays bounded regardless of file size. Requires a
//      user gesture (we open it the moment the user accepts the transfer).
//   2. BlobWriter — fallback. Keeps received chunks and assembles a Blob at the
//      end for a normal download. Memory scales with file size, so it's the
//      fallback, not the default, for very large files.

export function streamingSupported() {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/**
 * Create the best available writer. Must be called from a user gesture when
 * streaming is used (browsers require it for showSaveFilePicker).
 * Falls back to a Blob writer if streaming is unavailable or the user cancels.
 */
export async function createWriter(fileName, fileType, size, isClip = false) {
  if (isClip || (fileType && fileType.includes("flux-clip"))) {
    return new ClipWriter(fileName);
  }
  if (typeof window !== "undefined" && window.__BENCHMARK__) {
    return new BenchmarkWriter(fileName, fileType);
  }
  if (streamingSupported()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: fileType ? [{ description: "File", accept: { [fileType]: [guessExt(fileName)] } }] : undefined,
      });
      const writable = await handle.createWritable({ keepExistingData: false });
      return new StreamingWriter(writable, fileName);
    } catch (e) {
      // User cancelled the picker, or it failed — fall back to in-memory.
      if (e && e.name === "AbortError") throw e; // cancel means cancel
      console.warn("streaming writer unavailable, using Blob fallback", e);
    }
  }
  return new BlobWriter(fileName, fileType);
}

export class ClipWriter {
  constructor(fileName) {
    this.fileName = fileName || "beam.txt";
    this.chunks = new Map();
    this.streaming = false;
    this.isClip = true;
  }
  async write(offset, bytes) {
    this.chunks.set(offset, bytes.slice ? bytes.slice() : new Uint8Array(bytes));
  }
  async close() {
    const offsets = [...this.chunks.keys()].sort((a, b) => a - b);
    const parts = offsets.map((o) => this.chunks.get(o));
    const blob = new Blob(parts, { type: "text/plain;charset=utf-8" });
    const text = await blob.text();
    this.chunks.clear();
    return { isClip: true, text, blob, fileName: this.fileName };
  }
  async abort() {
    this.chunks.clear();
  }
}

class BenchmarkWriter {
  constructor(fileName, fileType) {
    this.fileName = fileName;
    this.fileType = fileType || "application/octet-stream";
    this.streaming = true;
  }
  async write(offset, bytes) {}
  async close() { return null; }
  async abort() {}
}

class StreamingWriter {
  constructor(writable, fileName) {
    this.writable = writable;
    this.fileName = fileName;
    this.streaming = true;
  }
  async write(offset, bytes) {
    await this.writable.write({ type: "write", position: offset, data: bytes });
  }
  async close() {
    await this.writable.close();
    return null; // already on disk, no blob/URL needed
  }
  async abort() {
    try { await this.writable.abort(); } catch {}
  }
}

class BlobWriter {
  // Offset-addressed and idempotent: bytes are stored keyed by their absolute
  // offset, so an out-of-order or duplicate write (which can happen when a
  // transfer fails over from direct to relay and the sender resends from the
  // receiver's last contiguous chunk) lands correctly and simply overwrites.
  constructor(fileName, fileType) {
    this.fileName = fileName;
    this.fileType = fileType || "application/octet-stream";
    this.chunks = new Map(); // offset -> Uint8Array
    this.streaming = false;
  }
  async write(offset, bytes) {
    this.chunks.set(offset, bytes.slice ? bytes.slice() : new Uint8Array(bytes));
  }
  async close() {
    const offsets = [...this.chunks.keys()].sort((a, b) => a - b);
    const parts = offsets.map((o) => this.chunks.get(o));
    const blob = new Blob(parts, { type: this.fileType });
    this.chunks.clear();
    return blob; // caller turns this into a download
  }
  async abort() {
    this.chunks.clear();
  }
}

function guessExt(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i) : "";
}
