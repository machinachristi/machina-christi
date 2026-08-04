// "Go to the ant, thou sluggard; consider her ways, and be wise: which having
// no guide, overseer, or ruler, provideth her meat in the summer, and
// gathereth her food in the harvest" (Proverbs 6:6-8). A column of ants works
// a single worn path between their hill and the near edge of the eastern
// grain — out empty, back laden, and no one at all directing them. Like the
// locusts that go forth by bands with no king over them (Proverbs 30:27),
// what governs them is only that they all keep the same road.
//
// One instanced mesh for the whole column and one merged ribbon for the path
// they have worn bare: two draw calls for the lot.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mulberry32, clamp } from '../util.js';

const COUNT = 18;
const HILL = { x: 13.6, z: -19.2 };     // where they live
const HARVEST = { x: 19.8, z: -25.8 };  // the near edge of the eastern grain
const BOW = 1.6;                        // how far the road bends off straight
const SPEED = 0.11;                     // fractions of the path per second
const PATH_W = 0.34;
const SEGMENTS = 24;

// The road, as a function of how far along it you are. A gentle bow, so it
// reads as a trodden way rather than a ruled line.
function pathAt(u) {
  const dx = HARVEST.x - HILL.x, dz = HARVEST.z - HILL.z;
  const len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len;      // perpendicular, in the ground plane
  const bow = Math.sin(u * Math.PI) * BOW;
  return {
    x: HILL.x + dx * u + nx * bow,
    z: HILL.z + dz * u + nz * bow,
  };
}

export function createAnts(scene) {
  // Own seeded stream: a column in the southern meadow shifts nothing planted.
  const rng = mulberry32(20260737);

  // ── The worn path ─────────────────────────────────────────
  // A ribbon of bare ground laid along the road, two triangles a segment,
  // built non-indexed so it merges into one flat geometry with no seams.
  const verts = [];
  const rim = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS;
    const p = pathAt(u);
    const q = pathAt(Math.min(1, u + 0.01));
    const tx = q.x - p.x, tz = q.z - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    // Narrower at both ends, where the traffic fans out and the ground heals.
    const w = PATH_W * (0.35 + 0.65 * Math.sin(u * Math.PI));
    const nx = (-tz / tl) * w, nz = (tx / tl) * w;
    rim.push([
      [p.x + nx, heightAt(p.x + nx, p.z + nz) + 0.04, p.z + nz],
      [p.x - nx, heightAt(p.x - nx, p.z - nz) + 0.04, p.z - nz],
    ]);
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const [l0, r0] = rim[i];
    const [l1, r1] = rim[i + 1];
    verts.push(...l0, ...r0, ...l1);
    verts.push(...r0, ...r1, ...l1);
  }
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const road = new THREE.Mesh(
    pathGeo,
    new THREE.MeshBasicMaterial({
      color: 0x6B5A42,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  scene.add(road);

  // ── The column ────────────────────────────────────────────
  const ants = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.05, 0.045, 0.11),
    new THREE.MeshLambertMaterial({ color: 0x2A2118, flatShading: true }),
    COUNT,
  );
  ants.frustumCulled = false;   // instances spread the whole length of the road
  scene.add(ants);

  // Spread them along the road at the start, half going each way, so the
  // column is already at work the moment the garden is entered.
  const column = [];
  for (let i = 0; i < COUNT; i++) {
    column.push({
      u: rng(),
      dir: i % 2 ? 1 : -1,
      // Each keeps her own lane, a little off the centre of the road.
      lane: (rng() - 0.5) * PATH_W * 1.2,
      rate: 0.85 + rng() * 0.35,
    });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  let working = 1;

  function update(dt, night = 0) {
    // Ants keep the day and rest at night; the road stays worn either way.
    working = clamp(working + (night > 0.5 ? -dt : dt) * 1.5, 0, 1);
    ants.visible = working > 0.02;
    if (!ants.visible) return;

    for (let i = 0; i < COUNT; i++) {
      const a = column[i];
      a.u += a.dir * SPEED * a.rate * dt * working;
      if (a.u >= 1) { a.u = 1; a.dir = -1; }
      if (a.u <= 0) { a.u = 0; a.dir = 1; }

      const here = pathAt(a.u);
      const ahead = pathAt(clamp(a.u + a.dir * 0.02, 0, 1));
      const tx = ahead.x - here.x, tz = ahead.z - here.z;
      const tl = Math.hypot(tx, tz) || 1;
      const x = here.x + (-tz / tl) * a.lane;
      const z = here.z + (tx / tl) * a.lane;

      p.set(x, heightAt(x, z) + 0.05, z);
      q.setFromAxisAngle(Y_AXIS, Math.atan2(tx * a.dir, tz * a.dir));
      m.compose(p, q, s);
      ants.setMatrixAt(i, m);
    }
    ants.instanceMatrix.needsUpdate = true;
  }
  update(0);

  // Namable where the road begins, at the hill itself (Genesis 2:19-20).
  const spots = [{
    pos: { x: HILL.x, y: heightAt(HILL.x, HILL.z) + 0.1, z: HILL.z },
    name: 'Nemalah', label: 'the ant', kind: 'ant',
  }];

  return { update, spots, count: COUNT, state: () => ({ count: COUNT, working }) };
}
