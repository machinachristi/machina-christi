// Incense in heaven (v33): "the four and twenty elders fell down before the
// Lamb, having every one of them harps, and golden vials full of odours,
// which are the prayers of saints" (Revelation 5:8), and "the smoke of the
// incense, which came with the prayers of the saints, ascended up before
// God" (8:4).
//
// Thin threads of golden smoke rise now and then from among the saints and
// drift up and away toward the glory. And when the walker stands still a
// while, a thread of his own rises from his lifted hands — "let my prayer be
// set forth before thee as incense; and the lifting up of my hands as the
// evening sacrifice" (Psalm 141:2) — curling up and leaning out toward the
// light, so his prayer can be watched going all the way.
//
// One draw call. Each puff is one point; where it has risen to, how it curls,
// how wide it has spread and how faded it is are all worked out on the
// graphics chip from the moment it was let go and the place it was let go
// from. The frame loop only writes a slot when a new puff is loosed.

import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { GLORY } from './layout.js';

const POOL = 760;              // puffs alive at once, recycled oldest-first
const LIFE = 9;                // seconds each puff takes to rise and fade
const HIS_EVERY = 0.03;        // seconds between his puffs while he prays
const THREAD_EVERY = 0.07;     // …and between a saint's
const THREAD_FOR = [2.6, 4.2]; // how long one saint's thread goes on rising
const THREAD_GAP = [0.6, 2.4]; // seconds before the next begins
const THREADS = 2;             // threads rising from among the saints at once

