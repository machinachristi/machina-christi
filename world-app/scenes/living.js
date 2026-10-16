// "And he shewed me a pure river of water of life, clear as crystal"
// (Revelation 22:1) — "a fountain of gardens, a well of living waters"
// (Song of Solomon 4:15).
//
// The river comes alive with light. By day the sun strikes a glittering path
// across it: thousands of tiny glints, each one a ripple catching the light
// for an instant, so the water flashes and dances wherever the sun would
// mirror in it, and shifts as the watcher moves. Under the moon the same path
// shines silver. And at night the water itself carries a soft light of its
// own, pale pulses drifting downstream; wade in, and it brightens round his
// legs and lies glowing behind him where he has walked, fading slowly, so he
// can turn and see his way through the water written in light.
//
// One draw call. Every glint is an instance of one small square, and whether
// it flashes is worked out on the graphics chip: each glint's ripple tilts a
// little this way and that, and only when that ripple would throw the sun
// (or the moon) straight into the watcher's eye does it shine. The frame loop
// hands over only where the lights are, where he is, and the short trail of
// places he has waded; it never touches a single glint.
//
// Its own seeded stream, drawn only at build time; nothing planted shifts.

import * as THREE from 'three';
import { heightAt, riverCourse, riverEdgeDist } from './terrain.js';
import { clamp, damp, mulberry32, smoothstep } from '../util.js';

const GLINTS = 2600;
const X_SPAN = [-58, 58];      // the reach of river inside the garden's sight
const TRAIL = 14;              // places he has waded, remembered at once
const TRAIL_EVERY = 0.3;       // seconds between them while he wades
const TRAIL_LIFE = 4.5;        // seconds a waded place keeps its light
const CAPTION_AFTER = 1.5;     // seconds wading at night before the name is given
const CAPTION_FOR = 5;

const CAPTION = { name: 'Mayim chayyim', label: 'living water' };

