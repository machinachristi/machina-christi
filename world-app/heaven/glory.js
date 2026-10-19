// The glory, and the multitude before it (AB#106).
//
// "The glory of God did lighten it, and the Lamb is the light thereof"
// (Revelation 21:23): God is shown here only as light — a great soft light far
// in the north, past where the walk can reach, with "a rainbow round about
// the throne, in sight like unto an emerald" (4:3). There is no throne and no
// figure; those are not for this foundation to draw.
//
// "A great multitude, which no man could number, of all nations, and kindreds,
// and people, and tongues, stood before the throne" (7:9): thousands of soft
// lights in tiers round the glory, opening toward the south where the walker
// comes, each breathing in its own time. One draw for the glory (a single
// quad turned always to the eye, its light and bow drawn in the shader) and
// one for the multitude (a cloud of points), whatever their number.

import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { GLORY } from './layout.js';

const TIERS = 13;
const FIRST_R = 17;        // the nearest tier, from the glory
const TIER_GAP = 2.4;
const ARC = Math.PI * 0.66; // each tier reaches this far round from due north, either way

export function createGlory(scene) {
  const rng = mulberry32(20260855);

  // ── The glory: core, glow, halo and the emerald bow, on one quad.
  const gu = {
    uCenter: { value: new THREE.Vector3(GLORY.x, GLORY.y, GLORY.z) },
    uSize: { value: 130 },
    uTime: { value: 0 },
    uCore: { value: new THREE.Color(0xFFFFFF) },
    uHalo: { value: new THREE.Color(0xFFF0C8) },
    uBow: { value: new THREE.Color(0x43C08A) },
  };
  const glory = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: gu,
    vertexShader: /* glsl */ `
      uniform vec3 uCenter;
      uniform float uSize;
      varying vec2 vUv;
      void main() {
        vUv = uv - 0.5;
        vec4 mv = viewMatrix * vec4(uCenter, 1.0);
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uHalo;
      uniform vec3 uBow;
      varying vec2 vUv;
      void main() {
        float r = length(vUv) * 2.0;
        float breath = 1.0 + 0.04 * sin(uTime * 0.5);
        float core = exp(-r * r * 90.0 / breath);
        float glow = exp(-r * 9.0 / breath);
        float halo = exp(-r * 3.2) * 0.55;
        float light = clamp(core + glow + halo, 0.0, 1.0);
        vec3 col = mix(uHalo, uCore, clamp(core * 2.0 + glow, 0.0, 1.0));
        // The bow round about it, emerald, with the faintest play of colour
        // at its edges.
        float d = (r - 0.36) / 0.03;
        float bow = exp(-d * d);
        vec3 bowCol = uBow + vec3(0.18, -0.05, 0.12) * clamp(d * 0.6, -1.0, 1.0);
        col = mix(col, bowCol, bow * 0.8);
        float a = max(light, bow * 0.6) * (1.0 - smoothstep(0.85, 1.0, r));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  }));
  glory.frustumCulled = false;   // placed in the shader, not where its geometry says
  glory.renderOrder = 1;
  scene.add(glory);

  // ── The multitude: tiers rising round the glory like a great amphitheatre,
  // open toward the south.
  const positions = [];
  const seeds = [];
  const sizes = [];
  const colors = [];
  const c = new THREE.Color();
  const WARM = new THREE.Color(0xFFEFC8);
  const GOLD = new THREE.Color(0xFFCF6E);
  const PALE = new THREE.Color(0xF4F7FF);
  for (let t = 0; t < TIERS; t++) {
    const r = FIRST_R + t * TIER_GAP;
    const y = 1.2 + t * 2.1;
    const count = Math.round(ARC * 2 * r / 0.5);
    for (let i = 0; i < count; i++) {
      const a = -ARC + (i + rng() * 0.8) * (ARC * 2 / count);
      const rr = r + (rng() - 0.5) * 0.9;
      positions.push(GLORY.x + Math.sin(a) * rr, y + (rng() - 0.5) * 0.7, GLORY.z + Math.cos(a) * rr);
      seeds.push(rng());
      sizes.push(0.8 + rng() * 0.5);
      const k = rng();
      c.copy(WARM).lerp(k < 0.5 ? GOLD : PALE, rng() * 0.6);
      colors.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  const mu = {
    uTime: { value: 0 },
    uHalfH: { value: 400 },
  };
  const multitude = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: mu,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uHalfH;
      varying vec3 vColor;
      varying float vBreath;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vBreath = 0.72 + 0.28 * sin(uTime * (0.5 + aSeed * 0.9) + aSeed * 40.0);
        vColor = aColor;
        gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uHalfH / -mv.z, 1.5, 28.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vBreath;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d) * 4.0;
        if (r2 > 1.0) discard;
        float a = (exp(-r2 * 4.0) * 0.85 + 0.15 * (1.0 - r2)) * vBreath;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  }));
  multitude.frustumCulled = false;
  multitude.renderOrder = 2;
  const _buf = new THREE.Vector2();
  multitude.onBeforeRender = renderer => { mu.uHalfH.value = renderer.getDrawingBufferSize(_buf).y / 2; };
  scene.add(multitude);

  return {
    count: seeds.length,
    update(time) {
      gu.uTime.value = time;
      mu.uTime.value = time;
    },
  };
}
