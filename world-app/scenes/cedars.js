// "The trees of the LORD are full of sap; the cedars of Lebanon, which he
// hath planted" (Psalm 104:16) — a stand of tall cedars along the garden's
// northern rim, where the ground climbs toward the fog. Taller than anything
// else that grows here, and broad-tiered, so the northern horizon reads as a
// ridge of them rather than more of the same meadow canopy.
//
// A cedar neither moves nor grows, so the whole stand is baked into a single
// merged, vertex-coloured geometry at build time (the same idiom as the
// standing stones): one draw call for all of them, and a real bounding
// sphere, so looking away from the north rim costs nothing at all.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 11;
// Three broad tiers per cedar, each a flattened cone: wide and low at the
// bottom, narrowing to a blunt crown. `y` is a fraction of the tree's height,
// and each tier is deliberately tall enough to overlap the one below it —
// leave a gap and the crown reads as three thin umbrellas on a pole rather
// than one layered mass of cedar.
const TIERS = [
  { y: 0.52, r: 2.20, h: 2.20 },
  { y: 0.70, r: 1.75, h: 2.00 },
  { y: 0.86, r: 1.20, h: 1.80 },
];

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

export function createCedars(scene) {
  // Own seeded stream: a stand on the far rim shifts nothing already planted.
  const rng = mulberry32(20260731);

  // North is +z here, the same reading as the stork's fir at the northwest
  // reach (scenes/storks.js). The river's four heads fan wide across the
  // northeast, so the bank guard is what keeps a cedar out of the water.
  const spots = [];
  let guard = 0;
  while (spots.length < COUNT && guard++ < COUNT * 40) {
    const ang = (rng() * 2 - 1) * 0.75;
    const r = 40 + rng() * 6;
    const x = Math.sin(ang) * r;
    const z = Math.cos(ang) * r;
    if (riverEdgeDist(x, z) < 4) continue;
    let ok = true;
    for (const p of spots) {
      if (Math.hypot(p.x - x, p.z - z) < 4.2) { ok = false; break; }
    }
    if (ok) spots.push({ x, z, height: 9.5 + rng() * 3.5, yaw: rng() * Math.PI * 2 });
  }

  const BARK = new THREE.Color(0x5F4A33);
  const SAP_LO = new THREE.Color(0x2C5138);   // deep, well-watered green
  const SAP_HI = new THREE.Color(0x487A4A);
  const sap = new THREE.Color();
  const parts = [];

  for (const sp of spots) {
    const groundY = heightAt(sp.x, sp.z);
    const trunkH = sp.height * TIERS[0].y + 0.4;
    parts.push({
      geo: new THREE.CylinderGeometry(0.24, 0.46, trunkH, 6)
        .toNonIndexed()
        .rotateY(sp.yaw)
        .translate(sp.x, groundY + trunkH / 2, sp.z),
      color: BARK,
    });
    for (const tier of TIERS) {
      sap.copy(SAP_LO).lerp(SAP_HI, rng());
      parts.push({
        geo: new THREE.ConeGeometry(tier.r, tier.h, 7)
          .toNonIndexed()
          .rotateY(sp.yaw)
          .translate(sp.x, groundY + sp.height * tier.y, sp.z),
        color: sap.clone(),
      });
    }
  }

  const stand = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(stand);
  for (const part of parts) part.geo.dispose();

  return { count: spots.length };
}
