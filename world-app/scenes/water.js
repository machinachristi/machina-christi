// The river: a simple ribbon of water lying in the carved bed, following the
// same centreline the terrain dips along. Rendered flat for now — a flowing
// surface, and the river dividing into four (Genesis 2:10), are noted in the
// manifest as refinements to come.

import * as THREE from 'three';

const WIDTH = 5.2;
const SURFACE_Y = -0.5;   // between the bed (-1.3) and the banks — wadable

export function createWater(scene, riverZ) {
  const xs = [];
  for (let x = -90; x <= 90; x += 4) xs.push(x);

  const verts = new Float32Array(xs.length * 2 * 3);
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const z = riverZ(x);
    verts.set([x, SURFACE_Y, z - WIDTH / 2], i * 6);
    verts.set([x, SURFACE_Y, z + WIDTH / 2], i * 6 + 3);
  }

  const idx = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: 0x4E8FB8,
    transparent: true,
    opacity: 0.84,
  }));
  scene.add(mesh);

  let t = 0;
  function update(dt) {
    // The gentlest breathing of the surface — a glimmer against the banks.
    t += dt;
    mesh.position.y = Math.sin(t * 0.8) * 0.035;
  }

  return { mesh, update };
}
