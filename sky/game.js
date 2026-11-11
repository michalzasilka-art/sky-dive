// Sky Dive: Foxino skydives through holographic word rings. 10 questions, then the parachute and a landing.
import * as THREE from './lib/three.module.min.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { SETS } from './words.js';
import { makeSky, makeWorld, makeClouds, makeBirds, updateBirds, makePlane, TARGET, FOG_COLOR, SUN } from './world.js';
import { makeRing, updateRing, setRingState, RING_R } from './rings.js';
import { makeStreaks, makeBursts } from './fx.js';
import { loadFoxino, makeParachute } from './foxino.js';
import { sfx, unlock, wind, setMuted, isMuted } from './sound.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const backOut = (t) => { const c1 = 1.9, c3 = c1 + 1; t = clamp(t, 0, 1); return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

// ---------- tuning ----------
const QN = 10;
const SPACING = 4.0;                 // metres between ring centres
const X_RANGE = 4.7, Z_RANGE = 1.3;  // how far Foxino can steer
const START_ALT = 980, A_OPEN = 62;  // jump altitude, parachute altitude
const RUSH = 1.5, DIVE = 1.0, AFTER = 1.8, RUSH_FROM = 48;
const HOLD = [7.5, 5.6, 5.2, 5.0, 4.8, 4.6, 4.4, 4.3, 4.1, 4.0]; // reading time while the rings hover below
const INTRO = 2.6, DEPLOY = 1.1, GLIDE = 7.4;
const XS = [-SPACING, 0, SPACING];
const FOX_SCALE = 1.1;

// ---------- renderer / scene ----------
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('loadText').textContent = 'Sorry, this device cannot show 3D graphics (WebGL).';
  throw e;
}
let pr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, 200, 5000);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.2, 12000);
scene.add(camera);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x6f8f5a, 1.7));
const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.3);
sunLight.position.copy(SUN).multiplyScalar(100);
scene.add(sunLight);

const sky = makeSky(); scene.add(sky);
const W = makeWorld(scene);
const clouds = makeClouds(scene, START_ALT);
const birds = makeBirds(scene);
const plane = makePlane(); scene.add(plane);
const rings = [0, 1, 2].map(() => { const r = makeRing(); r.visible = false; scene.add(r); return r; });
const streaks = makeStreaks(); scene.add(streaks.mesh);
const burstGroup = new THREE.Group(); scene.add(burstGroup);
const bursts = makeBursts(); burstGroup.add(bursts.points);

// ---------- game state ----------
const S = {
  phase: 'loading', pt: 0, time: 0, timeScale: 1, paused: false,
  topic: store.get('sky-topic', 'animals'),
  questions: [], qi: -1, q: null, qt: 0, sub: '', at: 0, chosen: -1, wasRight: false, zRow: 0,
  score: 0, right: 0, streak: 0, missed: [],
  fovKick: 0, shake: 0, vig: 0, mist: 0, diving: 0, revealT: 0,
};
if (S.topic !== 'mix' && !SETS.find((s) => s.id === S.topic)) S.topic = SETS[0].id;
const F = { x: 0, y: START_ALT, z: 0, vx: 0, vz: 0, tx: 0, tz: 0, vy: 0, heading: 0, bank: 0 };
const C = {}; // canopy flight
const ringFx = [0, 1, 2].map(() => ({ alpha: 0, label: 0, flash: 0, glitch: 0, scale: 1, x: 0, z: 0, dist: 0 }));
let fox = null, chute = null;

// ---------- camera framing ----------
const view = {};
function computeView() {
  const a = innerWidth / innerHeight;
  const hMin = THREE.MathUtils.degToRad(50);
  let vf = Math.max(THREE.MathUtils.degToRad(50), 2 * Math.atan(Math.tan(hMin / 2) / a));
  vf = Math.min(vf, THREE.MathUtils.degToRad(96));
  const T = Math.tan(vf / 2), Th = T * a;
  const ys = a < 1 ? 0.16 : innerHeight < 560 ? 0.0 : 0.24; // Foxino's height on screen (0 centre, 1 top), below the clue
  const alpha = Math.atan(0.5 * T);              // the fall vanishing point sits 3/4 down the screen
  const phi = Math.atan(ys * T);
  const dW = 1.3 / (0.28 * 2 * Th), dH = 1.4 / (0.33 * 2 * T);
  const d = clamp(Math.max(dW, dH), 3.6, 7.5);
  const hold = clamp((12.6 / (2 * Th) - d) / Math.cos(alpha), 7, 12); // all three rings fit the width
  Object.assign(view, { a, fov: THREE.MathUtils.radToDeg(vf), T, Th, alpha, phi, d, hold });
}
computeView();

const CAM = { pos: new THREE.Vector3(), look: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 55, fx: 0.5, fy: 0.5 };
const TRANS = { on: false, t: 0, dur: 1, rel: new THREE.Vector3(), relLook: new THREE.Vector3(), bulge: new THREE.Vector3(), fov: 55, fx: 0.5, fy: 0.5 };
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const camFollow = new THREE.Vector3();
const foxPos = () => _v3.set(F.x, F.y, F.z);

function lookQuat(eye, target, out) { _m.lookAt(eye, target, UP); return out.setFromRotationMatrix(_m); }

