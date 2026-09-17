// "For there is hope of a tree, if it be cut down, that it will sprout again,
// and that the tender branch thereof will not cease. Though the root thereof
// wax old in the earth, and the stock thereof die in the ground; yet through
// the scent of water it will bud, and bring forth boughs like a plant"
// (Job 14:7-9).
//
// One tree in the garden is down. What is left is a broken stock a little
// over knee height, its old roots humped out of the bank, and the pale torn
// face where the rest of it came away. It stands close enough to the river to
// be within the scent of water, which in Job is the whole reason for what
// happens next: a ring of tender shoots has come up out of the rim of it.
//
// The shoots keep the long year rather than the day (scenes/fig.js's clock,
// sky.js's `year`) — they thicken and lengthen through the growing turn and
// draw back in the cold one. What they never do is stop: the floor of the
// year is well clear of nothing at all, because the verse is not that it may
// sprout, but that the tender branch thereof will not cease.
//
// Two draw calls: the stock bakes to one merged geometry, and every shoot
// rides one instanced mesh.

import * as THREE from 'three';
import { heightAt, riverEdgeDist, riverZ } from './terrain.js';
import { mergeColored, mulberry32, clamp } from '../util.js';

const SHOOTS = 11;
const RIM = 0.34;          // how far out on the broken rim they come up
// The stock itself, and how far above the bank the torn face sits.
const STOCK_H = 0.72;
const STOCK_R = 0.42;

// Never nothing: the tender branch does not cease, so the year's floor is a
// third of its full growth rather than a bare stump in the cold turn. The
// cold turn is the same stretch of the year scenes/hoarfrost.js keeps and
// scenes/fig.js leaves the fig bare on.
const FLOOR = 0.34;
const COLD_TURN = 0.74;

const BARK = new THREE.Color(0x5A4632);
const BARK_DARK = new THREE.Color(0x3E3123);
const TORN = new THREE.Color(0xC2A87E);    // the pale face where it came away
const ROOT = new THREE.Color(0x4C3D2B);
const SHOOT = new THREE.Color(0x6F9440);
const SHOOT_LEAF = new THREE.Color(0x8FBA53);

// How far out the shoots presently are, FLOOR to 1, over sky.js's own long
// year. Pure, so a test can ask the same question the stump is answering.
export function budOf(year) {
  const y = ((year % 1) + 1) % 1;
  // Distance round the ring from the coldest turn, 0 (deep cold) to 1
  // (furthest from it) — the growing half of the year is simply everywhere
  // the cold one is not.
  let d = Math.abs(y - COLD_TURN);
  if (d > 0.5) d = 1 - d;
  const warm = d / 0.5;
  return FLOOR + (1 - FLOOR) * (warm * warm * (3 - 2 * warm));
}

// A bank close enough to the water to be within the scent of it, but standing
// out of it — the upstream course, west of the crossing.
//
// The offset off the centreline that works elsewhere does not work here: the
// carve along this reach is wide and shallow, and the ground is still a good
// way under the water's own surface four or five units out. So each candidate
// marches outward until it finds ground that is genuinely dry, the way
// scenes/behemoth.js finds its bank, and the closest such bank of all the
// candidates wins — nearest the water is the point of the verse.
function stumpSpot(rng) {
  let best = null;
  for (let i = 0; i < 48; i++) {
    const x = -40 + rng() * 30;
    const side = rng() < 0.5 ? -1 : 1;
    for (let off = 2.2; off <= 13; off += 0.25) {
      const z = riverZ(x) + side * off;
      const d = riverEdgeDist(x, z);
      if (d < 0.9 || heightAt(x, z) < -0.2) continue;
      if (d <= 6 && (!best || d < best.d)) best = { x, z, d };
      break;
    }
  }
  return best || { x: -34, z: riverZ(-34) + 5.6 };
}

