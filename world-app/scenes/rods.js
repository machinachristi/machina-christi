// "And Jacob took him rods of green poplar, and of the hazel and chestnut
// tree; and pilled white strakes in them... And he set the rods which he had
// pilled before the flocks in the gutters in the watering troughs when the
// flocks came to drink" (Genesis 30:37-38).
//
// Three trees named together in one verse, so they stand together here: a
// poplar, a hazel and a chestnut on the bank where the river runs whole,
// above a shelving place the flocks can walk down into. And set in the
// shallows below them, a few peeled rods — white strakes showing where the
// bark was taken off. Nothing is being bargained for here and no flock is
// being divided; it is only that the three trees of that verse are good trees
// and this is a good place for them, and that a peeled rod standing in clear
// water is a beautiful thing on its own account.
//
// None of it moves or grows, so the whole planting — trees, rods and all —
// bakes into a single merged, vertex-coloured geometry: one draw call, and no
// per-frame update at all (scenes/cedars.js's idiom).

import * as THREE from 'three';
import { heightAt, riverZ, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32 } from '../util.js';

// The watering place: the north bank of the upstream course, a short walk
// west of the crossing stones. The bank here is shallow and dry, and the
// channel's outer edge sits 2.6 from the centreline while the river is still
// whole — so the trees stand back at about 5, and the rods go in at 3.
const AT_X = -6.5;
const BANK = 5.4;
const SHALLOWS = 3.0;

const POPLAR_BARK = new THREE.Color(0xC6C3B6);
const POPLAR_LEAF = new THREE.Color(0x93BA79);
const HAZEL_BARK = new THREE.Color(0x7C6549);
const HAZEL_LEAF = new THREE.Color(0x6E9351);
const CHESTNUT_BARK = new THREE.Color(0x5C4A37);
const CHESTNUT_LEAF = new THREE.Color(0x4E7A41);
const PEELED = new THREE.Color(0xEFE7D2);

function poplar(parts, x, y, z, rng) {
  // Tall and narrow, the way a poplar goes — the one tree here that reads as
  // a line rather than a mass.
  const h = 5.4 + rng() * 1.1;
  parts.push({
    geo: new THREE.CylinderGeometry(0.13, 0.26, h, 6).toNonIndexed()
      .translate(x, y + h / 2, z),
    color: POPLAR_BARK,
  });
  for (let i = 0; i < 4; i++) {
    const f = i / 3;
    parts.push({
      geo: new THREE.ConeGeometry(1.15 - f * 0.55, 2.4 - f * 0.5, 7).toNonIndexed()
        .rotateY(rng() * Math.PI)
        .translate(x, y + h * (0.5 + f * 0.16), z),
      color: POPLAR_LEAF,
    });
  }
}

function hazel(parts, x, y, z, rng) {
  // Low, and many-stemmed out of one root, which is what a hazel is.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng() * 0.5;
    const lean = 0.16 + rng() * 0.2;
    const h = 2.3 + rng() * 0.9;
    parts.push({
      geo: new THREE.CylinderGeometry(0.06, 0.1, h, 5).toNonIndexed()
        .translate(0, h / 2, 0)
        .rotateX(Math.cos(a) * lean)
        .rotateZ(Math.sin(a) * lean)
        .translate(x, y, z),
      color: HAZEL_BARK,
    });
    parts.push({
      geo: new THREE.IcosahedronGeometry(0.78 + rng() * 0.22, 0).toNonIndexed()
        .scale(1, 0.72, 1)
        .translate(x + Math.sin(a) * lean * h * 0.9, y + h * 0.96, z + Math.cos(a) * lean * h * 0.9),
      color: HAZEL_LEAF,
    });
  }
}

function chestnut(parts, x, y, z, rng) {
  // Broad and heavy-crowned, spreading further than it stands tall.
  const h = 3.5 + rng() * 0.6;
  parts.push({
    geo: new THREE.CylinderGeometry(0.24, 0.44, h, 7).toNonIndexed()
      .translate(x, y + h / 2, z),
    color: CHESTNUT_BARK,
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng();
    const out = i === 0 ? 0 : 1.05 + rng() * 0.5;
    parts.push({
      geo: new THREE.IcosahedronGeometry(i === 0 ? 1.5 : 1.05 + rng() * 0.3, 1).toNonIndexed()
        .scale(1, 0.66, 1)
        .translate(
          x + Math.cos(a) * out,
          y + h + (i === 0 ? 0.35 : -0.15 + rng() * 0.4),
          z + Math.sin(a) * out,
        ),
      color: CHESTNUT_LEAF,
    });
  }
}

export function createRods(scene) {
  // Own seeded stream: a planting on a bank shifts nothing already planted.
  const rng = mulberry32(20260831);

  const parts = [];
  const trees = [
    { dx: -3.4, kind: poplar, name: 'Livneh', label: 'the poplar' },
    { dx: 0.2, kind: hazel, name: 'Luz', label: 'the hazel' },
    { dx: 3.6, kind: chestnut, name: 'Armon', label: 'the chestnut' },
  ];

  const spots = [];
  for (const tree of trees) {
    const x = AT_X + tree.dx;
    const z = riverZ(x) + BANK + (rng() - 0.5) * 0.9;
    const y = heightAt(x, z);
    tree.kind(parts, x, y, z, rng);
    spots.push({
      pos: { x, y: y + 1.5, z },
      name: tree.name, label: tree.label, kind: 'tree',
    });
  }

  // The rods: peeled wands set upright in the shallows, each showing bare
  // white where the bark was taken off in strakes and dark where it was left.
  const rods = [];
  for (let i = 0; i < 7; i++) {
    const x = AT_X - 3.2 + i * 1.05 + (rng() - 0.5) * 0.4;
    const z = riverZ(x) + SHALLOWS + (rng() - 0.5) * 0.5;
    // Only where there really is water to stand them in.
    if (riverEdgeDist(x, z) > 0.9) continue;
    const y = heightAt(x, z);
    const h = 0.85 + rng() * 0.5;
    const lean = (rng() - 0.5) * 0.34;
    const yaw = rng() * Math.PI * 2;
    // Alternating bands up the rod: pilled, left, pilled, left.
    const bands = 5;
    for (let b = 0; b < bands; b++) {
      const seg = h / bands;
      parts.push({
        geo: new THREE.CylinderGeometry(0.036, 0.042, seg, 5).toNonIndexed()
          .translate(0, seg * (b + 0.5), 0)
          .rotateX(Math.cos(yaw) * lean)
          .rotateZ(Math.sin(yaw) * lean)
          .translate(x, y, z),
        color: b % 2 === 0 ? PEELED : HAZEL_BARK,
      });
    }
    rods.push({ x, z });
  }

  const planting = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(planting);
  for (const part of parts) part.geo.dispose();

  return {
    spots,
    count: trees.length,
    state: () => ({ trees: trees.length, rods: rods.length, x: AT_X }),
  };
}