// each rig sets a camera position, a point to look at, a field of view and where on screen that point sits
function rigFall(out) {
  const k = view.alpha + view.phi;
  out.pos.set(camFollow.x, F.y + Math.cos(k) * view.d, camFollow.z + Math.sin(k) * view.d);
  out.look.set(0, -Math.cos(view.alpha), -Math.sin(view.alpha)).multiplyScalar(12).add(out.pos);
  out.fov = view.fov + S.fovKick; out.fx = 0.5; out.fy = 0.5;
}
function rigMenu(out) {
  // below and in front of him: he flies toward us with the sky behind him
  const th = 0.45 * Math.sin(S.time * 0.22) + 0.2;
  const dist = view.a < 1 ? 3.6 : 3.3;
  out.pos.set(F.x + Math.sin(th) * dist, F.y - 2.3, F.z + Math.cos(th) * dist);
  out.look.set(F.x, F.y - 0.1, F.z);
  out.fov = view.a < 1 ? 58 : 44;
  out.fx = view.a < 1.25 ? 0.5 : 0.25; out.fy = view.a < 1.25 ? 0.36 : 0.6;
}
function rigCanopy(out) {
  const h = F.heading, s = Math.sin(h), c = Math.cos(h);
  // behind (his local +z) and to the right, high enough to see the canopy, Foxino and the field ahead
  const lx = 3.2, ly = 1.6, lz = 8.5;
  out.pos.set(F.x + lx * c + lz * s, F.y + ly, F.z - lx * s + lz * c);
  const low = smooth(1 - F.y / 40); // look further down at the target as he gets low
  out.look.set(F.x - (3 + 5 * low) * s, F.y + 0.9 - 2.8 * low, F.z - (3 + 5 * low) * c);
  out.fov = view.a < 1 ? 74 : 54; out.fx = 0.5; out.fy = 0.5;
}
function rigLanded(out) {
  const h = F.heading + 0.45 * Math.sin(S.pt * 0.25) + 0.3;
  const s = Math.sin(h), c = Math.cos(h);
  const dist = view.a < 1 ? 5.6 : 4.6;
  const g = fox ? fox.ground : 0.7;
  // in front of Foxino (his front is local -z)
  out.pos.set(F.x - s * dist, g + 1.0, F.z - c * dist);
  out.look.set(F.x, g + 0.2, F.z);
  out.fov = view.a < 1 ? 56 : 42;
  out.fx = view.a < 1.25 ? 0.5 : 0.3; out.fy = view.a < 1.25 ? 0.28 : 0.52;
}
const RIGS = { menu: rigMenu, intro: rigFall, play: rigFall, canopy: rigCanopy, landed: rigLanded, end: rigLanded, loading: rigMenu };

// blend from the current camera to the new rig: orbit around Foxino (optionally bulging out of the way)
function startTransition(dur, bulge, ease = easeInOut) {
  TRANS.on = true; TRANS.t = 0; TRANS.dur = dur; TRANS.ease = ease;
  const fp = foxPos();
  TRANS.rel.copy(CAM.pos).sub(fp); TRANS.relLook.copy(CAM.look).sub(fp);
  TRANS.fov = CAM.fov; TRANS.fx = CAM.fx; TRANS.fy = CAM.fy;
  TRANS.bulge.copy(bulge || _v.set(0, 0, 0));
}
function slerpVec(a, b, t, out) {
  const la = a.length(), lb = b.length();
  if (la < 1e-4 || lb < 1e-4) return out.copy(a).lerp(b, t);
  const ua = _v.copy(a).divideScalar(la), ub = _v2.copy(b).divideScalar(lb);
  const d = clamp(ua.dot(ub), -1, 1), th = Math.acos(d);
  if (th < 1e-3) out.copy(ua).lerp(ub, t);
  else { const s = Math.sin(th); out.copy(ua).multiplyScalar(Math.sin((1 - t) * th) / s).addScaledVector(ub, Math.sin(t * th) / s); }
  return out.normalize().multiplyScalar(lerp(la, lb, t));
}
const target = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55, fx: 0.5, fy: 0.5 };
const _rel = new THREE.Vector3();
function updateCamera(dt) {
  camFollow.x = damp(camFollow.x, F.x, 5, dt);
  camFollow.z = damp(camFollow.z, F.z, 5, dt);
  (RIGS[S.phase] || rigMenu)(target);
  if (TRANS.on) {
    TRANS.t += dt / TRANS.dur;
    const e = TRANS.ease(TRANS.t);
    const fp = foxPos();
    slerpVec(TRANS.rel, _v4.copy(target.pos).sub(fp), e, _rel);
    CAM.pos.copy(fp).add(_rel).addScaledVector(TRANS.bulge, Math.sin(Math.PI * clamp(TRANS.t, 0, 1)));
    CAM.look.copy(TRANS.relLook).lerp(_v4.copy(target.look).sub(fp), e).add(fp);
    CAM.fov = lerp(TRANS.fov, target.fov, e); CAM.fx = lerp(TRANS.fx, target.fx, e); CAM.fy = lerp(TRANS.fy, target.fy, e);
    if (TRANS.t >= 1) TRANS.on = false;
  } else {
    CAM.pos.copy(target.pos); CAM.look.copy(target.look); CAM.fov = target.fov; CAM.fx = target.fx; CAM.fy = target.fy;
  }
  lookQuat(CAM.pos, CAM.look, CAM.quat);
  camera.position.copy(CAM.pos);
  if (S.shake > 0.001) camera.position.add(_v.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(S.shake * 0.35));
  camera.quaternion.copy(CAM.quat);
  if (Math.abs(camera.fov - CAM.fov) > 0.01) { camera.fov = CAM.fov; camera.updateProjectionMatrix(); }
  const w = innerWidth, h = innerHeight;
  const ox = Math.round((0.5 - CAM.fx) * w), oy = Math.round((0.5 - CAM.fy) * h);
  if (ox || oy) camera.setViewOffset(w, h, ox, oy, w, h); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  // atmosphere: the ground hazes over the higher we are
  scene.fog.near = 60;
  scene.fog.far = 2600 + Math.max(0, camera.position.y) * 0.8;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  computeView();
  for (const r of rings) r.userData.u.uSize.value = 190 * pr;
  bursts.points.material.uniforms.uScale.value = 260 * pr;
}
addEventListener('resize', resize);
resize();

