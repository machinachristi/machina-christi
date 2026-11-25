// "David danced before the LORD with all his might" (2 Samuel 6:14).
//
// v45: tap him on the sea of glass and he dances before the glory, as he
// dances in the garden (dance.js keeps the steps; main.js tells heaven how far
// into the dance he is). Heaven dances with him:
//
// - A ring of the multitude's lights comes down out of the tiers round the
//   glory, each in its own moment, sweeping down over the glass in a long
//   arc, and dances round him in two rings — the inner one turning against
//   him, the outer one with him — bobbing to the timbrel. "As well the
//   singers as the players on instruments shall be there" (Psalm 87:7).
// - Every stroke of the timbrel kindles a ring of fire in the glass under
//   his feet (Revelation 15:2), and as he leaps, the rings of lights leap too.
// - The whole multitude sways in time while he dances (glory.js).
// - When he bows, the lights go home up into the multitude, and heaven
//   answers: the wave through every tier and the glory brightening (19:6-7).
//   A dance cut short sends them home quietly, without the answer; and if he
//   dances again somewhere else before they are all home, the rings glide
//   across to him there.
//
// The lights are one `Points` draw, each one's whole path worked out in the
// vertex shader from three numbers the dance sets each frame, and drawn
// only while any of them is out of the multitude. Its own seeded stream
// (20260868), drawn only at build time.

import * as THREE from 'three';
import { mulberry32, clamp } from '../util.js';
import { GLORY } from './layout.js';

const INNER = 48;               // lights in the inner ring…
const OUTER = 72;               // …and the outer
const LIGHTS = INNER + OUTER;
const INNER_R = 2.9;            // metres from him
const OUTER_R = 4.5;
const GATHER = 1.5;             // seconds for the rings to come down…
const SCATTER = 2.6;            // …and to go home again
const SPIN = 0.9;               // radians a second the rings turn
const STEP = 1 / 3.8;           // the dance's skipping step (character.js DANCE_STEP)
const CAPTION = { name: 'Mekharker bekhol oz', label: 'dancing with all his might' };

