// "Look now toward heaven, and tell the stars, if thou be able to number
// them" (Genesis 15:5). "He telleth the number of the stars; he calleth them
// all by their names" (Psalm 147:4).
//
// The host of the night sky (v34). The garden always had its few hundred
// stars. Lie back in the grass at night and look up (consider.js), and as
// the eyes grow used to the dark thousands more come out, and with them the
// long cloudy river of the Milky Way right across the sky, with its dark
// rifts and its bright heart. While he lies there his eyes go to each named
// sign in turn (and to the moon, when she rides high), and its name is given
// in the garden's own tongue; and now and then one star in sight brightens
// and sings a single high note.
//
// Two draws, both by night only: the stars (one point each, worked out on
// the graphics chip) and the band (one strip round the sky, its clouds and
// rifts painted by its own shader). The band is only drawn while he lies
// looking up; standing, the extra stars are only faintly there.
//
// Both ride the firmament (sky.js's `celestial`), so they wheel with the
// signs through the long year. Their own seeded stream, drawn only here at
// build time; the song's choices come from a second stream of its own.

import * as THREE from 'three';
import { clamp, damp, mulberry32, smoothstep } from '../util.js';
import { POLE } from './sky.js';

const R = 392;                  // just inside the sky's own stars (400), well inside its dome (430)
const STARS = 3600;
const IN_BAND = 0.62;           // the share of them crowded into the band
const BAND_HALF = 0.3;          // radians either side of the band's middle line
// The band's middle passes this near the pole the sky wheels about (radians),
// so whatever the season it always crosses the sky high up somewhere.
const FROM_POLE = 0.42;
const HEART_AT = 2.2;           // where round the band its bright heart lies (radians)
const BAND_MAX = 0.07;          // the band's full strength (it is added to the dark)

const ADAPT_IN = 0.45;          // the eyes grow used to the dark slowly…
const ADAPT_OUT = 1.5;          // …and lose it again quickly on getting up
const TOUR_FROM = 0.55;         // the eyes go looking for the signs once this used to the dark

// A sign must stand at least this high (radians) to be looked at. Orion
// never climbs above about 0.59 in this sky, so this must stay below that.
const LOW = 0.5;
const HOLD = 12;                // seconds the eyes rest on each sign once there
const ON_WAY = 10;              // seconds allowed for the eyes to get to one
const NAME_IN = 0.16;           // radians from the middle of the view: its name is given…
const NAME_OUT = 0.26;          // …and kept until the eyes are this far from it
const SING_NEAR = 0.32;         // radians: a star that sings is one in sight
const SING_EVERY = [2.6, 5.4];  // seconds between the notes
const STEPS = [-2, -1, 1, 2];   // the tune wanders a step or two at a time (audio.js's pentatonic)

// The signs Job names (9:9; 38:31-32), by sky.js's own names for them.
const HEBREW = { 'the Bear': 'Ash', 'Orion': 'Kesil', 'the Pleiades': 'Kimah' };
const MOON = 'the moon';

const VERTEX_STARS = /* glsl */`
  attribute vec4 aStar;     // size (px), brightness, own phase, index
  attribute float aTint;    // 0 cool … 1 warm
  uniform float uTime;
  uniform float uOpacity;
  uniform float uDpr;
  uniform vec4 uFlare[3];   // a singing star: index, when, how strongly
  varying vec3 vCol;
  varying float vA;
  varying float vFlare;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float up = smoothstep(-0.02, 0.22, wp.y / length(wp.xyz));
    float tw = 0.8 + 0.2 * sin(uTime * (0.9 + 2.6 * aStar.z) + aStar.z * 61.0);
    float fl = 0.0;
    for (int i = 0; i < 3; i++) {
      float since = uTime - uFlare[i].y;
      if (abs(aStar.w - uFlare[i].x) < 0.5 && since > 0.0) {
        fl = max(fl, uFlare[i].z * smoothstep(0.0, 0.3, since) * exp(-max(since - 0.3, 0.0) * 1.3));
      }
    }
    vA = (aStar.y * tw * uOpacity + fl * min(uOpacity * 2.0, 1.0)) * up;
    vFlare = fl;
    vCol = mix(vec3(0.76, 0.84, 1.0), vec3(1.0, 0.87, 0.7), aTint);
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_PointSize = vA < 0.004 ? 0.0 : (aStar.x + 7.0 * fl) * uDpr;
  }
`;

