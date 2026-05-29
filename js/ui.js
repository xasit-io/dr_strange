/**
 * Futuristic HUD: FPS, gesture readout, fullscreen, screenshot, record, FX panel.
 */

const gestureLabels = {
  none: 'Scanning…',
  open_palm: 'Shield — Open palm',
  pinch: 'Orb — Pinch',
  portal: 'Portal — Spread hands',
  burst: 'Surge — Fast motion',
  fist: 'Charge — Fist',
  point: 'Bolt — Point index',
  clap: 'Pulse — Clap',
};

export function initUI({
  onFullscreen,
  onScreenshot,
  onRecordToggle,
  onEffectsToggle,
  onFxChange,
}) {
  const fpsEl = document.getElementById('fps');
  const latencyEl = document.getElementById('latency');
  const spellEl = document.getElementById('spell-mode');
  const hintEl = document.getElementById('gesture-hint');

  document.getElementById('btn-fullscreen')?.addEventListener('click', onFullscreen);
  document.getElementById('btn-screenshot')?.addEventListener('click', onScreenshot);
  document.getElementById('btn-record')?.addEventListener('click', onRecordToggle);
  document.getElementById('btn-effects')?.addEventListener('click', onEffectsToggle);

  const panel = document.getElementById('effects-panel');
  document.getElementById('fx-close')?.addEventListener('click', () => {
    panel?.classList.add('hidden');
  });

  const binds = [
    ['fx-bloom', 'bloom'],
    ['fx-chroma', 'chroma'],
    ['fx-motion', 'motion'],
    ['fx-heat', 'heat'],
    ['fx-rays', 'rays'],
    ['fx-particles', 'particles'],
  ];
  binds.forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      onFxChange?.(key, e.target.checked);
    });
  });

  let frames = 0;
  let last = performance.now();

  function tickFPS() {
    frames++;
    const now = performance.now();
    if (now - last >= 500) {
      const fps = (frames / (now - last)) * 1000;
      if (fpsEl) fpsEl.textContent = `FPS ${fps.toFixed(0)}`;
      frames = 0;
      last = now;
    }
  }

  function setLatency(ms) {
    if (latencyEl) latencyEl.textContent = `Track ${ms.toFixed(0)} ms`;
  }

  function setGesture(code, extra = '') {
    const base = gestureLabels[code] || gestureLabels.none;
    if (spellEl) spellEl.textContent = base;
    if (hintEl) hintEl.textContent = extra || '';
  }

  return { tickFPS, setLatency, setGesture };
}

export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

export function takeScreenshot(canvas) {
  try {
    const link = document.createElement('a');
    link.download = `mystic-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    console.warn('Screenshot failed', e);
  }
}

/**
 * Record composited view: WebGL canvas over video is not auto-merged; we capture canvas VFX layer.
 * For full composite, user can use OS capture; this records WebGL output.
 */
export function createRecorder(canvas) {
  let recorder = null;
  let chunks = [];

  return {
    isRecording: () => !!recorder && recorder.state === 'recording',
    toggle() {
      if (!recorder || recorder.state === 'inactive') {
        const stream = canvas.captureStream(30);
        chunks = [];
        let opt = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 6e6 };
        if (!MediaRecorder.isTypeSupported(opt.mimeType)) {
          opt = { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 5e6 };
        }
        if (!MediaRecorder.isTypeSupported(opt.mimeType)) {
          opt = {};
        }
        recorder = new MediaRecorder(stream, opt);
        if (recorder.stream.getVideoTracks().length === 0) {
          console.warn('MediaRecorder: no video track');
          return false;
        }
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const u = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = u;
          a.download = `mystic-${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(u);
        };
        recorder.start(200);
        return true;
      }
      recorder.stop();
      recorder = null;
      return false;
    },
  };
}
