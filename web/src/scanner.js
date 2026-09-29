// ==========================================================================
// FLUX CAMERA QR SCANNER
// Instant phone/laptop pairing using native BarcodeDetector API with canvas fallback
// ==========================================================================

export class QRScanner {
  constructor(videoElement, onDetected) {
    this.video = videoElement;
    this.onDetected = onDetected;
    this.stream = null;
    this._animId = null;
    this._scanning = false;
  }

  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async start(facing = "environment") {
    if (!QRScanner.isSupported() || this._scanning) return false;
    this._facingMode = facing;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      this.video.srcObject = this.stream;
      await this.video.play();
      this._scanning = true;

      if ("BarcodeDetector" in window) {
        this._scanWithBarcodeDetector();
      } else {
        this._scanWithCanvas();
      }
      return true;
    } catch (err) {
      console.warn("Camera access failed:", err.message);
      return false;
    }
  }

  async flipCamera() {
    const nextFacing = this._facingMode === "user" ? "environment" : "user";
    this.stop();
    return await this.start(nextFacing);
  }

  stop() {
    this._scanning = false;
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  async _scanWithBarcodeDetector() {
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    const loop = async () => {
      if (!this._scanning) return;
      try {
        if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const codes = await detector.detect(this.video);
          if (codes && codes.length > 0) {
            const raw = codes[0].rawValue;
            if (raw) {
              this.stop();
              this.onDetected(raw);
              return;
            }
          }
        }
      } catch {}
      this._animId = requestAnimationFrame(loop);
    };

    this._animId = requestAnimationFrame(loop);
  }

  _scanWithCanvas() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const loop = () => {
      if (!this._scanning) return;
      if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
        // Canvas is ready for any custom JS QR decoder if attached
      }
      this._animId = requestAnimationFrame(loop);
    };

    this._animId = requestAnimationFrame(loop);
  }
}
