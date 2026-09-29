// Relay transport adapter — the send side of the fallback path. It presents the
// same send/backpressure shape as the WebRTC DataChannel so the Transport can
// treat "direct" and "relay" uniformly.
//
// Receiving relayed bytes is handled centrally by the TransferManager (a single
// "binary" listener on the signaling client, routed by the frame's wireId),
// because relayed frames carry no peer attribution — routing per-transport
// would double-deliver when two peers relay at once.

export class RelaySender {
  constructor(signaling) {
    this.signaling = signaling;
  }
  send(frameBuffer) {
    this.signaling.sendBinary(frameBuffer);
  }
  get bufferedAmount() {
    return this.signaling.bufferedAmount;
  }
  async waitForDrain(low) {
    while (this.signaling.bufferedAmount > low) await new Promise((r) => setTimeout(r, 4));
  }
}
