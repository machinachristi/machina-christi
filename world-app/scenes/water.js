// The river alive: low-poly water lying in the carved bed, built from the
// same riverCourse() the terrain carves — one course through the garden,
// parted into four heads east of it (Genesis 2:10). The surface is four
// narrow strips that tile the wide course edge-to-edge upstream and fan
// apart past the parting, and its vertices ripple downstream every frame,
// so the water visibly flows toward the heads.

import * as THREE from 'three';
import { riverCourse } from './terrain.js';

const SURFACE_Y = -0.5;   // between the bed (-1.3) and the banks — wadable
const X_MIN = -90;
const X_MAX = 90;
const STEP_X = 3;                    // sampling pitch along the flow
const ACROSS = [-1, -0.4, 0.4, 1];   // cross-section, as fractions of halfWidth

// The flowing surface: two waves travelling downstream (+x) and a soft
// cross-ripple. Amplitudes sum to ±0.1, so the water never climbs the banks
// (y = 0) nor drains below the bed (y = -1.3).
function surfaceY(x, z, t) {
  return SURFACE_Y
    + 0.050 * Math.sin(x * 0.55 - t * 2.2 + z * 0.30)
    + 0.030 * Math.sin(x * 1.40 - t * 3.5 + z * 0.80)
    + 0.020 * Math.sin(z * 1.20 + t * 0.90);
}

export function createWater(scene) {
  // Non-indexed triangles: computeVertexNormals then gives true per-face
  // normals, so the rippling surface glints facet by facet like the terrain.
  const verts = [];
  const sections = Math.round((X_MAX - X_MIN) / STEP_X);

  for (let head = 0; head < 4; head++) {
    for (let i = 0; i < sections; i++) {
      const xA = X_MIN + i * STEP_X;
      const xB = X_MIN + (i + 1) * STEP_X;
      const a = riverCourse(xA);
      const b = riverCourse(xB);
      for (let c = 0; c < ACROSS.length - 1; c++) {
        const zA0 = a.centers[head] + ACROSS[c] * a.halfWidth;
        const zA1 = a.centers[head] + ACROSS[c + 1] * a.halfWidth;
        const zB0 = b.centers[head] + ACROSS[c] * b.halfWidth;
        const zB1 = b.centers[head] + ACROSS[c + 1] * b.halfWidth;
        verts.push(
          xA, SURFACE_Y, zA0, xA, SURFACE_Y, zA1, xB, SURFACE_Y, zB0,
          xA, SURFACE_Y, zA1, xB, SURFACE_Y, zB1, xB, SURFACE_Y, zB0,
        );
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: 0x4E8FB8,
    transparent: true,
    opacity: 0.84,
  }));
  scene.add(mesh);

  let t = 0;
  function update(dt) {
    t += dt;
    const arr = geo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] = surfaceY(arr[i], arr[i + 2], t);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  return { mesh, update };
}
