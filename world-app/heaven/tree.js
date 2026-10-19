// The Tree of Life (AB#106): "In the midst of the street of it, and on either
// side of the river, was there the tree of life, which bare twelve manner of
// fruits, and yielded her fruit every month: and the leaves of the tree were
// for the healing of the nations" (Revelation 22:2).
//
// One tree standing on both banks: a trunk rising from the street on each
// side of the water, leaning in, and a single crown joined over the river.
// Its twelve fruits hang under the crown, each its own colour, softly alight.
// The wood and leaves never move, so they are baked to one merged draw; the
// fruits are one InstancedMesh. The two trunks are solid to walk round.

import * as THREE from 'three';
import { mergeColored, mulberry32 } from '../util.js';
import { TREE } from './layout.js';

const BARK = new THREE.Color(0xC9A36A);
const BARK_PALE = new THREE.Color(0xE2C28A);
const LEAF = new THREE.Color(0x86C77A);
const LEAF_LIGHT = new THREE.Color(0xC4E89A);
const LEAF_GOLD = new THREE.Color(0xE3E28C);
// Twelve manner of fruits — twelve colours, like the twelve stones of the
// city's foundations (Revelation 21:19-20), each one apart.
const FRUIT = [0x8FB8E8, 0xE45B5B, 0xF2C14E, 0x49B67E, 0xF09A5B, 0xD9506E,
  0xF5E58C, 0x6FCF97, 0x7EC8D8, 0x9C6FD6, 0xE58FC6, 0xB3E36A];

export function createTree(scene) {
  const rng = mulberry32(20260856);
  const parts = [];

  // The trunks, one on each bank, leaning in toward the river.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const h0 = k * 2.9, h1 = h0 + 3.2;
      const g = new THREE.CylinderGeometry(0.42 - k * 0.08, 0.5 - k * 0.08, h1 - h0, 7, 1).toNonIndexed();
      g.translate(0, (h0 + h1) / 2, 0);
      g.rotateZ(side * 0.15);
      g.translate(side * TREE.trunkX, 0, TREE.z);
      parts.push({ geo: g, color: k === 2 ? BARK_PALE : BARK });
    }
    // A root flaring onto the street.
    const root = new THREE.ConeGeometry(0.85, 1.0, 7).toNonIndexed();
    root.translate(side * TREE.trunkX, 0.5, TREE.z);
    parts.push({ geo: root, color: BARK });
  }

  // One crown joined over the water: lobes along a low arch from bank to
  // bank, and more of them before and behind it.
  const LOBES = 32;
  for (let i = 0; i < LOBES; i++) {
    const u = i / (LOBES - 1);
    const x = (u - 0.5) * 13 + (rng() - 0.5) * 1.0;
    const y = 8.8 + Math.sin(u * Math.PI) * 2.2 + (rng() - 0.5) * 1.1;
    const z = TREE.z + (rng() - 0.5) * 5.6;
    const r = 1.6 + rng() * 1.1;
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.72, 1);
    g.translate(x, y, z);
    const pick = rng();
    parts.push({ geo: g, color: pick < 0.45 ? LEAF : pick < 0.85 ? LEAF_LIGHT : LEAF_GOLD });
  }
  const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true, emissive: 0x1C2A12,
  }));
  scene.add(mesh);

  // The twelve fruits, hanging under the crown.
  const fruitGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const fruit = new THREE.InstancedMesh(fruitGeo, new THREE.MeshBasicMaterial({ color: 0xFFFFFF }), FRUIT.length);
  fruit.frustumCulled = false;
  const hang = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < FRUIT.length; i++) {
    const u = (i + 0.5) / FRUIT.length;
    const a = u * Math.PI * 2;
    const p = new THREE.Vector3(
      Math.cos(a) * (3.2 + rng() * 2.2),
      7.1 + rng() * 0.8,
      TREE.z + Math.sin(a) * (1.6 + rng() * 1.0),
    );
    hang.push({ p, phase: rng() * Math.PI * 2 });
    m.makeTranslation(p.x, p.y, p.z);
    fruit.setMatrixAt(i, m);
    fruit.setColorAt(i, new THREE.Color(FRUIT[i]));
  }
  scene.add(fruit);

  function update(time) {
    // The fruits sway a little on their stems.
    for (let i = 0; i < hang.length; i++) {
      const h = hang[i];
      m.makeTranslation(
        h.p.x + Math.sin(time * 0.9 + h.phase) * 0.05,
        h.p.y + Math.sin(time * 0.7 + h.phase) * 0.03,
        h.p.z,
      );
      fruit.setMatrixAt(i, m);
    }
    fruit.instanceMatrix.needsUpdate = true;
  }

  return {
    update,
    fruits: FRUIT.length,
    solids: [-1, 1].map(side => ({ x: side * TREE.trunkX, z: TREE.z, r: 0.75 })),
  };
}
