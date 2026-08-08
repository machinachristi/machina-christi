// "The ungodly are not so: but are like the chaff which the wind driveth
// away" (Psalm 1:4) — set against the tree planted by the rivers of water,
// whose leaf does not wither (Psalm 1:3, scenes/watertree.js), a scatter of
// loosened leaves rests on the meadow and only stirs when the same evening
// gust that bows the trees (scenes/wind.js) reaches each one in turn.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';
import { gustAt } from './wind.js';

const COUNT = 24;
const BOUND = 45;
const TONES = [0xB8863E, 0x9C6B2E, 0xC79A4B, 0x8A5A2A];

function scatterSpot(rng) {
  for (let i = 0; i < 60; i++) {
    const x = (rng() * 2 - 1) * BOUND;
    const z = (rng() * 2 - 1) * BOUND;
    if (Math.hypot(x, z) < BOUND && riverEdgeDist(x, z) > 1.4) return { x, z };
  }
  return { x: -20, z: 12 };
}

export function createLeaves(scene) {
  // Own seeded stream: a ground scatter shifts nothing already planted.
  const rng = mulberry32(20260740);

  const mesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.07),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    COUNT,
  );
  mesh.frustumCulled = false;   // scattered across the whole meadow
  scene.add(mesh);
  const c = new THREE.Color();

  const leaves = [];
  for (let i = 0; i < COUNT; i++) {
    const spot = scatterSpot(rng);
    c.setHex(TONES[Math.floor(rng() * TONES.length)]);
    mesh.setColorAt(i, c);
    leaves.push({
      x: spot.x, z: spot.z,
      spin: rng() * Math.PI * 2,
      wobble: rng() * Math.PI * 2,
    });
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);

  let t = 0;
  let scudding = 0;
  function update(dt, cycleT = 0.1, sabbath = false) {
    t += dt;
    scudding = 0;
    for (let i = 0; i < COUNT; i++) {
      const L = leaves[i];
      const gust = gustAt(cycleT, L.x, sabbath);
      if (gust > 0.02) {
        L.x += gust * 2.4 * dt;
        L.spin += gust * 8 * dt;
        scudding++;
        if (L.x > BOUND) {
          const spot = scatterSpot(rng);
          L.x = Math.min(spot.x, -BOUND * 0.55);
          L.z = spot.z;
        }
      }
      const flutter = gust > 0.02 ? Math.abs(Math.sin(t * 8 + L.wobble)) * 0.05 * gust : 0;
      p.set(L.x, heightAt(L.x, L.z) + 0.025 + flutter, L.z);
      e.set(Math.PI / 2 + gust * 0.5, L.spin, L.wobble);
      m.compose(p, q.setFromEuler(e), s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0);   // seat the leaves before the pre-ready warm-up frame
  return { update, state: () => ({ count: COUNT, scudding }) };
}
