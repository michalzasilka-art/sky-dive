// Effects: wind streaks rushing past, and sparkle bursts that travel with Foxino.
import * as THREE from './lib/three.module.min.js';

// ---------- wind streaks (instanced quads, billboarded around the fall axis) ----------
export function makeStreaks(count = 56) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0.5 }, uWidth: { value: 0.035 } },
    vertexShader: `
      uniform float uWidth; varying float vAlong;
      void main(){
        vec4 c4 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 center = c4.xyz;
        float len = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
        vec3 toCam = normalize(cameraPosition - center);
        vec3 side = cross(vec3(0.0, 1.0, 0.0), toCam);
        side = length(side) < 1e-3 ? vec3(1.0, 0.0, 0.0) : normalize(side);
        vec3 wp = center + side * position.x * uWidth + vec3(0.0, 1.0, 0.0) * position.y * len;
        vAlong = position.y + 0.5;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `
      uniform float uAlpha; varying float vAlong;
      void main(){ float a = uAlpha * smoothstep(0.0, 0.45, vAlong) * smoothstep(1.0, 0.75, vAlong); gl_FragColor = vec4(vec3(1.0) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const items = [];
  for (let i = 0; i < count; i++) items.push({ x: 0, y: -999, z: 0, len: 1, speed: 1 });
  const dummy = new THREE.Object3D();
  const respawn = (s, cx, cy, cz, spread) => {
    const a = Math.random() * Math.PI * 2, d = 1.6 + Math.random() * spread;
    s.x = cx + Math.cos(a) * d; s.z = cz + Math.sin(a) * d * 0.8;
    s.y = cy - 6 - Math.random() * 26;
    s.len = 0.7 + Math.random() * 1.6; s.speed = 0.7 + Math.random() * 0.8;
  };
  return {
    mesh,
    // cx,cy,cz: Foxino; rel: how fast the air rushes up (m/s)
    update(dt, cx, cy, cz, rel, alpha) {
      mat.uniforms.uAlpha.value = alpha;
      mesh.visible = alpha > 0.01;
      for (let i = 0; i < count; i++) {
        const s = items[i];
        s.y += rel * s.speed * dt;
        if (s.y > cy + 10 || s.y < cy - 40 || Math.abs(s.x - cx) > 14) respawn(s, cx, cy, cz, 7);
        dummy.position.set(s.x, s.y, s.z); dummy.scale.set(1, s.len * (0.5 + rel * 0.035), 1); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- sparkle / confetti bursts ----------
export function makeBursts(max = 260) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), life = new Float32Array(max), size = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 300 } },
    vertexShader: `
      attribute float aLife; attribute float aSize; attribute vec3 color; uniform float uScale; varying vec3 vC; varying float vL;
      void main(){ vC = color; vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aLife > 0.0 ? uScale * aSize * (0.4 + 0.6 * aLife) / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying vec3 vC; varying float vL;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
        float core = max(0.0, 1.0 - r * 2.0); core *= core;
        float star = max(0.0, 1.0 - abs(d.x) * 10.0) * max(0.0, 1.0 - abs(d.y) * 2.0) + max(0.0, 1.0 - abs(d.y) * 10.0) * max(0.0, 1.0 - abs(d.x) * 2.0);
        float a = clamp(core + star * 0.7, 0.0, 1.0) * smoothstep(0.0, 0.25, vL);
        gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.5) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 9;
  const vel = new Float32Array(max * 3), decay = new Float32Array(max);
  let next = 0;
  const c = new THREE.Color();
  return {
    points,
    // centre (local to the points' parent), colours, count, speed, plane: 'xz' spreads mostly sideways
    emit(cx, cy, cz, colors, n, speed = 6, up = 0) {
      for (let k = 0; k < n; k++) {
        const i = next; next = (next + 1) % max;
        const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.75);
        const e = (Math.random() - 0.5) * 0.9;
        vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = e * s + up; vel[i * 3 + 2] = Math.sin(a) * s;
        pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz;
        c.set(colors[Math.floor(Math.random() * colors.length)]);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        life[i] = 1; decay[i] = 0.7 + Math.random() * 0.7; size[i] = 0.12 + Math.random() * 0.22;
      }
    },
    update(dt, gravity = 0) {
      const drag = Math.exp(-dt * 2.2);
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt * decay[i];
        vel[i * 3] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag - gravity * dt; vel[i * 3 + 2] *= drag;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
    },
    clear() { life.fill(0); geo.attributes.aLife.needsUpdate = true; },
  };
}
