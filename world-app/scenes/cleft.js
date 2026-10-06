// "O my dove, that art in the clefts of the rock, in the secret places of
// the stairs, let me see thy countenance, let me hear thy voice; for sweet is
// thy voice, and thy countenance is comely" (Song of Solomon 2:14).
//
// On the south-western rim a rock goes up in ledges like a stair, and
// between two shoulders of it near the top there is a cleft. A dove keeps
// it. From the meadow she is hardly there — a pale shape back in the dark of
// the gap — but come up to the foot of the stair and she steps out to the
// lip of her ledge, turns her face to you, and calls once. Draw away and she
// goes back in; come again, and she shows herself again. The verse asks for
// both the face and the voice, so she gives both, and only to someone who
// has come close enough to ask.
//
// The rock never moves, so the whole of it — stair, shoulders, the back wall
// that closes the cleft — is baked to one merged vertex-coloured geometry.
// The dove is one merged mesh of her own, moved as a whole. Two draw calls.
// The rock also offers the honey (scenes/honey.js, Psalm 81:16) a hollow on
// its far shoulder: `honey` is where, in world space.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32, damp, clamp } from '../util.js';

// The south-western rim, on rising ground between the coneys' rocks and the
// goats' own reach, and clear of every spring's head.
const NEAR = { x: -30, z: -33 };

const STONE = new THREE.Color(0x9A9081);
const STONE_WARM = new THREE.Color(0xAE9F86);
const STONE_DARK = new THREE.Color(0x6E665B);
const LICHEN = new THREE.Color(0x8C9367);
const DOVE = new THREE.Color(0xE4E0D8);
const DOVE_GREY = new THREE.Color(0xB9B6B4);
const DOVE_BEAK = new THREE.Color(0xC28B7A);
const DOVE_EYE = new THREE.Color(0x2A2420);

const STEPS = 5;
const RISE = 0.45;          // each ledge of the stair
const TREAD = 0.65;
const HOME_STEP = 2;        // the ledge the cleft opens onto
const DOVE_IN = -1.45;      // her place back in the cleft (local z)
const DOVE_OUT = -1.0;      // the lip of her ledge
const SHOW_NEAR = 6.5;      // how close one must come to be shown her face
const DOVE_SIZE = 1.35;

function rockParts(rng) {
  const parts = [];
  // The stair, going up away from the meadow. Every ledge runs well down
  // into the ground so a slope never shows daylight under it.
  for (let i = 0; i < STEPS; i++) {
    const top = RISE * (i + 1);
    const h = top + 1.2;
    parts.push({
      geo: new THREE.BoxGeometry(3.7 - i * 0.28, h, TREAD + 0.2).toNonIndexed()
        .rotateY((rng() - 0.5) * 0.08)
        .translate((rng() - 0.5) * 0.12, top - h / 2, -TREAD * i),
      color: i % 2 ? STONE_WARM : STONE,
    });
  }
  // The two shoulders of rock the cleft runs between, and the wall that
  // closes it behind — so the gap reads dark rather than as sky.
  for (const side of [-1, 1]) {
    parts.push({
      geo: new THREE.DodecahedronGeometry(1, 0).toNonIndexed()
        .scale(0.92, 1.65, 1.15)
        .rotateY(side * 0.25)
        .translate(side * 1.2, 1.75, -1.95),
      color: side < 0 ? STONE : STONE_WARM,
    });
    // A little green on the weather side of each.
    parts.push({
      geo: new THREE.DodecahedronGeometry(0.42, 0).toNonIndexed()
        .scale(1, 0.35, 1)
        .translate(side * 1.35, 3.25, -1.8),
      color: LICHEN,
    });
  }
  parts.push({
    geo: new THREE.DodecahedronGeometry(1.4, 0).toNonIndexed()
      .scale(1.3, 1.5, 0.8)
      .translate(0, 1.8, -3.15),
    color: STONE_DARK,
  });
  // The floor of the cleft, darker, a step back from the lip of her ledge.
  parts.push({
    geo: new THREE.BoxGeometry(0.62, 1.2, 0.9).toNonIndexed()
      .translate(0, RISE * (HOME_STEP + 1) + 0.6, -1.75),
    color: STONE_DARK,
  });
  return parts;
}

