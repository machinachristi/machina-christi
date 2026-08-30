// "As for the stork, the fir trees are her house" (Psalm 104:17) — her own
// nest, high in her own tree at the garden's northwest reach, deliberately
// set above every other nest in the garden (scenes/nests.js tops out at
// 4.85 units of lift; this one clears 6). A still, watching bird, not a
// flyer among the flock — the nest is a resting place, not a flight path.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32 } from '../util.js';

const POS_X = -16, POS_Z = 30;
const TREE_HEIGHT = 7.4;
const NEST_Y = TREE_HEIGHT * 0.66;   // clears every canopy tree and every other nest

export function createStorks(scene) {
  // Own seeded stream: one fixed tree and nest shifts nothing already planted.
  const rng = mulberry32(20260725);
  const groundY = heightAt(POS_X, POS_Z);

  const t = new THREE.Group();

  // The fir itself — trunk and three tiers narrowing upward. It neither
  // moves nor grows, so (v20, cedars' idiom) the whole tree bakes into one
  // merged, vertex-coloured geometry: one draw call where there were four.
  const BARK = new THREE.Color(0x5A4530);
  const FIR = new THREE.Color(0x2E5C3E);
  const firParts = [{
    geo: new THREE.CylinderGeometry(0.22, 0.34, TREE_HEIGHT * 0.62, 6)
      .toNonIndexed()
      .translate(0, TREE_HEIGHT * 0.31, 0),
    color: BARK,
  }];
  for (const tier of [
    { y: TREE_HEIGHT * 0.52, r: 1.5, h: 2.3 },
    { y: TREE_HEIGHT * 0.72, r: 1.15, h: 2.0 },
    { y: TREE_HEIGHT * 0.9, r: 0.75, h: 1.6 },
  ]) {
    firParts.push({
      geo: new THREE.ConeGeometry(tier.r, tier.h, 7).toNonIndexed().translate(0, tier.y, 0),
      color: FIR,
    });
  }
  t.add(new THREE.Mesh(
    mergeColored(firParts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  ));
  for (const part of firParts) part.geo.dispose();

  // The nest: a flattened ring of twigs cradled just under the crown.
  const TWIGS = 14;
  const nestMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3),
    new THREE.MeshLambertMaterial({ color: 0x7A6440, flatShading: true }),
    TWIGS,
  );
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < TWIGS; i++) {
      const a = (i / TWIGS) * Math.PI * 2 + rng() * 0.3;
      const r = 0.55 + rng() * 0.15;
      q.setFromEuler(new THREE.Euler(Math.PI / 2 + (rng() - 0.5) * 0.4, a, 0));
      m.compose(
        new THREE.Vector3(Math.cos(a) * r, NEST_Y + (rng() - 0.5) * 0.08, Math.sin(a) * r),
        q, new THREE.Vector3(1, 1, 1),
      );
      nestMesh.setMatrixAt(i, m);
    }
    nestMesh.instanceMatrix.needsUpdate = true;
  }
  t.add(nestMesh);

  // The stork herself: a tall, still white bird — long dark legs, a long
  // neck, black wingtips, a spear of a red-orange beak. Only her neck ever
  // moves, so (v20) she is two merged geometries rather than nine meshes:
  // everything that holds still in one, and neck, head and beak in another
  // on the pivot that dips them.
  const PLUME = new THREE.Color(0xF5F2E8);
  const WINGTIP = new THREE.Color(0x2A2A28);
  const BEAK = new THREE.Color(0xC65A2E);
  const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const stork = new THREE.Group();
  const stillParts = [{
    geo: new THREE.CapsuleGeometry(0.16, 0.34, 3, 7)
      .toNonIndexed()
      .rotateZ(Math.PI / 2)
      .translate(0, 0.42, 0),
    color: PLUME,
  }];
  for (const sx of [-1, 1]) {
    stillParts.push({
      geo: new THREE.BoxGeometry(0.32, 0.02, 0.16)
        .toNonIndexed()
        .translate(sx * 0.2, 0.5, -0.02),
      color: WINGTIP,
    });
    stillParts.push({
      geo: new THREE.CylinderGeometry(0.025, 0.02, 0.36, 5)
        .toNonIndexed()
        .translate(sx * 0.06, 0.18, 0),
      color: BEAK,
    });
  }
  stork.add(new THREE.Mesh(mergeColored(stillParts), lambert()));
  for (const part of stillParts) part.geo.dispose();

  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.55, 0.16);
  const neckParts = [
    {
      geo: new THREE.CylinderGeometry(0.04, 0.05, 0.42, 5).toNonIndexed().translate(0, 0.2, 0),
      color: PLUME,
    },
    {
      geo: new THREE.SphereGeometry(0.075, 7, 6).toNonIndexed().translate(0, 0.44, 0),
      color: PLUME,
    },
    {
      geo: new THREE.ConeGeometry(0.025, 0.22, 4)
        .toNonIndexed()
        .rotateX(Math.PI / 2)
        .translate(0, 0.44, 0.12),
      color: BEAK,
    },
  ];
  neckPivot.add(new THREE.Mesh(mergeColored(neckParts), lambert()));
  for (const part of neckParts) part.geo.dispose();
  stork.add(neckPivot);

  stork.position.y = NEST_Y + 0.08;
  t.add(stork);

  t.position.set(POS_X, groundY, POS_Z);
  scene.add(t);

  const spot = {
    pos: { x: POS_X, y: groundY + NEST_Y + 0.5, z: POS_Z },
    name: 'Hasidah', label: 'the stork', kind: 'stork',
  };

  // A slow, still idle: the neck dips to preen, then lifts again.
  let phase = rng() * Math.PI * 2;
  function update(dt) {
    phase += dt * 0.35;
    neckPivot.rotation.x = Math.sin(phase) * 0.12 + Math.max(0, Math.sin(phase * 2.3)) * 0.5;
  }

  return { update, spot };
}