// ---------- input ----------
const input = { keys: new Set(), dirty: false, px: 0, py: 0, touch: false };
const raycaster = new THREE.Raycaster();
const plane0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const KEYMAP = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D' };
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code]; if (!k) return;
  input.keys.add(k); e.preventDefault();
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) input.keys.delete(k); });
addEventListener('blur', () => input.keys.clear());
function onPointer(e) {
  if (e.pointerType === 'touch') input.touch = true;
  if (e.pointerType !== 'mouse' && e.type === 'pointermove' && !e.buttons && e.pressure === 0) return;
  input.px = e.clientX; input.py = e.clientY; input.dirty = true;
}
canvas.addEventListener('pointerdown', (e) => { onPointer(e); if (S.phase === 'play' || S.phase === 'intro') unlock(); });
canvas.addEventListener('pointermove', onPointer);

// pointer -> the point on the rings' level under the finger (or Foxino's level when there are no rings)
function pointerTarget() {
  const ndc = new THREE.Vector2((input.px / innerWidth) * 2 - 1, -(input.py / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const planeY = S.q && S.sub !== 'after' ? F.y - view.hold : F.y;
  plane0.constant = -planeY;
  const hit = raycaster.ray.intersectPlane(plane0, _v2);
  if (!hit) return;
  F.tx = clamp(hit.x, -X_RANGE, X_RANGE);
  F.tz = clamp(hit.z, -Z_RANGE, Z_RANGE);
}

function steer(dt) {
  if (input.dirty) { pointerTarget(); input.dirty = false; }
  const kx = (input.keys.has('R') ? 1 : 0) - (input.keys.has('L') ? 1 : 0);
  const kz = (input.keys.has('D') ? 1 : 0) - (input.keys.has('U') ? 1 : 0);
  if (kx) F.tx = clamp(F.tx + kx * 7.5 * dt, -X_RANGE, X_RANGE);
  if (kz) F.tz = clamp(F.tz + kz * 3.5 * dt, -Z_RANGE, Z_RANGE);
  // critically damped spring toward the target, in small steps
  const n = Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / n, w = 7;
  for (let i = 0; i < n; i++) {
    F.vx += (w * w * (F.tx - F.x) - 2 * w * F.vx) * h; F.x += F.vx * h;
    F.vz += (w * w * (F.tz - F.z) - 2 * w * F.vz) * h; F.z += F.vz * h;
  }
}

// ---------- UI ----------
const ui = {
  hud: $('hud'), clue: $('clue'), clueQ: $('clueQ'), clueText: $('clueText'), clueNote: $('clueNote'),
  score: $('score'), scorePill: $('scorePill'), alt: $('alt'), streakPill: $('streakPill'), streak: $('streak'),
  hint: $('hint'), hintText: $('hintText'), pop: $('pop'), bigText: $('bigText'), mist: $('mist'), vignette: $('vignette'),
  start: $('start'), end: $('end'), loading: $('loading'),
};
const labelEls = [...document.querySelectorAll('.ring-label')];
const labelSpans = labelEls.map((e) => e.firstElementChild);

function topicList() { return [...SETS.map((s) => ({ id: s.id, title: s.title, level: s.level })), { id: 'mix', title: 'Mix it up', level: 'ALL' }]; }
function renderTopics() {
  const best = store.get('sky-best', {});
  for (const [el, compact] of [[$('topicsStart'), false], [$('topicsEnd'), true]]) {
    el.innerHTML = '';
    for (const t of topicList()) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'topic' + (t.id === S.topic ? ' on' : '');
      b.innerHTML = `${t.title}<small>${t.level}</small>` + (!compact && best[t.id] ? `<span class="best">${'★'.repeat(best[t.id].stars)}</span>` : '');
      b.onclick = () => { unlock(); sfx.pick(); S.topic = t.id; store.set('sky-topic', t.id); renderTopics(); };
      el.appendChild(b);
      if (compact && t.id === S.topic) requestAnimationFrame(() => b.scrollIntoView({ inline: 'center', block: 'nearest' }));
    }
  }
}
function pop(word, plus, cls) {
  ui.pop.innerHTML = `<span class="word ${cls}">${word}</span>` + (plus ? `<span class="plus">${plus}</span>` : '');
}
function bigText(t, top = 30) { ui.bigText.style.top = top + '%'; ui.bigText.textContent = t; ui.bigText.classList.remove('show'); void ui.bigText.offsetWidth; ui.bigText.classList.add('show'); }
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function setClue(q) {
  ui.clue.classList.add('out');
  setTimeout(() => {
    ui.clueQ.textContent = `QUESTION ${S.qi + 1} / ${S.questions.length}`;
    ui.clueText.textContent = q.desc;
    ui.clueNote.className = ''; ui.clueNote.innerHTML = '';
    ui.clue.classList.remove('out');
  }, 180);
}
function updateHud() {
  ui.score.textContent = S.score;
  ui.streakPill.classList.toggle('hidden', S.streak < 2);
  ui.streak.textContent = 'x' + S.streak;
}

$('leaveBtn').onclick = () => {
  sfx.click();
  if (window.parent !== window) window.parent.postMessage({ fugio: 'leave' }, '*'); else location.href = '/';
};
const muteBtn = $('muteBtn');
muteBtn.classList.toggle('muted', isMuted());
muteBtn.onclick = () => { unlock(); setMuted(!isMuted()); muteBtn.classList.toggle('muted', isMuted()); if (!isMuted()) sfx.click(); };
$('playBtn').onclick = () => { unlock(); sfx.click(); startGame(); };
$('againBtn').onclick = () => { unlock(); sfx.click(); startGame(true); };
document.addEventListener('visibilitychange', () => { if (document.hidden) wind(0); });

// ---------- questions ----------
function buildQuestions(topic) {
  const pool = topic === 'mix' ? SETS.flatMap((s) => s.words) : (SETS.find((s) => s.id === topic) || SETS[0]).words;
  return shuffle(pool.slice()).slice(0, Math.min(QN, pool.length)).map(([word, desc, w1, w2]) => {
    const opts = shuffle([word, w1, w2]);
    return { word, desc, opts, correct: opts.indexOf(word) };
  });
}
const holdTime = (i = S.qi) => HOLD[clamp(i, 0, HOLD.length - 1)];

function timeLeft() { // seconds of free fall left before the parachute
  let rem = 0;
  const n = S.questions.length;
  for (let i = Math.max(0, S.qi); i < n; i++) {
    const full = RUSH + holdTime(i) + DIVE + AFTER + 0.3;
    if (i === S.qi && S.q) rem += Math.max(0, full - (S.sub === 'after' ? RUSH + holdTime(i) + DIVE + S.at : S.qt));
    else rem += full;
  }
  if (S.phase === 'intro') rem += Math.max(0, INTRO - S.pt);
  return rem;
}

// ---------- phases ----------
const qFree = new THREE.Quaternion(), qRoll = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1), Y_AXIS = new THREE.Vector3(0, 1, 0);
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function setPhase(p) { S.phase = p; S.pt = 0; }

