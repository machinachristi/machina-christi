// "The valleys also are covered over with corn; they shout for joy, they
// also sing" (Psalm 65:13) — thin grain stalks stand in two low valleys of
// open meadow, still through the day, swaying together the instant the
// evening gust reaches them (scenes/wind.js) — the same wind, the same
// moment, that already bows every canopy in vegetation.js.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { windOf, gustAt } from './wind.js';
import { mulberry32 } from '../util.js';

const PATCHES = [
  { cx: -26, cz: -22, r: 9 },
  { cx: 21, cz: -27, r: 8 },
];
const PER_PATCH = 90;
const TILT = 0.6;   // radians at full gust — a far freer sway than a canopy

const WIND_AXIS = new THREE.Vector3(0, 0, -1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function createGrain(scene) {
  const rng = mulberry32(20260723);

  const spots = [];
  for (const patch of PATCHES) {
    let placed = 0, guard = 0;
    while (placed < PER_PATCH && guard++ < PER_PATCH * 20) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * patch.r;
      const x = patch.cx + Math.cos(a) * rr;
      const z = patch.cz + Math.sin(a) * rr;
      if (riverEdgeDist(x, z) < 2.2) continue;
      spots.push({ x, z });
      placed++;
    }
  }

  const geo = new THREE.ConeGeometry(0.028, 0.62, 4);
  geo.translate(0, 0.31, 0);   // hinge at the ground, not the stalk's centre
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshLambertMaterial({ flatShading: true }),
    spots.length,
  );
  const colorA = new THREE.Color(0xC9A84A);
  const colorB = new THREE.Color(0xDBBE6A);
  const bases = [];
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const yaw = rng() * Math.PI * 2;
      const scale = 0.75 + rng() * 0.55;
      const groundY = heightAt(sp.x, sp.z);
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      s.setScalar(scale);
      m.compose(new THREE.Vector3(sp.x, groundY, sp.z), q, s);
      mesh.setMatrixAt(i, m);
      c.copy(colorA).lerp(colorB, rng());
      mesh.setColorAt(i, c);
      bases.push({ x: sp.x, z: sp.z, groundY, yaw, scale });
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  scene.add(mesh);

  // Scratch, reused every frame — the same idiom as vegetation.js's own
  // canopy sway, so no allocation rides the render loop.
  const windQ = new THREE.Quaternion();
  const yawQ = new THREE.Quaternion();
  const mixQ = new THREE.Quaternion();
  const m2 = new THREE.Matrix4();
  const p2 = new THREE.Vector3();
  const s2 = new THREE.Vector3();

  // Skipped entirely outside the gust's window: `settled` remembers whether
  // every stalk has already been written back to its upright rest pose, so
  // the long stretches of a still day cost nothing at all.
  let settled = true;

  function update(cycleT, sabbath) {
    const w = windOf(cycleT, sabbath);
    if (w <= 0 && settled) return;
    settled = w <= 0;

    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      const g = gustAt(cycleT, b.x, sabbath);
      windQ.setFromAxisAngle(WIND_AXIS, g * TILT);
      yawQ.setFromAxisAngle(Y_AXIS, b.yaw);
      mixQ.multiplyQuaternions(windQ, yawQ);
      p2.set(b.x, b.groundY, b.z);
      s2.setScalar(b.scale);
      m2.compose(p2, mixQ, s2);
      mesh.setMatrixAt(i, m2);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { update };
}
