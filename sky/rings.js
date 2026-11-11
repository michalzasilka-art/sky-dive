// Holographic answer rings: a glowing torus core + a shader disc (halo, faint membrane, scanlines) + orbiting sparks.
import * as THREE from './lib/three.module.min.js';

export const RING_R = 1.5;

const COLORS = {
  idle: [new THREE.Color(0x35f2ff), new THREE.Color(0xff4fe0)],
  right: [new THREE.Color(0xffd23a), new THREE.Color(0xff8a1a)],
  wrong: [new THREE.Color(0xff2a3a), new THREE.Color(0xff8a3a)],
  reveal: [new THREE.Color(0x5bff8a), new THREE.Color(0xfff35a)],
};

const torusVS = `
  uniform float uTime, uGlitch;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 p = position;
    float band = floor((p.y + 2.0) * 6.0 + uTime * 40.0);
    p.x += uGlitch * 0.35 * sin(band * 12.9898) * step(0.4, fract(sin(band * 78.233) * 43758.5));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal); vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const torusFS = `
  uniform float uTime, uAlpha, uFlash; uniform vec3 uA, uB;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv;
  void main(){
    float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    vec3 c = mix(uA, uB, 0.5 + 0.5 * sin(vUv.x * 12.566 + uTime * 1.6));
    float scan = 0.78 + 0.22 * sin(gl_FragCoord.y * 1.1 - uTime * 14.0);
    vec3 col = mix(c * 1.25, vec3(1.0), (1.0 - fres) * 0.4 + uFlash * 0.35) * scan;
    gl_FragColor = vec4(col, uAlpha * (0.8 + 0.2 * fres));
  }`;

const discVS = `
  varying vec2 vP;
  void main(){ vP = position.xy / ${RING_R.toFixed(2)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const discFS = `
  uniform float uTime, uAlpha, uGlitch, uFlash; uniform vec3 uA, uB;
  varying vec2 vP;
  void main(){
    vec2 p = vP;
    float band = floor(p.y * 9.0 + uTime * 30.0);
    p.x += uGlitch * 0.25 * sin(band * 12.9898);
    float r = length(p);
    float ang = atan(p.y, p.x);
    vec3 c = mix(uA, uB, 0.5 + 0.5 * sin(ang * 2.0 + uTime * 1.6));
    float glow = exp(-pow((r - 1.0) / 0.07, 2.0)) * 0.7 + exp(-pow((r - 1.0) / 0.26, 2.0)) * 0.35;
    float inside = 1.0 - smoothstep(0.96, 1.0, r);
    float ripple = smoothstep(0.92, 1.0, fract(r * 5.0 - uTime * 0.9));
    float scan = 0.55 + 0.45 * sin(gl_FragCoord.y * 1.1 - uTime * 14.0);
    float memb = inside * (0.05 + 0.16 * smoothstep(0.45, 1.0, r) + 0.08 * ripple) * scan;
    float a = (glow + memb) * uAlpha * (0.9 + 0.1 * sin(uTime * 31.0 + ang * 3.0));
    a += uFlash * inside * (0.1 + 0.12 * ripple) * uAlpha;
    gl_FragColor = vec4(c * a, a);
  }`;

const sparkVS = `
  uniform float uTime, uSize; attribute float aSeed; varying float vTw;
  void main(){
    float a = aSeed * 6.2832 + uTime * (0.6 + fract(aSeed * 7.0) * 0.8);
    float rr = ${RING_R.toFixed(2)} * (1.0 + 0.12 * sin(aSeed * 40.0 + uTime * 2.0));
    vec3 p = vec3(cos(a) * rr, sin(a) * rr, 0.08 * sin(aSeed * 17.0 + uTime * 3.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vTw = 0.5 + 0.5 * sin(uTime * 9.0 + aSeed * 50.0);
    gl_PointSize = uSize * (0.6 + 0.6 * vTw) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const sparkFS = `
  uniform vec3 uA; uniform float uAlpha; varying float vTw;
  void main(){
    vec2 d = gl_PointCoord - 0.5; float r = length(d);
    float s = max(0.0, 1.0 - r * 2.0); s = s * s;
    float star = max(0.0, 1.0 - abs(d.x) * 14.0) * max(0.0, 1.0 - abs(d.y) * 2.2) + max(0.0, 1.0 - abs(d.y) * 14.0) * max(0.0, 1.0 - abs(d.x) * 2.2);
    float a = (s + star * 0.6) * uAlpha * (0.5 + 0.5 * vTw);
    gl_FragColor = vec4(mix(uA, vec3(1.0), 0.6) * a, a);
  }`;

const torusGeo = new THREE.TorusGeometry(RING_R, 0.085, 10, 80);
const discGeo = new THREE.PlaneGeometry(RING_R * 2.9, RING_R * 2.9);
const sparkGeo = (() => {
  const g = new THREE.BufferGeometry();
  const n = 22, seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) seeds[i] = i / n + Math.random() * 0.03;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return g;
})();

export function makeRing() {
  const u = {
    uTime: { value: 0 }, uAlpha: { value: 0 }, uGlitch: { value: 0 }, uFlash: { value: 0 },
    uA: { value: COLORS.idle[0].clone() }, uB: { value: COLORS.idle[1].clone() }, uSize: { value: 260 },
  };
  const group = new THREE.Group();
  const torus = new THREE.Mesh(torusGeo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: torusVS, fragmentShader: torusFS, transparent: true, depthWrite: false, fog: false }));
  const disc = new THREE.Mesh(discGeo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: discVS, fragmentShader: discFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  const sparks = new THREE.Points(sparkGeo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: sparkVS, fragmentShader: sparkFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  disc.renderOrder = 5; torus.renderOrder = 6; sparks.renderOrder = 7;
  sparks.frustumCulled = false;
  group.add(disc, torus, sparks);
  group.userData = { u, state: 'idle', mix: 0 };
  return group;
}

// smoothly move the ring's colours toward a state
export function setRingState(ring, state) { ring.userData.state = state; }

export function updateRing(ring, t, dt) {
  const { u, state } = ring.userData;
  u.uTime.value = t;
  const [a, b] = COLORS[state] || COLORS.idle;
  const k = 1 - Math.exp(-dt * 10);
  u.uA.value.lerp(a, k); u.uB.value.lerp(b, k);
}
