// "The wilderness and the solitary place shall be glad for them; and the
// desert shall rejoice, and blossom as the rose. It shall blossom
// abundantly, and rejoice even with joy and singing" (Isaiah 35:1-2).
//
// Wherever the walker goes, the ground answers him. Flowers spring up out of
// the grass and the sand around his feet as he passes, open wide — a little
// too wide, for joy — and stand open behind him for half a minute and
// more, so he can turn and see the way he came written across the meadow
// in colour.
// Then each one closes back into a bud and sinks into the grass again, and
// the ground is ready for him to come that way once more. Stand still in the
// open and the blossoming spreads out from him in a widening ring. The one
// who walks with him leaves a lighter trail of their own, so a first-time
// visitor sees it happen before they have even moved. A note sounds now and then as the
// flowers open — the singing.
//
// One draw call. Every flower is an instance of one small merged mesh, and
// the whole life of a flower (rising, opening, holding, closing, sinking) is
// worked out on the graphics chip from the moment it was born: the frame
// loop only writes a slot when a new flower comes up, never to animate one.
// Nothing is placed at build time, so the garden's planting is untouched;
// this module draws only from its own seeded stream, and only as he walks.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32, smoothstep } from '../util.js';

// Big enough that every flower lives out its whole life before its slot is
// taken again, even with him at his quick pace (4.6 m/s → ~14 a second) and
// the companion walking too (~3 a second): 17 × LIFE 45 s ≈ 765.
const POOL = 1600;             // flowers alive at once, recycled oldest-first
const STEP = 1.0;              // metres walked between each little burst
const PER_STEP = 3;            // flowers in each of his bursts
const PER_STEP_OTHER = 1;      // …and in the companion's, a lighter trail
const NEAR = [0.45, 2.2];      // how far from his feet they come up
const JUMP = 3;                // a move longer than this in one frame is a teleport

const RISE = 0.55;             // seconds to come up out of the ground
const OPEN_AT = 0.3;           // …starting to open this far in
const OPEN = 0.95;             // seconds to open
const HOLD = 32;               // seconds standing open
const CLOSE = 10;              // seconds closing back into a bud
const SINK = 3;                // seconds sinking back into the grass
const LIFE = HOLD + CLOSE + SINK;

const STILL_SPEED = 0.25;      // m/s; slower than this he is standing
const RING_AFTER = 1.2;        // seconds standing before the ring begins
const RING_FOR = 7;            // seconds it goes on spreading
const RING_R = [1.2, 5.6];     // from this near to this far
const RING_RATE = 6;           // flowers a second while it spreads

const NOTE_STEP = 1.9;         // metres of blossoming between notes
const RING_NOTE = 0.75;        // seconds between notes while the ring spreads
const SCALE = 10;              // notes in the singing's own scale (see audio.js)

// The colours of the flowers, petal by petal; the stems and hearts are their own.
const TINTS = [0xF4A7B9, 0xFFF4E4, 0xF6D26B, 0xC9B3F0, 0xF7A47E, 0xA9CBF5, 0xF59AC0]
  .map(c => new THREE.Color(c));
const STEM = new THREE.Color(0x5E9A48);
const HEART = new THREE.Color(0xF2C14E);
const PETAL = new THREE.Color(0xFFFFFF);

const PETALS = 5;
const HEAD_Y = 0.27;

// One flower, open, standing at the origin: a short stem, five kite petals
// laid out round a small gold heart. `aPetal` marks the petal vertices, which
// are the only ones that fold up into a bud and take the flower's own colour.
function flowerGeometry() {
  const parts = [];
  const flags = [];
  const stem = new THREE.CylinderGeometry(0.011, 0.016, HEAD_Y, 3, 1, true).toNonIndexed()
    .translate(0, HEAD_Y / 2, 0);
  parts.push({ geo: stem, color: STEM });
  flags.push(0, stem.attributes.position.count);
  for (let k = 0; k < PETALS; k++) {
    const a = (k / PETALS) * Math.PI * 2;
    const at = (r, da) => [Math.cos(a + da) * r, HEAD_Y + 0.02 * (r / 0.22), Math.sin(a + da) * r];
    const inner = at(0.03, 0), left = at(0.12, -0.36), right = at(0.12, 0.36), tip = at(0.22, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...inner, ...tip, ...left, ...inner, ...right, ...tip], 3));
    parts.push({ geo: g, color: PETAL });
    flags.push(1, 6);
  }
  const heart = new THREE.ConeGeometry(0.05, 0.05, 5, 1, true).toNonIndexed().translate(0, HEAD_Y + 0.035, 0);
  parts.push({ geo: heart, color: HEART });
  flags.push(0, heart.attributes.position.count);

  const geo = mergeColored(parts);
  for (const p of parts) p.geo.dispose();
  const petal = new Float32Array(geo.attributes.position.count);
  let v = 0;
  for (let i = 0; i < flags.length; i += 2) {
    petal.fill(flags[i], v, v + flags[i + 1]);
    v += flags[i + 1];
  }
  geo.setAttribute('aPetal', new THREE.BufferAttribute(petal, 1));
  return geo;
}