// The glints ride the same flowing surface water.js draws (its surfaceY),
// lifted a little so the faceted water never hides them.
const VERTEX = /* glsl */`
  #define TRAIL ${TRAIL}
  attribute vec2 aCorner;
  attribute vec4 aGlint;          // x, z, phase, size
  uniform float uTime;
  uniform vec3 uSun;
  uniform float uSunK;
  uniform vec3 uMoon;
  uniform float uMoonK;
  uniform float uGlow;
  uniform vec3 uWalker;           // x, z, how much he stirs the water
  uniform vec3 uTrail[TRAIL];     // x, z, how much light is left there
  uniform vec3 uSunCol;
  uniform vec3 uMoonCol;
  uniform vec3 uGlowCol;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vStar;

  float surf(vec2 p, float t) {
    return -0.5
      + 0.050 * sin(p.x * 0.55 - t * 2.2 + p.y * 0.30)
      + 0.030 * sin(p.x * 1.40 - t * 3.5 + p.y * 0.80)
      + 0.020 * sin(p.y * 1.20 + t * 0.90);
  }

  void main() {
    float T = uTime;
    vec2 xz = aGlint.xy;
    float ph = aGlint.z;

    // How near he is, and the light left where he has waded.
    vec2 dw = xz - uWalker.xy;
    float nearW = exp(-dot(dw, dw) / 2.2) * uWalker.z;
    float trail = 0.0;
    for (int i = 0; i < TRAIL; i++) {
      vec2 d = xz - uTrail[i].xy;
      trail += uTrail[i].z * exp(-dot(d, d) / 1.3);
    }

    vec3 P = vec3(xz.x, surf(xz, T) + 0.1, xz.y);

    // Each glint's own ripple, tilting this way and that; the water round
    // his legs is stirred harder, so it flashes more.
    float j = 0.12 + 0.14 * nearW;
    vec3 N = normalize(vec3(
      j * sin(T * (2.1 + ph * 3.3) + ph * 61.0),
      1.0,
      j * cos(T * (1.7 + ph * 2.9) + ph * 37.0)));
    vec3 V = normalize(cameraPosition - P);
    vec3 R = reflect(-V, N);
    float sun = pow(max(dot(R, uSun), 0.0), 260.0) * uSunK;
    float moon = pow(max(dot(R, uMoon), 0.0), 170.0) * uMoonK;
    float spark = min(sun + moon, 2.5);

    // The water's own light at night: pale pulses drifting downstream, and
    // brighter wherever he is or has lately been.
    float flow = 0.5 + 0.5 * sin(xz.x * 0.6 - T * 1.2 + ph * 0.8);
    float glow = uGlow * (0.05 + 0.32 * pow(flow, 6.0) + 0.75 * min(trail, 1.2) + 0.9 * nearW);

    float dist = length(cameraPosition - P);
    float fade = 1.0 - smoothstep(52.0, 112.0, dist);
    spark *= fade;
    glow = min(glow, 1.1) * fade;

    vCol = (uSunCol * sun + uMoonCol * moon) / max(sun + moon, 1e-4) * spark + uGlowCol * glow;
    vStar = spark / (spark + glow + 1e-4);

    // A square turned to face the watcher, sized by how brightly it shines;
    // dark glints shrink to nothing and cost no fill. Far ones are kept a
    // touch larger so they never fall between the pixels.
    float size = aGlint.w * max(0.06 + 0.3 * min(spark, 1.5), 0.06 + 0.08 * min(glow, 1.0))
      * (1.0 + dist * 0.018);
    if (spark + glow < 0.015) size = 0.0;
    vUv = aCorner;
    vec4 mv = viewMatrix * vec4(P, 1.0);
    mv.xy += aCorner * size;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vStar;
  void main() {
    float r2 = dot(vUv, vUv);
    float edge = 1.0 - smoothstep(0.6, 1.0, max(abs(vUv.x), abs(vUv.y)));
    // A four-pointed star for a glint, a soft round bead for the glow.
    float core = exp(-r2 * 9.0);
    float rays = exp(-abs(vUv.x) * 14.0) * exp(-abs(vUv.y) * 2.4)
               + exp(-abs(vUv.y) * 14.0) * exp(-abs(vUv.x) * 2.4);
    float soft = exp(-r2 * 4.5);
    float a = mix(soft, core + 0.75 * rays, vStar) * edge;
    gl_FragColor = vec4(vCol * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createLiving(scene) {
  const rng = mulberry32(20260852);

  // Scatter the glints over the water itself: anywhere along the reach, in
  // any of the four strips the course is drawn as (which tile it edge to
  // edge upstream and fan apart past the parting), kept only where the
  // ground really is river.
  const glints = [];
  for (let tries = 0; glints.length < GLINTS * 4 && tries < GLINTS * 12; tries++) {
    const x = X_SPAN[0] + rng() * (X_SPAN[1] - X_SPAN[0]);
    const head = Math.min(3, Math.floor(rng() * 4));
    const f = (rng() * 2 - 1) * 0.92;
    const ph = rng();
    const size = 0.75 + rng() * 0.5;
    const c = riverCourse(x);
    const z = c.centers[head] + f * c.halfWidth;
    if (riverEdgeDist(x, z) > 0.01 || Math.hypot(x, z) > 62) continue;
    glints.push(x, z, ph, size);
  }
  const count = glints.length / 4;

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  geo.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aGlint', new THREE.InstancedBufferAttribute(new Float32Array(glints), 4));
  geo.instanceCount = count;

  const u = {
    uTime: { value: 0 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunK: { value: 0 },
    uMoon: { value: new THREE.Vector3(0, -1, 0) },
    uMoonK: { value: 0 },
    uGlow: { value: 0 },
    uWalker: { value: new THREE.Vector3(0, 0, 0) },
    uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector3(0, 0, 0)) },
    uSunCol: { value: new THREE.Color(1.0, 0.93, 0.76) },
    uMoonCol: { value: new THREE.Color(0.72, 0.8, 1.0) },
    uGlowCol: { value: new THREE.Color(0.3, 0.8, 0.74) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;    // placed in the shader, far from any bounds
  mesh.renderOrder = 2;          // after the water it lies on
  scene.add(mesh);

  const trail = u.uTrail.value;
  let head = 0;
  let clock = 0;
  let sinceMark = 0;
  let stir = 0;
  let wadingFor = 0;
  let armed = true;
  let caption = null;
  let captionLeft = 0;
  let notes = 0;
  let note = 12;
  let marks = 0;
  let hourAz = 0;
  // Steps of the blossom's own pentatonic scale (audio.js bloom), high up it.
  const NOTES = [5, 6, 7, 8, 9, 8, 7, 6];
  const sung = { notes: 0, note: NOTES[0] };
  let dryFor = 0;

  // hour: the sky's own state; moonDir: the moon's unit direction.
  function update(dt, walker, hour, moonDir) {
    clock += dt;
    u.uTime.value = clock;
    const rain = hour.rain || 0;
    hourAz = hour.sunAz;
    const dry = 1 - 0.85 * rain;

    // Where the great lights stand, and how brightly each can glitter.
    const se = clamp(hour.sunElev, -1, 1);
    const h = Math.sqrt(Math.max(0, 1 - se * se));
    u.uSun.value.set(Math.sin(hour.sunAz) * h, se, Math.cos(hour.sunAz) * h);
    u.uSunK.value = 1.6 * smoothstep(-0.01, 0.07, se) * dry;
    if (moonDir) u.uMoon.value.copy(moonDir).normalize();
    const lit = hour.moonPhase ? hour.moonPhase.lit : 1;
    u.uMoonK.value = 1.1 * smoothstep(-0.02, 0.08, u.uMoon.value.y) * (0.2 + 0.8 * lit)
      * smoothstep(0.2, 0.7, hour.night) * dry;
    const glow = hour.night * (1 - 0.5 * rain);
    u.uGlow.value = glow;

    // Is he in the water? (watering.js's own test, so the two agree.)
    let wading = false;
    if (walker) {
      const edge = riverEdgeDist(walker.x, walker.z);
      wading = heightAt(walker.x, walker.z) < -0.6 && edge < 0.01;
      u.uWalker.value.x = walker.x;
      u.uWalker.value.y = walker.z;
    }
    stir = damp(stir, wading ? 1 : 0, wading ? 4 : 1.5, dt);
    u.uWalker.value.z = stir;

    // Lay down a place of light every few strides while he wades.
    sinceMark += dt;
    if (wading && sinceMark >= TRAIL_EVERY) {
      sinceMark = 0;
      trail[head].set(walker.x, walker.z, 1);
      head = (head + 1) % TRAIL;
      marks++;
      // Every few, a soft high note — the water answering him — at night.
      if (glow > 0.5 && marks % 4 === 0) {
        note = NOTES[(marks / 4) % NOTES.length];
        notes++;
      }
    }
    for (const p of trail) if (p.z > 0) p.z = Math.max(0, p.z - dt / TRAIL_LIFE);

    // As he wades into it at night, its name is given.
    wadingFor = wading && glow > 0.5 ? wadingFor + dt : 0;
    if (wadingFor >= CAPTION_AFTER && armed) {
      armed = false;
      caption = CAPTION;
      captionLeft = CAPTION_FOR;
    }
    // Out of the water a while, and it will be named again next time.
    dryFor = wading ? 0 : dryFor + dt;
    if (dryFor > 6) armed = true;
    if (captionLeft > 0) {
      captionLeft -= dt;
      if (captionLeft <= 0) caption = null;
    }
  }

  function state() {
    return {
      glints: count,
      sun: +u.uSunK.value.toFixed(3),
      sunAz: +hourAz.toFixed(3),
      moon: +u.uMoonK.value.toFixed(3),
      glow: +u.uGlow.value.toFixed(3),
      stir: +stir.toFixed(3),
      trail: trail.filter(p => p.z > 0.05).length,
      marks,
    };
  }

  return {
    update, state,
    caption: () => caption,
    // Read every frame by main.js: one reused object, no allocation.
    song: () => { sung.notes = notes; sung.note = note; return sung; },
  };
}