function resetFox() {
  Object.assign(F, { x: 0, y: START_ALT, z: 0, vx: 0, vz: 0, tx: 0, tz: 0, vy: 0, heading: 0, bank: 0 });
  camFollow.set(0, 0, 0);
  if (!fox) return;
  Object.assign(fox.w, { box: 1, dive: 0, canopy: 0, squat: 0, land: 0 });
  fox.root.rotation.set(0, 0, 0);
  fox.body.scale.setScalar(FOX_SCALE);
  chute.group.visible = false;
  chute.lines.visible = true;
  chute.holder.position.set(0, 3.3, 0.1); chute.holder.rotation.set(-0.12, 0, 0); chute.holder.scale.set(1, 1, 1);
}

function startGame(again) {
  if (!fox) return;
  S.questions = buildQuestions(S.topic);
  S.qi = -1; S.q = null; S.sub = ''; S.score = 0; S.right = 0; S.streak = 0; S.missed = [];
  resetFox();
  for (const r of rings) r.visible = false;
  for (const s of clouds.pool) s.visible = false;
  bursts.clear();
  plane.visible = true;
  ui.start.classList.add('hidden'); ui.end.classList.add('hidden');
  ui.hud.classList.remove('hidden'); ui.clue.classList.add('out'); ui.hint.classList.add('hidden');
  ui.clueText.textContent = ''; ui.clueQ.textContent = '';
  updateHud();
  if (again) { // from the ground: flash white and start again up in the sky
    S.mist = 1.4;
    setPhase('menu'); updateCamera(0);
    CAM.pos.copy(target.pos); CAM.look.copy(target.look); CAM.fov = target.fov; CAM.fx = target.fx; CAM.fy = target.fy; TRANS.on = false;
  }
  setPhase('intro');
  startTransition(INTRO * 0.95);
  bigText('JUMP!');
  sfx.jump();
}

function nextQuestion() {
  S.qi++;
  if (S.qi >= S.questions.length) {
    S.q = null;
    if (F.y > A_OPEN + 6) { S.sub = 'drop'; ui.clue.classList.add('out'); return; } // still high: keep falling first
    startCanopy(); return;
  }
  S.q = S.questions[S.qi]; S.qt = 0; S.sub = 'rush'; S.at = 0; S.chosen = -1;
  F.tx = 0; F.tz = 0; // glide back to the middle so all three rings are in view
  S.zRow = S.qi === 0 ? 0 : (Math.random() - 0.5) * 1.2;
  S.q.opts.forEach((w, k) => {
    labelSpans[k].textContent = w;
    labelEls[k].classList.remove('reveal');
    const r = rings[k]; r.visible = true; setRingState(r, 'idle');
    Object.assign(ringFx[k], { alpha: 0, label: 0, flash: 0, glitch: 0, scale: 1, x: XS[k], z: S.zRow, dist: RUSH_FROM });
  });
  setClue(S.q);
  sfx.holo();
}

function resolve() {
  const q = S.q;
  let k = 0, best = 1e9;
  for (let i = 0; i < 3; i++) { const d = Math.hypot(F.x - XS[i], F.z - S.zRow); if (d < best) { best = d; k = i; } }
  const hit = best <= RING_R + 0.3 ? k : -1;
  S.sub = 'after'; S.at = 0; S.chosen = hit; S.wasRight = hit === q.correct;
  ui.hint.classList.add('hidden');
  if (S.wasRight) {
    S.right++; S.streak++;
    const gain = 100 + Math.min(100, 25 * (S.streak - 1));
    S.score += gain;
    pop('RIGHT!', '+' + gain, 'right');
    setRingState(rings[hit], 'right'); ringFx[hit].flash = 1;
    bursts.emit(0, 0, 0, ['#ffe066', '#35f2ff', '#ffffff', '#ff4fe0', '#ffb000'], 110, 9);
    sfx.right(); if (S.streak >= 2) sfx.streak(S.streak);
    S.fovKick = Math.max(S.fovKick, 9);
    ui.clueNote.className = 'show good'; ui.clueNote.innerHTML = `✓ ${q.word}`;
    bump(ui.scorePill);
  } else {
    S.streak = 0; S.missed.push(q.word);
    pop(hit < 0 ? 'MISSED!' : 'OOPS!', '', 'wrong');
    if (hit >= 0) { setRingState(rings[hit], 'wrong'); ringFx[hit].glitch = 1; }
    setRingState(rings[q.correct], 'reveal'); ringFx[q.correct].flash = 1;
    labelEls[q.correct].classList.add('reveal');
    bursts.emit(0, 0, 0, ['#ff2a3a', '#ff8a3a', '#401020'], 40, 5);
    sfx.wrong(); S.shake = 1; S.vig = 1;
    ui.clueNote.className = 'show bad'; ui.clueNote.innerHTML = `The answer: <b>${q.word}</b>`;
  }
  updateHud();
  // a cloud bank to fall through between questions, while high up
  if (F.y > 330 && S.qi % 2 === 0) spawnCloudBank(F.y - 17 - Math.random() * 4);
}