// solids: the garden's rock, as circles on the ground (footing.js) — no
// flower comes up inside a crag.
export function createBlossom(scene, solids = []) {
  // Own seeded stream, drawn from only as he walks: nothing planted shifts.
  const rng = mulberry32(20260850);

  const geo = flowerGeometry();
  const born = new Float32Array(POOL).fill(-1e6);
  const tint = new Float32Array(POOL * 3);
  const bornAttr = new THREE.InstancedBufferAttribute(born, 1);
  const tintAttr = new THREE.InstancedBufferAttribute(tint, 3);
  bornAttr.setUsage(THREE.DynamicDrawUsage);
  tintAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aBorn', bornAttr);
  geo.setAttribute('aTint', tintAttr);

  const uTime = { value: 0 };
  const uGlow = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uGlow = uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute float aBorn;
        attribute float aPetal;
        attribute vec3 aTint;
        varying float vPetal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float age = uTime - aBorn;
          float grow = smoothstep(0.0, ${RISE.toFixed(3)}, age)
            * (1.0 - smoothstep(${(LIFE - SINK).toFixed(3)}, ${LIFE.toFixed(3)}, age));
          float u = clamp((age - ${OPEN_AT.toFixed(3)}) / ${OPEN.toFixed(3)}, 0.0, 1.0);
          float b = u - 1.0;
          float open = (1.0 + 2.70158 * b * b * b + 1.70158 * b * b)
            * (1.0 - smoothstep(${HOLD.toFixed(3)}, ${(HOLD + CLOSE).toFixed(3)}, age));
          float r = length(transformed.xz);
          vec3 bud = vec3(transformed.x * 0.22, transformed.y + r * 0.95, transformed.z * 0.22);
          vec3 p = mix(transformed, mix(bud, transformed, open), aPetal);
          p.x += sin(uTime * 1.6 + aBorn * 7.3) * 0.022 * p.y / ${HEAD_Y.toFixed(3)};
          transformed = p * grow;
          vPetal = aPetal * clamp(open, 0.0, 1.0);   // only open petals glow
        }`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor.rgb = mix(vColor.rgb, aTint, aPetal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uGlow;
        varying float vPetal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uGlow * vPetal;`);
  };
  material.customProgramCacheKey = () => 'blossom';

  const mine = new Uint8Array(POOL);   // 1 where the flower came up under his own feet

  const mesh = new THREE.InstancedMesh(geo, material, POOL);
  mesh.frustumCulled = false;   // the instances are spread far past the base flower's bounds
  mesh.count = 0;               // only the slots ever filled are drawn (see sprout)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  let clock = 0;
  let next = 0;                // the next slot to fill (always the oldest)
  let spawned = 0;
  let byWalker = 0;
  let dirtyFrom = 0;           // the run of slots written this frame
  let dirtyN = 0;

  // Can a flower come up here? On ground — grass or sand — but not in the
  // water and not inside the rock. (Only the river's own edge says where the
  // water is: the meadow just south of the trees lies lower than the river's
  // surface and is dry ground all the same.)
  function ground(x, z) {
    if (riverEdgeDist(x, z) < 0.3) return false;
    for (const s of solids) if (s && Math.hypot(x - s.x, z - s.z) < s.r) return false;
    return true;
  }

  function sprout(x, z, his) {
    if (!ground(x, z)) return false;
    const i = next;
    next = (next + 1) % POOL;
    if (dirtyN === 0) dirtyFrom = i;
    dirtyN++;
    mine[i] = his ? 1 : 0;
    _p.set(x, heightAt(x, z) - 0.02, z);
    _q.setFromAxisAngle(UP, rng() * Math.PI * 2);
    _s.setScalar(0.8 + rng() * 0.65);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    const c = TINTS[Math.floor(rng() * TINTS.length)];
    tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
    // A shade younger or older, so a burst never opens in lockstep.
    born[i] = clock - rng() * 0.18;
    spawned++;
    mesh.count = Math.min(POOL, spawned);   // the pool fills from slot 0 in order
    return true;
  }

  function burst(x, z, n, his) {
    let got = 0;
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2;
      const r = NEAR[0] + Math.sqrt(rng()) * (NEAR[1] - NEAR[0]);
      if (sprout(x + Math.cos(a) * r, z + Math.sin(a) * r, his)) got++;
    }
    return got;
  }

  // The walkers: the one the visitor guides (index 0, the only one who sings
  // and the only one whose stillness spreads a ring), and whoever else walks
  // the garden with him.
  const walkers = [];
  function walker(pos) {
    const w = { pos, last: null, travel: 0, speed: 0, still: 0 };
    walkers.push(w);
    return w;
  }
  const main = walker(null);

  // The singing: a slow wandering melody, one note at a time.
  let note = 4;
  let notes = 0;
  let toNote = NOTE_STEP;
  let ringNote = 0;
  function sing(rise) {
    if (rise) note = note + 1 > SCALE - 1 ? 4 : note + 1;
    else {
      const stepBy = [-2, -1, -1, 1, 1, 2][Math.floor(rng() * 6)];
      note = Math.max(0, Math.min(SCALE - 1, note + stepBy));
      if (note === 0 || note === SCALE - 1) note = 4;
    }
    notes++;
  }

  let ringLeft = 0;
  let ringing = false;
  let ringGot = 0;             // flowers the ring has brought up since its last note

  function update(dt, playerPos, night = 0) {
    clock += dt;
    uTime.value = clock;
    uGlow.value = 0.55 * night;
    main.pos = playerPos;

    for (const w of walkers) {
      if (!w.pos) continue;
      if (!w.last) { w.last = { x: w.pos.x, z: w.pos.z }; continue; }
      const moved = Math.hypot(w.pos.x - w.last.x, w.pos.z - w.last.z);
      w.last.x = w.pos.x; w.last.z = w.pos.z;
      if (moved > JUMP) { w.travel = 0; w.still = 0; w.speed = 0; continue; }
      w.speed += (moved / Math.max(dt, 1e-4) - w.speed) * Math.min(1, dt * 10);
      w.still = w.speed < STILL_SPEED ? w.still + dt : 0;
      w.travel += moved;
      while (w.travel >= STEP) {
        w.travel -= STEP;
        const got = burst(w.pos.x, w.pos.z, w === main ? PER_STEP : PER_STEP_OTHER, w === main);
        if (w === main && got) {
          byWalker += got;
          toNote -= STEP;
          if (toNote <= 0) { toNote += NOTE_STEP; if (rng() < 0.8) sing(false); }
        }
      }
    }

    // Standing still in the open, the blossoming spreads out round him.
    const p = main.pos;
    if (p && main.still >= RING_AFTER && main.still < RING_AFTER + RING_FOR) {
      const u = (main.still - RING_AFTER) / RING_FOR;
      // From the bottom of the scale, one step up per note: RING_FOR / RING_NOTE
      // is nine notes, so the climb reaches the top just as the ring ends.
      if (!ringing) { ringing = true; note = 0; ringNote = RING_NOTE; ringGot = 0; }
      ringLeft += dt * RING_RATE;
      while (ringLeft >= 1) {
        ringLeft -= 1;
        const a = rng() * Math.PI * 2;
        const r = RING_R[0] + (RING_R[1] - RING_R[0]) * u + (rng() - 0.5) * 0.9;
        if (sprout(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, true)) { byWalker++; ringGot++; }
      }
      ringNote -= dt;
      if (ringNote <= 0) {
        ringNote = RING_NOTE;
        // Only sung when flowers have truly come up (none do in the water).
        if (ringGot > 0) sing(true);
        ringGot = 0;
      }
    } else {
      ringing = false;
      ringLeft = 0;
    }

    // Upload only the run of slots written this frame, not the whole pool —
    // unless the run wrapped past the end, when the whole of it goes.
    if (dirtyN > 0) {
      const wrapped = dirtyFrom + dirtyN > POOL;
      for (const attr of [mesh.instanceMatrix, bornAttr, tintAttr]) {
        attr.clearUpdateRanges();
        if (!wrapped) attr.addUpdateRange(dirtyFrom * attr.itemSize, dirtyN * attr.itemSize);
        attr.needsUpdate = true;
      }
      dirtyN = 0;
    }
  }

  // How open a flower born `age` seconds ago stands, 0..1 — the shader's own
  // curve, minus the overshoot, for the state accessor.
  function openOf(age) {
    return smoothstep(OPEN_AT, OPEN_AT + OPEN, age) * (1 - smoothstep(HOLD, HOLD + CLOSE, age));
  }

  function state() {
    let open = 0, his = 0;
    for (let i = 0; i < POOL; i++) {
      if (openOf(clock - born[i]) > 0.5) { open++; if (mine[i]) his++; }
    }
    return {
      open, mine: his, spawned, byWalker, notes, note,
      ringing,
    };
  }

  // Read every frame by main.js, so it costs nothing: no count, no allocation.
  const sung = { notes: 0, note: 0 };
  function song() {
    sung.notes = notes;
    sung.note = note;
    return sung;
  }

  return {
    update, state, song,
    // Anyone else walking the garden leaves flowers too (main.js adds the
    // companion), but only the walker sings.
    alsoWalking: pos => { walker(pos); },
  };
}
