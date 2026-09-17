// "Yea, the sparrow hath found an house, and the swallow a nest for herself"
// (Psalm 84:3). One swallow has kept a nest in the sacred trees since v15
// (scenes/nests.js). These are the rest of them, and they are doing the other
// thing swallows are known for: at evening they come down onto the river and
// work it end to end, running the length of the water in long low beats,
// rising off it, swinging back, and dropping again — and at the bottom of
// each beat one of them touches the surface and leaves a ring behind it.
//
// The path is written against the river itself rather than across a straight
// line near it: each swallow's x runs up and down a stretch of the course and
// its z is taken from riverZ at that x, so the low point of every beat is on
// open water by construction and never out over a bank.
//
// They are not namable. Like the eagle and the owl, they never come to rest
// where anyone could stand and wait on them — and the swallow who did find a
// nest already answers to Deror over in the branches.
//
// Two draw calls: one instanced mesh for the birds, one for the rings. Both
// are hidden outright for the rest of the day.

import * as THREE from 'three';
import { riverZ, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32, clamp, smoothstep } from '../util.js';

const COUNT = 5;
const RINGS = 6;            // recycled pool — one beat's touch at a time
const RING_LIFE = 1.6;      // seconds a ring takes to widen away
const WATER_Y = -0.5;       // the river's own surface (scenes/water.js)
const TOUCH_H = 0.11;       // how close the bottom of a beat comes to it
const CRUISE_H = 2.9;       // and how high the top of one gets
const REACH = { min: -38, max: 16 };   // the upstream course, west of the parting

const BACK = new THREE.Color(0x27305A);
const BACK_HI = new THREE.Color(0x3C4A7E);
const THROAT = new THREE.Color(0xB5643E);
const BELLY = new THREE.Color(0xE4DCCA);

// How far into their hour the swallows are, 0 (none) to 1 (the whole company
// on the water), from the sky's own clock. It opens as the light goes long
// and closes in the dusk, well after the day's heat and well before the deep
// of the night. Pure, so a test can ask the same question the birds answer.
export function swallowOf(cycleT) {
  const t = ((cycleT % 1) + 1) % 1;
  return smoothstep(0.43, 0.5, t) * (1 - smoothstep(0.63, 0.7, t));
}

// A swallow, built once and shared by every instance: a slim dark body, two
// wings held swept and still — a bird working a river holds them out rather
// than beating them — and the forked tail that is the whole silhouette.
function swallowGeometry() {
  const parts = [];
  parts.push({
    geo: new THREE.CapsuleGeometry(0.055, 0.2, 3, 6)
      .toNonIndexed()
      .rotateX(Math.PI / 2),
    color: BACK,
  });
  parts.push({
    geo: new THREE.SphereGeometry(0.055, 6, 5).toNonIndexed().translate(0, 0.01, 0.16),
    color: BACK_HI,
  });
  parts.push({
    geo: new THREE.SphereGeometry(0.036, 5, 4)
      .toNonIndexed()
      .scale(1, 0.7, 1)
      .translate(0, -0.03, 0.17),
    color: THROAT,
  });
  parts.push({
    geo: new THREE.SphereGeometry(0.045, 5, 4)
      .toNonIndexed()
      .scale(1, 0.5, 1.5)
      .translate(0, -0.05, 0.02),
    color: BELLY,
  });
  // The wings: long, thin, and swept back from the shoulder.
  for (const side of [-1, 1]) {
    parts.push({
      geo: new THREE.ConeGeometry(0.07, 0.42, 3)
        .toNonIndexed()
        .scale(1, 1, 0.22)               // flattened into a blade
        .rotateZ(Math.PI / 2 * side)     // out to the side, apex outboard
        .rotateY(side * 0.55)            // and swept back off the shoulder
        .translate(side * 0.22, 0.02, -0.04),
      color: BACK,
    });
  }
  // The fork.
  for (const side of [-1, 1]) {
    parts.push({
      geo: new THREE.ConeGeometry(0.03, 0.22, 3)
        .toNonIndexed()
        .scale(1, 1, 0.3)
        .rotateX(-Math.PI / 2)
        .rotateY(side * 0.22)
        .translate(side * 0.025, 0, -0.22),
      color: BACK,
    });
  }
  const merged = mergeColored(parts);
  for (const part of parts) part.geo.dispose();
  return merged;
}

