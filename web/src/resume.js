// Resume state tracking. Flux distinguishes connection resume (the transport
// dropped and came back) from transfer resume (start where we left off).
//
// v1 reliably supports connection-level resume within a live session: the
// receiver reports its last contiguous chunk, the sender validates identity and
// size, and streaming continues from the next chunk. Durable resume across a
// full page refresh is only offered where durable browser storage is available
// and is not implemented here.

export class ResumeState {
  constructor(meta) {
    this.transferId = meta.transferId;
    this.wireId = meta.wireId;
    this.fileId = meta.fileId;
    this.fileName = meta.fileName;
    this.fileSize = meta.size;
    this.chunkSize = meta.chunkSize;
    this.totalChunks = meta.totalChunks;
    this.lastContiguousChunk = -1; // highest index received with no gaps
    this.receivedBytes = 0;
    this.status = "active"; // active | paused | complete | failed | cancelled
  }

  noteReceived(index, byteLen) {
    // Engine delivers in order (reliable/ordered transport), so contiguous.
    if (index === this.lastContiguousChunk + 1) this.lastContiguousChunk = index;
    this.receivedBytes += byteLen;
  }

  nextChunkToRequest() {
    return this.lastContiguousChunk + 1;
  }

  matches(meta) {
    return meta.fileId === this.fileId && Number(meta.size) === this.fileSize;
  }
}
