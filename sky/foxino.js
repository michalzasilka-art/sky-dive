// Foxino: loads the rigged F1-helmet model and poses him in code (aim-the-bone poses + blending),
// plus the parachute (ram-air canopy, lines and risers) built from code geometry.
import * as THREE from './lib/three.module.min.js';
import { GLTFLoader } from './lib/GLTFLoader.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const CHILD = {
  Spine02: 'Spine01', Spine01: 'Spine', Spine: 'neck', neck: 'Head', Head: 'head_end',
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};
const ORDER = ['Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const ALL = ['Hips', ...ORDER];
const GROUP = { // which flutter channel each bone listens to
  Hips: 'body',
  Spine02: 'body', Spine01: 'body', Spine: 'body', neck: 'head', Head: 'head',
  LeftArm: 'armL', LeftForeArm: 'armL', RightArm: 'armR', RightForeArm: 'armR',
  LeftUpLeg: 'legL', LeftLeg: 'legL', LeftFoot: 'legL', RightUpLeg: 'legR', RightLeg: 'legR', RightFoot: 'legR',
};

// directions are in Foxino's own standing frame: +Y up (head), +Z his front, +X his left hand side
function sym(spec) { // fill in the right side by mirroring the left
  const out = { ...spec };
  for (const k of Object.keys(spec)) if (k.startsWith('Left')) { const v = spec[k]; out['Right' + k.slice(4)] = V(-v.x, v.y, v.z); }
  return out;
}
const POSES = {
  // free-fall "box": belly to the earth, back arched, arms out and bent up, knees bent with shins to the sky
  box: sym({
    hips: -0.75,
    Spine02: V(0, 1, -0.12), Spine01: V(0, 1, -0.18), Spine: V(0, 1, -0.22), neck: V(0, 1, -0.35), Head: V(0, 1, -0.5),
    LeftArm: V(1, 0.42, -0.28), LeftForeArm: V(0.3, 1, -0.2),
    LeftUpLeg: V(0.42, -1, -0.2), LeftLeg: V(0.2, -0.5, -1), LeftFoot: V(0.08, -0.85, -0.55),
  }),
  boxF: sym({
    hips: -0.7,
    Spine02: V(0, 1, -0.1), Spine01: V(0, 1, -0.16), Spine: V(0, 1, -0.2), neck: V(0, 1, -0.3), Head: V(0.06, 1, -0.45),
    LeftArm: V(1, 0.3, -0.12), LeftForeArm: V(0.42, 1, -0.05),
    LeftUpLeg: V(0.5, -1, -0.32), LeftLeg: V(0.24, -0.7, -1), LeftFoot: V(0.1, -0.9, -0.45),
  }),
  // the dive into a ring: arms swept back, legs together
  dive: sym({
    hips: -0.6,
    Spine02: V(0, 1, -0.05), Spine01: V(0, 1, -0.05), Spine: V(0, 1, -0.08), neck: V(0, 1, -0.2), Head: V(0, 1, -0.25),
    LeftArm: V(0.45, -0.75, -0.3), LeftForeArm: V(0.15, -1, -0.15),
    LeftUpLeg: V(0.1, -1, -0.05), LeftLeg: V(0.04, -1, -0.15), LeftFoot: V(0.02, -1, -0.2),
  }),
  // hanging under the canopy, holding the risers
  canopy: sym({
    hips: -0.3,
    Spine02: V(0, 1, 0.04), Spine01: V(0, 1, 0.04), Spine: V(0, 1, 0.02), neck: V(0, 1, 0.08), Head: V(0, 1, 0.12),
    LeftArm: V(0.5, 1, 0.06), LeftForeArm: V(0.05, 1, 0.12),
    LeftUpLeg: V(0.12, -1, 0.18), LeftLeg: V(0.04, -1, -0.04),
  }),
  canopyF: sym({
    hips: -0.3,
    Spine02: V(0, 1, 0.04), Spine01: V(0, 1, 0.04), Spine: V(0, 1, 0.02), neck: V(0.05, 1, 0.1), Head: V(0.08, 1, 0.14),
    LeftArm: V(0.55, 1, 0.1), LeftForeArm: V(0.1, 1, 0.16),
    LeftUpLeg: V(0.16, -1, 0.42), LeftLeg: V(0.06, -1, 0.12),
  }),
  // touchdown squat
  squat: sym({
    Spine02: V(0, 1, 0.25), Spine01: V(0, 1, 0.2), Spine: V(0, 1, 0.1), neck: V(0, 1, 0.05), Head: V(0, 1, 0.0),
    LeftArm: V(1, 0.1, 0.35), LeftForeArm: V(0.6, 0.3, 0.8),
    LeftUpLeg: V(0.22, -0.6, 0.85), LeftLeg: V(0.08, -1, -0.45),
  }),
  // ta-da!
  land: sym({
    Spine02: V(0, 1, -0.03), Spine01: V(0, 1, -0.05), Spine: V(0, 1, -0.05), neck: V(0, 1, -0.08), Head: V(0, 1, -0.12),
    LeftArm: V(0.85, 0.85, 0.12), LeftForeArm: V(0.5, 1, 0.08),
    LeftUpLeg: V(0.14, -1, 0.02), LeftLeg: V(0.06, -1, -0.02),
  }),
  landF: sym({
    Spine02: V(0, 1, -0.03), Spine01: V(0, 1, -0.05), Spine: V(0.03, 1, -0.05), neck: V(0.05, 1, -0.08), Head: V(0.12, 1, -0.1),
    LeftArm: V(0.75, 1, 0.1), LeftForeArm: V(0.35, 1, 0.05),
    LeftUpLeg: V(0.14, -1, 0.02), LeftLeg: V(0.06, -1, -0.02),
  }),
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

function computePose(root, bones, rest, spec) {
  for (const n of Object.keys(bones)) bones[n].quaternion.copy(rest[n]);
  // tip the pelvis so the big tail lies back instead of sticking up (spine and legs are re-aimed after)
  if (spec.hips && bones.Hips) bones.Hips.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spec.hips));
  root.updateMatrixWorld(true);
  for (const name of ORDER) {
    const dir = spec[name];
    const bone = bones[name], child = bones[CHILD[name]];
    if (!dir || !bone || !child) continue;
    bone.updateWorldMatrix(true, true);
    bone.getWorldPosition(_a); child.getWorldPosition(_b);
    const cur = _b.sub(_a).normalize();
    _q.setFromUnitVectors(cur, dir);
    bone.getWorldQuaternion(_q2);
    _q2.premultiply(_q);
    bone.parent.getWorldQuaternion(_q3).invert();
    bone.quaternion.copy(_q3.multiply(_q2));
    bone.updateWorldMatrix(false, true);
  }
  const out = {};
  for (const n of ALL) if (bones[n]) out[n] = bones[n].quaternion.clone();
  for (const n of Object.keys(bones)) bones[n].quaternion.copy(rest[n]);
  return out;
}

