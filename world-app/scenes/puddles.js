// After the shower, low puddles glisten a while in the ground before the
// earth drinks them in (Psalm 65:10: "thou waterest the ridges thereof
// abundantly... thou settlest the furrows thereof"). A fixed field of
// shallow discs on the open meadow; the whole field fills fast while the
// rain falls and drains slowly once it has passed — one instanced mesh,
// one draw call, only its shared opacity ever changes.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { damp, clamp, mulberry32 } from '../util.js';

const COUNT = 26;
const FILL_LAMBDA = 0.7;    // quick to gather
const DRAIN_LAMBDA = 0.09;  // the earth drinks them in slowly

export function createPuddles(scene) {
  // Own seeded stream: a fixed scatter shifts nothing already planted.
  const rng = mulberry32(20260728);

  const mesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.6, 10),
    new THREE.MeshBasicMaterial({
      color: 0xBFDCEA, transparent: true, opacity: 0, depthWrite: false, fog: false,
    }),
    COUNT,
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < COUNT * 30) {
    const a = rng() * Math.PI * 2;
    const r = 3 + Math.sqrt(rng()) * 44;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) < 2.4) continue;   // low ground, not the water itself
    p.set(x, heightAt(x, z) + 0.025, z);
    const scale = 0.55 + rng() * 0.9;
    s.set(scale, scale, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;

  let wet = 0;
  let t = 0;

  function update(dt, rainLevel = 0) {
    t += dt;
    const target = rainLevel > 0.12 ? 1 : 0;
    wet = damp(wet, target, target > wet ? FILL_LAMBDA : DRAIN_LAMBDA, dt);
    if (wet < 0.004) wet = 0;
    mesh.visible = wet > 0.01;
    if (mesh.visible) {
      mesh.material.opacity = clamp(wet, 0, 1) * (0.42 + 0.08 * Math.sin(t * 1.7));
    }
  }

  function state() {
    return { wet, count: placed };
  }

  return { update, state };
}