const FRAGMENT_STARS = /* glsl */`
  varying vec3 vCol;
  varying float vA;
  varying float vFlare;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float core = exp(-dot(p, p) * 6.0);
    float rays = (exp(-abs(p.x) * 12.0) * exp(-abs(p.y) * 2.2)
                + exp(-abs(p.y) * 12.0) * exp(-abs(p.x) * 2.2)) * vFlare;
    float a = (core + 0.8 * rays) * (1.0 - smoothstep(0.7, 1.0, max(abs(p.x), abs(p.y))));
    gl_FragColor = vec4(vCol * vA * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const VERTEX_BAND = /* glsl */`
  attribute float aAcross;  // -1 … 1 across the band
  varying vec3 vDir;
  varying float vAcross;
  varying float vUp;
  void main() {
    vDir = normalize(position);
    vAcross = aAcross;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vUp = wp.y / length(wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Its clouds and rifts come from smooth noise over the direction on the sky,
// in the firmament's own frame, so they keep their shapes as it wheels.
const FRAGMENT_BAND = /* glsl */`
  uniform float uOpacity;
  uniform vec3 uHeart;
  varying vec3 vDir;
  varying float vAcross;
  varying float vUp;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  void main() {
    float a = vAcross;
    float n0 = noise(vDir * 3.0 + 7.0);
    float n1 = noise(vDir * 7.0);
    float n2 = noise(vDir * 17.0 + 3.1);
    float n3 = noise(vDir * 61.0 + 5.3);   // the grain of countless stars too faint to tell apart
    // Thickest down its middle, and gone to nothing at the strip's edges.
    float body = exp(-a * a * 3.0) * (1.0 - smoothstep(0.55, 1.0, abs(a)));
    float clouds = pow(0.2 + 0.8 * (0.5 * n1 + 0.3 * n2 + 0.2 * n3), 1.7);
    // The dark rift: a lane of dust wandering along the middle, deep in
    // places and gone in others.
    float mid = 0.7 * (n0 - 0.5);
    float q = (a - mid) / 0.17;   // (q * q, never pow(): pow of a negative is undefined in GLSL)
    float lane = exp(-q * q) * smoothstep(0.3, 0.7, n0 + 0.3 * n1);
    float heart = pow(max(dot(vDir, uHeart), 0.0), 6.0);
    float glow = body * clouds * (1.0 - 0.75 * lane) * (0.55 + 1.1 * heart);
    vec3 col = mix(vec3(0.62, 0.7, 0.95), vec3(1.0, 0.86, 0.66), clamp(heart * 0.8 + 0.15 * n2, 0.0, 1.0));
    float up = smoothstep(0.0, 0.3, vUp);
    gl_FragColor = vec4(col * glow * uOpacity * up, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createHost(celestial, signs) {
  const rng = mulberry32(20260860);
  const gauss = () => {
    const u = Math.max(rng(), 1e-6), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // The band's frame: `n` square to it; `bu`, `bv` round its middle line.
  const side = new THREE.Vector3().crossVectors(POLE, new THREE.Vector3(0, 0, 1)).normalize();
  const n = POLE.clone().multiplyScalar(Math.sin(FROM_POLE)).addScaledVector(side, Math.cos(FROM_POLE)).normalize();
  const bu = new THREE.Vector3().crossVectors(n, POLE).normalize();
  const bv = new THREE.Vector3().crossVectors(n, bu).normalize();
  const onBand = (theta, across, out) => out
    .copy(bu).multiplyScalar(Math.cos(theta))
    .addScaledVector(bv, Math.sin(theta))
    .addScaledVector(n, Math.tan(across * BAND_HALF))
    .normalize();
  const heart = onBand(HEART_AT, 0, new THREE.Vector3());

  // The stars: most crowded into the band (and thickest toward its heart),
  // the rest scattered over the whole sphere. Mostly faint, a few bright.
  const pos = new Float32Array(STARS * 3);
  const star = new Float32Array(STARS * 4);
  const tint = new Float32Array(STARS);
  const bright = [];   // the brighter ones, which may sing: { i, dir }
  const d = new THREE.Vector3();
  for (let i = 0; i < STARS; i++) {
    if (rng() < IN_BAND) {
      const theta = rng() < 0.3 ? HEART_AT + gauss() * 0.5 : rng() * Math.PI * 2;
      onBand(theta, clamp(gauss() * 0.42, -1.6, 1.6), d);
    } else {
      const z = rng() * 2 - 1, phi = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      d.set(r * Math.cos(phi), z, r * Math.sin(phi));
    }
    const b = 0.08 + 0.85 * Math.pow(rng(), 2.6);
    pos[i * 3] = d.x * R; pos[i * 3 + 1] = d.y * R; pos[i * 3 + 2] = d.z * R;
    star[i * 4] = 2.4 + 2.6 * b;
    star[i * 4 + 1] = b;
    star[i * 4 + 2] = rng();
    star[i * 4 + 3] = i;
    tint[i] = rng() < 0.2 ? 0.75 + 0.25 * rng() : 0.25 * rng();
    if (b > 0.42) bright.push({ i, dir: d.clone() });
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aStar', new THREE.BufferAttribute(star, 4));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  const su = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uDpr: { value: 1 },
    uFlare: { value: [0, 1, 2].map(() => new THREE.Vector4(-1, -100, 0, 0)) },
  };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: su, vertexShader: VERTEX_STARS, fragmentShader: FRAGMENT_STARS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  stars.visible = false;
  stars.onBeforeRender = renderer => { su.uDpr.value = renderer.getPixelRatio(); };
  celestial.add(stars);

  // The band: one strip round the whole sky.
  const SEG = 96, ROWS = 6;
  const bandPos = [], across = [], index = [];
  for (let s = 0; s <= SEG; s++) {
    for (let r = 0; r <= ROWS; r++) {
      const w = (r / ROWS) * 2 - 1;
      onBand((s / SEG) * Math.PI * 2, w, d);
      bandPos.push(d.x * (R + 2), d.y * (R + 2), d.z * (R + 2));
      across.push(w);
    }
  }
  for (let s = 0; s < SEG; s++) {
    for (let r = 0; r < ROWS; r++) {
      const a = s * (ROWS + 1) + r, b = a + ROWS + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const bandGeo = new THREE.BufferGeometry();
  bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(bandPos, 3));
  bandGeo.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  bandGeo.setIndex(index);
  const bu2 = { uOpacity: { value: 0 }, uHeart: { value: heart } };
  const band = new THREE.Mesh(bandGeo, new THREE.ShaderMaterial({
    uniforms: bu2, vertexShader: VERTEX_BAND, fragmentShader: FRAGMENT_BAND,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  band.frustumCulled = false;
  band.renderOrder = -9;
  band.visible = false;
  celestial.add(band);

  // The places his eyes may go: the three signs, and the moon.
  const stops = signs
    .filter(s => HEBREW[s.name])
    .map(s => ({ caption: { name: HEBREW[s.name], label: s.name }, dir: s.dir, world: new THREE.Vector3(), ok: false }));
  stops.push({ caption: { name: 'Yareach', label: MOON }, dir: null, world: new THREE.Vector3(), ok: false });

  const songRng = mulberry32(20260861);
  const qInv = new THREE.Quaternion();
  const look = new THREE.Vector3();
  let clock = 0;
  let adapt = 0;
  let nightK = 0;
  let stop = -1;           // where the eyes are going, or resting (index into stops)
  let held = 0;            // seconds rested there with its name given
  let going = 0;           // seconds on the way there
  let named = null;        // the stop whose name is given now
  let singIn = SING_EVERY[0];
  let flareSlot = 0;
  const sung = { notes: 0, note: 5 };   // how many have sung this visit, and the last one's step

  function pickNext() {
    for (let k = 1; k <= stops.length; k++) {
      const j = (Math.max(stop, -1) + k + stops.length) % stops.length;
      if (stops[j].ok && j !== stop) return j;
    }
    return stop >= 0 && stops[stop].ok ? stop : -1;
  }

  // gaze: { lying, k (0..1 how far he looks up), dir (unit, world: where his
  // eyes are) } from consider.js, or null.
  function update(dt, hour, gaze) {
    clock += dt;
    su.uTime.value = clock;
    nightK = smoothstep(0.4, 0.9, hour.night) * (1 - 0.7 * hour.rain);
    const looking = !!(gaze && gaze.lying && gaze.k > 0.6);
    adapt = damp(adapt, looking ? 1 : 0, looking ? ADAPT_IN : ADAPT_OUT, dt);
    if (!looking && adapt < 0.002) adapt = 0;
    su.uOpacity.value = nightK * (0.3 + 0.7 * adapt);
    stars.visible = su.uOpacity.value > 0.01;
    bu2.uOpacity.value = nightK * adapt * BAND_MAX;
    band.visible = bu2.uOpacity.value > 0.0015;

    const touring = looking && nightK > 0.5 && adapt > TOUR_FROM;
    if (!touring) { stop = -1; held = 0; going = 0; named = null; return; }

    // Which stops stand high enough to look at tonight, and where.
    const q = celestial.quaternion;
    for (const s of stops) {
      if (s.dir) s.world.copy(s.dir).applyQuaternion(q);
      else s.world.copy(hour.moonDir);
      s.ok = s.world.y > Math.sin(LOW) && (s.dir !== null || hour.moonPhase.lit > 0.15);
    }
    if (stop >= 0 && !stops[stop].ok) { stop = -1; named = null; }
    if (stop < 0 || held > HOLD || going > ON_WAY) {
      const next = pickNext();
      if (next !== stop) { stop = next; held = 0; going = 0; named = null; }
      else { held = 0; going = 0; }
    }
    if (stop < 0) { named = null; return; }

    // Its name is given once the eyes have come to it, and kept while they rest there.
    const off = gaze.dir.angleTo(stops[stop].world);
    if (named !== stops[stop] && off < NAME_IN) named = stops[stop];
    else if (named && off > NAME_OUT) named = null;
    if (named) held += dt; else going += dt;

    // Now and then a star in sight sings.
    if (adapt > 0.6 && (singIn -= dt) <= 0) {
      singIn = SING_EVERY[0] + songRng() * (SING_EVERY[1] - SING_EVERY[0]);
      qInv.copy(q).invert();
      look.copy(gaze.dir).applyQuaternion(qInv);
      const from = Math.floor(songRng() * bright.length);
      for (let k = 0; k < bright.length; k++) {
        const c = bright[(from + k) % bright.length];
        if (c.dir.angleTo(look) > SING_NEAR) continue;
        su.uFlare.value[flareSlot].set(c.i, clock, 0.8 + 0.2 * songRng(), 0);
        flareSlot = (flareSlot + 1) % 3;
        sung.note = clamp(sung.note + STEPS[Math.floor(songRng() * STEPS.length)], 0, 9);
        sung.notes++;
        break;
      }
    }
  }

  // Where the eyes should go now (a unit direction, world), if anywhere.
  function guide(out) {
    if (stop < 0) return false;
    out.copy(stops[stop].world);
    return true;
  }

  function caption() {
    return named ? named.caption : null;
  }

  function state() {
    return {
      stars: STARS,
      adapt: +adapt.toFixed(3),
      band: band.visible,
      shown: stars.visible,
      going: stop >= 0 ? stops[stop].caption.label : null,
      named: named ? named.caption.label : null,
      sung: sung.notes,
    };
  }

  return { update, guide, caption, state, song: () => sung };
}
