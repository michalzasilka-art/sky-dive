// Sky Dive scenery, all built in code: sky dome, a painted landscape (fields, lake, river, village, forests),
// low-poly hills, trees and houses, clouds, birds, the plane, and the landing target.
import * as THREE from './lib/three.module.min.js';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TARGET = new THREE.Vector3(0, 0, 42); // the landing target on the meadow
export const SUN = new THREE.Vector3(0.45, 0.8, 0.4).normalize();
export const FOG_COLOR = new THREE.Color(0xd2e9f8);
const DISC_R = 1600; // the painted ground disc (metres)
const TEX = 2048;

// ---------- sky dome ----------
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(0x2c7fdc) },
      uMid: { value: new THREE.Color(0x76b9f0) },
      uHor: { value: new THREE.Color(0xdcf0ff) },
      uLow: { value: FOG_COLOR.clone() },
      uSun: { value: SUN.clone() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 uTop,uMid,uHor,uLow,uSun; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > 0.0 ? mix(uHor, mix(uMid, uTop, smoothstep(0.25, 0.9, y)), smoothstep(0.0, 0.25, y)) : uLow;
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.95, 0.8) * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// ---------- the painted landscape ----------
const W2P = (v) => (v / (2 * DISC_R) + 0.5) * TEX; // world metres -> canvas pixels

function blob(g, cx, cy, r, R, n = 18, wob = 0.25) {
  g.beginPath();
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (R() - 0.5) * 2 * wob);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
  }
  g.closePath();
}

export const LAKE = { x: -150, z: 160, r: 75 };
export const VILLAGE = { x: 200, z: 250 };
export const FORESTS = [
  { x: -150, z: 70, r: 70 }, { x: 90, z: 140, r: 55 }, { x: -330, z: -380, r: 110 }, { x: 330, z: 160, r: 90 },
  { x: -60, z: -330, r: 60 }, { x: 520, z: -520, r: 140 }, { x: -560, z: 300, r: 150 }, { x: 40, z: 520, r: 120 },
  { x: -700, z: -200, r: 130 }, { x: 650, z: 80, r: 120 },
];

