// The heavens keep time. A vertex-gradient dome, the sun and moon riding one
// tilted arc, stars that only the night reveals, drifting clouds, and the
// garden's lighting — all driven by a slow cycle of keyframed light:
// "And the evening and the morning were the first day" (Genesis 1:5);
// "the greater light to rule the day, and the lesser light to rule the
// night: he made the stars also" (Genesis 1:16). One directional light
// serves as both great lights, handed from sun to moon when they trade
// places at the horizon. The dome's horizon tone is copied into the scene
// fog every frame, so land and sky keep melting together at every hour.

import * as THREE from 'three';
import { smoothstep, lerp, clamp, mulberry32 } from '../util.js';

export const HORIZON = new THREE.Color(0xEAE4CB);   // the day horizon — scene fog boots with it

const DAY_LENGTH = 420;   // one whole day, in seconds — a day breathes in seven minutes
const DAY_END = 0.62;     // sunset, as a fraction of the cycle; night runs to 1
const START_T = 0.075;    // every visit begins in morning light
const ARC_TILT = 0.5;     // the sun's path leans, so noon light falls the way v1's did
const SKY_R = 430;

// The day's palette, sampled and lerped by cycle time. `night` is how deep
// into night the world is (0 day → 1 full dark) — vegetation, creatures and
// the ambience all key off it. `light` is the one directional light's color;
// through dusk it becomes moonlight. Intensities pinch low around the two
// sun↔moon handoffs so the direction flip is never seen at strength.
const STOPS = [
  { t: 0.000, horizon: 0xF4C489, zenith: 0x7FA3CC, light: 0xFFC98E, lightI: 1.50, hemiSky: 0xC5CEDD, hemiGround: 0x6E8B54, hemiI: 0.80, glow: 1.00, stars: 0.12, moon: 0.40, night: 0.12 },
  { t: 0.075, horizon: 0xEAE4CB, zenith: 0x79B4E4, light: 0xFFF2D0, lightI: 2.35, hemiSky: 0xBFDCF2, hemiGround: 0x7FA05F, hemiI: 1.00, glow: 0.85, stars: 0.00, moon: 0.30, night: 0.00 },
  { t: 0.320, horizon: 0xE9EDDA, zenith: 0x66ACE8, light: 0xFFF9E8, lightI: 2.55, hemiSky: 0xCAE4F5, hemiGround: 0x85A863, hemiI: 1.05, glow: 0.75, stars: 0.00, moon: 0.00, night: 0.00 },
  { t: 0.500, horizon: 0xF0DCA6, zenith: 0x7BA6D6, light: 0xFFE3AE, lightI: 2.10, hemiSky: 0xC3D6E8, hemiGround: 0x7C9A58, hemiI: 0.95, glow: 0.90, stars: 0.00, moon: 0.15, night: 0.00 },
  { t: 0.585, horizon: 0xF39C5A, zenith: 0x53629B, light: 0xFF9852, lightI: 1.35, hemiSky: 0xB9AFC0, hemiGround: 0x6A7D4C, hemiI: 0.80, glow: 1.00, stars: 0.05, moon: 0.50, night: 0.20 },
  { t: 0.605, horizon: 0xB97E68, zenith: 0x3A4877, light: 0xE8A878, lightI: 0.55, hemiSky: 0x8B879C, hemiGround: 0x556347, hemiI: 0.66, glow: 0.55, stars: 0.20, moon: 0.65, night: 0.42 },
  { t: 0.640, horizon: 0x6A5E80, zenith: 0x232F55, light: 0xA9B8D8, lightI: 0.30, hemiSky: 0x4E5A78, hemiGround: 0x39433A, hemiI: 0.50, glow: 0.00, stars: 0.55, moon: 0.85, night: 0.72 },
  { t: 0.760, horizon: 0x2A3450, zenith: 0x0C1224, light: 0x9FB2D8, lightI: 0.50, hemiSky: 0x35415E, hemiGround: 0x252E26, hemiI: 0.38, glow: 0.00, stars: 1.00, moon: 1.00, night: 1.00 },
  { t: 0.900, horizon: 0x2A3450, zenith: 0x0C1224, light: 0x9FB2D8, lightI: 0.50, hemiSky: 0x35415E, hemiGround: 0x252E26, hemiI: 0.38, glow: 0.00, stars: 1.00, moon: 1.00, night: 1.00 },
  { t: 0.945, horizon: 0x4A4468, zenith: 0x141C36, light: 0x9FB2D8, lightI: 0.42, hemiSky: 0x3E475F, hemiGround: 0x2A3229, hemiI: 0.42, glow: 0.00, stars: 0.70, moon: 0.80, night: 0.90 },
  { t: 0.980, horizon: 0xBF8E88, zenith: 0x3A4A74, light: 0xC8A79A, lightI: 0.38, hemiSky: 0x8C93A8, hemiGround: 0x4C5C42, hemiI: 0.60, glow: 0.40, stars: 0.30, moon: 0.60, night: 0.50 },
];

