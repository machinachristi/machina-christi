// The Tree of Life, as the greatest and brightest thing in the garden
// (AB#129): "the tree of life also in the midst of the garden" (Genesis
// 2:9). A pale trunk rising in a slow S from flared roots; seven boughs
// opening from it like the branches of the lampstand (Exodus 25:32); and
// over every bough a broad, layered crown of gold, about ten metres to its
// top where the old one stood under six.
//
// This file only shapes it, and says where its parts are, so that whatever
// hangs off the tree (the birds' perches, the nest, the shadow, the shaft
// of light, the flock's way round the trunk, the falling leaves) reads the
// same numbers the wood and leaves were built from. vegetation.js plants
// it, lights it, and makes it answer the night.
//
// All of the wood is one mesh and all of the crown another, each coloured
// per vertex: two draw calls, the same as the trunk and canopy it replaces.

import * as THREE from 'three';
import { mulberry32, smoothstep } from '../util.js';

const S = 1.18;                       // the whole tree, scaled from its drawing size

// Its measures, in metres from the ground at its root (already scaled).
export const LIFE_TREE = {
  height: 8.4 * S,                    // the top of the crown
  crownRadius: 4.7 * S,               // how far the crown spreads from the trunk
  crownUnder: 4.4 * S,                // the underside of the crown, where the fruit hangs
  trunkRadius: 0.62 * S,              // at the ground, before the roots flare
  rootRadius: 1.25 * S,               // how far the root flares run out
  fork: 4.1 * S,                      // where the trunk gives way to the boughs
  lamp: 3.9 * S,                      // its own light, in the fork under the crown
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);

// One limb: an open tapering tube from a to b.
function limb(a, b, r0, r1, sides = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true).toNonIndexed();
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

// Many shapes into one, coloured vertex by vertex by where each vertex is.
function mergeBy(geos, colorOf) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  let o = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++, o++) {
      const x = p.getX(i) * S, y = p.getY(i) * S, z = p.getZ(i) * S;
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
      colorOf(c, y);
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.computeVertexNormals();      // non-indexed, so true per-face normals
  return merged;
}

// The tree's shape. Its own seeded stream: the same tree for every visitor,
// and nothing else planted in the garden shifts for it.
export function buildLifeTree() {
  const rng = mulberry32(20260866);
  const wood = [], leaves = [];

  // The trunk: a slow S, flaring at the root.
  const t0 = V(0, -0.2, 0), t1 = V(0.12, 1.5, 0.05), t2 = V(-0.1, 3.0, -0.06), t3 = V(0.05, 4.1, 0);
  wood.push(limb(t0, t1, 0.62, 0.42, 7), limb(t1, t2, 0.42, 0.34, 7), limb(t2, t3, 0.34, 0.3, 7));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    wood.push(limb(V(Math.cos(a) * 1.25, -0.25, Math.sin(a) * 1.25), V(Math.cos(a) * 0.2, 0.75, Math.sin(a) * 0.2), 0.1, 0.3, 5));
  }

  // Seven boughs, opening like a lampstand, a twig either side of each.
  const tips = [];
  const BOUGHS = 7;
  for (let i = 0; i < BOUGHS; i++) {
    const a = (i / BOUGHS) * Math.PI * 2 + 0.2;
    const reach = 2.7 + rng() * 0.7;
    const from = V(0.02, 2.9 + (i % 3) * 0.35, 0);
    const mid = V(Math.cos(a) * reach * 0.55, 4.5 + rng() * 0.3, Math.sin(a) * reach * 0.55);
    const tip = V(Math.cos(a) * reach, 5.6 + rng() * 0.5, Math.sin(a) * reach);
    wood.push(limb(from, mid, 0.2, 0.13, 5), limb(mid, tip, 0.13, 0.06, 5));
    tips.push(tip, mid);
    for (const side of [-1, 1]) {
      const b = a + side * 0.42;
      const twig = V(Math.cos(b) * reach * 0.9, 5.3 + rng() * 0.5, Math.sin(b) * reach * 0.9);
      wood.push(limb(mid, twig, 0.09, 0.04, 4));
      tips.push(twig);
    }
  }
  wood.push(limb(t3, V(0.1, 6.2, 0), 0.24, 0.08, 5));
  tips.push(V(0.1, 6.3, 0));

  // The crown: a soft golden mass over every tip, an upper tier over
  // those, and two great ones at the top — a broad layered dome.
  const lobe = (c, r, flat) => {
    const g = new THREE.IcosahedronGeometry(1, 1);   // already one corner per face
    g.scale(r, r * flat, r);
    g.rotateY(rng() * 6.28);
    g.translate(c.x, c.y, c.z);
    return g;
  };
  for (const t of tips) leaves.push(lobe(V(t.x, t.y + 0.25, t.z), 1.05 + rng() * 0.5, 0.55 + rng() * 0.12));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = 1.7 + rng() * 0.5;
    leaves.push(lobe(V(Math.cos(a) * r, 6.75 + rng() * 0.3, Math.sin(a) * r), 1.2 + rng() * 0.3, 0.55));
  }
  leaves.push(lobe(V(0, 7.45, 0), 1.55, 0.6), lobe(V(0.5, 7.0, -0.4), 1.5, 0.6));

  // Pale wood, darker toward the root; gold that deepens to amber under
  // the crown and brightens toward its top.
  const pale = new THREE.Color(0.93, 0.86, 0.72), root = new THREE.Color(0.62, 0.52, 0.4);
  const woodGeo = mergeBy(wood, (c, y) => c.copy(pale).lerp(root, smoothstep(2.8 * S, -0.2 * S, y) * 0.6));
  const amber = new THREE.Color(0.86, 0.56, 0.16), gold = new THREE.Color(1.0, 0.86, 0.42);
  const crownGeo = mergeBy(leaves, (c, y) => c.copy(amber).lerp(gold, smoothstep(4.8 * S, 7.4 * S, y)));

  return { woodGeo, crownGeo };
}

// "Which bare twelve manner of fruits" (Revelation 22:2): where each of the
// twelve hangs under the crown, and its own colour. From the root, scaled.
const FRUIT_HUES = [0xFF8A5C, 0xFFD166, 0xF25F8A, 0x9BE08A, 0x7FD7F2, 0xC79BFF, 0xFFB36B, 0xFF6F91, 0xB4F06A, 0x6FE3D0, 0xFFE08A, 0xE58BFF];
export const LIFE_FRUITS = FRUIT_HUES.map((hue, i) => {
  const a = (i / 12) * Math.PI * 2 + 0.3, r = 1.5 + (i % 3) * 0.8;
  return { x: Math.cos(a) * r * S, y: (4.0 + (i % 4) * 0.16) * S, z: Math.sin(a) * r * S, hue };
});

// Where a bird may settle on it: the very top of the crown, and the tops of
// two of the upper tier's masses, either side. From the root.
export const LIFE_PERCHES = [
  { x: 0.1 * S, y: 8.4 * S, z: 0 },
  { x: -2.0 * S, y: 7.55 * S, z: 0.9 * S },
  { x: 1.9 * S, y: 7.6 * S, z: -1.0 * S },
];

// The sparrow's nest: in the fork, where the boughs leave the trunk, so it
// is seen from below against the gold. From the root.
export const LIFE_NEST = { x: 0.3 * S, y: 4.2 * S, z: 0.22 * S };