function paintGround() {
  const c = document.createElement('canvas'); c.width = c.height = TEX;
  const g = c.getContext('2d');
  const R = rng(7);
  g.fillStyle = '#86c45a'; g.fillRect(0, 0, TEX, TEX);
  // patchwork fields on a slightly rotated grid
  const cols = ['#e7cb5c', '#a7d65e', '#74be4b', '#5aa340', '#c09359', '#b2d36a', '#dcb54e', '#93c957', '#a58ad6', '#6cb44a', '#d8a35a'];
  g.save(); g.translate(TEX / 2, TEX / 2); g.rotate(0.21); g.translate(-TEX / 2, -TEX / 2);
  const cell = 46;
  for (let y = -6; y < TEX / cell + 6; y++) {
    for (let x = -6; x < TEX / cell + 6; x++) {
      const w = cell * (R() < 0.3 ? 2 : 1), h = cell * (R() < 0.25 ? 2 : 1);
      const px = x * cell + (R() - 0.5) * 6, py = y * cell + (R() - 0.5) * 6;
      const col = cols[Math.floor(R() * cols.length)];
      g.fillStyle = col; g.fillRect(px, py, w - 2, h - 2);
      // crop rows
      g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1;
      const vertical = R() < 0.5;
      for (let k = 3; k < (vertical ? w : h) - 2; k += 4) {
        g.beginPath();
        if (vertical) { g.moveTo(px + k, py + 1); g.lineTo(px + k, py + h - 3); } else { g.moveTo(px + 1, py + k); g.lineTo(px + w - 3, py + k); }
        g.stroke();
      }
    }
  }
  // hedges between fields
  g.strokeStyle = 'rgba(40,90,30,0.55)'; g.lineWidth = 2;
  for (let y = -6; y < TEX / cell + 6; y += 2) { g.beginPath(); g.moveTo(-400, y * cell - 1); g.lineTo(TEX + 400, y * cell - 1); g.stroke(); }
  for (let x = -6; x < TEX / cell + 6; x += 3) { g.beginPath(); g.moveTo(x * cell - 1, -400); g.lineTo(x * cell - 1, TEX + 400); g.stroke(); }
  g.restore();

  // the landing meadow (big soft green circle) around the target
  const tx = W2P(TARGET.x), tz = W2P(TARGET.z);
  g.fillStyle = '#7fc552'; blob(g, tx, tz, 95 / 1.5625, R, 22, 0.12); g.fill();
  // forests
  for (const f of FORESTS) {
    g.fillStyle = '#2f7a35'; blob(g, W2P(f.x), W2P(f.z), f.r / 1.5625, R, 20, 0.3); g.fill();
    for (let i = 0; i < f.r * 1.4; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * f.r / 1.5625;
      g.fillStyle = R() < 0.5 ? '#27662c' : '#3d8c3c';
      g.beginPath(); g.arc(W2P(f.x) + Math.cos(a) * d, W2P(f.z) + Math.sin(a) * d, 2 + R() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  // river winding into the lake
  const lx = W2P(LAKE.x), lz = W2P(LAKE.z);
  const river = (wid, col) => {
    g.strokeStyle = col; g.lineWidth = wid; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W2P(-1500), W2P(900));
    g.bezierCurveTo(W2P(-900), W2P(500), W2P(-600), W2P(60), lx - 30, lz + 10);
    g.moveTo(lx + 30, lz - 20);
    g.bezierCurveTo(W2P(-80), W2P(-120), W2P(-500), W2P(-600), W2P(-300), W2P(-1500));
    g.stroke();
  };
  river(13, '#d9cf9a'); river(8, '#3f97d6'); river(3, '#7cc4f0');
  // the lake
  g.fillStyle = '#e3d79f'; blob(g, lx, lz, LAKE.r / 1.5625 + 6, rng(3), 16, 0.18); g.fill();
  g.fillStyle = '#3a8fd2'; blob(g, lx, lz, LAKE.r / 1.5625, rng(3), 16, 0.18); g.fill();
  g.fillStyle = 'rgba(140,210,250,0.5)'; blob(g, lx - 8, lz - 8, LAKE.r / 1.5625 * 0.55, rng(4), 12, 0.2); g.fill();
  // roads
  const road = (pts) => {
    for (const [w, col] of [[7, '#b8a17a'], [4.5, '#efe2c2']]) {
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(W2P(pts[0][0]), W2P(pts[0][1]));
      for (let i = 1; i < pts.length; i++) g.lineTo(W2P(pts[i][0]), W2P(pts[i][1]));
      g.stroke();
    }
  };
  road([[95, -1600], [90, -300], [80, -40], [110, 170], [VILLAGE.x - 40, VILLAGE.z], [VILLAGE.x + 60, VILLAGE.z + 30], [1600, 420]]);
  road([[-1600, 40], [-400, 10], [-120, -20], [80, -40]]);
  road([[VILLAGE.x, VILLAGE.z], [VILLAGE.x + 30, 900], [VILLAGE.x - 20, 1600]]);
  // village ground
  g.fillStyle = 'rgba(214,205,180,0.85)'; blob(g, W2P(VILLAGE.x), W2P(VILLAGE.z), 70 / 1.5625, rng(9), 14, 0.25); g.fill();
  // fade the disc edge into the hills' green
  const grd = g.createRadialGradient(TEX / 2, TEX / 2, TEX * 0.4, TEX / 2, TEX / 2, TEX * 0.5);
  grd.addColorStop(0, 'rgba(110,170,80,0)'); grd.addColorStop(1, 'rgba(110,170,80,1)');
  g.fillStyle = grd; g.fillRect(0, 0, TEX, TEX);
  return c;
}

function grassTile() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7fc552'; g.fillRect(0, 0, 256, 256);
  const R = rng(21);
  for (let i = 0; i < 2600; i++) {
    const x = R() * 256, y = R() * 256, l = 3 + R() * 5;
    const v = R();
    g.strokeStyle = v < 0.33 ? '#6db345' : v < 0.66 ? '#93d462' : '#86ca58';
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 2, y - l); g.stroke();
  }
  for (let i = 0; i < 40; i++) { // tiny flowers
    g.fillStyle = R() < 0.5 ? '#fff6d0' : '#ffd84a';
    g.beginPath(); g.arc(R() * 256, R() * 256, 1.3, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function radialAlpha(size = 128, inner = 0.55) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, size * inner * 0.5, size / 2, size / 2, size / 2);
  grd.addColorStop(0, '#fff'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return c;
}

function targetTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const rings = ['#ffffff', '#ff5a36', '#ffffff', '#ffc531', '#ffffff', '#ff5a36'];
  for (let i = 0; i < rings.length; i++) {
    g.fillStyle = rings[i]; g.beginPath(); g.arc(256, 256, 252 - i * 42, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(80,40,120,0.85)'; g.lineWidth = 6;
  g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.stroke();
  // a paw print in the middle (Foxino's mark)
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(256, 272, 24, 20, 0, 0, Math.PI * 2); g.fill();
  for (const [dx, dy] of [[-26, -14], [-9, -30], [9, -30], [26, -14]]) { g.beginPath(); g.ellipse(256 + dx, 256 + dy, 8, 10, 0, 0, Math.PI * 2); g.fill(); }
  return c;
}

// low-poly geometry helpers (all non-indexed with a colour attribute so they can be merged)
function colored(geo, hex) {
  const gg = geo.index ? geo.toNonIndexed() : geo;
  const col = new THREE.Color(hex);
  const n = gg.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (gg.attributes.uv) gg.deleteAttribute('uv');
  return gg;
}
function prism(w, h, d) { // gable roof: ridge along z
  const x = w / 2, z = d / 2;
  const P = [[-x, 0, -z], [x, 0, -z], [0, h, -z], [-x, 0, z], [x, 0, z], [0, h, z]];
  const tris = [[0, 2, 1], [3, 4, 5], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 4], [0, 1, 4], [0, 4, 3]];
  const pos = [];
  for (const t of tris) for (const i of t) pos.push(...P[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function treeGeos() {
  const trunk = colored(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 5).translate(0, 0.9, 0), 0x7a5232);
  const conifer = mergeGeometries([
    trunk.clone(),
    colored(new THREE.ConeGeometry(1.9, 3.0, 7).translate(0, 2.8, 0), 0x2f8a46),
    colored(new THREE.ConeGeometry(1.4, 2.4, 7).translate(0, 4.3, 0), 0x3a9a50),
  ]);
  const round = mergeGeometries([
    trunk.clone(),
    colored(new THREE.IcosahedronGeometry(2.0, 0).translate(0, 3.3, 0), 0x56b041),
  ]);
  conifer.computeVertexNormals(); round.computeVertexNormals();
  return { conifer, round };
}

export function makeWorld(scene) {
  const world = new THREE.Group();
  scene.add(world);
  const R = rng(42);

  // inner painted disc
  const groundTex = new THREE.CanvasTexture(paintGround());
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 4;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(DISC_R, 96).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: groundTex }));
  world.add(disc);

  // outer ring of low-poly hills and far mountains
  const ring = new THREE.RingGeometry(DISC_R, 9000, 128, 16).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = ring.attributes.position, colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0x6eaa50), cB = new THREE.Color(0x3f8a45), cM = new THREE.Color(0x7c8fa6), cS = new THREE.Color(0xf4f8ff), tmp = new THREE.Color();
  const H = (x, z) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const hills = THREE.MathUtils.smoothstep(r, DISC_R, DISC_R + 900) * (50 + 70 * Math.sin(a * 7 + 1.3) * Math.sin(a * 3 - 0.4) + 40 * Math.sin(r * 0.004 + a * 5));
    const mts = THREE.MathUtils.smoothstep(r, 4200, 7000) * (380 + 420 * Math.abs(Math.sin(a * 6.5 + 0.7)) + 200 * Math.sin(a * 17));
    return Math.max(0, hills) + Math.max(0, mts);
  };
  for (let i = 0; i < pos.count; i++) pos.setY(i, H(pos.getX(i), pos.getZ(i)));
  for (let i = 0; i < pos.count; i += 3) { // flat colour per triangle
    let h = 0, r = 0;
    for (let k = 0; k < 3; k++) { h += pos.getY(i + k) / 3; r += Math.hypot(pos.getX(i + k), pos.getZ(i + k)) / 3; }
    if (h > 620) tmp.copy(cS);
    else if (r > 3800) tmp.copy(cB).lerp(cM, THREE.MathUtils.smoothstep(r, 3800, 6500));
    else tmp.copy(cA).lerp(cB, THREE.MathUtils.smoothstep(h, 20, 110) * 0.8 + (R() - 0.5) * 0.15);
    for (let k = 0; k < 3; k++) { colors[(i + k) * 3] = tmp.r; colors[(i + k) * 3 + 1] = tmp.g; colors[(i + k) * 3 + 2] = tmp.b; }
  }
  ring.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ring.computeVertexNormals();
  world.add(new THREE.Mesh(ring, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // detailed grass around the landing field, faded at the edge
  const grass = new THREE.CanvasTexture(grassTile());
  grass.colorSpace = THREE.SRGBColorSpace; grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(36, 36); grass.anisotropy = 4;
  const alpha = new THREE.CanvasTexture(radialAlpha());
  const near = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: grass, alphaMap: alpha, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  near.position.set(TARGET.x, 0.03, TARGET.z);
  near.renderOrder = 1;
  world.add(near);

  // the landing target
  const tt = new THREE.CanvasTexture(targetTexture()); tt.colorSpace = THREE.SRGBColorSpace; tt.anisotropy = 4;
  const target = new THREE.Mesh(new THREE.CircleGeometry(6, 48).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: tt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  target.position.set(TARGET.x, 0.06, TARGET.z);
  target.renderOrder = 2;
  world.add(target);

  // trees: forests + field edges + a ring around the meadow
  const { conifer, round } = treeGeos();
  const spots = [];
  for (const f of FORESTS) {
    const n = Math.round(f.r * (Math.hypot(f.x, f.z) < 450 ? 0.55 : 0.18));
    for (let i = 0; i < n; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * f.r * 0.92; spots.push([f.x + Math.cos(a) * d, f.z + Math.sin(a) * d]); }
  }
  for (let i = 0; i < 40; i++) { const a = R() * 6.283, d = 70 + R() * 50; spots.push([TARGET.x + Math.cos(a) * d, TARGET.z + Math.sin(a) * d]); }
  for (let i = 0; i < 50; i++) { spots.push([(R() - 0.5) * 900, (R() - 0.5) * 900]); }
  const okSpot = ([x, z]) => Math.hypot(x - TARGET.x, z - TARGET.z) > 55 && Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + 8 && Math.hypot(x - VILLAGE.x, z - VILLAGE.z) > 80;
  const good = spots.filter(okSpot);
  const dummy = new THREE.Object3D();
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const half = Math.ceil(good.length / 2);
  const trees = [new THREE.InstancedMesh(conifer, treeMat, half), new THREE.InstancedMesh(round, treeMat, good.length - half)];
  const tint = new THREE.Color();
  good.forEach((p, i) => {
    const im = i < half ? trees[0] : trees[1], k = i < half ? i : i - half;
    const s = 0.75 + R() * 0.8;
    dummy.position.set(p[0], 0, p[1]); dummy.rotation.set(0, R() * 6.283, 0); dummy.scale.set(s, s * (0.85 + R() * 0.4), s);
    dummy.updateMatrix(); im.setMatrixAt(k, dummy.matrix);
    tint.setHSL(0.27 + (R() - 0.5) * 0.08, 0.5 + R() * 0.3, 0.75 + R() * 0.3); im.setColorAt(k, tint);
  });
  for (const t of trees) { t.instanceMatrix.needsUpdate = true; if (t.instanceColor) t.instanceColor.needsUpdate = true; world.add(t); }

  // the village (+ a farm by the meadow)
  const houses = [];
  for (let i = 0; i < 34; i++) {
    const a = R() * 6.283, d = 10 + Math.sqrt(R()) * 60;
    houses.push({ x: VILLAGE.x + Math.cos(a) * d, z: VILLAGE.z + Math.sin(a) * d, rot: Math.round(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.3, s: 0.8 + R() * 0.5 });
  }
  houses.push({ x: TARGET.x + 34, z: TARGET.z + 30, rot: 0.5, s: 1.6, barn: true });
  houses.push({ x: TARGET.x + 48, z: TARGET.z + 14, rot: 0.5, s: 1.0 });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 4, 8).translate(0, 2, 0), new THREE.MeshLambertMaterial(), houses.length);
  const roofs = new THREE.InstancedMesh(prism(7, 3, 9).translate(0, 4, 0), new THREE.MeshLambertMaterial({ flatShading: true }), houses.length);
  const wallCols = [0xfff3dc, 0xffe7c2, 0xf6f0ff, 0xfde1d1], roofCols = [0xd9472f, 0xe2622d, 0xa8432d, 0x7b4fbf, 0xd04a3a];
  houses.forEach((h, i) => {
    dummy.position.set(h.x, 0, h.z); dummy.rotation.set(0, h.rot, 0); dummy.scale.setScalar(h.s); dummy.updateMatrix();
    walls.setMatrixAt(i, dummy.matrix); roofs.setMatrixAt(i, dummy.matrix);
    walls.setColorAt(i, new THREE.Color(h.barn ? 0xc8402e : wallCols[i % wallCols.length]));
    roofs.setColorAt(i, new THREE.Color(h.barn ? 0x6b3b2a : roofCols[Math.floor(R() * roofCols.length)]));
  });
  world.add(walls, roofs);

  // hay bales and a windsock by the target
  const hayGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 10).rotateZ(Math.PI / 2).translate(0, 0.75, 0);
  const hay = new THREE.InstancedMesh(hayGeo, new THREE.MeshLambertMaterial({ color: 0xe9c75e }), 6);
  for (let i = 0; i < 6; i++) {
    dummy.position.set(TARGET.x - 20 + (i % 3) * 2.2 + R(), 0, TARGET.z + 16 + Math.floor(i / 3) * 3); dummy.rotation.set(0, R(), 0); dummy.scale.setScalar(1); dummy.updateMatrix();
    hay.setMatrixAt(i, dummy.matrix);
  }
  world.add(hay);
  const sock = new THREE.Group();
  sock.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 6).translate(0, 3, 0), new THREE.MeshLambertMaterial({ color: 0xdddddd })));
  const sockCone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 2.2, 10, 4, true).rotateZ(Math.PI / 2).translate(1.1, 0, 0),
    new THREE.MeshLambertMaterial({ color: 0xff6a2a, side: THREE.DoubleSide }));
  sockCone.position.y = 5.7; sock.add(sockCone);
  sock.position.set(TARGET.x + 10, 0, TARGET.z + 7);
  world.add(sock);

  return { world, sockCone, target };
}

