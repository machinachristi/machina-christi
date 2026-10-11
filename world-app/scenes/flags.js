// "Can the rush grow up without mire? can the flag grow without water?"
// (Job 8:11).
//
// Along the slow western reach, where the river runs whole and wide before
// the parting, clumps of flag stand up out of the mire in the shallows just
// inside the water's edge: tufts of tall flat sword-leaves, a few stalks
// each with a bud at the top. In their season — the spring of the long
// year, just after the latter rain (sky.js's LATTER_RAIN) — the buds open
// into blue flowers, and through the rest of the year there are only the
// leaves and the closed green buds. Wade up to a clump and it is named.
//
// Two draw calls: the leaves and stalks of every clump bake to one merged
// vertex-coloured mesh, and every flower is an instance of one more. The
// flowers are recomposed only when the season actually moves them (fig.js's
// idiom), so on an ordinary frame the whole stand costs nothing.

import * as THREE from 'three';
import { heightAt, riverZ, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32, smoothstep } from '../util.js';

const CLUMPS = 7;
const FROM_X = -42, TO_X = -10;   // the slow reach, well west of the parting and the crossing
const SPACING = 3.6;              // clumps at least this far apart along it
const INSHORE = [1.7, 2.3];       // how far out from the centreline — just inside the 2.6 edge
const WATER_Y = -0.5;

const LEAF = new THREE.Color(0x4E7E45);
const LEAF_PALE = new THREE.Color(0x67985A);
const BUD = new THREE.Color(0x5D8A5F);
const FALL = new THREE.Color(0x4B5CC2);       // the three drooping outer petals
const STANDARD = new THREE.Color(0x7586DC);   // the three upright inner ones
const SIGNAL = new THREE.Color(0xE7C24C);     // the yellow mark at the heart

// In bloom: a wrap-aware window over the long year opening as the latter
// rain's season runs out (sky.js: centred 0.93, gone by about the turn of
// the year), and closing again before the year is a fifth gone. Pure, so
// any test can ask it directly.
const OPEN = 0.0;
const SPAN = 0.2;
export function bloomOf(year) {
  const w = (((year - OPEN) % 1) + 1) % 1;
  if (w > SPAN) return 0;
  return smoothstep(0, 0.04, w) * (1 - smoothstep(SPAN - 0.05, SPAN, w));
}

// One flower, built about its own heart at the origin, facing up.
function flowerGeometry() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push({
      geo: new THREE.ConeGeometry(0.05, 0.17, 4).toNonIndexed()
        .scale(1, 1, 0.35).translate(0, 0.085, 0).rotateX(2.0).rotateY(a),
      color: FALL,
    });
    parts.push({
      geo: new THREE.ConeGeometry(0.035, 0.14, 4).toNonIndexed()
        .scale(1, 1, 0.35).translate(0, 0.07, 0).rotateX(0.35).rotateY(a + Math.PI / 3),
      color: STANDARD,
    });
  }
  parts.push({ geo: new THREE.SphereGeometry(0.025, 5, 4).toNonIndexed(), color: SIGNAL });
  return mergeColored(parts);
}

export function createFlags(scene) {
  // Own seeded stream: nothing already planted shifts.
  const rng = mulberry32(20260848);

  const clumps = [];
  for (let tries = 0; clumps.length < CLUMPS && tries < 200; tries++) {
    const x = FROM_X + rng() * (TO_X - FROM_X);
    const side = rng() < 0.5 ? -1 : 1;
    const off = INSHORE[0] + rng() * (INSHORE[1] - INSHORE[0]);
    const z = riverZ(x) + side * off;
    if (riverEdgeDist(x, z) > 0) continue;            // in the water, never on the bank
    if (clumps.some(c => Math.abs(c.x - x) < SPACING)) continue;
    clumps.push({ x, z, side, y: heightAt(x, z) });
  }

  const parts = [];
  const flowers = [];
  for (const c of clumps) {
    const leaves = 7 + Math.floor(rng() * 4);
    for (let i = 0; i < leaves; i++) {
      const a = rng() * Math.PI * 2;
      const lean = 0.06 + rng() * 0.2;
      const h = 1.3 + rng() * 0.7;
      const r = rng() * 0.22;
      parts.push({
        geo: new THREE.ConeGeometry(0.07, h, 4).toNonIndexed()
          .scale(1, 1, 0.22).translate(0, h / 2, 0)
          .rotateX(lean).rotateY(a)
          .translate(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r),
        color: rng() < 0.5 ? LEAF : LEAF_PALE,
      });
    }
    const stalks = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < stalks; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.08 + rng() * 0.16;
      const h = 1.55 + rng() * 0.45;
      const sx = c.x + Math.cos(a) * r, sz = c.z + Math.sin(a) * r;
      parts.push({
        geo: new THREE.CylinderGeometry(0.014, 0.02, h, 4).toNonIndexed().translate(sx, c.y + h / 2, sz),
        color: LEAF,
      });
      parts.push({
        geo: new THREE.ConeGeometry(0.03, 0.13, 4).toNonIndexed().translate(sx, c.y + h + 0.05, sz),
        color: BUD,
      });
      flowers.push({ x: sx, y: c.y + h + 0.06, z: sz, yaw: rng() * Math.PI * 2 });
    }
  }

  const mesh = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(mesh);
  for (const p of parts) p.geo.dispose();

  const bloomMesh = new THREE.InstancedMesh(
    flowerGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    flowers.length,
  );
  // Spread instances: the base geometry's bounding sphere covers none of them.
  bloomMesh.frustumCulled = false;
  scene.add(bloomMesh);

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  let shown = -1;
  let bloom = 0;

  function update(year) {
    bloom = bloomOf(year);
    // Only when the season has really moved them (and always the 0/1 plateaus).
    const settled = bloom === 0 || bloom === 1;
    if (Math.abs(bloom - shown) < 0.004 && !(settled && bloom !== shown)) return;
    shown = bloom;
    bloomMesh.visible = bloom > 0;
    if (!bloomMesh.visible) return;
    flowers.forEach((f, i) => {
      _p.set(f.x, f.y, f.z);
      _q.setFromEuler(_e.set(0, f.yaw, 0));
      _s.setScalar(bloom);
      bloomMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    bloomMesh.instanceMatrix.needsUpdate = true;
  }
  update(0);

  // Named where the clump stands, at the water's own surface.
  const spots = clumps.map(c => ({
    pos: new THREE.Vector3(c.x, WATER_Y, c.z), name: 'Achu', label: 'the flag', kind: 'flag',
  }));

  return {
    update, spots,
    state: () => ({ count: clumps.length, flowers: flowers.length, bloom }),
  };
}
