// Sky Dive sounds: everything is made with WebAudio in code (no sound files).
let ctx = null, master = null, windGain = null, windFilter = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('sky-muted') === '1'; } catch (e) { /* private mode */ }

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('sky-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
}

// must be called from a user gesture (PLAY / a click) the first time
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // the wind: looping noise through a band-pass filter, loudness follows the fall speed
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
    src.start();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// 0 = silent, 1 = full free-fall roar
export function wind(level, pitch = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  windGain.gain.setTargetAtTime(0.16 * level, t, 0.25);
  windFilter.frequency.setTargetAtTime(300 + 900 * pitch * level, t, 0.3);
}

function tone(type, f0, f1, dur, vol = 0.2, when = 0, attack = 0.005) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol, type, f0, f1, q = 1, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

export const sfx = {
  click() { tone('sine', 660, 990, 0.09, 0.15); },
  pick() { tone('triangle', 520, 780, 0.1, 0.14); },
  jump() { noise(0.9, 0.35, 'bandpass', 300, 1800, 0.8); tone('triangle', 330, 660, 0.25, 0.1, 0.05); },
  // the holographic rings appear
  holo() {
    tone('sine', 880, 1760, 0.35, 0.06); tone('sine', 1320, 1980, 0.4, 0.04, 0.05);
    tone('triangle', 660, 660, 0.5, 0.03, 0.1, 0.05);
  },
  dive() { noise(0.7, 0.3, 'bandpass', 500, 2600, 1.2); },
  right() {
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.16, 0.18, i * 0.07));
    tone('sine', 2093, 2093, 0.35, 0.06, 0.28);
    noise(0.5, 0.1, 'highpass', 4000, 9000, 0.5, 0.05);
  },
  wrong() {
    tone('sawtooth', 300, 110, 0.4, 0.12);
    tone('square', 160, 80, 0.3, 0.06, 0.06);
    for (let i = 0; i < 4; i++) tone('square', 900 + Math.random() * 900, 200, 0.04, 0.04, i * 0.05);
  },
  streak(n) { tone('sine', 784 + n * 60, 1568 + n * 120, 0.2, 0.07, 0.3); },
  whoosh() { noise(1.0, 0.28, 'bandpass', 250, 1400, 0.9); },
  chute() {
    tone('sine', 110, 40, 0.5, 0.35);
    noise(0.25, 0.3, 'lowpass', 900, 300, 0.7);
    for (let i = 0; i < 6; i++) noise(0.12, 0.08, 'bandpass', 700, 500, 2, 0.1 + i * 0.07);
  },
  land() {
    tone('sine', 140, 50, 0.35, 0.35);
    noise(0.3, 0.15, 'lowpass', 600, 200, 0.7);
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.22, 0.13, 0.35 + i * 0.09));
  },
  star(i) { tone('sine', 1047 + i * 262, 1047 + i * 262, 0.4, 0.14); tone('sine', 2093 + i * 524, 2093 + i * 524, 0.3, 0.05); },
};
