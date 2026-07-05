// The land: gently rolling low-poly ground, rising to a soft rim at the
// garden's edge (the fog swallows anything beyond), with a riverbed carved
// along a meandering curve — "a river went out of Eden to water the garden;
// and from thence it was parted, and became into four heads" (Genesis 2:10).
// West of the parting the river runs whole; east of the garden it fans into
// four channels that carve through the rim and vanish into the mist. One
// analytic height function is shared by the mesh, the character, the camera,
// and every planted thing, so they always agree.

import * as THREE from 'three';
import { lerp, smoothstep } from '../util.js';

export const GARDEN_RADIUS = 50;   // how far the walk may wander
const SIZE = 170;                  // ground plane extent (edges hide in fog)
const SEGMENTS = 64;

// The river's centreline: z as a gentle function of x. Upstream this is the
// whole river; past the parting it is the spine the four heads fan out from.
export function riverZ(x) {
  return Math.sin(x * 0.055) * 9 + 14;
}

// Where the parting begins, how far the fan takes to open, and where each
// head rides across it (in multiples of the growing gap).
const SPLIT_X = 22;
const FAN_LENGTH = 32;
const HEADS = [-1.5, -0.5, 0.5, 1.5];

// The river's cross-section at x: four channel centrelines and their shared
// half-width. Upstream the four lie edge to edge, tiling the one wide course
// exactly (4 × 1.3 = the old 5.2-wide river), so land and water stay seamless
// where the parting begins; eastward the gap grows and each head narrows.
export function riverCourse(x) {
  const t = smoothstep(SPLIT_X, SPLIT_X + FAN_LENGTH, x);
  const ease = t * t;
  const zc = riverZ(x);
  const gap = 1.3 + ease * 16;
  return {
    centers: HEADS.map(h => zc + h * gap),
    halfWidth: 0.65 + ease * 1.05,
  };
}

// Distance from (x, z) to the nearest water's edge — 0 anywhere on water.
// The carve, the sandy banks, and every planting rule share this measure.
export function riverEdgeDist(x, z) {
  const { centers, halfWidth } = riverCourse(x);
  let d = Infinity;
  for (const zc of centers) d = Math.min(d, Math.abs(z - zc));
  return Math.max(0, d - halfWidth);
}

export function heightAt(x, z) {
  // Rolling meadow.
  let h = 1.5 * Math.sin(x * 0.085) * Math.cos(z * 0.07)
        + 0.8 * Math.sin(x * 0.16 + 1.7) * Math.sin(z * 0.13 + 0.6);

  // A calm clearing at the heart of the garden, where the two trees stand.
  const r = Math.hypot(x, z);
  h = lerp(0.25, h, smoothstep(6, 13, r));

  // The rim: land rises toward the edges so the horizon is always garden.
  h += smoothstep(40, 58, r) * 3.2;

  // The riverbed — one course through the garden, four heads past the
  // parting — blended smoothly into the banks.
  h = lerp(-1.3, h, smoothstep(0, 3.4, riverEdgeDist(x, z)));

  return h;
}

// Meadow palette, chosen per-face for the classic faceted low-poly look.
const SAND = new THREE.Color(0xD9C58C);
const GRASS_LO = new THREE.Color(0x5E9B54);
const GRASS_HI = new THREE.Color(0x8CC072);
const GRASS_DRY = new THREE.Color(0x9FB56A);

export function createTerrain(scene, rng) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS).toNonIndexed();
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }

  // Per-face colours: all three vertices of a triangle share one tone.
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;

    const nearRiver = 1 - smoothstep(0, 2.7, riverEdgeDist(cx, cz));
    const high = smoothstep(1.2, 4.2, cy);

    c.copy(GRASS_LO).lerp(GRASS_HI, smoothstep(-0.5, 1.6, cy) * 0.9 + rng() * 0.1);
    c.lerp(GRASS_DRY, high * 0.55);          // paler on the rim heights
    c.lerp(SAND, nearRiver);                 // sandy banks along the water
    c.offsetHSL(0, 0, (rng() - 0.5) * 0.045); // faceted shimmer

    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 3] = c.r;
      colors[(f + v) * 3 + 1] = c.g;
      colors[(f + v) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();   // non-indexed → true per-face normals

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);

  return { mesh, heightAt, riverZ, radius: GARDEN_RADIUS };
}
