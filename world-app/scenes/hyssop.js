// "And he spake of trees, from the cedar tree that is in Lebanon even unto
// the hyssop that springeth out of the wall" (1 Kings 4:33) — the least of
// the garden's trees, tucked low among the same high rocks the goats and
// conies keep (scenes/creatures.js's goatSpot, scenes/conies.js), a small
// answer to the cedars standing tall on the northern rim (scenes/cedars.js).
//
// A hyssop tuft neither moves nor grows, so — the wildflowers' idiom
// exactly — the whole scatter is one instanced mesh, no per-frame update
// needed at all.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 14;
const LEAF_LO = new THREE.Color(0x5D7A46);
const LEAF_HI = new THREE.Color(0x7C9760);

function hyssopSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 36 + rng() * 11;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > 4) return { x, z };
  }
  return { x: 38, z: -20 };
}

export function createHyssop(scene) {
  // Own seeded stream: a scatter among the rocks shifts nothing already
  // planted.
  const rng = mulberry32(20260807);

  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.13, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    COUNT,
  );
  mesh.frustumCulled = false;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  const spots = [];
  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < COUNT * 30) {
    const sp = hyssopSpot(rng);
    let ok = true;
    for (const other of spots) {
      if (Math.hypot(other.x - sp.x, other.z - sp.z) < 1.6) { ok = false; break; }
    }
    if (!ok) continue;
    const groundY = heightAt(sp.x, sp.z);
    p.set(sp.x, groundY + 0.1, sp.z);
    q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
    const scale = 0.7 + rng() * 0.6;
    s.set(scale, scale * (0.7 + rng() * 0.3), scale);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    c.copy(LEAF_LO).lerp(LEAF_HI, rng());
    mesh.setColorAt(placed, c);
    spots.push({ x: sp.x, z: sp.z, y: groundY });
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;

  const namable = spots.map(sp => ({
    pos: { x: sp.x, y: sp.y + 0.15, z: sp.z },
    name: 'Ezov', label: 'the hyssop', kind: 'hyssop',
  }));

  return { count: placed, spots: namable };
}
