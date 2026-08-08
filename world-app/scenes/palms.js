// "The righteous shall flourish like the palm tree" (Psalm 92:12) — a few
// palms stand apart from the planted wood, out on the open plain, each a
// single upright trunk crowned with a fan of drooping fronds.
//
// A palm neither walks nor wanders, so — the cedars'/willows'/vine's idiom
// exactly — the whole stand bakes into one merged, vertex-coloured geometry
// at build time: one draw call, a real bounding sphere.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 6;
const TRUNK_H = 3.2;
const FRONDS = 7;
const MIN_GAP = 5;

const BARK = new THREE.Color(0x8A6B45);
const BARK_DARK = new THREE.Color(0x715537);
const LEAF_LO = new THREE.Color(0x5FA062);
const LEAF_HI = new THREE.Color(0x7FBE72);

function mergeColored(parts) {
  let count = 0;
  for (const part of parts) count += part.geo.attributes.position.count;
  const posArr = new Float32Array(count * 3);
  const colArr = new Float32Array(count * 3);
  let v = 0;
  for (const { geo, color } of parts) {
    const n = geo.attributes.position.count;
    posArr.set(geo.attributes.position.array, v * 3);
    for (let i = 0; i < n; i++) {
      colArr[(v + i) * 3] = color.r;
      colArr[(v + i) * 3 + 1] = color.g;
      colArr[(v + i) * 3 + 2] = color.b;
    }
    v += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  merged.computeVertexNormals();
  return merged;
}

// The open plain, south of the garden's heart, clear of the river and away
// from the cedars' own northern rim (scenes/cedars.js) — a different reach
// so the two stands read as their own places.
function palmSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 19 + rng() * 22;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 4 && riverEdgeDist(x, z) > 3.5) return { x, z };
  }
  return { x: 8, z: 30 };
}

export function createPalms(scene) {
  // Own seeded stream: a stand on the open plain shifts nothing already
  // planted.
  const rng = mulberry32(20260743);

  const spots = [];
  let guard = 0;
  while (spots.length < COUNT && guard++ < COUNT * 40) {
    const sp = palmSpot(rng);
    let ok = true;
    for (const p of spots) {
      if (Math.hypot(p.x - sp.x, p.z - sp.z) < MIN_GAP) { ok = false; break; }
    }
    if (ok) spots.push(sp);
  }

  const parts = [];
  const namable = [];
  const bark = new THREE.Color();
  const leaf = new THREE.Color();

  for (const sp of spots) {
    const groundY = heightAt(sp.x, sp.z);
    const lean = (rng() - 0.5) * 0.1;
    const yaw = rng() * Math.PI * 2;

    bark.copy(BARK).lerp(BARK_DARK, rng());
    parts.push({
      geo: new THREE.CylinderGeometry(0.1, 0.16, TRUNK_H, 6)
        .toNonIndexed()
        .translate(0, TRUNK_H / 2, 0)
        .rotateZ(lean)
        .rotateY(yaw)
        .translate(sp.x, groundY, sp.z),
      color: bark.clone(),
    });

    for (let i = 0; i < FRONDS; i++) {
      const a = (i / FRONDS) * Math.PI * 2 + yaw;
      const droop = 0.5 + rng() * 0.25;
      leaf.copy(LEAF_LO).lerp(LEAF_HI, rng());
      parts.push({
        geo: new THREE.ConeGeometry(0.05, 1.7, 3)
          .toNonIndexed()
          .translate(0, 0.85, 0)
          .rotateX(Math.PI / 2 - droop)
          .rotateY(a)
          .translate(0, TRUNK_H, 0)
          .rotateZ(lean)
          .translate(sp.x, groundY, sp.z),
        color: leaf.clone(),
      });
    }

    namable.push({
      pos: { x: sp.x, y: groundY + TRUNK_H * 0.55, z: sp.z },
      name: 'Tamar', label: 'the palm tree', kind: 'palm',
    });
  }

  const mesh = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(mesh);
  for (const part of parts) part.geo.dispose();

  return { count: spots.length, spots: namable };
}
