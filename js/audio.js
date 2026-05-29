/**
 * Procedural Web Audio — hum, sparks, charges; driven by gesture + motion.
 */

import { G } from './gestures.js';

export class MysticAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.oscHum = null;
    this.gainHum = null;
    this.noiseBuffer = null;
    this.chargeGain = null;
    this.portalGain = null;
    this.sparkGain = null;
    this._started = false;
  }

  async start() {
    if (this._started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);

    this.gainHum = this.ctx.createGain();
    this.gainHum.gain.value = 0.08;
    this.oscHum = this.ctx.createOscillator();
    this.oscHum.type = 'sine';
    this.oscHum.frequency.value = 110;
    this.oscHum.connect(this.gainHum);
    this.gainHum.connect(this.master);
    this.oscHum.start();

    const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = n;

    this.chargeGain = this.ctx.createGain();
    this.chargeGain.gain.value = 0;
    this.chargeOsc = this.ctx.createOscillator();
    this.chargeOsc.type = 'sawtooth';
    this.chargeOsc.frequency.value = 165;
    this.chargeOsc.connect(this.chargeGain);
    this.chargeGain.connect(this.master);
    this.chargeOsc.start();

    this.portalGain = this.ctx.createGain();
    this.portalGain.gain.value = 0;

    this.sparkGain = this.ctx.createGain();
    this.sparkGain.gain.value = 0;

    this._noiseSrc = null;
    this._portalOsc = null;

    this._started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _playNoiseBurst(duration = 0.12, volume = 0.25) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(this.ctx.currentTime + duration + 0.02);
  }

  _ensurePortalDrone() {
    if (!this.ctx || this._portalOsc) return;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 55;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(this.portalGain);
    this.portalGain.connect(this.master);
    o.start();
    this._portalOsc = { o, g };
  }

  update(gestureName, detail = {}) {
    if (!this._started || !this.ctx) return;
    const t = this.ctx.currentTime;

    /** Base hum follows "energy" */
    let hum = 0.06;
    let freq = 108 + (detail.maxVel || 0) * 12;

    if (gestureName === G.FIST || gestureName === G.PINCH) {
      hum = 0.14;
      freq = 132;
      this.chargeGain.gain.setTargetAtTime(0.22, t, 0.05);
    } else {
      this.chargeGain.gain.setTargetAtTime(0, t, 0.08);
    }

    if (gestureName === G.TWO_HANDS_WIDE) {
      hum += 0.08;
      freq += 8;
      this._ensurePortalDrone();
      if (this._portalOsc) {
        this._portalOsc.g.gain.setTargetAtTime(0.12 * (detail.portalStrength || 0), t, 0.06);
        this._portalOsc.o.frequency.setTargetAtTime(52 + (detail.portalStrength || 0) * 40, t, 0.08);
      }
    } else if (this._portalOsc) {
      this._portalOsc.g.gain.setTargetAtTime(0, t, 0.12);
    }

    if (gestureName === G.FAST_MOVE || gestureName === G.CLAP) {
      this._playNoiseBurst(0.08 + Math.random() * 0.06, 0.18 + Math.random() * 0.1);
    }

    if (gestureName === G.CLAP) {
      this._playNoiseBurst(0.25, 0.45);
    }

    this.gainHum.gain.setTargetAtTime(hum, t, 0.06);
    this.oscHum.frequency.setTargetAtTime(freq, t, 0.06);
  }

  dispose() {
    try {
      this.oscHum?.stop();
      this.chargeOsc?.stop();
      this._portalOsc?.o.stop();
    } catch (_) {
      /* ignore */
    }
    this.ctx?.close();
  }
}
