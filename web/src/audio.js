// ==========================================================================
// FLUX PROCEDURAL AUDIO ENGINE — Web Audio API Synthesizer
// Zero external assets • Ultra-low latency • Futuristic Obsidian Soundscape
// ==========================================================================

class AudioEngine {
  constructor() {
    this._ctx = null;
    this._enabled = true;
    try {
      const saved = localStorage.getItem("flux-sound-enabled");
      if (saved !== null) this._enabled = saved === "1";
    } catch {}
  }

  _getCtx() {
    if (!this._ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this._ctx = new AudioCtx();
      }
    }
    if (this._ctx && this._ctx.state === "suspended") {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  isEnabled() {
    return this._enabled;
  }

  setEnabled(val) {
    this._enabled = !!val;
    try {
      localStorage.setItem("flux-sound-enabled", this._enabled ? "1" : "0");
    } catch {}
  }

  toggle() {
    this.setEnabled(!this._enabled);
    if (this._enabled) {
      this.play("click");
    }
    return this._enabled;
  }

  play(type) {
    if (!this._enabled) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;

      const now = ctx.currentTime;

      switch (type) {
        case "click": {
          // Subtle obsidian button click (50ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(1400, now);
          osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }

        case "sonar": {
          // Radar sonar ping with harmonic resonance (500ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = "sine";
          osc2.type = "triangle";
          osc1.frequency.setValueAtTime(880, now);
          osc2.frequency.setValueAtTime(1760, now);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);
          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.5);
          osc2.stop(now + 0.5);
          break;
        }

        case "start":
        case "beam": {
          // Transfer start futuristic power-up sweep (250ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(280, now);
          osc.frequency.exponentialRampToValueAtTime(960, now + 0.22);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.09, now + 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.26);
          break;
        }

        case "complete":
        case "success": {
          // Luxurious gold pentatonic chime (C5 -> E5 -> G5 -> C6)
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteStart = now + idx * 0.08;
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, noteStart);
            gain.gain.setValueAtTime(0.08, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.55);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(noteStart);
            osc.stop(noteStart + 0.6);
          });
          break;
        }

        case "incoming": {
          // Two-tone friendly incoming transfer ring (E5 -> A5)
          [659.25, 880].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteStart = now + idx * 0.14;
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, noteStart);
            gain.gain.setValueAtTime(0.12, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(noteStart);
            osc.stop(noteStart + 0.4);
          });
          break;
        }

        case "error": {
          // Dual low alert buzz
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = "sawtooth";
          osc2.type = "sawtooth";
          osc1.frequency.setValueAtTime(160, now);
          osc2.frequency.setValueAtTime(140, now);
          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);
          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.3);
          osc2.stop(now + 0.3);
          break;
        }
      }
    } catch {}
  }
}

export const Sound = new AudioEngine();
