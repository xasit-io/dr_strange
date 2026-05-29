/**
 * Mystic Arts — main loop: webcam, MediaPipe, gestures, Three.js FX, audio, HUD.
 */

import { HandTracker } from './js/handTracking.js';
import { detectGestures } from './js/gestures.js';
import { MagicScene } from './js/effects.js';
import { MysticAudio } from './js/audio.js';
import {
  initUI,
  toggleFullscreen,
  takeScreenshot,
  createRecorder,
} from './js/ui.js';

const video = document.getElementById('webcam');
const canvas = document.getElementById('gl-canvas');
const startScreen = document.getElementById('start-screen');
const btnStart = document.getElementById('btn-start');

const audio = new MysticAudio();
const scene = new MagicScene(canvas);
const recorder = createRecorder(canvas);

const clapState = { prevClapDistance: null };

let uiApi = null;
let running = false;
let effectsPanelOpen = false;
let lastGestureKey = '';

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  video.srcObject = stream;
  await video.play();
}

uiApi = initUI({
  onFullscreen: () => toggleFullscreen(),
  onScreenshot: () => takeScreenshot(canvas),
  onRecordToggle: () => {
    const on = recorder.toggle();
    const btn = document.getElementById('btn-record');
    if (btn) {
      btn.classList.toggle('recording', on);
      btn.textContent = on ? '■' : '⏺';
    }
  },
  onEffectsToggle: () => {
    effectsPanelOpen = !effectsPanelOpen;
    const panel = document.getElementById('effects-panel');
    const btn = document.getElementById('btn-effects');
    panel?.classList.toggle('hidden', !effectsPanelOpen);
    btn?.classList.toggle('active', effectsPanelOpen);
  },
  onFxChange: (key, checked) => {
    scene.setFxEnabled(key, checked);
  },
});

const tracker = new HandTracker(video, { smoothFactor: 0.42 });
tracker.setOnResults(() => {
  /* optional hook */
});

btnStart?.addEventListener('click', async () => {
  try {
    await audio.start();
    await startCamera();
    await tracker.init();
    tracker.start();
    startScreen?.classList.add('hidden');
    running = true;
    audio.resume();
  } catch (err) {
    console.error(err);
    uiApi?.setGesture('none', `Camera or tracking failed: ${err.message || err}`);
  }
});

function loop(now) {
  requestAnimationFrame(loop);
  if (!running) return;

  uiApi?.tickFPS();

  const snap = tracker.getSnapshot();
  const gesture = detectGestures(snap, clapState);

  const maxVel = Math.max(0, ...(snap.hands || []).map((h) => h.velocity), 0);
  audio.update(gesture.primary, {
    maxVel,
    portalStrength: gesture.portalStrength,
  });

  const g = gesture.primary;
  uiApi?.setLatency(snap.latencyMs || 0);
  uiApi?.setGesture(g === 'none' ? 'none' : g, '');
  const gk = `${g}`;
  if (typeof window.gsap !== 'undefined' && g !== 'none' && gk !== lastGestureKey) {
    lastGestureKey = gk;
    const spellEl = document.getElementById('spell-mode');
    if (spellEl)
      window.gsap.fromTo(
        spellEl,
        { textShadow: '0 0 8px rgba(255,100,40,0.4)' },
        {
          textShadow: '0 0 32px rgba(255,160,60,0.9)',
          duration: 0.35,
          ease: 'power2.out',
        },
      );
  }
  if (g === 'none') lastGestureKey = '';

  scene.renderFrame({
    gesture,
    snapshot: snap,
    time: now,
  });
}

requestAnimationFrame(loop);

window.addEventListener('beforeunload', () => {
  audio.dispose();
  scene.dispose();
});
