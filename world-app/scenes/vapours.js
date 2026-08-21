// "He causeth the vapours to ascend from the ends of the earth" (Psalm
// 135:7) — through the heat of the middle day, thin columns of vapour lift
// off the water and the warm low ground, climb, thin out, and are gone.
//
// Deliberately the mist's opposite number (scenes/mist.js): the mist is a
// ground-hugging veil of the last watch of the night, burnt away by
// t≈0.2; the vapours only begin well after it has gone, stand upright
// rather than lying flat, and belong to the noon the mist never sees. They
// keep off entirely while it rains — vapour rising is what happens *before*
// the water comes down, not during.
//
// One instanced open-ended cone per column, so each reads the same from any
// angle with no billboarding (nothing here has the camera). The whole field
// shares one material and so fades in and out as one with the hour —
// puddles'/dew's idiom — while each column's own climb is carried in its
// instance matrix.

import * as THREE from 'three';
import { heightAt, riverEdgeDist, riverZ } from './terrain.js';
import { clamp, mulberry32 } from '../util.js';

const COUNT = 30;
const RISE = 3.4;          // how far a column climbs before it is spent
const CENTER = 0.35;       // the heat of the day, inside sky.js's noon (0.24–0.46)
const HALF = 0.12;

// How strongly the vapours presently stand, 0 to 1 — one soft pulse over
// the middle of the day. Pure, so anything that wants to know what it
// should be seeing reads the same function the field itself does.
export function vapourOf(t) {
  return Math.max(0, 1 - Math.abs(t - CENTER) / HALF);
}

export function createVapours(scene) {
  // Own seeded stream: a field of columns shifts nothing already planted.
  const rng = mulberry32(20260818);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xDCE7EA,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Open-ended and hinged at its foot, so scaling a column in y grows it up
  // out of the ground rather than out of its own middle.
  const geo = new THREE.CylinderGeometry(0.55, 0.16, 1, 6, 1, true)
    .translate(0, 0.5, 0);

  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.frustumCulled = false;   // instance transforms outrun the base bounds
  mesh.renderOrder = 2;         // over the water it rises from
  scene.add(mesh);

  // Most of them stand over the water; the rest off the warm open ground
  // either side of it.
  const bases = [];
  for (let i = 0; i < COUNT; i++) {
    let x, z;
    if (i % 5 < 3) {
      x = -44 + rng() * 88;
      z = riverZ(x) + (rng() - 0.5) * 3.2;
    } else {
      let guard = 0;
      do {
        const a = rng() * Math.PI * 2;
        const r = 10 + rng() * 34;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      } while (riverEdgeDist(x, z) < 1.5 && guard++ < 20);
    }
    bases.push({
      x, z,
      groundY: heightAt(x, z) + 0.1,
      phase: rng(),                   // where in its own climb it starts
      rate: 0.055 + rng() * 0.055,    // climbs of its own, unhurried
      width: 0.5 + rng() * 0.65,
      drift: (rng() - 0.5) * 0.5,     // leans a little as it goes up
    });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  let level = 0;

  function update(dt, cycleT, rain = 0) {
    level = vapourOf(cycleT) * (1 - clamp(rain * 2.2, 0, 1));
    mat.opacity = 0.13 * level;
    mesh.visible = level > 0.02;
    if (!mesh.visible) return;

    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      b.phase = (b.phase + b.rate * dt) % 1;
      const k = b.phase;
      // Thin out and widen as it climbs, then shrink away at the top of the
      // rise — a column is spent by the time it gets there, and reappears
      // at the foot without ever being seen to.
      const spent = k * k;
      const height = 0.6 + k * RISE;
      const wide = b.width * (0.35 + k * 1.5) * (1 - spent);
      p.set(b.x + b.drift * k * RISE, b.groundY, b.z);
      s.set(wide, height, wide);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { update, state: () => ({ count: COUNT, level }) };
}