export async function loadFoxino(url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, onProgress);
  const model = gltf.scene;
  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.frustumCulled = false; // skinned bounds don't follow the pose
      const m = o.material;
      if (m) { m.side = THREE.FrontSide; m.envMapIntensity = 0.7; }
    }
  });
  const rest = {};
  for (const n of Object.keys(bones)) rest[n] = bones[n].quaternion.clone();
  const poses = {};
  for (const k of Object.keys(POSES)) poses[k] = computePose(model, bones, rest, POSES[k]);

  // pivot around the middle of the body (between hips and chest)
  model.updateMatrixWorld(true);
  const hips = bones.Hips.getWorldPosition(new THREE.Vector3());
  const chest = bones.Spine.getWorldPosition(new THREE.Vector3());
  const pivot = hips.clone().lerp(chest, 0.35);
  model.position.copy(pivot).negate();

  const body = new THREE.Group(); body.add(model); // rotates (belly down / upright, banking)
  const root = new THREE.Group(); root.add(body);   // moves through the world; parachute hangs from it

  const w = { box: 1, dive: 0, canopy: 0, squat: 0, land: 0 };
  const flutter = { body: 0, head: 0, armL: 0, armR: 0, legL: 0, legR: 0 };
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  let t = 0;

  function applyPose(dt, intensity = 1) {
    t += dt;
    flutter.body = 0.5 + 0.5 * Math.sin(t * 5.1);
    flutter.head = 0.5 + 0.5 * Math.sin(t * 2.3 + 1);
    flutter.armL = 0.5 + 0.5 * Math.sin(t * 13.0) * intensity;
    flutter.armR = 0.5 + 0.5 * Math.sin(t * 12.2 + 1.7) * intensity;
    flutter.legL = 0.5 + 0.5 * Math.sin(t * 10.5 + 0.6) * intensity;
    flutter.legR = 0.5 + 0.5 * Math.sin(t * 11.3 + 2.4) * intensity;
    const sw = 0.5 + 0.5 * Math.sin(t * 2.2); // slow leg swing under the canopy
    for (const n of ALL) {
      const b = bones[n]; if (!b) continue;
      const f = flutter[GROUP[n]];
      q.copy(poses.box[n]).slerp(poses.boxF[n], f);
      if (w.dive > 0) q.slerp(poses.dive[n], w.dive);
      if (w.canopy > 0) { qa.copy(poses.canopy[n]).slerp(poses.canopyF[n], n.includes('Leg') ? sw : f * 0.5); q.slerp(qa, w.canopy); }
      if (w.squat > 0) q.slerp(poses.squat[n], w.squat);
      if (w.land > 0) { qb.copy(poses.land[n]).slerp(poses.landF[n], 0.5 + 0.5 * Math.sin(t * 7)); q.slerp(qb, w.land); }
      b.quaternion.copy(q);
    }
  }

  const hand = (side, out) => bones[side + 'Hand'].getWorldPosition(out);
  return { root, body, model, bones, w, applyPose, hand, pivotHeight: pivot.y };
}