// ---------- clouds ----------
function cloudCanvas(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  const R = rng(seed);
  const puffs = [];
  for (let i = 0; i < 13; i++) {
    const x = 54 + R() * 148, y = 106 + (R() - 0.3) * 40 - Math.sin(((x - 54) / 148) * Math.PI) * 28;
    puffs.push([x, y, 22 + R() * 28]); // stays inside the canvas (no flat cut edges)
  }
  for (const [x, y, r] of puffs) {
    const grd = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.65, 'rgba(255,255,255,0.85)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // soft blue-grey shading underneath
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 60, 0, 170);
  sh.addColorStop(0, 'rgba(180,205,235,0)'); sh.addColorStop(1, 'rgba(150,180,220,0.55)');
  g.fillStyle = sh; g.fillRect(0, 0, 256, 192);
  return c;
}

export function makeClouds(scene, startAlt) {
  const texes = [11, 23, 37].map((s) => { const t = new THREE.CanvasTexture(cloudCanvas(s)); t.colorSpace = THREE.SRGBColorSpace; return t; });
  const R = rng(5);
  const list = [];
  const add = (x, y, z, size, base = 0.95, corridor = false) => {
    const m = new THREE.SpriteMaterial({ map: texes[Math.floor(R() * 3)], transparent: true, depthWrite: false, fog: true, opacity: base });
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z); s.scale.set(size, size * 0.75, 1);
    s.userData = { base, size, corridor };
    scene.add(s); list.push(s);
    return s;
  };
  // big clouds in the sky all around (seen at the start and from the parachute)
  for (let i = 0; i < 46; i++) {
    const a = R() * 6.283, d = 300 + R() * 2600;
    add(Math.cos(a) * d, 350 + R() * 900, Math.sin(a) * d - 200, 160 + R() * 320, 0.9);
  }
  // a few clouds around the jump spot (the sky behind Foxino on the start screen)
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.4, d = 90 + R() * 260;
    add(Math.cos(a) * d, startAlt + 15 + R() * 110, Math.sin(a) * d, 50 + R() * 70, 0.95);
  }
  // clouds that rush past the edges of the screen while falling (moved below again once passed)
  const passing = [];
  for (let i = 0; i < 12; i++) { const s = add(0, -9999, 0, 30, 0.9); s.userData.passing = true; s.visible = false; passing.push(s); }
  // a pool of clouds we fall straight through between questions
  const pool = [];
  for (let i = 0; i < 9; i++) { const s = add(0, -9999, 0, 18, 0.95, true); s.visible = false; pool.push(s); }
  return {
    list, pool, passing,
    // keep the passing clouds around the faller; only above the low-cloud ceiling
    updatePassing(x, y, z, active) {
      for (const s of passing) {
        const u = s.userData;
        if (!active || y < 300) { if (s.position.y > y + 20 || !active) s.visible = false; continue; }
        if (!s.visible || s.position.y > y + 25) {
          const a = Math.random() * 6.283, d = 24 + Math.random() * 40;
          const size = 26 + Math.random() * 34;
          s.position.set(x + Math.cos(a) * d, y - 60 - Math.random() * 120, z + Math.sin(a) * d);
          s.scale.set(size, size * 0.75, 1); u.size = size; u.far = 85;
          s.visible = true;
        }
      }
    },
  };
}

