// "Yea, the stork in the heaven knoweth her appointed times; and the
// turtle and the crane and the swallow observe the time of their coming"
// (Jeremiah 8:7) — once each morning a skein of cranes crosses high
// overhead, west to east, and is gone, keeping its own appointed time the
// way the whole garden already keeps its hours (scenes/sky.js). A pure
// function of the sky's own clock, the same idiom as the quail's one hour
// (scenes/creatures.js's quailOf) — no state, no seed for the timing.

import * as THREE from 'three';
import { GARDEN_RADIUS } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 9;
const FROM = 0.1;     // shortly after the morning mist lifts
const SPAN = 0.045;   // how much of the day the crossing takes
const HEIGHT = 15;
const CROSS = GARDEN_RADIUS * 2.6;

// Where the skein presently stands in its crossing: 0 (not yet risen) to 1
// (passed beyond the far rim).
export function craneOf(t) {
  const w = (t - FROM + 1) % 1;
  if (w >= SPAN) return { presence: 0, u: 0 };
  return { presence: 1, u: w / SPAN };
}

export function createCranes(scene) {
  // Own seeded stream: the skein's own shallow-V spacing shifts nothing
  // already planted.
  const rng = mulberry32(20260742);

  const mesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.09, 0.55, 3),
    new THREE.MeshLambertMaterial({ color: 0x9AA79E, flatShading: true }),
    COUNT,
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  const offsets = [];
  for (let i = 0; i < COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const rank = Math.ceil(i / 2);
    offsets.push({ across: side * rank * 1.15, back: rank * 0.95, bob: rng() * Math.PI * 2 });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  let t = 0;
  let lastPresence = 0;

  function update(dt, cycleT = 0.1) {
    t += dt;
    const c = craneOf(cycleT);
    lastPresence = c.presence;
    mesh.visible = c.presence > 0;
    if (!mesh.visible) return;
    const along = -CROSS / 2 + c.u * CROSS;
    q.setFromAxisAngle(Z_AXIS, -Math.PI / 2);   // cone apex tips toward +x, the way of flight
    for (let i = 0; i < COUNT; i++) {
      const o = offsets[i];
      p.set(along - o.back, HEIGHT + Math.sin(t * 0.6 + o.bob) * 0.35, o.across);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0);
  return { update, state: () => ({ presence: lastPresence }) };
}
