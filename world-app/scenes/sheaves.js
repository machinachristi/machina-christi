// "For, behold, we were binding sheaves in the field, and, lo, my sheaf
// arose, and also stood upright" (Genesis 37:7) — at the edge of each grain
// valley (scenes/grain.js), a few sheaves stand bound and upright where the
// corn has been cut, each one a gathered fistful of stalks tied about the
// middle and splayed at the head.
//
// A bound sheaf is the stillest thing in the garden — it does not even sway
// with the standing grain beside it, having been cut from the ground it grew
// in — so the whole set bakes into one merged, vertex-coloured geometry
// (cedars'/lilies' idiom): one draw call for every sheaf in both fields.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { PATCHES } from './grain.js';
import { mergeColored, mulberry32 } from '../util.js';

const PER_PATCH = 3;
const STALKS = 11;
const HEIGHT = 0.95;

const STRAW_LO = new THREE.Color(0xC9A84A);
const STRAW_HI = new THREE.Color(0xE0CB84);
const BAND = new THREE.Color(0x8A6B32);

export function createSheaves(scene) {
  // Own seeded stream: sheaves standing at the field's edge shift nothing
  // already planted.
  const rng = mulberry32(20260822);

  const parts = [];
  const namable = [];
  const straw = new THREE.Color();

  for (const patch of PATCHES) {
    let placed = 0, guard = 0;
    while (placed < PER_PATCH && guard++ < PER_PATCH * 30) {
      // Out at the rim of the standing corn, where a reaper would have
      // worked in to it — never in the middle of the uncut field.
      const a = rng() * Math.PI * 2;
      const rr = patch.r * (0.82 + rng() * 0.3);
      const x = patch.cx + Math.cos(a) * rr;
      const z = patch.cz + Math.sin(a) * rr;
      if (riverEdgeDist(x, z) < 2.2) continue;
      const groundY = heightAt(x, z);
      const lean = (rng() - 0.5) * 0.12;   // stood up by hand, not by rule

      // The stalks: a ring of them gathered in at the waist and splaying
      // outward above and below, which is the whole shape of a bound sheaf.
      for (let i = 0; i < STALKS; i++) {
        const sa = (i / STALKS) * Math.PI * 2 + rng() * 0.4;
        const splay = 0.1 + rng() * 0.08;
        const h = HEIGHT * (0.86 + rng() * 0.28);
        straw.copy(STRAW_LO).lerp(STRAW_HI, rng());
        parts.push({
          geo: new THREE.CylinderGeometry(0.035, 0.02, h, 4)
            .toNonIndexed()
            .translate(0, h / 2, 0)
            .rotateZ(splay)
            .rotateY(sa)
            .rotateZ(lean)
            .translate(x, groundY, z),
          color: straw.clone(),
        });
      }
      // The band that binds it, a little below the middle.
      parts.push({
        geo: new THREE.CylinderGeometry(0.13, 0.13, 0.09, 7)
          .toNonIndexed()
          .rotateZ(lean)
          .translate(x, groundY + HEIGHT * 0.42, z),
        color: BAND,
      });

      namable.push({
        pos: { x, y: groundY + HEIGHT * 0.8, z },
        name: 'Alummah', label: 'the sheaf', kind: 'sheaf',
      });
      placed++;
    }
  }

  const mesh = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(mesh);
  for (const part of parts) part.geo.dispose();

  return { count: namable.length, spots: namable };
}
