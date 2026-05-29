/**
 * Gesture recognition from MediaPipe landmark arrays.
 */

import { LM } from './handTracking.js';

const G = {
  NONE: 'none',
  OPEN_PALM: 'open_palm',
  PINCH: 'pinch',
  TWO_HANDS_WIDE: 'portal',
  FAST_MOVE: 'burst',
  FIST: 'fist',
  POINT: 'point',
  CLAP: 'clap',
};

function fingerExtended(lm, tipIdx, pipIdx, mcpIdx) {
  const wrist = lm[LM.WRIST];
  const dTip = dist3(wrist, lm[tipIdx]);
  const dPip = dist3(wrist, lm[pipIdx]) * 0.92;
  return dTip > dPip;
}

function thumbExtended(lm) {
  const wrist = lm[LM.WRIST];
  const dTip = dist3(wrist, lm[LM.THUMB_TIP]);
  const dIp = dist3(lm[LM.THUMB_IP], lm[LM.THUMB_TIP]);
  return dTip > dist3(wrist, lm[LM.THUMB_MCP]) * 0.85 && dTip > dIp * 1.1;
}

function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Classify a single hand's pose.
 */
export function classifyHand(lm) {
  const indexE = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP, LM.INDEX_MCP);
  const middleE = fingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP, LM.MIDDLE_MCP);
  const ringE = fingerExtended(lm, LM.RING_TIP, LM.RING_PIP, LM.RING_MCP);
  const pinkyE = fingerExtended(lm, LM.PINKY_TIP, LM.PINKY_PIP, LM.PINKY_MCP);
  const thumbE = thumbExtended(lm);

  const dPinch = dist3(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]);
  const rawPinch = dPinch < 0.055;

  const allCurled = !indexE && !middleE && !ringE && !pinkyE;
  const point =
    indexE && !middleE && !ringE && !pinkyE && !thumbE;

  if (rawPinch && !point) return G.PINCH;
  if (point) return G.POINT;
  if (allCurled && !thumbE) return G.FIST;
  if ((indexE && middleE && ringE && pinkyE) || (indexE && middleE && ringE && pinkyE && thumbE)) {
    return G.OPEN_PALM;
  }
  return G.NONE;
}

export { G };

const FAST_THRESH = 1.35;
const CLAP_THRESH = 0.12;
const PORTAL_SEP = 0.32;
const CLAP_COOLDOWN_MS = 500;

let lastClapTime = 0;

/**
 * @param {{ hands: Array<{ landmarks, palm, wrist, velocity }> }} snapshot
 * @param {{ prevClapDistance: number|null }} state  mutated clap estimator
 */
export function detectGestures(snapshot, state = {}) {
  const hands = snapshot.hands || [];
  const n = hands.length;

  const perHand = hands.map((h) => ({
    type: classifyHand(h.landmarks),
    lm: h.landmarks,
    palm: h.palm,
    velocity: h.velocity,
  }));

  let primary = G.NONE;
  let pinchMid = null;
  let portalStrength = 0;

  if (n === 2) {
    const p0 = hands[0].palm;
    const p1 = hands[1].palm;
    const sep = dist2(p0, p1);
    if (sep > PORTAL_SEP) {
      primary = G.TWO_HANDS_WIDE;
      portalStrength = Math.min(1, (sep - PORTAL_SEP) / 0.25);
    }
    const dClap = dist3(p0, p1);
    if (state.prevClapDistance != null) {
      const closing = dClap < state.prevClapDistance - 0.004;
      if (dClap < CLAP_THRESH && closing && performance.now() - lastClapTime > CLAP_COOLDOWN_MS) {
        primary = G.CLAP;
        lastClapTime = performance.now();
      }
    }
    state.prevClapDistance = dClap;
  } else {
    state.prevClapDistance = null;
  }

  for (let i = 0; i < perHand.length; i++) {
    const ph = perHand[i];
    if (ph.velocity > FAST_THRESH && primary !== G.CLAP && primary !== G.TWO_HANDS_WIDE) {
      primary = G.FAST_MOVE;
    }
    if (ph.type === G.PINCH) {
      const a = ph.lm[LM.THUMB_TIP];
      const b = ph.lm[LM.INDEX_TIP];
      pinchMid = {
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5,
        z: (a.z + b.z) * 0.5,
      };
    }
    if (
      primary === G.NONE ||
      primary === G.FAST_MOVE
    ) {
      if (ph.type === G.OPEN_PALM) primary = G.OPEN_PALM;
      else if (ph.type === G.FIST) primary = G.FIST;
      else if (ph.type === G.POINT) primary = G.POINT;
      else if (ph.type === G.PINCH) primary = G.PINCH;
    }
  }

  if (n === 1 && perHand[0].velocity > FAST_THRESH && primary === G.NONE) {
    primary = G.FAST_MOVE;
  }

  return {
    primary,
    perHand,
    pinchMid,
    portalStrength,
    twoPalms:
      n === 2
        ? [hands[0].palm, hands[1].palm]
        : null,
  };
}
