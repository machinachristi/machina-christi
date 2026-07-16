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
import { smoothstep, lerp, clamp, damp, mulberry32 } from '../util.js';
import { heightAt } from './terrain.js';

export const HORIZON = new THREE.Color(0xEAE4CB);   // the day horizon — scene fog boots with it

const DAY_LENGTH = 420;   // one whole day, in seconds — a day breathes in seven minutes
const YEAR_DAYS = 28;     // the long year: the signs wheel full circle in 28 of those days
const WEEK_DAYS = 7;      // "on the seventh day God ended his work" (Genesis 2:2-3)
// "Let them be for signs, and for seasons" (Genesis 1:14): the whole night
// sky turns slowly about one pole, and its starting angle is set by the
// visitor's real calendar date — the Bear stands where the season sets it.
const POLE = new THREE.Vector3(
  Math.cos(1.05) * Math.cos(0.45), Math.sin(1.05), Math.cos(1.05) * Math.sin(0.45),
).normalize();
const WHEEL_RATE = (Math.PI * 2) / (YEAR_DAYS * DAY_LENGTH);
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

// "When the morning stars sang together" (Job 38:7): how strongly that
// swell presently sounds, 0 apart from it, 1 right at the cycle's own dawn
// instant (t wraps through 0) — a narrow window, well inside where the
// stars are still faintly shown (STOPS keeps them lit at t=0.98..0.075).
function dawnSingOf(t) {
  const d = Math.min(t, 1 - t);   // distance to the wrap point, either side
  return Math.max(0, 1 - d / 0.05);
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

  // One rigid firmament: every star and sign rides this group, which wheels
  // slowly about the pole through the long year — so which figures stand
  // high at night drifts with the seasons, as Genesis 1:14 has it.
  const celestial = new THREE.Group();
  celestial.add(stars);
  scene.add(celestial);
  const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 0);
  const wheel0 = ((Date.now() - startOfYear) / 86400000 / 365.25) * Math.PI * 2;

  // Signs in the heavens: "let them be for signs, and for seasons"
  // (Genesis 1:14). Three figures the Scriptures themselves name — "which
  // maketh Arcturus, Orion, and Pleiades" (Job 9:9) — set as brighter
  // stars, the Bear and Orion joined by faint lines, the Pleiades left as
  // the close-knit cluster it is. Revealed, like the stars, only by night.
  // Each figure: a base direction (azimuth/elevation, radians) and star
  // offsets in degrees; `lines` index into its own stars.
  const CONSTELLATIONS = [
    {
      name: 'the Bear', az: 0.45, el: 0.72,
      stars: [[0, 0], [4, 0.4], [4.8, -3.0], [0.6, -3.2], [7.6, 1.6], [10.8, 2.4], [14.4, 1.8]],
      lines: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 5], [5, 6]],
    },
    {
      name: 'Orion', az: 2.65, el: 0.52,
      stars: [[0, 0], [5.4, -0.6], [1.9, -5.2], [2.9, -5.8], [3.9, -6.4], [0.6, -11.4], [5.8, -10.6]],
      lines: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [5, 6]],
    },
    {
      name: 'the Pleiades', az: 2.0, el: 0.92,
      stars: [[0, 0], [0.9, 0.5], [1.6, -0.2], [0.7, -0.9], [-0.5, -0.6], [2.2, 0.6]],
      lines: [],
    },
  ];
  const signPos = [];
  const linePos = [];
  const DEG = Math.PI / 180;
  for (const c of CONSTELLATIONS) {
    const world = c.stars.map(([oa, oe]) => {
      const az = c.az + oa * DEG;
      const el = c.el + oe * DEG;
      return new THREE.Vector3(
        Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az),
      ).multiplyScalar(398);
    });
    for (const w of world) signPos.push(w.x, w.y, w.z);
    for (const [i2, j2] of c.lines) {
      linePos.push(world[i2].x, world[i2].y, world[i2].z, world[j2].x, world[j2].y, world[j2].z);
    }
  }
  const signGeo = new THREE.BufferGeometry();
  signGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(signPos), 3));
  const signStars = new THREE.Points(signGeo, new THREE.PointsMaterial({
    size: 3.6,
    sizeAttenuation: false,
    color: 0xDFE8F5,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  }));
  signStars.renderOrder = -9;
  signStars.visible = false;
  celestial.add(signStars);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePos), 3));
  const signLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
    color: 0x8FA6CC,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  signLines.renderOrder = -9;
  signLines.visible = false;
  celestial.add(signLines);

  // Clouds: one instanced icosahedron forming a few puffy clusters. Each
  // cluster drifts as one body (its puffs bob independently but travel
  // together), because down on the meadow its shadow travels with it.
  // The sun's tilted arc throws every shade north of its cloud by a steady
  // ~0.55 × height, so three tracks are placed for where the shade falls:
  // they sweep the garden's heart, its north band, and its south meadow,
  // while two more clusters keep to the horizon as dressing.
  const clusters = [
    { x: -60, y: 64, z: -34, n: 4, s: 9 },   // shade ≈ z +1
    { x: 85, y: 74, z: -8, n: 3, s: 7 },     // shade ≈ z +32
    { x: -30, y: 82, z: -70, n: 4, s: 8 },   // shade ≈ z −25
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
  {
    let idx = 0;
    for (let ci = 0; ci < clusters.length; ci++) {
      const cl = clusters[ci];
      cl.speed = 0.55 + (ci % 4) * 0.18;
      cl.puffs = [];
      for (let i = 0; i < cl.n; i++) {
        const off = new THREE.Vector3(
          (i - (cl.n - 1) / 2) * cl.s * 0.9,
          (i % 2) * cl.s * 0.22,
          ((i * 37) % 5 - 2) * 1.5,
        );
        sc.set(cl.s * (1 + (i % 3) * 0.25), cl.s * 0.45, cl.s * 0.7);
        q.setFromEuler(new THREE.Euler(0, i * 0.9 + cl.x, 0));
        cl.puffs.push({ idx, off, scale: sc.clone(), quat: q.clone() });
        // A first placement, so even the warm-up frame has its clouds.
        m.compose(p.set(cl.x + off.x, cl.y + off.y, cl.z + off.z), q, sc);
        clouds.setMatrixAt(idx, m);
        idx++;
      }
    }
  }
  scene.add(clouds);

  // Cloud-shadows: under each cluster, one soft gradient disc whose vertices
  // are laid onto the terrain each frame (so the shade rolls over the
  // meadow's rises), cast along the true sun ray — long shade at the golden
  // hours, none once the sun has gone under or the rain has greyed the light.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  {
    const g = shadowCanvas.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.5)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x1E2A16,
    map: new THREE.CanvasTexture(shadowCanvas),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const cloudShadows = [];
  for (const cl of clusters) {
    const geo = new THREE.CircleGeometry(1, 14);
    geo.rotateX(-Math.PI / 2);
    const local = Float32Array.from(geo.attributes.position.array);   // unit-disc offsets
    const mesh = new THREE.Mesh(geo, shadowMat);
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;   // vertices are written in world space
    mesh.visible = false;
    scene.add(mesh);
    cloudShadows.push({ mesh, attr: geo.attributes.position, local, cl, sx: (cl.n * cl.s * 0.9) / 2 + cl.s * 0.7, sz: cl.s * 1.1 });
  }
  // Where each cluster's shade presently stands, for the debug state (and
  // through it the smoke suite, which watches the shade drift).
  const shadeState = clusters.map(() => ({ x: 0, z: 0 }));

  // Rain: "a brief gentle rain", once in a while — thin falling line
  // segments recycled in a drum around the walker. The shower clock runs on
  // its own seeded stream; setRain() overrides it for tests and the curious.
  const RAIN_N = 300;
  const RAIN_H = 17;
  const rainRng = mulberry32(20260706);
  const rainDrops = [];
  for (let i = 0; i < RAIN_N; i++) {
    const a = rainRng() * Math.PI * 2;
    const r = Math.sqrt(rainRng()) * 24;
    rainDrops.push({
      ox: Math.cos(a) * r, oz: Math.sin(a) * r,
      y0: rainRng() * RAIN_H,
      len: 0.35 + rainRng() * 0.3,
      speed: 9 + rainRng() * 3,
    });
  }
  const rainPos = new Float32Array(RAIN_N * 6);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
    color: 0xB9CBDD,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }));
  rain.visible = false;
  rain.frustumCulled = false;   // the drum always surrounds the camera
  scene.add(rain);
  let rainLevel = 0;            // 0 dry → 1 full shower (eased)
  let rainForced = null;        // setRain() override; null returns to the sky's own clock
  let showerIn = 210 + rainRng() * 240;   // first shower keeps its distance
  let showerFor = 0;

  // The one directional light both great lights take turns holding,
  // plus the ambient bounce of sky and ground.
  const greatLight = new THREE.DirectionalLight(0xFFF2D0, 2.35);
  scene.add(greatLight);
  const hemi = new THREE.HemisphereLight(0xBFDCF2, 0x7FA05F, 1.0);
  scene.add(hemi);

  const CLOUD_EMISSIVE_DAY = new THREE.Color(0x8E99A8);
  const CLOUD_EMISSIVE_NIGHT = new THREE.Color(0x1C2433);
  const CLOUD_EMISSIVE_RAIN = new THREE.Color(0x4E5661);
  const RAIN_GREY = new THREE.Color(0x9AA3AC);

  // Reused per-frame scratch — no allocation inside update().
  const cur = { horizon: new THREE.Color(), zenith: new THREE.Color(), light: new THREE.Color() };
  const hemiSky = new THREE.Color(), hemiGround = new THREE.Color();
  const vc = new THREE.Color();
  const sunV = new THREE.Vector3(), moonV = new THREE.Vector3();
  const num = { lightI: 0, hemiI: 0, glow: 0, stars: 0, moon: 0, night: 0 };

  const state = {
    t: START_T, phase: phaseOf(START_T), night: 0, sunElev: 0, rain: 0, wheel: wheel0, shade: shadeState,
    day: 1, sabbath: false, morningStars: 0,
  };
  let t = START_T;
  let elapsed = 0;
  let dayOverride = null;   // setDay() override; null follows the real elapsed clock

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

    // Rain greys the light: sky and lamps dim and flatten with the shower,
    // and come back as it passes.
    if (rainLevel > 0.001) {
      cur.horizon.lerp(RAIN_GREY, 0.28 * rainLevel);
      cur.zenith.lerp(RAIN_GREY, 0.22 * rainLevel);
      num.lightI *= 1 - 0.38 * rainLevel;
      num.hemiI *= 1 - 0.2 * rainLevel;
      num.glow *= 1 - 0.7 * rainLevel;
      num.stars *= 1 - 0.6 * rainLevel;
    }

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

    // Stars breathe in with the dark, and faintly shimmer — swelling
    // together for a few moments right at first light (Job 38:7).
    const dawnSing = dawnSingOf(t);
    state.morningStars = dawnSing;
    const twinkle = 0.92 + 0.08 * Math.sin(elapsed * 2.1)
      + dawnSing * 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 5.0));
    stars.material.opacity = num.stars * twinkle;
    stars.visible = num.stars > 0.02;
    signStars.material.opacity = num.stars * twinkle;
    signStars.visible = stars.visible;
    signLines.material.opacity = num.stars * 0.2;
    signLines.visible = stars.visible;

    cloudMat.emissive.lerpColors(CLOUD_EMISSIVE_DAY, CLOUD_EMISSIVE_NIGHT, num.night);
    if (rainLevel > 0.001) cloudMat.emissive.lerp(CLOUD_EMISSIVE_RAIN, 0.5 * rainLevel);

    state.t = t;
    state.phase = phaseOf(t);
    state.night = num.night;
    state.sunElev = sunV.y;
  }

  function update(dt, walker = null) {
    elapsed += dt;
    t = (t + dt / DAY_LENGTH) % 1;

    // On the seventh day the garden keeps a deeper rest (Genesis 2:2-3):
    // count whole days elapsed (1-indexed, so a fresh visit begins on day
    // one), and every seventh is the Sabbath. `setDay` overrides the count
    // for tests and the curious, independent of the hour it presently is.
    const dayIndex = dayOverride !== null ? dayOverride : Math.floor(elapsed / DAY_LENGTH);
    state.day = dayIndex + 1;
    state.sabbath = state.day % WEEK_DAYS === 0;

    // The shower clock: long dry spells, a brief gentle rain, eased edges.
    // A forced level (setRain) eases in faster, so tests never idle.
    let target;
    if (rainForced !== null) {
      target = rainForced;
    } else {
      if (showerFor > 0) {
        showerFor -= dt;
        if (showerFor <= 0) showerIn = 210 + rainRng() * 260;
      } else if ((showerIn -= dt) <= 0) {
        showerFor = 22 + rainRng() * 18;
      }
      target = showerFor > 0 ? 1 : 0;
    }
    rainLevel = damp(rainLevel, target, rainForced !== null ? 1.1 : 0.25, dt);
    if (target === 0 && rainLevel < 0.001) rainLevel = 0;

    apply();

    // The firmament wheels slowly about its pole through the long year.
    state.wheel = wheel0 + elapsed * WHEEL_RATE;
    celestial.quaternion.setFromAxisAngle(POLE, state.wheel);

    // Each cluster drifts as one body; its puffs bob individually.
    for (const cl of clusters) {
      cl.driftX = ((cl.x + elapsed * 0.35 * cl.speed + 160) % 320) - 160;
      for (const puff of cl.puffs) {
        p.set(
          cl.driftX + puff.off.x + Math.sin(elapsed * 0.02 * cl.speed + puff.idx) * 6,
          cl.y + puff.off.y,
          cl.z + puff.off.z,
        );
        m.compose(p, puff.quat, puff.scale);
        clouds.setMatrixAt(puff.idx, m);
      }
    }
    clouds.instanceMatrix.needsUpdate = true;

    // Lay each cluster's shade onto the meadow along the true sun ray —
    // long shade at the golden hours, none by night or under full rain.
    const shadowSun = smoothstep(0.1, 0.3, sunV.y);
    shadowMat.opacity = 0.19 * shadowSun * (1 - 0.75 * rainLevel);
    const shadowsOn = shadowMat.opacity > 0.005;
    for (let si = 0; si < cloudShadows.length; si++) {
      const sh = cloudShadows[si];
      sh.mesh.visible = shadowsOn;
      if (!shadowsOn) continue;
      const cl = sh.cl;
      let offX = -(sunV.x / sunV.y) * cl.y;
      let offZ = -(sunV.z / sunV.y) * cl.y;
      const offLen = Math.hypot(offX, offZ);
      if (offLen > 70) { offX *= 70 / offLen; offZ *= 70 / offLen; }
      shadeState[si].x = cl.driftX + offX;
      shadeState[si].z = cl.z + offZ;
      const arr = sh.attr.array;
      for (let v = 0; v < arr.length; v += 3) {
        const wx = shadeState[si].x + sh.local[v] * sh.sx;
        const wz = shadeState[si].z + sh.local[v + 2] * sh.sz;
        arr[v] = wx;
        arr[v + 1] = Math.max(heightAt(wx, wz), -0.45) + 0.12;
        arr[v + 2] = wz;
      }
      sh.attr.needsUpdate = true;
    }

    // The rain's drum of drops rides with the walker.
    rain.visible = rainLevel > 0.015;
    if (rain.visible) {
      rain.material.opacity = 0.38 * rainLevel;
      if (walker) rain.position.set(walker.x, walker.y - 3, walker.z);
      for (let i = 0; i < RAIN_N; i++) {
        const d = rainDrops[i];
        const y = RAIN_H - ((elapsed * d.speed + d.y0) % RAIN_H);
        const o = i * 6;
        rainPos[o] = d.ox; rainPos[o + 1] = y + d.len; rainPos[o + 2] = d.oz;
        rainPos[o + 3] = d.ox; rainPos[o + 4] = y; rainPos[o + 5] = d.oz;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    state.rain = rainLevel;
    return state;
  }

  // Call the rain or send it away — 1 (or true) summons it, 0 dismisses it,
  // null hands the sky back its own clock. For tests and the curious.
  function setRain(v) {
    if (v === null || v === undefined) rainForced = null;
    else rainForced = clamp(v === true ? 1 : v === false ? 0 : +v || 0, 0, 1);
    return state;
  }

  // Jump straight to a given day (1-indexed) — for tests, and the curious
  // who don't want to wait six days for the seventh. `null` hands the count
  // back to the real elapsed clock.
  function setDay(v) {
    if (v === null || v === undefined) dayOverride = null;
    else dayOverride = Math.max(0, Math.floor(v) - 1);
    state.day = (dayOverride !== null ? dayOverride : Math.floor(elapsed / DAY_LENGTH)) + 1;
    state.sabbath = state.day % WEEK_DAYS === 0;
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
  return { update, setTime, setRain, setDay, state, constellations: CONSTELLATIONS.map(c => c.name) };
}
