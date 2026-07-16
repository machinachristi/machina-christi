// Gold and bdellium and onyx glint among the stones where the Pishon runs —
// "the wealth of that land" (Genesis 2:11-12): "the name of the first is
// Pison: that is it which compasseth the whole land of Havilah, where there
// is gold; and the gold of that land is good: there is bdellium and the
// onyx stone." A dozen small stones scattered along the Pishon's own bank —
// four golden, four pale as resin, four dark as onyx — one shared material
// so the whole scatter glints together, the way the stars breathe (sky.js).

import * as THREE from 'three';
import { heightAt, riverCourse } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 12;
const HEAD_INDEX = 0;      // Pishon is HEADS[0] in terrain.js's fan (stones.js agrees)
const X_MIN = 26, X_MAX = 47;   // the same reach the Pishon's standing stone claims

const GOLD = new THREE.Color(0xD9B23C);
const BDELLIUM = new THREE.Color(0xE7DCC3);   // pale, waxen — a resin-stone
const ONYX = new THREE.Color(0x2B2A2E);

export function createWealth(scene) {
  // Own seeded stream: a scatter along one bank shifts nothing already planted.
  const rng = mulberry32(20260717);

  const mat = new THREE.MeshLambertMaterial({
    flatShading: true, emissive: 0x3A2E12, emissiveIntensity: 0.25,
  });
  const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.09, 0), mat, COUNT);
  mesh.frustumCulled = false;   // sits well off scene-centre, out along the Pishon
  scene.add(mesh);

  const tones = [GOLD, GOLD, GOLD, GOLD, BDELLIUM, BDELLIUM, BDELLIUM, BDELLIUM, ONYX, ONYX, ONYX, ONYX];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    const x = X_MIN + rng() * (X_MAX - X_MIN);
    const { centers, halfWidth } = riverCourse(x);
    const side = rng() < 0.5 ? -1 : 1;
    const z = centers[HEAD_INDEX] + side * (halfWidth + 0.3 + rng() * 1.6);
    p.set(x, heightAt(x, z) + 0.05, z);
    q.setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI));
    s.setScalar(0.7 + rng() * 0.7);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, tones[i]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;

  let t = 0;
  function update(dt) {
    t += dt;
    mat.emissiveIntensity = 0.22 + 0.14 * Math.sin(t * 1.7);
  }

  return { update, count: COUNT };
}
