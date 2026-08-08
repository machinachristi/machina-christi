// "The conies are but a feeble folk, yet make they their houses in the
// rocks" (Proverbs 30:26) — a few small, shy creatures keep the same high
// rocky rim as the goats (scenes/creatures.js's goatSpot), and duck low
// toward their own houses in the rocks now and then, on no one's schedule
// but their own.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const COUNT = 6;
const DUCK_LEN = 0.7;    // seconds a duck takes, dip and recover

const COAT = new THREE.Color(0x8C7A5E);
const COAT_DARK = new THREE.Color(0x5E5240);

function conySpot(rng) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 37 + rng() * 10;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > 4) return { x, z };
  }
  return { x: 40, z: 18 };
}

export function createConies(scene) {
  // Own seeded stream: a scatter among the rocks shifts nothing already
  // planted.
  const rng = mulberry32(20260741);

  const mesh = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.09, 0.14, 3, 6),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    COUNT,
  );
  scene.add(mesh);
  const c = new THREE.Color();

  const conies = [];
  const spots = [];
  for (let i = 0; i < COUNT; i++) {
    const spot = conySpot(rng);
    const groundY = heightAt(spot.x, spot.z);
    c.copy(COAT).lerp(COAT_DARK, rng());
    mesh.setColorAt(i, c);
    const pos = new THREE.Vector3(spot.x, groundY + 0.12, spot.z);
    conies.push({
      x: spot.x, z: spot.z, groundY, pos,
      yaw: rng() * Math.PI * 2,
      bob: rng() * Math.PI * 2,
      timer: 3 + rng() * 12,
      duck: 0,
    });
    spots.push({ pos, name: 'Shaphan', label: 'the coney', kind: 'coney' });
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();

  let t = 0;
  function update(dt) {
    t += dt;
    for (let i = 0; i < COUNT; i++) {
      const C = conies[i];
      if (C.duck > 0) {
        C.duck -= dt;
      } else {
        C.timer -= dt;
        if (C.timer <= 0) {
          C.duck = DUCK_LEN;
          C.timer = 6 + rng() * 14;
        }
      }
      // A quick dip toward the rocks and back — feeble folk, quick to hide.
      const u = C.duck > 0 ? 1 - Math.max(0, C.duck) / DUCK_LEN : 0;
      const dip = C.duck > 0 ? Math.sin(u * Math.PI) : 0;
      const bobY = Math.sin(t * 1.6 + C.bob) * 0.012;
      C.pos.set(C.x, C.groundY + 0.12 - dip * 0.08 + bobY, C.z);
      e.set(0, C.yaw, 0);
      s.setScalar(1 - dip * 0.35);
      m.compose(C.pos, q.setFromEuler(e), s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0);
  return { update, spots, state: () => ({ count: COUNT }) };
}
