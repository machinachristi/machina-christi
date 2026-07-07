// The walker's wake (v9): where a step meets the water, a ring widens and
// fades. Wading strides ring quickly, one after another; a walker standing
// still in the shallows sends out a slow, occasional ripple, the water
// settling around them. A small pool of instanced rings is recycled — each
// grows from the footfall outward, paling from foam-white into the water's
// own blue as it goes.

import * as THREE from 'three';
import { riverEdgeDist } from './terrain.js';
import { clamp } from '../util.js';

const RINGS = 8;          // recycled pool — plenty for one walker's stride
const LIFE = 1.3;         // seconds a ring takes to widen away
const RING_Y = -0.35;     // just above the ripple crests (crest ≈ -0.4)

export function createWake(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.78, 1, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
    RINGS,
  );
  mesh.frustumCulled = false;   // rings live wherever the walker wades
  scene.add(mesh);

  const FOAM = new THREE.Color(0xF0FAFD);
  const WATER = new THREE.Color(0x4E8FB8);
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  const rings = [];
  for (let i = 0; i < RINGS; i++) rings.push({ age: LIFE, x: 0, z: 0 });

  let nextRing = 0;
  let timer = 0;
  let lastX = null;
  let lastZ = null;

  function spawn(x, z) {
    const r = rings[nextRing];
    nextRing = (nextRing + 1) % RINGS;
    r.age = 0;
    r.x = x;
    r.z = z;
  }

  function update(dt, walker = null) {
    // A step meets the water: feet on the bed (well below the banks) and on
    // the water itself — the crossing's stones keep feet dry and ringless.
    if (walker) {
      const speed = lastX === null || dt <= 0
        ? 0
        : Math.hypot(walker.x - lastX, walker.z - lastZ) / dt;
      lastX = walker.x;
      lastZ = walker.z;
      const wading = walker.y < -0.6 && riverEdgeDist(walker.x, walker.z) <= 0;
      timer -= dt;
      if (wading && timer <= 0) {
        spawn(walker.x, walker.z);
        timer = speed > 0.6 ? 0.34 : 1.4;   // strides ring; stillness settles
      }
      if (!wading) timer = 0;
    }

    for (let i = 0; i < RINGS; i++) {
      const r = rings[i];
      r.age += dt;
      const k = clamp(r.age / LIFE, 0, 1);
      const radius = k >= 1 ? 0 : 0.28 + k * 1.3;   // spent rings scale away
      p.set(r.x, RING_Y, r.z);
      s.set(radius, 1, radius);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      c.copy(FOAM).lerp(WATER, k);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function state() {
    let live = 0;
    for (const r of rings) if (r.age < LIFE) live++;
    return { rings: live };
  }

  update(0);   // seat the (empty) pool before the pre-ready warm-up frame
  return { update, state };
}