// One tender shoot with a few leaves on it, built once and shared by every
// instance: base at the origin, growing up +Y.
function shootGeometry() {
  const parts = [];
  parts.push({
    geo: new THREE.CylinderGeometry(0.014, 0.03, 0.62, 4)
      .toNonIndexed()
      .translate(0, 0.31, 0),
    color: SHOOT,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const at = 0.24 + i * 0.1;
    parts.push({
      geo: new THREE.ConeGeometry(0.055, 0.19, 4)
        .toNonIndexed()
        .scale(1, 1, 0.45)
        .rotateX(-Math.PI / 2)
        .translate(0, 0, 0.095)
        .rotateX(-0.75)
        .rotateY(a)
        .translate(0, at, 0),
      color: i % 2 ? SHOOT_LEAF : SHOOT,
    });
  }
  const merged = mergeColored(parts);
  for (const part of parts) part.geo.dispose();
  return merged;
}

export function createStump(scene) {
  // Own seeded stream: a tree already down on an empty bank shifts nothing
  // already planted.
  const rng = mulberry32(20260837);

  const at = stumpSpot(rng);
  const groundY = heightAt(at.x, at.z);
  const parts = [];
  const tint = new THREE.Color();

  // The stock: a short, slightly leaning barrel of old wood.
  const lean = (rng() - 0.5) * 0.18;
  parts.push({
    geo: new THREE.CylinderGeometry(STOCK_R * 0.92, STOCK_R * 1.15, STOCK_H, 9)
      .toNonIndexed()
      .rotateZ(lean)
      .translate(at.x, groundY + STOCK_H * 0.45, at.z),
    color: BARK,
  });
  // The torn face across the top — not a clean cut, a break: a shallow cap
  // tilted off the level, pale where the wood is open.
  parts.push({
    geo: new THREE.CylinderGeometry(STOCK_R * 0.86, STOCK_R * 0.9, 0.09, 9)
      .toNonIndexed()
      .rotateX(0.16)
      .rotateZ(lean)
      .translate(at.x, groundY + STOCK_H * 0.9, at.z),
    color: TORN,
  });
  // A couple of splinters still standing off the break, where it gave.
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI * 2;
    const out = STOCK_R * (0.3 + rng() * 0.45);
    parts.push({
      geo: new THREE.ConeGeometry(0.06, 0.2 + rng() * 0.22, 3)
        .toNonIndexed()
        .translate(0, 0.12, 0)
        .rotateZ((rng() - 0.5) * 0.5)
        .rotateY(a)
        .translate(at.x + Math.cos(a) * out, groundY + STOCK_H * 0.9, at.z + Math.sin(a) * out),
      color: TORN,
    });
  }
  // The old roots, waxing old in the earth: humps breaking the bank round
  // the foot of it.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng() * 0.5;
    const len = 0.6 + rng() * 0.5;
    tint.copy(ROOT).lerp(BARK_DARK, rng());
    parts.push({
      geo: new THREE.CylinderGeometry(0.05, 0.14, len, 4)
        .toNonIndexed()
        .rotateX(Math.PI / 2)          // laid along +Z
        .rotateX(0.42)                 // and pitched down into the ground
        .translate(0, 0, len * 0.42)
        .rotateY(a)
        .translate(at.x, groundY + 0.1, at.z),
      color: tint.clone(),
    });
  }

  const stock = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(stock);
  for (const part of parts) part.geo.dispose();

  // ── The tender branch ─────────────────────────────────────
  const mesh = new THREE.InstancedMesh(
    shootGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    SHOOTS,
  );
  scene.add(mesh);

  const shoots = [];
  const c = new THREE.Color();
  for (let i = 0; i < SHOOTS; i++) {
    // Up out of the rim of the break, leaning outward and away — nothing
    // comes up through the middle of a stock.
    const a = (i / SHOOTS) * Math.PI * 2 + rng() * 0.4;
    const out = RIM * (0.72 + rng() * 0.5);
    const x = at.x + Math.cos(a) * out;
    const z = at.z + Math.sin(a) * out;
    shoots.push({
      x, z,
      y: groundY + STOCK_H * (0.62 + rng() * 0.26),
      tilt: 0.22 + rng() * 0.3,
      face: Math.atan2(Math.cos(a), Math.sin(a)),   // lean away from the stock
      vigour: 0.78 + rng() * 0.44,
    });
    c.copy(SHOOT).lerp(SHOOT_LEAF, rng() * 0.5).multiplyScalar(1.15);
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  let out = -1;

  function update(year = 0) {
    const grown = budOf(year);
    // Only recompose when the year has actually moved the shoots — on an
    // ordinary frame this whole crop costs nothing (scenes/fig.js's rule).
    if (Math.abs(grown - out) < 0.002) return;
    out = grown;
    for (let i = 0; i < SHOOTS; i++) {
      const S = shoots[i];
      const g = clamp(grown * S.vigour, 0, 1.25);
      p.set(S.x, S.y, S.z);
      e.set(S.tilt * g, S.face, 0, 'YXZ');
      s.set(0.55 + 0.45 * g, g, 0.55 + 0.45 * g);
      m.compose(p, q.setFromEuler(e), s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);

  // "Geza", the stock — Isaiah 11:1's own word for exactly this thing, the
  // cut-down stem that a rod comes out of.
  const spots = [{
    pos: { x: at.x, y: groundY + STOCK_H + 0.4, z: at.z },
    name: 'Geza', label: 'the stump', kind: 'stump',
  }];

  return {
    update,
    spots,
    state: () => ({
      x: at.x, z: at.z,
      shoots: SHOOTS,
      bud: clamp(out, 0, 1),
    }),
  };
}