function spawnCloudBank(y) {
  clouds.pool.forEach((s, i) => {
    const a = (i / clouds.pool.length) * Math.PI * 2 + Math.random() * 0.6, d = i === 0 ? 0 : 3 + Math.random() * 7;
    s.position.set(F.x + Math.cos(a) * d, y + (Math.random() - 0.5) * 6, F.z + Math.sin(a) * d * 0.8);
    const size = 12 + Math.random() * 9;
    s.scale.set(size, size * 0.75, 1); s.userData.size = size; s.userData.hit = false;
    s.visible = true;
  });
}

function startCanopy() {
  setPhase('canopy');
  S.q = null; S.sub = '';
  for (const r of rings) r.visible = false;
  ui.clue.classList.add('out'); ui.hint.classList.add('hidden');
  Object.assign(C, { vy0: F.vy, glide: false, x0: F.x, z0: F.z, cpos: null });
  F.heading = Math.PI; F.bank = 0; // he faces +z, the way he was diving
  chute.group.visible = true; chute.lines.visible = true;
  chute.holder.scale.set(0.05, 0.05, 0.05); chute.holder.position.set(0, 0.8, 0.4);
  sfx.chute();
  bigText('PARACHUTE!', 17);
  // swing round his side (not through the opening canopy) to behind him
  startTransition(2.4, new THREE.Vector3(-4.5, -1.2, 0), (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 2.2));
}

function hermite(u, p0, p1, m0, m1) {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}
function bez(a, b, c, u) { return (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c; }

function land() {
  setPhase('landed');
  F.y = fox.ground; F.vy = 0;
  S.shake = 0.5;
  sfx.land();
  bursts.emit(0, -0.5, 0, ['#ffc531', '#ff7a1a', '#8a4fe0', '#35d6ff', '#ff4f9a', '#5bff8a'], 140, 7, 6);
  bigText('TOUCHDOWN!', 17);
  chute.lines.visible = false;
  Object.assign(C, { cpos: chute.holder.position.clone(), crot: chute.holder.rotation.x });
  startTransition(1.9);
}

function showEnd() {
  setPhase('end');
  ui.hud.classList.add('hidden');
  const n = S.questions.length, frac = S.right / n;
  const stars = frac >= 0.9 ? 3 : frac >= 0.6 ? 2 : 1;
  $('endTitle').textContent = stars === 3 ? 'Perfect landing!' : stars === 2 ? 'Great landing!' : 'Safe landing!';
  $('endRight').textContent = `${S.right} / ${n}`;
  $('endScore').textContent = S.score;
  const starEls = [...document.querySelectorAll('#stars i')];
  starEls.forEach((el) => el.classList.remove('on'));
  starEls.forEach((el, i) => { if (i < stars) setTimeout(() => { el.classList.add('on'); sfx.star(i); }, 350 + i * 320); });
  const pw = $('practiceWords'); pw.innerHTML = '';
  for (const w of S.missed) { const s = document.createElement('span'); s.textContent = w; pw.appendChild(s); }
  $('practice').classList.toggle('hidden', !S.missed.length);
  const best = store.get('sky-best', {});
  const prev = best[S.topic];
  if (!prev || stars > prev.stars || (stars === prev.stars && S.score > prev.score)) { best[S.topic] = { stars, score: S.score }; store.set('sky-best', best); }
  renderTopics();
  ui.end.classList.remove('hidden');
  $('againBtn').classList.add('pulse');
}

// ---------- per-phase updates ----------
function updateFall(dt) {
  const goal = clamp((F.y - A_OPEN) / Math.max(timeLeft(), 0.5), 3, 26);
  F.vy = damp(F.vy, goal, 1.5, dt);
  F.y -= F.vy * dt;
}

function updatePlay(dt) {
  if (S.sub === 'drop') { // after the last question: fall on down to parachute height
    F.vy = damp(F.vy, Math.max(12, (F.y - A_OPEN) / 1.2), 3, dt); F.y -= F.vy * dt; steer(dt);
    if (F.y <= A_OPEN) startCanopy();
    return;
  }
  updateFall(dt);
  const q = S.q;
  if (!q) { nextQuestion(); return; }
  const hold = holdTime();
  if (S.sub !== 'after') {
    S.qt += dt;
    const t1 = RUSH, t2 = RUSH + hold, t3 = t2 + DIVE;
    let dist;
    if (S.qt < t1) { dist = lerp(RUSH_FROM, view.hold + 4, easeOut(S.qt / t1)); S.sub = 'rush'; }
    else if (S.qt < t2) {
      dist = lerp(view.hold + 4, view.hold, (S.qt - t1) / hold);
      if (S.sub !== 'hold') { S.sub = 'hold'; if (S.qi === 0) showHint(); }
    } else {
      const u = clamp((S.qt - t2) / DIVE, 0, 1);
      dist = view.hold * (1 - u * u);
      if (S.sub !== 'dive') { S.sub = 'dive'; sfx.dive(); }
      // help a little when Foxino is already inside a ring
      let k = 0, bd = 1e9;
      for (let i = 0; i < 3; i++) { const d = Math.abs(F.x - XS[i]); if (d < bd) { bd = d; k = i; } }
      if (bd < RING_R + 0.2) { F.tx = damp(F.tx, XS[k], 3, dt); F.tz = damp(F.tz, S.zRow, 3, dt); }
    }
    for (let k = 0; k < 3; k++) {
      const f = ringFx[k];
      f.dist = dist; f.x = XS[k]; f.z = S.zRow;
      f.alpha = smooth(S.qt / 0.45);
      f.label = S.sub === 'rush' ? smooth((S.qt - t1 * 0.55) / (t1 * 0.45)) : S.sub === 'hold' ? 1 : 1 - smooth((S.qt - t2) / (DIVE * 0.55));
    }
    S.diving = S.sub === 'dive' ? 1 : 0;
    steer(dt);
    if (S.qt >= t3) resolve();
  } else {
    S.at += dt;
    steer(dt);
    S.diving = 0;
    const right = S.wasRight;
    for (let k = 0; k < 3; k++) {
      const f = ringFx[k];
      if (right && k === S.chosen) { // the ring bursts open around Foxino
        f.dist = -0.6 * easeOut(S.at / 0.8); f.scale = 1 + 0.9 * easeOut(S.at / 0.8);
        f.alpha = 1 - smooth(S.at / 0.8); f.label = 0;
      } else if (!right && k === S.q.correct) { // the right ring swoops in under Foxino and glows
        const e = easeOut(S.at / 0.55);
        f.x = lerp(XS[k], F.x, e); f.z = lerp(S.zRow, F.z, e); f.dist = lerp(0, view.hold * 0.6, e);
        f.flash = 0.55 + 0.45 * Math.sin(S.at * 12);
        const out = smooth((S.at - (AFTER + 0.5)) / 0.4);
        f.alpha = 1 - out; f.label = 1 - out;
      } else if (k === S.chosen) { // the wrong ring glitches and falls apart
        f.dist = -1.2 * easeOut(S.at); f.alpha = 1 - smooth(S.at / 0.9); f.label = 0;
        f.glitch = Math.max(0.25, 1 - S.at);
      } else { f.alpha = Math.max(0, f.alpha - dt * 3); f.label = Math.max(0, f.label - dt * 4); f.dist = -0.4 * easeOut(S.at); }
    }
    if (S.at >= AFTER + (right ? 0 : 0.9)) {
      for (const r of rings) r.visible = false;
      nextQuestion();
    }
  }
}

function showHint() {
  const touchy = input.touch || matchMedia('(hover: none) and (pointer: coarse)').matches;
  ui.hintText.textContent = touchy ? 'Slide your finger to steer' : 'Steer with the mouse or ← → keys';
  ui.hint.classList.remove('hidden');
}

function updateCanopy(dt) {
  const t = S.pt;
  if (t < DEPLOY) {
    F.vy = lerp(C.vy0, 5, easeOut(t / DEPLOY));
    F.y -= F.vy * dt;
    F.vx *= Math.exp(-dt * 3); F.x += F.vx * dt; F.z += F.vz * dt * 0.3;
  } else {
    if (!C.glide) {
      C.glide = true; C.x1 = F.x; C.y1 = F.y; C.z1 = F.z; C.vd = F.vy;
      C.cx = C.x1 + 16; C.cz = C.z1 + 14;
    }
    const u = clamp((t - DEPLOY) / GLIDE, 0, 1);
    const uh = 1 - Math.pow(1 - u, 1.6);
    const nx = bez(C.x1, C.cx, TARGET.x, uh), nz = bez(C.z1, C.cz, TARGET.z, uh);
    const dx = nx - F.x, dz = nz - F.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      const h = Math.atan2(-dx, -dz);
      let dh = h - F.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      F.heading += dh * (1 - Math.exp(-dt * 4));
      F.bank = damp(F.bank, clamp(-dh * 6, -0.45, 0.45), 3, dt);
    }
    F.x = nx; F.z = nz;
    F.y = hermite(u, C.y1, fox.ground, -C.vd * GLIDE, -0.5 * GLIDE);
    if (u >= 1) land();
  }
}