// ---------- the parachute ----------
const CANOPY_COLS = [0xff7a1a, 0xffc531, 0x8a4fe0, 0x35d6ff, 0xff4f9a, 0x8a4fe0, 0xffc531, 0xff7a1a, 0x35d6ff];

export function makeParachute() {
  const group = new THREE.Group();
  const cells = CANOPY_COLS.length;
  const SPAN = 4.4, CHORD = 1.7, THICK = 0.34, ARC = 0.95;
  const Rarc = (SPAN / 2) / Math.sin(ARC);
  const sub = 4, NC = 10;
  const pos = [], col = [], idx = [];
  const prof = (c) => THICK * 4 * c * (1 - c) * (1 - 0.35 * c) + 0.0001;
  const P = (s, c, side) => { // s in [-1,1] across the span, c in [0,1] front->back, side +1 top / -1 bottom
    const a = s * ARC;
    const nx = Math.sin(a), ny = Math.cos(a);
    const cellPos = ((s + 1) / 2) * cells;
    const pillow = side > 0 ? 0.05 * Math.sin(Math.PI * (cellPos % 1)) * Math.sin(Math.PI * c) : 0;
    const off = side > 0 ? prof(c) * 0.68 + pillow : -prof(c) * 0.32;
    const r = Rarc + off;
    return [nx * r, ny * r - Rarc, (c - 0.5) * CHORD];
  };
  const color = new THREE.Color();
  for (let ci = 0; ci < cells; ci++) {
    color.set(CANOPY_COLS[ci]);
    for (const side of [1, -1]) {
      const shade = side > 0 ? 1 : 0.72;
      const base = pos.length / 3;
      for (let i = 0; i <= sub; i++) {
        const s = -1 + 2 * (ci + i / sub) / cells;
        for (let j = 0; j <= NC; j++) {
          const c = j / NC;
          pos.push(...P(s, c, side));
          const edge = (i === 0 || i === sub) ? 0.85 : 1;
          col.push(color.r * shade * edge, color.g * shade * edge, color.b * shade * edge);
        }
      }
      for (let i = 0; i < sub; i++) for (let j = 0; j < NC; j++) {
        const a = base + i * (NC + 1) + j, b = a + NC + 1;
        if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  // tip caps
  for (const s of [-1, 1]) {
    const base = pos.length / 3;
    color.set(CANOPY_COLS[s < 0 ? 0 : cells - 1]);
    for (let j = 0; j <= NC; j++) { pos.push(...P(s, j / NC, 1)); col.push(color.r * 0.8, color.g * 0.8, color.b * 0.8); }
    for (let j = 0; j <= NC; j++) { pos.push(...P(s, j / NC, -1)); col.push(color.r * 0.8, color.g * 0.8, color.b * 0.8); }
    for (let j = 0; j < NC; j++) { const a = base + j, b = base + NC + 1 + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const canopy = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const holder = new THREE.Group(); holder.add(canopy);
  group.add(holder);

  // attachment points under the canopy (canopy-local)
  const attach = [];
  for (let r = 0; r <= 6; r++) {
    const s = -0.92 + (1.84 * r) / 6;
    for (const c of [0.12, 0.5, 0.85]) attach.push({ p: new THREE.Vector3(...P(s, c, -1)), left: s > 0 });
  }
  // lines: attachment -> confluence above each hand, then a riser down to the hand
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array((attach.length + 2) * 2 * 3);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x3a3550, transparent: true, opacity: 0.75 }));
  lines.frustumCulled = false;
  group.add(lines);

  const _w = new THREE.Vector3(), _hl = new THREE.Vector3(), _hr = new THREE.Vector3(), _cl = new THREE.Vector3(), _cr = new THREE.Vector3();
  return {
    group, holder, canopy, lines,
    // handL/handR in world space; keeps lines in group-local space
    updateLines(handL, handR) {
      group.updateMatrixWorld(true);
      const inv = group.matrixWorld.clone().invert();
      _hl.copy(handL).applyMatrix4(inv); _hr.copy(handR).applyMatrix4(inv);
      _cl.copy(_hl).add(new THREE.Vector3(0.18, 0.75, 0)); _cr.copy(_hr).add(new THREE.Vector3(-0.18, 0.75, 0));
      holder.updateMatrix();
      let k = 0;
      for (const a of attach) {
        _w.copy(a.p).applyMatrix4(holder.matrix);
        const c = a.left ? _cl : _cr;
        linePos[k++] = _w.x; linePos[k++] = _w.y; linePos[k++] = _w.z;
        linePos[k++] = c.x; linePos[k++] = c.y; linePos[k++] = c.z;
      }
      for (const [c, h] of [[_cl, _hl], [_cr, _hr]]) {
        linePos[k++] = c.x; linePos[k++] = c.y; linePos[k++] = c.z;
        linePos[k++] = h.x; linePos[k++] = h.y; linePos[k++] = h.z;
      }
      lineGeo.attributes.position.needsUpdate = true;
    },
  };
}