// Precompute Color objects once; numbers lerp as-is.
const COLOR_KEYS = ['horizon', 'zenith', 'light', 'hemiSky', 'hemiGround'];
const NUM_KEYS = ['lightI', 'hemiI', 'glow', 'stars', 'moon', 'night'];
for (const s of STOPS) for (const k of COLOR_KEYS) s[k] = new THREE.Color(s[k]);

const PHASE_TIMES = { dawn: 0.985, morning: 0.10, noon: 0.33, evening: 0.53, dusk: 0.64, night: 0.80 };

function phaseOf(t) {
  if (t >= 0.945 || t < 0.03) return 'dawn';
  if (t < 0.24) return 'morning';
  if (t < 0.46) return 'noon';
  if (t < 0.585) return 'evening';
  if (t < 0.68) return 'dusk';
  return 'night';
}

// Where a body stands on the shared arc: `f` in [0,1] is its above-horizon
// journey east (+x) to west (−x); beyond 1 it continues below the horizon,
// so its motion is continuous across the whole cycle — nothing ever pops.
function arcInto(out, f) {
  const a = Math.PI * f;
  const s = Math.sin(a);
  return out.set(Math.cos(a), s * Math.cos(ARC_TILT), -s * Math.sin(ARC_TILT));
}

function makeGlowSprite(inner, mid) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, mid);
  grad.addColorStop(1, 'rgba(255, 238, 180, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    fog: false,
    depthWrite: false,
  }));
}

