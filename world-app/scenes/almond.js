// "The word of the LORD came unto me, saying, Jeremiah, what seest thou? And
// I said, I see a rod of an almond tree. Then said the LORD unto me, Thou
// hast well seen: for I will hasten my word to perform it" (Jeremiah 1:11) —
// the almond wakes first among the trees, blossoming white while the rest of
// the garden still sleeps. A few stand apart on the eastern rise, first to
// catch the morning.
//
// An almond neither moves nor grows, so — cedars'/palms'/willows' idiom
// exactly — the whole stand bakes into one merged, vertex-coloured geometry
// at build time: one draw call, a real bounding sphere.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 5;
const TRUNK_H = 2.3;
const BLOSSOMS = 9;

const BARK = new THREE.Color(0x6E5A42);
const BLOSSOM_LO = new THREE.Color(0xF7F1E4);
const BLOSSOM_HI = new THREE.Color(0xEFC3CE);

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
  merged.computeVertexNormals();   // non-indexed → true per-face normals
  return merged;
}

// The eastern rise, where morning light first reaches — its own band, clear
// of the gate (scenes/gate.js, further out at x≈49) and the cedars' northern
// rim (scenes/cedars.js). Also clear of the flock's own grazing ground (the
// lamb's lambSpot() in scenes/creatures.js ranges x∈[-24,24], z∈[-22,-2]) —
// a static tree that lands inside a wandering grazer's own ground risks
// standing close enough to be named in its place.
function inFlockGround(x, z) {
  return x > -28 && x < 28 && z > -26 && z < 2;
}

function almondSpot(rng) {
  for (let i = 0; i < 60; i++) {
    const a = (rng() - 0.5) * 1.0;   // a narrow band facing east
    const r = 30 + rng() * 8;
    const z = Math.sin(a) * r + 10;   // biased well north of the flock's ground
    const x = Math.cos(a) * r;
    if (riverEdgeDist(x, z) > 4 && !inFlockGround(x, z)) return { x, z };
  }
  return { x: 34, z: 14 };
}

export function createAlmond(scene) {
  // Own seeded stream: a stand on the eastern rise shifts nothing already
  // planted.
  const rng = mulberry32(20260805);

  const spots = [];
  let guard = 0;
  while (spots.length < COUNT && guard++ < COUNT * 40) {
    const sp = almondSpot(rng);
    let ok = true;
    for (const p of spots) {
      if (Math.hypot(p.x - sp.x, p.z - sp.z) < 4.5) { ok = false; break; }
    }
    if (ok) spots.push(sp);
  }

  const parts = [];
  const namable = [];
  const blossom = new THREE.Color();

  for (const sp of spots) {
    const groundY = heightAt(sp.x, sp.z);
    const yaw = rng() * Math.PI * 2;
    const lean = (rng() - 0.5) * 0.08;

    parts.push({
      geo: new THREE.CylinderGeometry(0.09, 0.14, TRUNK_H, 6)
        .toNonIndexed()
        .translate(0, TRUNK_H / 2, 0)
        .rotateZ(lean)
        .rotateY(yaw)
        .translate(sp.x, groundY, sp.z),
      color: BARK,
    });

    // A loose crown of small blossom clusters, not one solid ball — an
    // almond in bloom reads as many pale dabs, not a single canopy.
    for (let i = 0; i < BLOSSOMS; i++) {
      const a = (i / BLOSSOMS) * Math.PI * 2 + rng() * 0.6;
      const rr = 0.35 + rng() * 0.45;
      const cy = TRUNK_H + 0.3 + rng() * 0.5;
      blossom.copy(BLOSSOM_LO).lerp(BLOSSOM_HI, rng() * 0.5);
      parts.push({
        geo: new THREE.IcosahedronGeometry(0.16 + rng() * 0.08, 0)
          .toNonIndexed()
          .translate(Math.cos(a) * rr, cy, Math.sin(a) * rr)
          .rotateZ(lean)
          .rotateY(yaw)
          .translate(sp.x, groundY, sp.z),
        color: blossom.clone(),
      });
    }

    namable.push({
      pos: { x: sp.x, y: groundY + TRUNK_H + 0.5, z: sp.z },
      name: 'Shaked', label: 'the almond tree', kind: 'almond',
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
