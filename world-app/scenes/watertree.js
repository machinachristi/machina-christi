// "He shall be like a tree planted by the rivers of water, that bringeth
// forth his fruit in his season; his leaf also shall not wither" (Psalm 1:3).
// A single tree stands apart at the river's bank — always in leaf, always
// fruited, nothing ever shed from it (unlike the Tree of Life's falling gold).

import * as THREE from 'three';
import { heightAt, riverZ } from './terrain.js';
import { gustAt } from './wind.js';
import { mulberry32 } from '../util.js';

const POS_X = -30;
const BANK_OFFSET = 2.6;   // just outside the water's edge, hugging the bank
const LEAN_LIMIT = 0.14;   // radians at full gust, same idiom as the sacred trees

export function createWaterTree(scene) {
  const rng = mulberry32(20260722);
  const z = riverZ(POS_X) + BANK_OFFSET;
  const groundY = heightAt(POS_X, z);

  const t = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, 2.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x6E5738, flatShading: true }),
  );
  trunk.position.y = 1.1;
  t.add(trunk);

  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x4C8F5A, flatShading: true });
  for (const [dx, dy, dz, s] of [[0, 2.7, 0, 1.25], [-0.55, 2.35, 0.35, 0.85], [0.5, 2.45, -0.3, 0.9]]) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), canopyMat);
    blob.position.set(dx, dy, dz);
    blob.scale.setScalar(s);
    t.add(blob);
  }

  // Fruit in every season — always hanging, nothing waits for a turn.
  const FRUIT_COUNT = 8;
  const fruit = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.09, 0),
    new THREE.MeshLambertMaterial({ color: 0xC9A227, flatShading: true }),
    FRUIT_COUNT,
  );
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < FRUIT_COUNT; i++) {
      const a = (i / FRUIT_COUNT) * Math.PI * 2 + rng() * 0.5;
      const rr = 0.9 + rng() * 0.6;
      m.setPosition(Math.cos(a) * rr, 2.1 + rng() * 0.9, Math.sin(a) * rr * 0.8);
      fruit.setMatrixAt(i, m);
    }
    fruit.instanceMatrix.needsUpdate = true;
  }
  t.add(fruit);

  t.position.set(POS_X, groundY, z);
  scene.add(t);

  const spot = {
    pos: { x: POS_X, y: groundY + 2.4, z },
    name: 'Shatul', label: 'the tree by the waters', kind: 'watertree',
  };

  // Bows in the evening gust exactly as the sacred trees do — but its leaf
  // never withers, so unlike them nothing ever falls from it.
  function update(cycleT, sabbath) {
    t.rotation.z = -gustAt(cycleT, POS_X, sabbath) * LEAN_LIMIT;
  }

  return { update, spot };
}
