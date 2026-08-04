// "And ye shall take you on the first day the boughs of goodly trees,
// branches of palm trees, and the boughs of thick trees, and willows of the
// brook" (Leviticus 23:40) — willows along the one wide stretch of the
// river, west of where it parts into its four heads. They lean out over the
// water the way a willow always does, their fronds hanging almost to the
// surface, so the brook is roofed in green wherever it runs widest.
//
// A willow neither walks nor wanders, so the whole stand bakes into a single
// merged, vertex-coloured geometry at build time — the cedars' idiom exactly
// (scenes/cedars.js): one draw call for all of them, and a real bounding
// sphere, so looking away from the water costs nothing.

import * as THREE from 'three';
import { heightAt, riverZ, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 7;
const TRUNK_H = 3.0;
const LEAN = 0.34;          // how far the trunk tips out over the brook
const FRONDS = 9;

// The river runs as one 5.2-wide course until it parts at x = 22; that whole
// upstream stretch is where it is widest, and where the willows keep.
const REACH = { min: -42, max: 18 };

const BARK = new THREE.Color(0x6B5B44);
const LEAF_LO = new THREE.Color(0x6E8A52);
const LEAF_HI = new THREE.Color(0x93AB70);

// Concatenate non-indexed geometries, painting each one its own flat colour
// into a shared vertex-colour attribute.
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

export function createWillows(scene) {
  // Own seeded stream: a stand on the banks shifts nothing already planted.
  const rng = mulberry32(20260735);

  // Alternate banks as we go downstream, so the brook is shaded from both
  // sides rather than lined along one. `side` is which bank; the trunk then
  // leans back the other way, out over the water.
  const spots = [];
  let guard = 0;
  while (spots.length < COUNT && guard++ < COUNT * 40) {
    const x = REACH.min + rng() * (REACH.max - REACH.min);
    const side = spots.length % 2 ? 1 : -1;
    // The course's outer edge sits 2.6 from the centreline upstream; stand
    // the trunk just back from it, on dry ground.
    const z = riverZ(x) + side * (3.05 + rng() * 0.8);
    if (riverEdgeDist(x, z) < 0.3) continue;
    let ok = true;
    for (const p of spots) {
      if (Math.hypot(p.x - x, p.z - z) < 6) { ok = false; break; }
    }
    if (ok) spots.push({ x, z, side, yaw: rng() * Math.PI * 2 });
  }

  const leaf = new THREE.Color();
  const parts = [];
  const namable = [];

  for (const sp of spots) {
    const groundY = heightAt(sp.x, sp.z);
    // Lean toward the water: the bank is at `side`, so the crown goes the
    // other way. A rotation about +x tips the trunk toward +z.
    const lean = -sp.side * LEAN;

    parts.push({
      geo: new THREE.CylinderGeometry(0.12, 0.25, TRUNK_H, 6)
        .toNonIndexed()
        .rotateY(sp.yaw)
        .translate(0, TRUNK_H / 2, 0)
        .rotateX(lean)
        .translate(sp.x, groundY, sp.z),
      color: BARK,
    });

    // The crown: a low squashed mass the fronds hang from.
    leaf.copy(LEAF_LO).lerp(LEAF_HI, rng());
    parts.push({
      geo: new THREE.IcosahedronGeometry(0.95, 0)
        .toNonIndexed()
        .scale(1, 0.55, 1)
        .translate(0, TRUNK_H + 0.1, 0)
        .rotateX(lean)
        .translate(sp.x, groundY, sp.z),
      color: leaf.clone(),
    });

    // The fronds, hanging: a ring of long thin cones tipped apex-down, each
    // splayed a little outward from the crown so they fall as a curtain.
    for (let i = 0; i < FRONDS; i++) {
      const a = (i / FRONDS) * Math.PI * 2 + rng() * 0.4;
      const r = 0.55 + rng() * 0.5;
      const len = 1.6 + rng() * 1.3;
      const splay = 0.18 + rng() * 0.22;
      leaf.copy(LEAF_LO).lerp(LEAF_HI, rng());
      parts.push({
        geo: new THREE.ConeGeometry(0.075, len, 4)
          .toNonIndexed()
          .rotateX(Math.PI)              // apex down: a frond hangs
          .translate(0, -len / 2, 0)     // and hangs from its own origin
          .rotateZ(splay)                // tipped outward, toward +x
          .rotateY(a)                    // swung round to its own quarter
          .translate(Math.cos(a) * r, TRUNK_H + 0.15, -Math.sin(a) * r)
          .rotateX(lean)
          .translate(sp.x, groundY, sp.z),
        color: leaf.clone(),
      });
    }

    // Namable like everything else that grows here (Genesis 2:19-20) — and
    // `aravah` is the very word Leviticus 23:40 uses for them.
    namable.push({
      pos: { x: sp.x, y: groundY + TRUNK_H * 0.6, z: sp.z },
      name: 'Aravah', label: 'the willow', kind: 'willow',
    });
  }

  const stand = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(stand);
  for (const part of parts) part.geo.dispose();

  return { count: spots.length, spots: namable };
}
