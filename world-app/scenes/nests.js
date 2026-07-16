// The birds nest in the sacred trees' branches, and in time a chick or two
// of their own (Genesis 1:22): "let fowl multiply in the earth." Two nests,
// one in each sacred tree's canopy — empty at first, each quietly given a
// chick as the visit goes on. Nothing to summon; only to notice, and to come
// back to.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { mulberry32, smoothstep } from '../util.js';

// `hatchAt`: seconds into the visit before that nest's chick shows itself.
const SPOTS = [
  { base: TREE_OF_LIFE_POS, dx: 0.55, dy: 4.85, dz: -0.35, hatchAt: 45 },
  { base: TREE_OF_KNOWLEDGE_POS, dx: -0.4, dy: 4.15, dz: 0.5, hatchAt: 110 },
];
const GROW = 2.5;   // seconds a chick takes to fill out once its moment comes

export function createNests(scene) {
  // Own seeded stream: a small twiggy tilt at two fixed spots shifts nothing
  // already planted.
  const rng = mulberry32(20260718);

  const nestMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.16, 0),
    new THREE.MeshLambertMaterial({ color: 0x6E5230, flatShading: true }),
    SPOTS.length,
  );
  const chickMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0xE8D77A, flatShading: true }),
    SPOTS.length,
  );
  scene.add(nestMesh, chickMesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const nests = SPOTS.map(spot => {
    const groundY = heightAt(spot.base.x, spot.base.z);
    return {
      x: spot.base.x + spot.dx,
      y: groundY + spot.dy,
      z: spot.base.z + spot.dz,
      hatchAt: spot.hatchAt,
      hatched: false,
      grownFor: 0,
    };
  });

  for (let i = 0; i < nests.length; i++) {
    const n = nests[i];
    q.setFromEuler(new THREE.Euler(rng() * 0.3, rng() * Math.PI * 2, rng() * 0.3));
    s.set(1.3, 0.7, 1.3);
    m.compose(p.set(n.x, n.y, n.z), q, s);
    nestMesh.setMatrixAt(i, m);
    // Chicks start hidden — scale 0 — until their own moment comes.
    m.compose(p.set(n.x, n.y + 0.08, n.z), q.identity(), s.setScalar(0));
    chickMesh.setMatrixAt(i, m);
  }
  nestMesh.instanceMatrix.needsUpdate = true;
  chickMesh.instanceMatrix.needsUpdate = true;

  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    let dirty = false;
    for (let i = 0; i < nests.length; i++) {
      const n = nests[i];
      if (elapsed < n.hatchAt) continue;
      n.hatched = true;
      n.grownFor = Math.min(GROW, n.grownFor + dt);
      const k = smoothstep(0, GROW, n.grownFor);
      m.compose(p.set(n.x, n.y + 0.08, n.z), q.identity(), s.setScalar(0.55 * k));
      chickMesh.setMatrixAt(i, m);
      dirty = true;
    }
    if (dirty) chickMesh.instanceMatrix.needsUpdate = true;
  }

  function state() {
    return { hatched: nests.filter(n => n.hatched).length };
  }

  update(0);
  return { update, state };
}