// She is built facing local +z, standing on (0, 0, 0).
function doveParts() {
  const s = DOVE_SIZE;
  const parts = [];
  parts.push({
    geo: new THREE.IcosahedronGeometry(0.13 * s, 1).toNonIndexed()
      .scale(0.85, 0.85, 1.3).translate(0, 0.13 * s, 0),
    color: DOVE,
  });
  for (const dx of [-1, 1]) {
    parts.push({
      geo: new THREE.IcosahedronGeometry(0.1 * s, 0).toNonIndexed()
        .scale(0.35, 0.6, 1.5).translate(dx * 0.1 * s, 0.15 * s, -0.04 * s),
      color: DOVE_GREY,
    });
  }
  parts.push({
    geo: new THREE.BoxGeometry(0.1 * s, 0.03 * s, 0.2 * s).toNonIndexed()
      .rotateX(-0.25).translate(0, 0.15 * s, -0.22 * s),
    color: DOVE_GREY,
  });
  parts.push({
    geo: new THREE.IcosahedronGeometry(0.075 * s, 1).toNonIndexed()
      .translate(0, 0.27 * s, 0.11 * s),
    color: DOVE,
  });
  parts.push({
    geo: new THREE.ConeGeometry(0.02 * s, 0.07 * s, 4).toNonIndexed()
      .rotateX(Math.PI / 2).translate(0, 0.26 * s, 0.2 * s),
    color: DOVE_BEAK,
  });
  for (const dx of [-1, 1]) {
    parts.push({
      geo: new THREE.SphereGeometry(0.014 * s, 4, 3).toNonIndexed()
        .translate(dx * 0.055 * s, 0.29 * s, 0.15 * s),
      color: DOVE_EYE,
    });
  }
  return parts;
}

export function createCleft(scene) {
  // Own seeded stream: nothing already planted shifts.
  const rng = mulberry32(20260840);

  const x = NEAR.x + (rng() - 0.5) * 2;
  const z = NEAR.z + (rng() - 0.5) * 2;
  // Seat the whole rock on the lowest ground under its footprint, so the
  // stair's foot never stands proud of the slope.
  const yaw = Math.atan2(-x, -z);   // the stair looks back toward the heart of the garden
  let groundY = Infinity;
  for (const [lx, lz] of [[-1.8, 0.4], [1.8, 0.4], [-1.8, -3], [1.8, -3], [0, -1.3]]) {
    const wx = x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
    const wz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
    groundY = Math.min(groundY, heightAt(wx, wz));
  }

  const group = new THREE.Group();
  group.position.set(x, groundY, z);
  group.rotation.y = yaw;
  scene.add(group);

  const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const rockBits = rockParts(rng);
  group.add(new THREE.Mesh(mergeColored(rockBits), lambert()));
  for (const p of rockBits) p.geo.dispose();

  const doveBits = doveParts();
  const dove = new THREE.Mesh(mergeColored(doveBits), lambert());
  for (const p of doveBits) p.geo.dispose();
  const ledgeY = RISE * (HOME_STEP + 1);
  dove.position.set(0, ledgeY, DOVE_IN);
  group.add(dove);
  group.updateMatrixWorld(true);

  // Where the honey's hollow is: high on the warm (+x) shoulder's face,
  // above the stair, looking out the way the stair does.
  const hollow = new THREE.Vector3(1.55, 2.35, -1.05);
  group.localToWorld(hollow);

  const walkerLocal = new THREE.Vector3();
  const doveWorld = new THREE.Vector3();
  let show = 0;
  let armed = true;
  let calls = 0;
  let t = 0;

  function update(dt, walker = null) {
    t += dt;
    let want = 0;
    let face = 0;
    if (walker) {
      walkerLocal.copy(walker);
      group.worldToLocal(walkerLocal);
      const d = Math.hypot(walkerLocal.x, walkerLocal.z - DOVE_OUT);
      want = d < SHOW_NEAR ? 1 : 0;
      // Turned toward whoever has come, as far as the cleft lets her turn.
      face = clamp(Math.atan2(walkerLocal.x, walkerLocal.z - DOVE_OUT), -0.8, 0.8);
    }
    show = damp(show, want, want ? 1.4 : 0.8, dt);

    dove.position.z = DOVE_IN + (DOVE_OUT - DOVE_IN) * show;
    dove.rotation.y = damp(dove.rotation.y, face * show, 3, dt);
    // A dove's small bob as she settles, and her breathing back in the dark.
    dove.position.y = ledgeY + Math.abs(Math.sin(t * 2.3)) * 0.03 * show;
    dove.rotation.x = Math.sin(t * 1.1) * 0.04 * (1 - show);

    // "Let me hear thy voice": once each time she comes out, as she reaches
    // the lip — and not again until she has gone back in.
    if (armed && show > 0.7) { calls++; armed = false; }
    else if (show < 0.15) armed = true;

    doveWorld.set(0, 0.2, 0);
    dove.localToWorld(doveWorld);
  }
  update(0);

  const spots = [{ pos: doveWorld, name: 'Yonati', label: 'the dove in the cleft', kind: 'dove' }];

  return {
    update, spots,
    honey: { x: hollow.x, y: hollow.y, z: hollow.z, yaw },
    state: () => ({ x, z, shown: show, calls }),
  };
}