export function createSwallows(scene) {
  // Own seeded stream: birds given their own stretch of an existing river
  // shift nothing already planted.
  const rng = mulberry32(20260835);

  const mesh = new THREE.InstancedMesh(
    swallowGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    COUNT,
  );
  mesh.frustumCulled = false;   // the company works the whole length of the river
  mesh.visible = false;
  scene.add(mesh);

  const ringMesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.6, 1, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false }),
    RINGS,
  );
  ringMesh.frustumCulled = false;
  ringMesh.visible = false;
  scene.add(ringMesh);

  const FOAM = new THREE.Color(0xF0FAFD);
  const WATER = new THREE.Color(0x4E8FB8);

  const birds = [];
  for (let i = 0; i < COUNT; i++) {
    // Each keeps its own stretch, its own width of swing off the centre, and
    // its own pace — they work the river together but never in step.
    const cx = REACH.min + ((i + 0.5) / COUNT) * (REACH.max - REACH.min) + (rng() - 0.5) * 3;
    birds.push({
      cx,
      span: 7.5 + rng() * 5,        // how far up and down its stretch it runs
      swing: 3.2 + rng() * 3,       // and how wide it swings off the water
      theta: rng() * Math.PI * 2,
      rate: 0.5 + rng() * 0.26,     // radians a second round its own beat
      dir: rng() < 0.5 ? -1 : 1,
      touched: false,
    });
  }

  const rings = [];
  for (let i = 0; i < RINGS; i++) rings.push({ age: RING_LIFE, x: 0, z: 0 });
  let nextRing = 0;

  // Where a swallow is at a point on its own beat. The dip falls at theta 0
  // and PI, where the swing across the course is zero — so the bottom of a
  // beat is always over the centre of the water, whatever the river is doing
  // at that x.
  function posAt(S, theta) {
    const x = S.cx + Math.cos(theta) * S.span;
    const z = riverZ(x) + Math.sin(theta) * S.swing;
    const d = Math.abs(Math.sin(theta));
    const y = WATER_Y + TOUCH_H + (CRUISE_H - TOUCH_H) * Math.pow(d, 0.65);
    return { x, y, z };
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const rs = new THREE.Vector3();
  const rq = new THREE.Quaternion();
  const c = new THREE.Color();

  let here = 0;
  let touches = 0;

  function update(dt, cycleT = 0.075) {
    here = swallowOf(cycleT);
    const out = here > 0.01;
    mesh.visible = out;
    ringMesh.visible = out;
    if (!out) return;

    for (let i = 0; i < COUNT; i++) {
      const S = birds[i];
      S.theta += S.rate * S.dir * dt;

      const at = posAt(S, S.theta);
      // Heading, pitch and bank all come off two more samples a little way
      // along the same beat — no stored previous position to go stale when
      // the hour is skipped about with __world.setTime().
      const ahead = posAt(S, S.theta + 0.03 * S.dir);
      const further = posAt(S, S.theta + 0.06 * S.dir);
      const dx = ahead.x - at.x, dy = ahead.y - at.y, dz = ahead.z - at.z;
      const flat = Math.hypot(dx, dz) || 1e-5;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, flat);
      const yawAhead = Math.atan2(further.x - ahead.x, further.z - ahead.z);
      let turn = yawAhead - yaw;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      const roll = clamp(-turn * 9, -0.9, 0.9);

      p.set(at.x, at.y, at.z);
      e.set(pitch, yaw, roll, 'YXZ');
      m.compose(p, q.setFromEuler(e), s);
      mesh.setMatrixAt(i, m);

      // The touch: at the bottom of the beat, and only over open water.
      const low = Math.abs(Math.sin(S.theta));
      if (low > 0.3) S.touched = false;
      else if (low < 0.05 && !S.touched && riverEdgeDist(at.x, at.z) <= 0.01) {
        S.touched = true;
        touches++;
        const r = rings[nextRing];
        nextRing = (nextRing + 1) % RINGS;
        r.age = 0;
        r.x = at.x;
        r.z = at.z;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < RINGS; i++) {
      const r = rings[i];
      if (r.age < RING_LIFE) r.age += dt;
      const u = clamp(r.age / RING_LIFE, 0, 1);
      // A ring off a wingtip is a smaller thing than a ring off a foot
      // (scenes/wake.js) — it opens quickly and is gone.
      const size = u >= 1 ? 0 : 0.12 + u * 0.7;
      rs.set(size, 1, size);
      rq.identity();
      m.compose(p.set(r.x, WATER_Y + 0.14, r.z), rq, rs);
      ringMesh.setMatrixAt(i, m);
      c.copy(FOAM).lerp(WATER, u);
      ringMesh.setColorAt(i, c);
    }
    ringMesh.instanceMatrix.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  }

  update(0, 0.075);

  return {
    update,
    state: () => ({
      count: COUNT,
      here: clamp(here, 0, 1),
      touches,
      birds: birds.map(S => ({ x: S.cx, span: S.span })),
    }),
  };
}
