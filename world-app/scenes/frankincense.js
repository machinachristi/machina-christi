// "I am come into my garden, my sister, my spouse: I have gathered my myrrh
// with my spice... A garden inclosed is my sister, my spouse... Spikenard
// and saffron; calamus and cinnamon, with all trees of frankincense" (Song
// of Solomon 4:14, 5:1) — a few low, gnarled frankincense trees stand apart
// on the garden's warmer western slope, sparse and pale-barked, fragrant in
// the sun.
//
// A frankincense tree neither moves nor grows, so — cedars'/palms'/almond's
// idiom exactly — the whole stand bakes into one merged, vertex-coloured
// geometry at build time: one draw call, a real bounding sphere.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 6;
const TRUNK_H = 1.4;
const TUFTS = 4;

const BARK = new THREE.Color(0xC9B48C);
const BARK_DARK = new THREE.Color(0xA88F63);
const LEAF_LO = new THREE.Color(0x8FA07A);
const LEAF_HI = new THREE.Color(0xB0BB93);

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

// The garden's warmer western slope — its own band, clear of the spring's
// own rise further out (scenes/spring.js) and the palms' open southern
// plain (scenes/palms.js).
function frankincenseSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const a = Math.PI + (rng() - 0.5) * 1.1;
    const r = 20 + rng() * 9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > 4) return { x, z };
  }
  return { x: -24, z: 2 };
}

export function createFrankincense(scene) {
  // Own seeded stream: a stand on the western slope shifts nothing already
  // planted.
  const rng = mulberry32(20260806);

  const spots = [];
  let guard = 0;
  while (spots.length < COUNT && guard++ < COUNT * 40) {
    const sp = frankincenseSpot(rng);
    let ok = true;
    for (const p of spots) {
      if (Math.hypot(p.x - sp.x, p.z - sp.z) < 4.2) { ok = false; break; }
    }
    if (ok) spots.push(sp);
  }

  const parts = [];
  const namable = [];
  const bark = new THREE.Color();
  const leaf = new THREE.Color();

  for (const sp of spots) {
    const groundY = heightAt(sp.x, sp.z);
    const yaw = rng() * Math.PI * 2;
    const lean = (rng() - 0.5) * 0.35;   // gnarled — leans harder than a cedar

    bark.copy(BARK).lerp(BARK_DARK, rng());
    parts.push({
      geo: new THREE.CylinderGeometry(0.1, 0.2, TRUNK_H, 6)
        .toNonIndexed()
        .translate(0, TRUNK_H / 2, 0)
        .rotateZ(lean)
        .rotateY(yaw)
        .translate(sp.x, groundY, sp.z),
      color: bark.clone(),
    });

    // A few sparse tufts, well apart — not a full canopy. Frankincense
    // grows thin and pale, not lush.
    for (let i = 0; i < TUFTS; i++) {
      const a = (i / TUFTS) * Math.PI * 2 + rng() * 0.5;
      const rr = 0.3 + rng() * 0.3;
      leaf.copy(LEAF_LO).lerp(LEAF_HI, rng());
      parts.push({
        geo: new THREE.ConeGeometry(0.28, 0.5, 5)
          .toNonIndexed()
          .translate(Math.cos(a) * rr, TRUNK_H + 0.2, Math.sin(a) * rr)
          .rotateZ(lean)
          .rotateY(yaw)
          .translate(sp.x, groundY, sp.z),
        color: leaf.clone(),
      });
    }

    namable.push({
      pos: { x: sp.x, y: groundY + TRUNK_H + 0.3, z: sp.z },
      name: 'Levonah', label: 'the frankincense tree', kind: 'frankincense',
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