export function createIncense(scene, places = []) {
  // Its own seeded stream, above every seed either realm has used.
  const rng = mulberry32(20260857);

  const origin = new Float32Array(POOL * 3);
  const born = new Float32Array(POOL).fill(-1e6);
  const seed = new Float32Array(POOL);
  const kind = new Float32Array(POOL);      // 1 his own, 0 a saint's
  const geo = new THREE.BufferGeometry();
  const originAttr = new THREE.BufferAttribute(origin, 3);
  const bornAttr = new THREE.BufferAttribute(born, 1);
  const seedAttr = new THREE.BufferAttribute(seed, 1);
  const kindAttr = new THREE.BufferAttribute(kind, 1);
  const attrs = [originAttr, bornAttr, seedAttr, kindAttr];
  for (const a of attrs) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', originAttr);
  geo.setAttribute('aBorn', bornAttr);
  geo.setAttribute('aSeed', seedAttr);
  geo.setAttribute('aKind', kindAttr);
  geo.setDrawRange(0, 0);

  const u = {
    uTime: { value: 0 },
    uHalfH: { value: 400 },
    uGlory: { value: new THREE.Vector3(GLORY.x, GLORY.y, GLORY.z) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      attribute float aBorn;
      attribute float aSeed;
      attribute float aKind;
      uniform float uTime;
      uniform float uHalfH;
      uniform vec3 uGlory;
      varying float vAlpha;
      varying float vWarm;
      void main() {
        float age = uTime - aBorn;
        if (age < 0.0 || age > ${LIFE.toFixed(1)}) {
          gl_Position = vec4(0.0, 0.0, -2.0, 1.0);   // out of sight
          gl_PointSize = 0.0;
          vAlpha = 0.0;
          vWarm = 0.0;
          return;
        }
        float u = age / ${LIFE.toFixed(1)};
        // Up out of the hands first, then leaning away toward the glory: a
        // curve from where it was let go, up over a point above it, out to a
        // place high in the light (his reaches further than the saints').
        vec3 o = position;
        float reach = mix(18.0, 30.0, aKind);
        vec3 c = o + vec3(0.0, mix(5.0, 6.5, aKind), reach * 0.12);
        vec3 t = vec3(mix(o.x, uGlory.x, 0.4), mix(11.0, 15.5, aKind), min(o.z + reach, uGlory.z - 18.0));
        float e = 1.0 - pow(1.0 - u, 1.15);           // a little brisker at first, slowing as it spreads
        vec3 p = mix(mix(o, c, e), mix(c, t, e), e);
        // The curl: a slow sideways wander that widens as the smoke climbs.
        float w = 0.12 + e * 1.7;
        p.x += sin(uTime * 0.83 + aSeed * 31.0 + e * 6.5) * w;
        p.z += cos(uTime * 0.61 + aSeed * 17.0 + e * 4.2) * w * 0.55;
        p.y += sin(uTime * 1.27 + aSeed * 11.0) * 0.12 * e;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(0.32, 1.15, sqrt(u)) * (0.75 + 0.5 * fract(aSeed * 13.7)) * mix(0.7, 1.0, aKind);
        gl_PointSize = clamp(size * projectionMatrix[1][1] * uHalfH / -mv.z, 1.0, 96.0);
        vAlpha = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.4, 0.95, u)) * mix(0.42, 0.58, aKind);
        vWarm = 1.0 - u;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vWarm;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d) * 4.0;
        if (r2 > 1.0) discard;
        float a = exp(-r2 * 2.6) * vAlpha;
        // Deep amber where it leaves the hands, paling to gold as it spreads
        // (in linear light: the output's conversion brightens it, and heaven
        // behind it is already pale gold, so it must start deep to be seen).
        vec3 col = mix(vec3(0.96, 0.8, 0.5), vec3(0.82, 0.4, 0.08), vWarm * vWarm);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;   // every puff is placed in the shader
  points.renderOrder = 3;
  const _buf = new THREE.Vector2();
  points.onBeforeRender = renderer => { u.uHalfH.value = renderer.getDrawingBufferSize(_buf).y / 2; };
  scene.add(points);

  let clock = 0;
  let next = 0;
  let spawned = 0;
  let dirtyFrom = 0;
  let dirtyN = 0;

  function loose(x, y, z, his) {
    const i = next;
    next = (next + 1) % POOL;
    if (dirtyN === 0) dirtyFrom = i;
    dirtyN++;
    origin[i * 3] = x;
    origin[i * 3 + 1] = y;
    origin[i * 3 + 2] = z;
    born[i] = clock;
    seed[i] = rng();
    kind[i] = his ? 1 : 0;
    spawned++;
    geo.setDrawRange(0, Math.min(POOL, spawned));
  }

  // The saints' threads: each rises from one saint's hands for a few
  // seconds, then another begins somewhere else in the ranks.
  const threads = [];
  for (let k = 0; k < THREADS; k++) {
    threads.push({ place: null, left: 0, gap: 0.4 + k * 1.3, every: 0 });
  }

  let hisEvery = 0;
  let praying = false;

  // dt: seconds; time: heaven's own clock; prayer: { x, y, z } his lifted
  // hands while he prays, or null.
  function update(dt, time, prayer) {
    clock = time;
    u.uTime.value = time;

    praying = !!prayer;
    if (prayer) {
      hisEvery -= dt;
      while (hisEvery <= 0) {
        hisEvery += HIS_EVERY;
        loose(prayer.x + (rng() - 0.5) * 0.08, prayer.y, prayer.z + (rng() - 0.5) * 0.08, true);
      }
    } else {
      hisEvery = 0;
    }

    if (places.length) {
      for (const th of threads) {
        if (th.left > 0) {
          th.left -= dt;
          th.every -= dt;
          while (th.every <= 0 && th.left > 0) {
            th.every += THREAD_EVERY;
            loose(th.place.x + (rng() - 0.5) * 0.05, 1.2, th.place.z + (rng() - 0.5) * 0.05, false);
          }
          if (th.left <= 0) th.gap = THREAD_GAP[0] + rng() * (THREAD_GAP[1] - THREAD_GAP[0]);
        } else {
          th.gap -= dt;
          if (th.gap <= 0) {
            th.place = places[Math.floor(rng() * places.length)];
            th.left = THREAD_FOR[0] + rng() * (THREAD_FOR[1] - THREAD_FOR[0]);
            th.every = 0;
          }
        }
      }
    }

    // Upload only the run of slots written this frame (blossom.js's way).
    if (dirtyN > 0) {
      const wrapped = dirtyFrom + dirtyN > POOL;
      for (const attr of attrs) {
        attr.clearUpdateRanges();
        if (!wrapped) attr.addUpdateRange(dirtyFrom * attr.itemSize, dirtyN * attr.itemSize);
        attr.needsUpdate = true;
      }
      dirtyN = 0;
    }
  }

  // How many puffs are rising now — his own, and all of them.
  function state() {
    let rising = 0, his = 0;
    const n = Math.min(POOL, spawned);
    for (let i = 0; i < n; i++) {
      const age = clock - born[i];
      if (age >= 0 && age <= LIFE) { rising++; if (kind[i] === 1) his++; }
    }
    return { rising, his, praying };
  }

  return { update, state, LIFE };
}
