// "As the lily among thorns, so is my love among the daughters" (Song of
// Solomon 2:2) — small stands of white lilies keep the garden's rougher
// ground, each one ringed by the low thorn scrub it has come up through.
// The thorns are not cleared away for them: the lily is only ever the lily
// *among* the thorns, and stands the whiter for it.
//
// Neither a lily nor a briar moves, so — cedars'/frankincense's idiom
// exactly — blooms, stems and thorns alike bake into one merged,
// vertex-coloured geometry at build time: a single draw call for the lot.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const CLUSTERS = 7;
const THORNS_PER = 8;
const LILIES_PER = 3;
const STEM_H = 0.44;

const THORN = new THREE.Color(0x4B4534);
const THORN_DRY = new THREE.Color(0x6D6249);
const STEM = new THREE.Color(0x6F8A52);
const PETAL = new THREE.Color(0xFBF8EE);
const PETAL_WARM = new THREE.Color(0xF2E7CC);

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

// The rougher middle ground, well back from the water — thorn scrub keeps
// the dry places, not the banks.
function lilySpot(rng) {
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2;
    const r = 19 + rng() * 15;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > 5) return { x, z };
  }
  return { x: 24, z: -6 };
}

export function createLilies(scene) {
  // Own seeded stream: a scatter of stands shifts nothing already planted.
  const rng = mulberry32(20260814);

  const spots = [];
  let guard = 0;
  while (spots.length < CLUSTERS && guard++ < CLUSTERS * 40) {
    const sp = lilySpot(rng);
    let ok = true;
    for (const p of spots) {
      if (Math.hypot(p.x - sp.x, p.z - sp.z) < 6) { ok = false; break; }
    }
    if (ok) spots.push(sp);
  }

  const parts = [];
  const namable = [];
  const thornC = new THREE.Color();
  const petalC = new THREE.Color();

  for (const sp of spots) {
    const groundY = heightAt(sp.x, sp.z);

    // The briars first: a low ring of dry, splayed spines around the stand.
    for (let i = 0; i < THORNS_PER; i++) {
      const a = (i / THORNS_PER) * Math.PI * 2 + rng() * 0.7;
      const rr = 0.55 + rng() * 0.5;
      const h = 0.3 + rng() * 0.26;
      thornC.copy(THORN).lerp(THORN_DRY, rng());
      parts.push({
        geo: new THREE.ConeGeometry(0.06, h, 4)
          .toNonIndexed()
          .translate(0, h / 2, 0)
          .rotateZ((rng() - 0.5) * 0.9)   // splayed outward, never upright
          .rotateY(a)
          .translate(sp.x + Math.cos(a) * rr, groundY, sp.z + Math.sin(a) * rr),
        color: thornC.clone(),
      });
    }

    // And the lilies standing up through the middle of them, taller than
    // any thorn around.
    for (let i = 0; i < LILIES_PER; i++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * 0.24;
      const lx = sp.x + Math.cos(a) * rr;
      const lz = sp.z + Math.sin(a) * rr;
      const h = STEM_H * (0.85 + rng() * 0.35);

      parts.push({
        geo: new THREE.CylinderGeometry(0.017, 0.026, h, 4)
          .toNonIndexed()
          .translate(lx, groundY + h / 2, lz),
        color: STEM.clone(),
      });

      // The bloom: a cone stood on its point, so it opens upward like a
      // trumpet rather than tapering to one.
      petalC.copy(PETAL).lerp(PETAL_WARM, rng());
      parts.push({
        geo: new THREE.ConeGeometry(0.115, 0.24, 6)
          .toNonIndexed()
          .rotateX(Math.PI)
          .translate(lx, groundY + h + 0.11, lz),
        color: petalC.clone(),
      });
    }

    namable.push({
      pos: { x: sp.x, y: groundY + STEM_H + 0.2, z: sp.z },
      name: 'Shoshanah', label: 'the lily', kind: 'lily',
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