export function createChorus(scene, sea, glory) {
  const rng = mulberry32(20260868);

  // aHome: where in the multitude each light sets out from (it is one of
  // them, standing in the near tiers round the glory). aSeed: x its place
  // round its ring (0..1), y how late it leaves (0..1), z its size, w its
  // ring (0 inner, 1 outer).
  const home = new Float32Array(LIGHTS * 3);
  const seed = new Float32Array(LIGHTS * 4);
  const tint = new Float32Array(LIGHTS * 3);
  const WARM = new THREE.Color(0xFFEFC8);
  const GOLD = new THREE.Color(0xFFCF6E);
  const PALE = new THREE.Color(0xF4F7FF);
  const c = new THREE.Color();
  for (let i = 0; i < LIGHTS; i++) {
    const outer = i >= INNER ? 1 : 0;
    const n = outer ? OUTER : INNER;
    const k = outer ? i - INNER : i;
    // The near tiers of the multitude (glory.js: from 17 m out, 2.4 m apart,
    // reaching 0.66 of a half-turn round from due north either way), on the
    // side of them facing him.
    const a = (rng() * 2 - 1) * Math.PI * 0.62;
    const r = 17 + rng() * 9.6;
    home[i * 3] = GLORY.x + Math.sin(a) * r;
    home[i * 3 + 1] = 1.2 + (r - 17) / 2.4 * 2.1;
    home[i * 3 + 2] = GLORY.z + Math.cos(a) * r;
    seed[i * 4] = (k + rng() * 0.3) / n;
    seed[i * 4 + 1] = rng();
    seed[i * 4 + 2] = 0.8 + rng() * 0.5;
    seed[i * 4 + 3] = outer;
    c.copy(WARM).lerp(rng() < 0.5 ? GOLD : PALE, rng() * 0.6);
    tint.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  // Every light's place is the shader's; `position` is its home, so the
  // geometry has something to bound.
  geo.setAttribute('position', new THREE.BufferAttribute(home, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const u = {
    uCenter: { value: new THREE.Vector3() },   // where he dances
    uOut: { value: 0 },        // 0 all at home … 1 all in the rings
    uSpin: { value: 0 },       // how far round the rings have turned
    uBeat: { value: 0 },       // the timbrel's bob, 0..1
    uLeap: { value: 0 },       // the leap, 0..1..0
    uTime: { value: 0 },
    uHalfH: { value: 400 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute vec3 aTint;
      uniform vec3 uCenter;
      uniform float uOut;
      uniform float uSpin;
      uniform float uBeat;
      uniform float uLeap;
      uniform float uTime;
      uniform float uHalfH;
      varying vec3 vTint;
      varying float vAlpha;
      void main() {
        // Each light leaves (and comes home) in its own moment.
        float k = clamp(uOut * 1.6 - aSeed.y * 0.6, 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);
        float outer = aSeed.w;
        float r = mix(${INNER_R.toFixed(2)}, ${OUTER_R.toFixed(2)}, outer);
        // The inner ring turns against him, the outer one with him.
        float ang = aSeed.x * 6.2831853 + uSpin * mix(-1.3, 1.0, outer);
        float bob = uBeat * 0.22 * (0.6 + 0.4 * sin(aSeed.x * 37.0));
        vec3 ring = uCenter + vec3(sin(ang) * r,
          mix(1.05, 1.55, outer) + bob + uLeap * mix(1.5, 1.0, outer) + 0.08 * sin(uTime * 2.0 + aSeed.x * 20.0),
          cos(ang) * r);
        // Down from the multitude in a long arc, and home again the same way.
        vec3 p = mix(position, ring, k) + vec3(0.0, sin(k * 3.14159) * 9.0, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // Out of the tiers it grows a little brighter than the rest; and
        // any light that comes right up against the eye fades rather than
        // filling the screen.
        float away = smoothstep(0.6, 1.8, -mv.z);
        vAlpha = step(0.002, uOut) * away * (0.55 + 0.45 * k) * (1.0 + 0.6 * uLeap);
        vTint = mix(aTint, vec3(1.0, 0.82, 0.42), 0.45 * k);
        gl_PointSize = clamp(aSeed.z * (1.0 + 0.7 * k) * 0.75 * projectionMatrix[1][1] * uHalfH / -mv.z, 1.5, 30.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vTint;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d) * 4.0;
        if (r2 > 1.0 || vAlpha < 0.01) discard;
        float a = min(1.0, (exp(-r2 * 4.0) * 0.85 + 0.15 * (1.0 - r2)) * vAlpha);
        gl_FragColor = vec4(vTint, a);
        #include <colorspace_fragment>
      }`,
  });
  const lights = new THREE.Points(geo, mat);
  lights.frustumCulled = false;   // every light's place is the shader's
  lights.renderOrder = 3;
  const _buf = new THREE.Vector2();
  lights.onBeforeRender = renderer => { u.uHalfH.value = renderer.getDrawingBufferSize(_buf).y / 2; };
  // Left showing for heaven's first frame (every light at home, nothing
  // drawn), so its shader is compiled then and not at the first dance.
  lights.visible = true;
  scene.add(lights);

  let out = 0;             // uOut, eased
  let dancing = false;
  let danced = 0;          // dances begun in heaven
  let answers = 0;         // dances heaven has answered
  let lastBeats = -1;
  let bowsAtStart = 0;     // dance.js's count of dances bowed, as this one began
  let spin = 0;
  let beatAt = -1e6;
  const center = u.uCenter.value;
  const centerTo = new THREE.Vector3();   // where he dances now

  // t: seconds into his dance, or −1; dir: which way he turns; beats: the
  // timbrel strokes so far, and bows: the dances danced right through to
  // the bow (dance.js); walker: his position; time: heaven's.
  // Returns true the moment heaven should answer (a dance finished).
  function update(dt, time, walker, t, dir, beats, bows = 0) {
    let answer = false;
    const now = typeof t === 'number' && t >= 0;
    if (now && !dancing) {
      // A dance begins where he stands. With every light at home, the rings
      // are there at once; with some still out from the last dance, the
      // rings glide across to him rather than leap.
      dancing = true;
      danced++;
      if (walker) centerTo.set(walker.x, 0, walker.z);
      if (out <= 0) center.copy(centerTo);
      lastBeats = beats;
      bowsAtStart = bows;
    } else if (!now && dancing) {
      dancing = false;
      // Bowed, the whole dance through: heaven answers. Let go part-way
      // through: the lights go home quietly.
      if (bows !== bowsAtStart) { answers++; answer = true; }
    }
    center.lerp(centerTo, 1 - Math.exp(-3 * Math.max(0, dt)));
    if (dancing && beats !== lastBeats) {
      lastBeats = beats;
      beatAt = time;
      // A ring of fire in the glass under his feet, each stroke.
      if (walker) sea.kindle(walker.x, walker.z, time, 1);
    }
    const target = dancing ? 1 : 0;
    const rate = dancing ? 1 / GATHER : 1 / SCATTER;
    out = target > out ? Math.min(target, out + dt * rate) : Math.max(target, out - dt * rate);
    spin += dt * SPIN * (dir || 1);
    if (!dancing && out <= 0) spin = 0;
    u.uOut.value = out;
    u.uSpin.value = spin;
    u.uTime.value = time;
    const since = time - beatAt;
    u.uBeat.value = since >= 0 && since < STEP ? Math.sin(Math.PI * since / STEP) : 0;
    // The leap (character.js LEAP, 4.15–4.8 s into the dance).
    u.uLeap.value = dancing ? Math.sin(Math.PI * clamp((t - 4.15) / 0.65, 0, 1)) : 0;
    lights.visible = out > 0;
    glory.sway(dancing ? 1 : 0, dt);
    return answer;
  }

  return {
    update,
    dancing: () => dancing,
    caption: () => (dancing ? CAPTION : null),
    answers: () => answers,
    state() {
      return {
        dancing,
        out: Math.round(out * 1000) / 1000,
        lights: lights.visible ? LIGHTS : 0,
        danced,
        answers,
        center: { x: u.uCenter.value.x, z: u.uCenter.value.z },
        sway: glory.swaying(),
      };
    },
  };
}