// ---------- the per-frame animation of Foxino and the parachute ----------
const _hl = new THREE.Vector3(), _hr = new THREE.Vector3();
function animateFox(dt) {
  if (!fox) return;
  const w = fox.w, p = S.phase;
  fox.root.position.set(F.x, F.y, F.z);
  if (p === 'menu' || p === 'intro' || p === 'play' || p === 'loading') {
    w.dive = damp(w.dive, S.diving, 6, dt);
    let roll = clamp(-F.vx * 0.085, -0.6, 0.6) + 0.05 * Math.sin(S.time * 1.7);
    if (p === 'intro') roll += Math.PI * 2 * easeInOut((S.pt - 0.35) / 1.3); // a happy barrel roll
    const yaw = clamp(F.vx * 0.04, -0.3, 0.3);
    const pitch = Math.PI / 2 - clamp(F.vz * 0.06, -0.2, 0.2) + 0.04 * Math.sin(S.time * 1.3);
    euler.set(pitch, 0, 0, 'YXZ'); qFree.setFromEuler(euler);
    qRoll.setFromAxisAngle(Z_AXIS, roll); qYaw.setFromAxisAngle(Y_AXIS, yaw);
    fox.body.quaternion.copy(qYaw).multiply(qRoll).multiply(qFree);
    fox.root.rotation.set(0, 0, 0);
    fox.applyPose(dt, 1);
  } else if (p === 'canopy') {
    const t = S.pt;
    w.dive = damp(w.dive, 0, 6, dt);
    w.canopy = smooth(t / 0.9);
    // pendulum swing from belly-down to hanging upright
    const th = (Math.PI / 2) * Math.exp(-3.2 * t) * Math.cos(4.2 * t) + 0.06 * Math.sin(t * 2.1);
    euler.set(th, Math.PI, 0, 'YXZ'); qFree.setFromEuler(euler);
    qRoll.setFromAxisAngle(Z_AXIS, F.bank + 0.04 * Math.sin(t * 1.6));
    fox.body.quaternion.copy(qRoll).multiply(qFree);
    fox.root.rotation.set(0, F.heading, 0);
    fox.applyPose(dt, 0.6);
    // canopy unfolds with a bounce
    const tc = Math.max(0, t - 0.3);
    const e = backOut(tc / 0.9), e2 = easeOut(tc / 0.7);
    chute.holder.scale.set(lerp(0.05, 1, e), lerp(0.05, 1, e2), lerp(0.05, 1, e2));
    chute.holder.position.set(0, lerp(0.8, 3.3, e2), lerp(0.4, 0.1, e2));
    chute.holder.rotation.set(-0.12 + 0.05 * Math.sin(t * 1.9), 0, -F.bank * 0.5 + 0.03 * Math.sin(t * 1.3));
  } else if (p === 'landed' || p === 'end') {
    const t = S.pt;
    w.canopy = 1 - smooth(t / 0.25);
    w.squat = t < 0.12 ? smooth(t / 0.12) : 1 - smooth((t - 0.25) / 0.3);
    w.land = smooth((t - 0.3) / 0.35);
    const squash = t < 0.5 ? Math.sin(Math.min(1, t / 0.5) * Math.PI) : 0;
    fox.body.scale.set(FOX_SCALE * (1 + 0.08 * squash), FOX_SCALE * (1 - 0.12 * squash), FOX_SCALE * (1 + 0.08 * squash));
    const hop = t > 0.55 && t < 1.05 ? Math.sin(((t - 0.55) / 0.5) * Math.PI) * 0.35 : 0;
    fox.root.position.y = fox.ground - 0.16 * w.squat + hop;
    euler.set(0, Math.PI, 0, 'YXZ'); qFree.setFromEuler(euler);
    fox.body.quaternion.copy(qFree);
    fox.root.rotation.set(0, F.heading, 0);
    fox.applyPose(dt, 0.3);
    // the canopy sinks down behind him
    if (C.cpos) { // the empty canopy sinks down and lies on the grass behind him
      const c = easeOut(t / 1.5);
      const dy = fox.root.position.y - fox.ground;
      chute.holder.position.set(0, lerp(C.cpos.y, 0.36 - fox.ground, c) - dy, lerp(C.cpos.z, 3.6, c));
      chute.holder.rotation.set(lerp(C.crot, 0.04, c), 0, 0);
      chute.holder.scale.set(lerp(1, 1.06, c), lerp(1, 0.3, c), lerp(1, 1.2, c));
    }
  }
  if (chute.group.visible && chute.lines.visible) {
    fox.root.updateMatrixWorld(true);
    fox.hand('Left', _hl); fox.hand('Right', _hr);
    chute.updateLines(_hl, _hr);
  }
}

