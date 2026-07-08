// The spring of Eden (Genesis 2:10): west of the garden, where the river is
// first found — wet stones gathered close, and water welling quietly up
// between them, ring after ring, before it ever reaches the planted trees.
// A landmark near the walk's own western edge, not a hard beginning: the
// riverbed carries on a little further into the mist, the way the eastern
// gate is "always a little farther off than it seems" (scenes/gate.js) —
// Eden's edges are impressionistic, not walls.

import * as THREE from 'three';
import { riverZ, heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

export const SPRING_POS = new THREE.Vector3(-48, 0, riverZ(-48));

const STONES = 8;
const RINGS = 4;
const RING_LIFE = 2.6;
const RING_INTERVAL = 1.8;
const RING_Y = -0.35;   // just above the ripple crests, matching wake.js

export function createSpring(scene) {
  // Own seeded stream: jitter here shifts nothing already planted.
  const rng = mulberry32(20260713);

  const group = new THREE.Group();
  group.position.set(SPRING_POS.x, 0, SPRING_POS.z);
  scene.add(group);

  // ── Wet stones, gathered close about the welling water ────
  const stones = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: 0x6E7A78, flatShading: true }),
    STONES,
  );
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < STONES; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.6 + rng() * 2.2;
      const wx = SPRING_POS.x + Math.cos(a) * r;
      const wz = SPRING_POS.z + Math.sin(a) * r * 0.8;
      const wet = riverEdgeDist(wx, wz) < 0.4;
      const y = wet ? -0.42 : heightAt(wx, wz) + 0.08;   // wet ones just crest the ripples
      const sc = 0.22 + rng() * 0.24;
      p.set(wx - SPRING_POS.x, y, wz - SPRING_POS.z);
      q.setFromEuler(new THREE.Euler(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
      s.setScalar(sc);
      m.compose(p, q, s);
      stones.setMatrixAt(i, m);
    }
  }
  group.add(stones);

  // ── The welling itself: a low dome of water, quietly breathing ────
  const well = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshLambertMaterial({ color: 0x5AA0C8, transparent: true, opacity: 0.75 }),
  );
  well.position.y = -0.46;
  group.add(well);

  // ── Rings that widen from the welling, over and over ──────
  const ringMesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.5, 0.66, 18).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false }),
    RINGS,
  );
  ringMesh.frustumCulled = false;   // sits well off scene-centre, out at the spring
  group.add(ringMesh);

  const FOAM = new THREE.Color(0xF0FAFD);
  const WATER = new THREE.Color(0x4E8FB8);
  const rm = new THREE.Matrix4();
  const rq = new THREE.Quaternion();
  const rp = new THREE.Vector3();
  const rs = new THREE.Vector3();
  const rc = new THREE.Color();
  // Pre-staggered ages so the rings don't all pulse in lockstep at boot.
  const rings = Array.from({ length: RINGS }, (_, i) => ({ age: (i / RINGS) * RING_LIFE }));

  let t = 0;
  let nextRing = 0;
  let spawnIn = RING_INTERVAL;
  function update(dt) {
    t += dt;
    well.scale.setScalar(1 + Math.sin(t * 1.3) * 0.05);
    well.position.y = -0.46 + Math.sin(t * 1.3) * 0.02;

    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnIn += RING_INTERVAL;
      rings[nextRing].age = 0;
      nextRing = (nextRing + 1) % RINGS;
    }
    for (let i = 0; i < RINGS; i++) {
      const r = rings[i];
      r.age += dt;
      const k = Math.min(r.age / RING_LIFE, 1);
      const radius = k >= 1 ? 0 : 0.4 + k * 1.6;
      rs.set(radius, 1, radius);
      rm.compose(rp.set(0, RING_Y, 0), rq, rs);
      ringMesh.setMatrixAt(i, rm);
      rc.copy(FOAM).lerp(WATER, k);
      ringMesh.setColorAt(i, rc);
    }
    ringMesh.instanceMatrix.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  }

  function state() {
    return { x: SPRING_POS.x, z: SPRING_POS.z };
  }

  update(0);   // seat every matrix before the pre-ready warm-up frame
  return { update, state };
}
