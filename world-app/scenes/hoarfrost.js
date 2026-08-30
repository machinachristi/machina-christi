// "He giveth snow like wool: he scattereth the hoarfrost like ashes"
// (Psalm 147:16) — on the coldest turn of the garden's long year, frost lies
// scattered over the open grass through the last watch of the night, and is
// gone off it before the morning is properly up.
//
// The cold turn is the same stretch of the 28-day year the fig stands bare
// through (scenes/fig.js) — one season, read by two different things, so the
// garden's year hangs together rather than each module keeping its own.
//
// One instanced field of pale flecks, one shared opacity for the whole of it
// (scenes/puddles.js's and scenes/dew.js's trick): a single draw call that
// costs nothing at all on the many days it is not the season for.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { clamp, damp, mulberry32, smoothstep } from '../util.js';

const COUNT = 240;
const COLD_TURN = 0.74;    // where the fig's bare season sits in the long year
const COLD_HALF = 0.10;    // roughly five days of the twenty-eight

// How thick the hoarfrost presently lies, 0 to 1 — the cold of the year times
// the cold of the night. Pure, so a test (or a curious visitor with
// `__world.setDay()` and `__world.setTime()`) can ask for exactly the hour it
// should be seeing frost. It gathers deep in the night and is off the grass
// well before the hour every visit opens at, so no ordinary morning finds it.
export function frostOf(year, cycleT) {
  const y = ((year % 1) + 1) % 1;
  let d = Math.abs(y - COLD_TURN);
  if (d > 0.5) d = 1 - d;                       // the year is a circle
  const season = 1 - smoothstep(COLD_HALF * 0.5, COLD_HALF, d);
  const t = ((cycleT % 1) + 1) % 1;
  // Gathering through the night, gone by first light: t < 0.05 or t > 0.86.
  const watch = t > 0.5
    ? smoothstep(0.86, 0.93, t)
    : 1 - smoothstep(0.02, 0.05, t);
  return season * watch;
}

export function createHoarfrost(scene) {
  // Own seeded stream: a scatter over the meadow shifts nothing already
  // planted.
  const rng = mulberry32(20260821);

  const mesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.2, 5),
    new THREE.MeshBasicMaterial({
      color: 0xE8F2F6, transparent: true, opacity: 0, depthWrite: false, fog: true,
    }),
    COUNT,
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < COUNT * 30) {
    const a = rng() * Math.PI * 2;
    const r = 4 + Math.sqrt(rng()) * 44;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) < 1.4) continue;   // never on the water, nor its wet sand
    // Flat to the ground, each fleck turned its own way so the scatter never
    // reads as a pattern — ashes, not tiles.
    e.set(-Math.PI / 2, 0, rng() * Math.PI * 2);
    p.set(x, heightAt(x, z) + 0.02, z);
    const scale = 0.45 + rng() * 0.85;
    s.set(scale, scale * (0.6 + rng() * 0.6), 1);
    m.compose(p, q.setFromEuler(e), s);
    mesh.setMatrixAt(placed, m);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;

  let lay = 0;

  function update(dt, year = 0, cycleT = 0.1) {
    // Damped, so a jump of the clock still settles rather than snapping.
    lay = damp(lay, frostOf(year, cycleT), 1.6, dt);
    if (lay < 0.004) lay = 0;
    mesh.visible = lay > 0.01;
    if (mesh.visible) mesh.material.opacity = clamp(lay, 0, 1) * 0.55;
  }

  function state() {
    return { lay, count: placed };
  }

  return { update, state };
}
