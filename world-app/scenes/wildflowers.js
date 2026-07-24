// Wildflowers dot the meadow grass in quick dabs of color among the green
// (Genesis 1:11: "let the earth bring forth grass, the herb yielding
// seed... and it was so"). A fixed scatter of small bright dabs across the
// open meadow — one instanced mesh, no per-frame update needed at all.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 240;
const COLORS = [0xC94F4F, 0xD9A62E, 0xB25FA8, 0xEDE7D2, 0x5F84C4, 0xE07B39];

export function createWildflowers(scene) {
  // Own seeded stream: a fixed dressing over the meadow shifts nothing
  // already planted.
  const rng = mulberry32(20260729);

  const mesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.055, 0),
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
  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < COUNT * 30) {
    const a = rng() * Math.PI * 2;
    const r = 3 + Math.sqrt(rng()) * 46;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) < 2.3) continue;   // grass, not the banks or water
    p.set(x, heightAt(x, z) + 0.05, z);
    q.setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI));
    const scale = 0.65 + rng() * 1.15;
    s.set(scale, scale, scale);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    c.set(COLORS[Math.floor(rng() * COLORS.length)]);
    mesh.setColorAt(placed, c);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;

  return { count: placed };
}
