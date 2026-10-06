// "He should have fed them also with the finest of the wheat: and with honey
// out of the rock should I have satisfied thee" (Psalm 81:16).
//
// High on the warm shoulder of the dove's rock (scenes/cleft.js) there is a
// hollow, and wild bees have built in it: a few pale-gold combs hanging in
// the dark of it, with the honey come down over the lip of the stone in
// slow runs. A handful of bees work the air in front of it by day and are
// gone in at night. Nobody keeps them and nobody takes it — it is simply
// there in the rock, which is the whole of the verse: the satisfying was
// already provided, in the last place anyone would look for it.
//
// The comb and its runs never move, so they are one merged geometry; the
// bees are one instanced mesh, like the garden's other bees (creatures.js).
// Two draw calls. The comb is namable: `devash`, honey.

import * as THREE from 'three';
import { mergeColored, mulberry32, smoothstep } from '../util.js';

const COMB = new THREE.Color(0xE2B65A);
const COMB_DEEP = new THREE.Color(0xC28B2C);
const RUN = new THREE.Color(0xD99A2B);
const HOLLOW = new THREE.Color(0x3A332B);
const BEE = new THREE.Color(0xD9A830);
const BEE_DARK = new THREE.Color(0x2E2618);

const BEES = 6;

// Built in the hollow's own frame: +z looks out of the rock, y is up.
function combParts(rng) {
  const parts = [];
  // The dark of the hollow itself, set just into the face of the stone.
  parts.push({
    geo: new THREE.CircleGeometry(0.42, 9).toNonIndexed()
      .scale(1, 1.25, 1).translate(0, 0, 0.02),
    color: HOLLOW,
  });
  // Three combs hanging side by side in it, each a flat slab of hexagonal
  // cells seen end-on, longest in the middle.
  for (let i = 0; i < 3; i++) {
    const dx = (i - 1) * 0.17;
    const len = i === 1 ? 0.62 : 0.44 + rng() * 0.08;
    for (let c = 0; c < 5; c++) {
      const cy = 0.24 - (c / 4) * len;
      parts.push({
        geo: new THREE.CylinderGeometry(0.065, 0.065, 0.09, 6).toNonIndexed()
          .rotateX(Math.PI / 2)
          .translate(dx + (c % 2) * 0.03 - 0.015, cy, 0.09),
        color: c % 2 ? COMB : COMB_DEEP,
      });
    }
  }
  // The honey come down over the lip of the stone in slow runs, each
  // thinning to a drop that never quite falls.
  for (let i = 0; i < 4; i++) {
    const dx = (rng() - 0.5) * 0.5;
    const len = 0.22 + rng() * 0.3;
    parts.push({
      geo: new THREE.CylinderGeometry(0.03, 0.012, len, 5).toNonIndexed()
        .translate(dx, -0.5 - len / 2, 0.08),
      color: RUN,
    });
    parts.push({
      geo: new THREE.SphereGeometry(0.032, 5, 4).toNonIndexed()
        .translate(dx, -0.5 - len, 0.08),
      color: RUN,
    });
  }
  return parts;
}

function beeGeometry() {
  return mergeColored([
    { geo: new THREE.SphereGeometry(0.045, 6, 4).toNonIndexed().scale(0.8, 0.8, 1.5), color: BEE },
    { geo: new THREE.SphereGeometry(0.03, 5, 3).toNonIndexed().translate(0, 0, 0.07), color: BEE_DARK },
    { geo: new THREE.PlaneGeometry(0.09, 0.05).toNonIndexed().rotateX(-Math.PI / 2).translate(0, 0.035, 0), color: new THREE.Color(0xF2F0E8) },
  ]);
}

// `at` is the hollow in world space and the way the rock's face looks out
// ({x, y, z, yaw}) — handed over from the cleft, which owns the rock.
export function createHoney(scene, at) {
  // Own seeded stream: nothing already planted shifts.
  const rng = mulberry32(20260841);

  const group = new THREE.Group();
  group.position.set(at.x, at.y, at.z);
  group.rotation.y = at.yaw;
  scene.add(group);

  const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const bits = combParts(rng);
  const comb = new THREE.Mesh(mergeColored(bits), lambert());
  // A little warmth of its own, so the gold still reads in the rock's shade.
  comb.material.emissive = new THREE.Color(0x3A2608);
  group.add(comb);
  for (const p of bits) p.geo.dispose();

  const bees = new THREE.InstancedMesh(beeGeometry(), lambert(), BEES);
  bees.frustumCulled = false;   // the instances wander off the base geometry's bounds
  group.add(bees);

  // Each bee keeps its own loose loop in front of the hollow.
  const loops = [];
  for (let i = 0; i < BEES; i++) {
    loops.push({
      r: 0.35 + rng() * 0.75,
      speed: (1.6 + rng() * 1.4) * (rng() < 0.5 ? -1 : 1),
      phase: rng() * Math.PI * 2,
      lift: (rng() - 0.5) * 0.7,
      out: 0.45 + rng() * 0.5,
    });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  let t = 0;
  let out = 1;

  // `night` (0 day → 1 dark): the bees are in by dark, and out again by day.
  function update(dt, night = 0, rain = 0) {
    t += dt;
    out = (1 - smoothstep(0.3, 0.5, night)) * (1 - smoothstep(0.3, 0.6, rain));
    bees.visible = out > 0.02;
    if (!bees.visible) return;
    for (let i = 0; i < BEES; i++) {
      const L = loops[i];
      const a = L.phase + t * L.speed;
      // In nearer the hollow as they go in for the night.
      const k = out;
      p.set(
        Math.cos(a) * L.r * k,
        L.lift * k + Math.sin(a * 2.3) * 0.08,
        0.12 + (L.out + Math.sin(a) * L.r * 0.5) * k,
      );
      // Facing the way it flies round its loop.
      q.setFromEuler(e.set(0, Math.atan2(-Math.sin(a) * L.speed, Math.cos(a) * L.speed * 0.5), 0));
      m.compose(p, q, s);
      bees.setMatrixAt(i, m);
    }
    bees.instanceMatrix.needsUpdate = true;
  }
  update(0);

  const spots = [{
    pos: { x: at.x, y: at.y, z: at.z },
    name: 'Devash', label: 'honey out of the rock', kind: 'honey',
  }];

  return { update, spots, state: () => ({ x: at.x, z: at.z, bees: bees.visible ? BEES : 0 }) };
}