// ---------- rings, labels, clouds, effects ----------
const camRight = new THREE.Vector3(), _p = new THREE.Vector3();
function updateRings(t, dt) {
  for (let k = 0; k < 3; k++) {
    const r = rings[k]; if (!r.visible) continue;
    const f = ringFx[k], u = r.userData.u;
    r.position.set(f.x, F.y - f.dist, f.z);
    r.lookAt(camera.position);
    r.scale.setScalar(f.scale);
    f.flash = Math.max(0, f.flash - dt * (S.wasRight ? 1.5 : 0));
    f.glitch = Math.max(0, f.glitch - dt * 0.2);
    u.uAlpha.value = f.alpha; u.uFlash.value = f.flash; u.uGlitch.value = f.glitch;
    updateRing(r, t, dt);
  }
}
function updateLabels() {
  const w = innerWidth, h = innerHeight;
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const pos = [];
  for (let k = 0; k < 3; k++) {
    const r = rings[k], f = ringFx[k];
    if (!r.visible || f.label <= 0.02 || !S.q) { pos.push(null); continue; }
    _p.copy(r.position).project(camera);
    if (_p.z > 1) { pos.push(null); continue; }
    const x = (_p.x + 1) / 2 * w, y = (1 - _p.y) / 2 * h;
    _p.copy(r.position).addScaledVector(camRight, RING_R * r.scale.x).project(camera);
    const d = Math.abs((_p.x + 1) / 2 * w - x) * 2;
    pos.push({ x, y, d });
  }
  let gap = 1e9;
  for (let k = 0; k < 2; k++) if (pos[k] && pos[k + 1]) gap = Math.min(gap, pos[k + 1].x - pos[k].x);
  for (let k = 0; k < 3; k++) {
    const el = labelEls[k], p = pos[k];
    if (!p) { if (el.style.opacity !== '0') el.style.opacity = '0'; continue; }
    const word = labelSpans[k].textContent;
    const longest = Math.max(...word.split(' ').map((s) => s.length));
    const maxW = Math.max(70, Math.min(p.d * 1.5, gap - 4, w * 0.42));
    const fs = Math.floor(clamp(Math.min(p.d * 0.3, (maxW - 4) / (0.62 * longest + 0.95)), 14, 38));
    el.style.fontSize = fs + 'px';
    el.style.maxWidth = Math.round(maxW) + 'px';
    const half = Math.min(maxW, (longest + 1) * fs * 0.6) / 2 + 6;
    const x = clamp(p.x, half, w - half);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    el.style.opacity = ringFx[k].label.toFixed(3);
  }
}

let mistTarget = 0;
function updateClouds() {
  mistTarget = 0;
  clouds.updatePassing(F.x, F.y, F.z, S.phase === 'play' || S.phase === 'intro');
  const cp = camera.position;
  for (const s of clouds.list) {
    if (!s.visible) continue;
    const u = s.userData;
    const d = s.position.distanceTo(cp);
    const near = u.size * 0.55;
    s.material.opacity = u.base * smooth((d - near * 0.3) / (near * 0.7)) * (u.passing ? 1 - smooth((d - u.far) / 40) : 1);
    if (u.corridor && d < u.size * 0.6) {
      mistTarget = Math.max(mistTarget, 1 - d / (u.size * 0.6));
      if (!u.hit && (S.phase === 'play' || S.phase === 'intro')) { u.hit = true; sfx.whoosh(); }
    }
    if (u.corridor && s.position.y > F.y + 30) s.visible = false;
  }
}

function updateWorldBits(t, dt) {
  updateBirds(birds, t, dt);
  // the plane circles around the jump spot
  if (plane.visible) {
    const a = t * 0.32;
    plane.position.set(Math.cos(a) * 110, START_ALT + 26, Math.sin(a) * 110 - 30);
    plane.rotation.set(0, -a + Math.PI, 0.25);
    plane.userData.prop.rotation.x += dt * 40;
    if (S.phase === 'play' && F.y < START_ALT - 300) plane.visible = false;
  }
  if (W.sockCone) W.sockCone.rotation.y = 0.5 + 0.25 * Math.sin(t * 0.9);
}

