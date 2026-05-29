/**
 * MediaPipe Hands wrapper with EMA smoothing, velocity, and palm/wrist orientation.
 */

const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/';

/** Landmark indices (MediaPipe convention) */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
};

function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpLm(target, src, t) {
  target.x = lerp(target.x, src.x, t);
  target.y = lerp(target.y, src.y, t);
  target.z = lerp(target.z, src.z, t);
}

function cloneLm(lm) {
  return { x: lm.x, y: lm.y, z: lm.z };
}

/**
 * Smooth a full landmark set using exponential moving average.
 */
function smoothLandmarks(prev, next, factor) {
  if (!prev || prev.length !== next.length) {
    return next.map((p) => cloneLm(p));
  }
  return next.map((p, i) => ({
    x: lerp(prev[i].x, p.x, factor),
    y: lerp(prev[i].y, p.y, factor),
    z: lerp(prev[i].z, p.z, factor),
  }));
}

export class HandTracker {
  constructor(videoEl, options = {}) {
    this.video = videoEl;
    this.smoothFactor = options.smoothFactor ?? 0.38;
    this.prevHands = [];
    this.lastTime = performance.now();
    this.onResultsCb = null;
    this.hands = null;
    this.camera = null;

    this.latest = {
      hands: [],
      imageWidth: 1,
      imageHeight: 1,
      latencyMs: 0,
    };

    /** Raw velocities per hand (normalized / sec) */
    this.velocities = [];
  }

  setOnResults(fn) {
    this.onResultsCb = fn;
  }

  async init() {
    if (typeof Hands === 'undefined') {
      throw new Error('MediaPipe Hands script not loaded');
    }

    this.hands = new Hands({
      locateFile: (file) => `${MP_CDN}${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults((results) => this._handleResults(results));

    this.camera = new Camera(this.video, {
      onFrame: async () => {
        if (this.hands) await this.hands.send({ image: this.video });
      },
      width: 1280,
      height: 720,
    });
  }

  start() {
    if (this.camera) this.camera.start();
  }

  stop() {
    if (this.camera) this.camera.stop();
  }

  _computePalmCenter(lm) {
    const wrist = lm[LM.WRIST];
    const indexM = lm[LM.INDEX_MCP];
    const pinkyM = lm[LM.PINKY_MCP];
    const middleM = lm[LM.MIDDLE_MCP];
    return {
      x: (wrist.x + indexM.x + pinkyM.x + middleM.x) * 0.25,
      y: (wrist.y + indexM.y + pinkyM.y + middleM.y) * 0.25,
      z: (wrist.z + indexM.z + pinkyM.z + middleM.z) * 0.25,
    };
  }

  _handVelocity(prevLm, nextLm, dt) {
    if (!prevLm || dt <= 1e-6) return 0;
    const pc0 = this._computePalmCenter(prevLm);
    const pc1 = this._computePalmCenter(nextLm);
    const d = dist3(pc0, pc1);
    return d / dt;
  }

  _handleResults(results) {
    const t0 = performance.now();
    const now = t0;
    const dt = Math.max(1e-4, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const rawHands = results.multiHandLandmarks || [];
    if (rawHands.length !== this.prevHands.length) {
      this.prevHands = [];
    }
    const handedness = results.multiHandedness || [];
    const w = results.image?.width || this.video.videoWidth || 1;
    const h = results.image?.height || this.video.videoHeight || 1;

    const smoothed = [];
    const vels = [];

    for (let i = 0; i < rawHands.length; i++) {
      const prev =
        this.prevHands[i] &&
        this.prevHands[i].length === rawHands[i].length
          ? this.prevHands[i]
          : null;
      const next = smoothLandmarks(
        prev,
        rawHands[i],
        Math.min(1, this.smoothFactor + (rawHands[i] ? 0 : 0)),
      );
      smoothed.push(next);

      const prevForVel =
        this.prevHands[i] &&
        this.prevHands[i].length === rawHands[i].length
          ? this.prevHands[i]
          : null;
      vels.push(this._handVelocity(prevForVel, next, dt));
    }

    this.prevHands = smoothed.map((lm) => lm.map((p) => cloneLm(p)));
    this.velocities = vels;

    const enriched = smoothed.map((lm, i) => ({
      landmarks: lm,
      palm: this._computePalmCenter(lm),
      wrist: lm[LM.WRIST],
      velocity: vels[i] ?? 0,
      label: handedness[i]?.label || (i === 0 ? 'Right' : 'Left'),
    }));

    this.latest = {
      hands: enriched,
      imageWidth: w,
      imageHeight: h,
      latencyMs: performance.now() - t0,
    };

    if (this.onResultsCb) this.onResultsCb(this.latest);
  }

  getSnapshot() {
    return this.latest;
  }
}