// ---------- birds ----------
export function makeBirds(scene) {
  const birds = [];
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.22, 0.95, 0.05, 0.05], 3));
  wingGeo.computeVertexNormals();
  const wingMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const tipMat = new THREE.MeshLambertMaterial({ color: 0x444a55, side: THREE.DoubleSide });
  const bodyGeo = new THREE.OctahedronGeometry(0.2, 0).scale(0.8, 0.8, 2.4);
  const R = rng(77);
  const spec = [
    [230, 40], [236, 46], [226, 52], [140, 34], [146, 30], [60, 70], [26, 40], [30, 48], [22, 55],
  ];
  for (const [alt, rad] of spec) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, wingMat);
    const L = new THREE.Mesh(wingGeo, R() < 0.5 ? wingMat : tipMat), Rw = new THREE.Mesh(wingGeo, wingMat);
    Rw.scale.x = -1;
    g.add(body, L, Rw);
    g.scale.setScalar(2.2);
    g.userData = { alt, rad, ang: R() * 6.283, speed: (0.12 + R() * 0.1) * (R() < 0.5 ? 1 : -1), L, R: Rw, ph: R() * 6, cx: (alt < 80 ? TARGET.x : 0) + (R() - 0.5) * 30, cz: (alt < 80 ? TARGET.z : 0) + (R() - 0.5) * 30 };
    scene.add(g); birds.push(g);
  }
  return birds;
}
export function updateBirds(birds, t, dt) {
  for (const b of birds) {
    const u = b.userData;
    u.ang += u.speed * dt;
    const x = u.cx + Math.cos(u.ang) * u.rad, z = u.cz + Math.sin(u.ang) * u.rad;
    b.position.set(x, u.alt + Math.sin(t * 0.7 + u.ph) * 2, z);
    // face along the circle
    const dir = u.speed > 0 ? 1 : -1;
    b.rotation.set(0, -u.ang - (dir > 0 ? 0 : Math.PI), 0);
    const f = Math.sin(t * 9 + u.ph) * 0.65;
    u.L.rotation.z = f; u.R.rotation.z = -f;
  }
}

// ---------- the plane Foxino jumps from ----------
export function makePlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xfafafa, flatShading: true });
  const orange = new THREE.MeshLambertMaterial({ color: 0xff7a1a, flatShading: true });
  const purple = new THREE.MeshLambertMaterial({ color: 0x7b3fc4, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.5, 9, 10).rotateZ(Math.PI / 2), white); g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, 10).rotateZ(Math.PI / 2).translate(-5.2, 0, 0), orange); g.add(nose);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.75, 2.2, 10).rotateZ(Math.PI / 2).translate(1.2, 0, 0), purple); g.add(stripe);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6).scale(1.6, 0.8, 1).translate(-3, 0.6, 0), glass); g.add(cockpit);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 12).translate(-1.2, 0.55, 0), orange); g.add(wing);
  const tailW = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 4).translate(4.2, 0.3, 0), orange); g.add(tailW);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.8, 0.12).translate(4.2, 1.1, 0), purple); g.add(fin);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.22), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  prop.position.x = -5.95; g.add(prop);
  g.userData.prop = prop;
  return g;
}