const diveW = () => (fox ? fox.w.dive : 0);
function updateEffects(dt, rdt) {
  const p = S.phase;
  // wind streaks
  let alpha = 0, rel = 0;
  if (p === 'menu') { alpha = 0.22; rel = 22; }
  else if (p === 'intro' || p === 'play') { alpha = 0.2 + 0.5 * diveW(); rel = 18 + F.vy * 1.6 + 24 * diveW(); }
  else if (p === 'canopy') { alpha = 0.12 * (1 - smooth(S.pt / 3)); rel = 8; }
  streaks.update(dt, F.x, F.y, F.z, rel, alpha);
  burstGroup.position.set(F.x, F.y, F.z);
  bursts.update(dt, p === 'landed' || p === 'end' ? 9 : 0);
  // camera punch
  const fovGoal = S.sub === 'dive' ? 8 : 0;
  S.fovKick = damp(S.fovKick, fovGoal, S.sub === 'dive' ? 3 : 2.2, dt);
  S.shake = Math.max(0, S.shake - rdt * 2.2);
  S.vig = Math.max(0, S.vig - rdt * 1.6);
  ui.vignette.style.opacity = S.vig.toFixed(3);
  S.mist = Math.max(mistTarget * 0.9, S.mist - rdt * 1.4);
  ui.mist.style.opacity = clamp(S.mist, 0, 1).toFixed(3);
  // the wind's roar
  const lvl = p === 'menu' ? 0.35 : p === 'intro' ? 0.4 + 0.5 * smooth(S.pt / INTRO) : p === 'play' ? 0.75 + 0.35 * diveW() : p === 'canopy' ? 0.85 - 0.6 * smooth(S.pt / 2) : 0.06;
  wind(document.hidden ? 0 : lvl, p === 'play' ? 1 + diveW() * 0.6 : 0.7);
}

// ---------- main loop ----------
let last = performance.now(), slow = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  const dt = S.paused ? 0 : rdt * S.timeScale;
  S.time += dt; S.pt += dt;

  switch (S.phase) {
    case 'intro':
      F.vy = lerp(0, 10, smooth(S.pt / INTRO)); F.y -= F.vy * dt; steer(dt);
      if (S.pt >= INTRO) { setPhase('play'); S.pt = 0; }
      break;
    case 'play': updatePlay(dt); break;
    case 'canopy': updateCanopy(dt); break;
    case 'landed': if (S.pt > 1.9) showEnd(); break;
    default: break;
  }
  animateFox(dt);
  updateCamera(dt);
  updateRings(S.time, dt);
  updateLabels();
  updateClouds();
  updateWorldBits(S.time, dt);
  updateEffects(dt, rdt);
  if (S.phase !== 'loading') ui.alt.textContent = Math.max(0, Math.round(F.y - (fox ? fox.ground : 0)));
  renderer.render(scene, camera);

  // lower the resolution on slow devices (never raise it again)
  if (rdt > 0) { frames++; if (rdt > 1 / 38) slow++; }
  if (frames >= 90) {
    if (slow > 45 && pr > 1) { pr = Math.max(1, pr - 0.25); resize(); }
    frames = 0; slow = 0;
  }
}

// ---------- loading ----------
async function init() {
  renderTopics();
  try {
    fox = await loadFoxino('models/foxino.glb?v=1', (e) => {
      if (e.total) $('loadFill').style.width = Math.round(10 + 85 * e.loaded / e.total) + '%';
    });
  } catch (err) {
    console.error(err);
    $('loadText').textContent = 'Could not load Foxino. Please reload the page.';
    return;
  }
  fox.body.scale.setScalar(FOX_SCALE);
  fox.ground = fox.pivotHeight * FOX_SCALE + 0.06;
  scene.add(fox.root);
  chute = makeParachute();
  fox.root.add(chute.group);
  resetFox();
  setPhase('menu');
  updateCamera(0);
  ui.loading.classList.add('gone');
  ui.start.classList.remove('hidden');
  $('playBtn').classList.add('pulse');
  window.SKY.ready = true;
}

// ---------- test hooks ----------
window.SKY = {
  ready: false,
  state: () => ({
    phase: S.phase, sub: S.sub, q: S.qi + 1, total: S.questions.length, score: S.score, right: S.right, streak: S.streak,
    alt: Math.round(F.y), word: S.q && S.q.word, options: S.q && S.q.opts, correct: S.q ? S.q.correct : -1,
    fox: { x: +F.x.toFixed(2), z: +F.z.toFixed(2) }, missed: S.missed.slice(), pixelRatio: pr,
  }),
  start: (topic) => { if (topic) S.topic = topic; unlock(); startGame(S.phase === 'end'); return S.questions.length; },
  // steer into the right (or a wrong) ring now and skip the rest of the reading time
  answer: (right = true) => {
    if (S.phase !== 'play' || !S.q || S.sub === 'after') return false;
    const k = right ? S.q.correct : (S.q.correct + 1) % 3;
    F.tx = XS[k]; F.tz = S.zRow;
    const t = RUSH + holdTime() - 0.7;
    if (S.qt < t) S.qt = t;
    return true;
  },
  skipToLanding: () => {
    if (S.phase !== 'play' && S.phase !== 'intro') return false;
    while (S.qi < S.questions.length - 1) { S.qi++; S.missed.push(S.questions[S.qi].word); }
    for (const r of rings) r.visible = false;
    F.y = A_OPEN; F.vy = 9; S.q = null;
    startCanopy();
    return true;
  },
  timeScale: (k) => { S.timeScale = k; },
  pause: (b) => { S.paused = !!b; },
  info: () => ({ ...renderer.info.render, calls: renderer.info.render.calls, programs: renderer.info.programs.length }),
  rings: () => rings.map((r, k) => ({ visible: r.visible, label: labelSpans[k].textContent, opacity: labelEls[k].style.opacity, rect: labelEls[k].getBoundingClientRect().toJSON() })),
};

requestAnimationFrame(frame);
init();