export function createSky(scene) {
  // Dome — vertex colours from horizon to zenith. The gradient factor per
  // vertex is fixed; the two colours it blends are repainted as time passes.
  const domeGeo = new THREE.SphereGeometry(SKY_R, 24, 12);
  const pos = domeGeo.attributes.position;
  const domeT = new Float32Array(pos.count);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    domeT[i] = smoothstep(-0.06, 0.55, pos.getY(i) / SKY_R);
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const domeAttr = domeGeo.attributes.color;
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  }));
  dome.renderOrder = -10;
  scene.add(dome);

  // The two great lights, and the glows they wear near the horizon.
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(15, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xFFF3C4, fog: false, transparent: true }),
  );
  scene.add(sun);
  const sunGlow = makeGlowSprite('rgba(255, 244, 200, 0.85)', 'rgba(255, 238, 180, 0.28)');
  sunGlow.scale.setScalar(120);
  scene.add(sunGlow);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9, 10, 7),
    new THREE.MeshBasicMaterial({ color: 0xEDF2F8, fog: false, transparent: true }),
  );
  scene.add(moon);
  const moonGlow = makeGlowSprite('rgba(214, 228, 248, 0.55)', 'rgba(198, 214, 240, 0.16)');
  moonGlow.scale.setScalar(60);
  scene.add(moonGlow);

  // The stars, made also: one seeded Points cloud on the upper sphere, its
  // own rng stream so the garden's planting draws are untouched. Brightness
  // and warmth vary per star via vertex colours — one draw call, night only.
  const starRng = mulberry32(20260704);
  const STAR_COUNT = 620;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const az = starRng() * Math.PI * 2;
    const sinEl = 0.05 + 0.95 * starRng();
    const rh = Math.sqrt(1 - sinEl * sinEl);
    starPos[i * 3] = Math.cos(az) * rh * 400;
    starPos[i * 3 + 1] = sinEl * 400;
    starPos[i * 3 + 2] = Math.sin(az) * rh * 400;
    const w = 0.45 + starRng() * 0.55;                  // brightness
    const tint = starRng();                             // a few warm, a few cool
    const r2 = tint < 0.18 ? 1.0 : 0.82, b2 = tint > 0.82 ? 1.0 : 0.88;
    starCol[i * 3] = w * r2;
    starCol[i * 3 + 1] = w * 0.9;
    starCol[i * 3 + 2] = w * b2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  }));
  stars.renderOrder = -9;
  stars.visible = false;
  scene.add(stars);

  // Clouds: one instanced icosahedron forming a few puffy clusters.
  const CLOUD_PUFFS = [];
  const clusters = [
    { x: -60, y: 64, z: -90, n: 4, s: 9 },
    { x: 85, y: 74, z: -30, n: 3, s: 7 },
    { x: -30, y: 82, z: 95, n: 4, s: 8 },
    { x: 100, y: 60, z: 80, n: 3, s: 6 },
    { x: 10, y: 90, z: -140, n: 3, s: 10 },
  ];
  let total = 0;
  for (const cl of clusters) total += cl.n;
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF, emissive: 0x8E99A8, fog: false, flatShading: true });
  const clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), cloudMat, total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let idx = 0;
  for (const cl of clusters) {
    for (let i = 0; i < cl.n; i++) {
      const dx = (i - (cl.n - 1) / 2) * cl.s * 0.9;
      p.set(cl.x + dx, cl.y + (i % 2) * cl.s * 0.22, cl.z + ((i * 37) % 5 - 2) * 1.5);
      sc.set(cl.s * (1 + (i % 3) * 0.25), cl.s * 0.45, cl.s * 0.7);
      q.setFromEuler(new THREE.Euler(0, i * 0.9 + cl.x, 0));
      m.compose(p, q, sc);
      clouds.setMatrixAt(idx, m);
      CLOUD_PUFFS.push({ base: p.clone(), scale: sc.clone(), quat: q.clone(), speed: 0.55 + (idx % 4) * 0.18 });
      idx++;
    }
  }
  scene.add(clouds);

  // The one directional light both great lights take turns holding,
  // plus the ambient bounce of sky and ground.
  const greatLight = new THREE.DirectionalLight(0xFFF2D0, 2.35);
  scene.add(greatLight);
  const hemi = new THREE.HemisphereLight(0xBFDCF2, 0x7FA05F, 1.0);
  scene.add(hemi);

  const CLOUD_EMISSIVE_DAY = new THREE.Color(0x8E99A8);
  const CLOUD_EMISSIVE_NIGHT = new THREE.Color(0x1C2433);

  // Reused per-frame scratch — no allocation inside update().
  const cur = { horizon: new THREE.Color(), zenith: new THREE.Color(), light: new THREE.Color() };
  const hemiSky = new THREE.Color(), hemiGround = new THREE.Color();
  const vc = new THREE.Color();
  const sunV = new THREE.Vector3(), moonV = new THREE.Vector3();
  const num = { lightI: 0, hemiI: 0, glow: 0, stars: 0, moon: 0, night: 0 };

  const state = { t: START_T, phase: phaseOf(START_T), night: 0, sunElev: 0 };
  let t = START_T;
  let elapsed = 0;

  function apply() {
    // Bracketing keyframes (the list wraps: past the last stop, blend
    // toward the first at t=1).
    let i = STOPS.length - 1;
    while (i > 0 && STOPS[i].t > t) i--;
    const a = STOPS[i];
    const b = STOPS[(i + 1) % STOPS.length];
    const span = (i + 1 < STOPS.length ? b.t : 1) - a.t;
    const k = span > 0 ? clamp((t - a.t) / span, 0, 1) : 0;

    cur.horizon.lerpColors(a.horizon, b.horizon, k);
    cur.zenith.lerpColors(a.zenith, b.zenith, k);
    cur.light.lerpColors(a.light, b.light, k);
    hemiSky.lerpColors(a.hemiSky, b.hemiSky, k);
    hemiGround.lerpColors(a.hemiGround, b.hemiGround, k);
    for (const key of NUM_KEYS) num[key] = lerp(a[key], b[key], k);

    // Repaint the dome and hand its horizon tone to the fog.
    for (let v = 0; v < domeT.length; v++) {
      vc.copy(cur.horizon).lerp(cur.zenith, domeT[v]);
      colors[v * 3] = vc.r; colors[v * 3 + 1] = vc.g; colors[v * 3 + 2] = vc.b;
    }
    domeAttr.needsUpdate = true;
    if (scene.fog) scene.fog.color.copy(cur.horizon);

    // The sun walks its arc over the day and under the world by night; the
    // moon keeps the opposite watch (rising a little before sunset, setting
    // a little after dawn). Both are continuous across the midnight wrap.
    const fSun = t < DAY_END ? t / DAY_END : 1 + (t - DAY_END) / (1 - DAY_END);
    arcInto(sunV, fSun);
    const tm = (t - 0.58 + 1) % 1;
    const fMoon = tm < 0.44 ? tm / 0.44 : 1 + (tm - 0.44) / 0.56;
    arcInto(moonV, fMoon);

    sun.position.copy(sunV).multiplyScalar(370);
    sunGlow.position.copy(sun.position);
    moon.position.copy(moonV).multiplyScalar(380);
    moonGlow.position.copy(moon.position);

    const sunUp = smoothstep(-0.045, 0.05, sunV.y);
    const moonUp = smoothstep(-0.045, 0.06, moonV.y);
    sun.material.opacity = sunUp;
    sun.material.color.copy(cur.light);
    sun.visible = sunUp > 0.01;
    sunGlow.material.opacity = num.glow * sunUp;
    sunGlow.material.color.copy(cur.light);
    sunGlow.visible = sunGlow.material.opacity > 0.01;
    moon.material.opacity = num.moon * moonUp;
    moon.visible = moon.material.opacity > 0.01;
    moonGlow.material.opacity = num.moon * moonUp * 0.5;
    moonGlow.visible = moonGlow.material.opacity > 0.01;

    // Whichever great light stands higher holds the directional light.
    // The palette pinches lightI low around both handoffs, so the swing
    // of shading direction happens only in the dimmest moments.
    greatLight.position.copy(sunV.y >= moonV.y ? sunV : moonV).multiplyScalar(100);
    greatLight.color.copy(cur.light);
    greatLight.intensity = num.lightI;
    hemi.color.copy(hemiSky);
    hemi.groundColor.copy(hemiGround);
    hemi.intensity = num.hemiI;

    // Stars breathe in with the dark, and faintly shimmer.
    const twinkle = 0.92 + 0.08 * Math.sin(elapsed * 2.1);
    stars.material.opacity = num.stars * twinkle;
    stars.visible = num.stars > 0.02;

    cloudMat.emissive.lerpColors(CLOUD_EMISSIVE_DAY, CLOUD_EMISSIVE_NIGHT, num.night);

    state.t = t;
    state.phase = phaseOf(t);
    state.night = num.night;
    state.sunElev = sunV.y;
  }

  function update(dt) {
    elapsed += dt;
    t = (t + dt / DAY_LENGTH) % 1;
    apply();
    for (let i = 0; i < CLOUD_PUFFS.length; i++) {
      const puff = CLOUD_PUFFS[i];
      p.copy(puff.base);
      p.x += Math.sin(elapsed * 0.02 * puff.speed + i) * 6 + elapsed * 0.35 * puff.speed;
      // Drift around: wrap far-east clouds back to the west.
      p.x = ((p.x + 160) % 320) - 160;
      m.compose(p, puff.quat, puff.scale);
      clouds.setMatrixAt(i, m);
    }
    clouds.instanceMatrix.needsUpdate = true;
    return state;
  }

  // Jump the clock — for tests, screenshots, and the curious console.
  // Accepts a named hour ('dawn'|'morning'|'noon'|'evening'|'dusk'|'night')
  // or a number in [0, 1).
  function setTime(v) {
    const target = typeof v === 'string' ? PHASE_TIMES[v] : v;
    if (typeof target !== 'number' || !isFinite(target)) return state;
    t = ((target % 1) + 1) % 1;
    apply();
    return state;
  }

  apply();
  return { update, setTime, state };
}
