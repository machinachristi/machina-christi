// Fallen fig leaves lie sewn together at the foot of the dark tree — a small
// foreshadowing, easy to miss (Genesis 3:7, foreshadowed): "they sewed fig
// leaves together, and made themselves aprons." Three leaves in the grass at
// the Tree of Knowledge's own root, nothing more, no caption, no light drawn
// to them — the garden doesn't explain itself, and this hasn't happened yet.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { mulberry32 } from '../util.js';

const LEAVES = 3;

export function createApron(scene) {
  // Own seeded stream: a small fixed cluster at one spot shifts nothing
  // already planted.
  const rng = mulberry32(20260716);

  const mesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.22, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    LEAVES,
  );
  scene.add(mesh);

  const groundY = heightAt(TREE_OF_KNOWLEDGE_POS.x, TREE_OF_KNOWLEDGE_POS.z);
  const colorA = new THREE.Color(0x6E7A3E);
  const colorB = new THREE.Color(0x8C6A3A);   // a couple gone the brown of drying
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < LEAVES; i++) {
    // Clustered close and overlapping, as if laid one atop the next — sewn,
    // not scattered.
    const a = (i / LEAVES) * Math.PI * 2 + rng() * 0.6;
    const r = 0.16 + rng() * 0.22;
    p.set(
      TREE_OF_KNOWLEDGE_POS.x + Math.cos(a) * r,
      groundY + 0.03,
      TREE_OF_KNOWLEDGE_POS.z + Math.sin(a) * r,
    );
    q.setFromEuler(new THREE.Euler(
      Math.PI / 2 + (rng() - 0.5) * 0.35,
      rng() * Math.PI * 2,
      (rng() - 0.5) * 0.35,
    ));
    s.set(1.3 + rng() * 0.35, 0.16, 0.75 + rng() * 0.25);   // flattened, leaf-wide
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.copy(colorA).lerp(colorB, rng());
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;

  return {};
}
