// "I will plant in the wilderness the cedar, the shittah tree, and the
// myrtle, and the oil tree" (Isaiah 41:19).
//
// Out on the dry southern reach of the rim, where the meadow thins toward
// the hills, stand three shittah trees — the acacia of the wilderness, whose
// wood the ark itself would one day be made of. Each is the shape that
// country gives it: a short grey trunk that forks low into a few leaning
// limbs, and over them a broad, flat crown, wider than the tree is tall,
// like a roof held up against the sun.
//
// They never move, so all three bake to one merged vertex-coloured mesh:
// one draw call, far out of the opening frame. Each is namable.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { PATCHES } from './grain.js';
import { mergeColored, mulberry32 } from '../util.js';

const TREES = 3;

const BARK = new THREE.Color(0x6E6052);
const BARK_PALE = new THREE.Color(0x857665);
const CROWN = new THREE.Color(0x6F8443);
const CROWN_DARK = new THREE.Color(0x56692F);
const CROWN_PALE = new THREE.Color(0x87995A);

// Places already spoken for along the south: the grain, the mustard, the
// ostrich's scrape, the ants' hill, the spice bed, the locusts' ground, the
// cleft and the eagle's crag, the ram's thicket and the hyssop.
const TAKEN = [
  ...PATCHES.map(p => ({ x: p.cx, z: p.cz, r: p.r + 3 })),
  { x: 8, z: -24, r: 7 }, { x: 6, z: -30, r: 5 }, { x: 13.6, z: -19.2, r: 4 },
  { x: -9, z: -27, r: 6 }, { x: -16, z: -30, r: 5 }, { x: -30, z: -33, r: 7 },
  { x: -38, z: -30, r: 9 }, { x: 39, z: -24, r: 6 }, { x: 38, z: -20, r: 5 },
  { x: 42, z: -28, r: 5 },
];

function placeTrees(rng, treeSpots) {
  const out = [];
  for (let guard = 0; out.length < TREES && guard < 400; guard++) {
    // The southern arc of the rim: z well to the south, out toward the hills.
    const a = -Math.PI / 2 + (rng() - 0.5) * 1.5;
    const r = 34 + rng() * 11;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) < 6) continue;
    if (TAKEN.some(t => Math.hypot(x - t.x, z - t.z) < t.r)) continue;
    if (treeSpots.some(t => Math.hypot(x - t.x, z - t.z) < 4.5)) continue;
    if (out.some(t => Math.hypot(x - t.x, z - t.z) < 8)) continue;
    out.push({ x, z });
  }
  return out;
}

function treeParts(rng, x, z, parts) {
  const g = heightAt(x, z);
  const scale = 0.9 + rng() * 0.25;
  const trunkH = 1.2 * scale;
  // The short trunk.
  parts.push({
    geo: new THREE.CylinderGeometry(0.16 * scale, 0.24 * scale, trunkH + 0.3, 6)
      .toNonIndexed().translate(x, g + (trunkH + 0.3) / 2 - 0.3, z),
    color: BARK,
  });
  // Forked low into leaning limbs, each reaching out and up toward the edge
  // of the crown.
  const limbs = 3;
  const crownY = g + trunkH + 1.6 * scale;
  const spread = 2.5 * scale;
  const tips = [];
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rng() * 0.8;
    const reach = spread * (0.45 + rng() * 0.2);
    const tx = Math.cos(a) * reach, tz = Math.sin(a) * reach;
    const rise = crownY - (g + trunkH) - 0.1;
    const len = Math.hypot(tx, rise, tz);
    // A cylinder along +Y, laid over toward its tip.
    const dir = new THREE.Vector3(tx, rise, tz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    parts.push({
      geo: new THREE.CylinderGeometry(0.07 * scale, 0.13 * scale, len, 5)
        .toNonIndexed().translate(0, len / 2, 0).applyQuaternion(q)
        .translate(x, g + trunkH - 0.05, z),
      color: i % 2 ? BARK_PALE : BARK,
    });
    tips.push({ x: x + tx, z: z + tz });
  }
  // The flat crown: a broad low slab over everything, and a few lesser flat
  // lobes about its rim and just under it, so it reads as foliage rather
  // than a lid.
  parts.push({
    geo: new THREE.CylinderGeometry(spread, spread * 0.86, 0.42 * scale, 11)
      .toNonIndexed().scale(1, 1, 0.8 + rng() * 0.25).rotateY(rng() * Math.PI)
      .translate(x, crownY + 0.12, z),
    color: CROWN,
  });
  for (const tip of tips) {
    parts.push({
      geo: new THREE.CylinderGeometry(spread * 0.5, spread * 0.42, 0.34 * scale, 8)
        .toNonIndexed().translate(tip.x, crownY - 0.08, tip.z),
      color: CROWN_DARK,
    });
  }
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const rr = spread * (0.55 + rng() * 0.35);
    parts.push({
      geo: new THREE.CylinderGeometry(spread * 0.36, spread * 0.3, 0.28 * scale, 7)
        .toNonIndexed().translate(x + Math.cos(a) * rr, crownY + 0.2 + rng() * 0.12, z + Math.sin(a) * rr),
      color: i % 2 ? CROWN_PALE : CROWN,
    });
  }
  return g;
}

export function createAcacia(scene, treeSpots) {
  // Own seeded stream: three trees on the empty southern rim shift nothing
  // already planted.
  const rng = mulberry32(20260846);
  const at = placeTrees(rng, treeSpots);
  const parts = [];
  const spots = [];
  for (const t of at) {
    const g = treeParts(rng, t.x, t.z, parts);
    spots.push({
      pos: new THREE.Vector3(t.x, g + 1, t.z),
      name: 'Shittah', label: 'the shittah tree', kind: 'tree',
    });
  }
  if (parts.length) {
    const mesh = new THREE.Mesh(
      mergeColored(parts),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    scene.add(mesh);
    for (const part of parts) part.geo.dispose();
  }

  function state() {
    return { count: at.length, trees: at.map(t => ({ x: t.x, z: t.z })) };
  }

  return { spots, state };
}
