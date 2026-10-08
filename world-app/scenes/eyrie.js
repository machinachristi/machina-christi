// "She dwelleth and abideth on the rock, upon the crag of the rock, and the
// strong place" (Job 39:28) — and "as an eagle stirreth up her nest,
// fluttereth over her young, spreadeth abroad her wings" (Deuteronomy 32:11).
//
// The eagle that keeps the high air over the garden (creatures.js) has always
// gone home at dusk to a nest on high. Now the nest has a crag under it, out
// on the south-western rim behind the dove's rock, and two eaglets in it.
// When she leaves them in the morning, and once on every round of her day's
// circuit as it brings her past the crag, she comes down over the nest and
// hangs there with her wings spread, beating them, and the young stretch up
// toward her and stir in the sticks until she goes. At night she sits on
// them and they are tucked down out of sight under her.
//
// The crag and the nest never move, so they are baked to one merged
// vertex-coloured geometry; the two eaglets share one InstancedMesh. Two
// draw calls, both far out of the opening frame.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32, damp } from '../util.js';

const AT = { x: -38, z: -30 };
const CRAG_H = 14;
const GROUND = heightAt(AT.x, AT.z);

// Where the eagle sits on her young — read by creatures.js, so the crag
// and the bird can never disagree about where home is.
export const EYRIE = new THREE.Vector3(AT.x, GROUND + CRAG_H + 0.55, AT.z);

// Where the crag stands and the ground at its foot — read by scenes/hind.js
// (v26), whose ledges are shouldered against this same rock.
export const CRAG = { x: AT.x, z: AT.z, ground: GROUND };

const STONE = new THREE.Color(0xA59C8D);
const STONE_WARM = new THREE.Color(0xB5A890);
const STONE_DARK = new THREE.Color(0x877E71);
const LICHEN = new THREE.Color(0x87905F);
const STICK = new THREE.Color(0x5E4A33);
const STICK_PALE = new THREE.Color(0x7E6948);
const DOWN = new THREE.Color(0xE6DFD0);
const DOWN_GREY = new THREE.Color(0xC4BBAA);
const BEAK = new THREE.Color(0x3C3328);

// A seven-sided block of rock, tapering as it rises, its faces pushed in and
// out so no two are alike. The roughening is a fixed function of where each
// corner stands (never a stream draw), so corners the cylinder duplicates at
// its seam and its caps move together and the block stays closed.
export function roughPrism(rBottom, rTop, h) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 7, 2);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
    const f = n - Math.floor(n);
    const k = 1 + (f - 0.5) * 0.34;
    pos.setXYZ(i, v.x * k, v.y + (Math.abs(v.y) > h * 0.49 ? (f - 0.5) * 0.3 : 0), v.z * k);
  }
  return g.toNonIndexed();
}

function cragParts(rng) {
  const parts = [];
  // Blocks of rock stacked into a pinnacle, each narrower than the last and
  // shouldered a little off the one below, the base sunk well into the
  // ground so no slope ever shows daylight under it. The top block's flat
  // is where the nest is laid.
  const tiers = [
    { rb: 3.5, rt: 2.9, h: 5.6, y: 1.6 },
    { rb: 2.8, rt: 2.3, h: 4.2, y: 6.2 },
    { rb: 2.3, rt: 1.95, h: 3.6, y: 9.8 },
    { rb: 1.95, rt: 1.7, h: 2.6, y: 12.7 },
  ];
  tiers.forEach((tr, i) => {
    const ox = (rng() - 0.5) * 0.5, oz = (rng() - 0.5) * 0.5;
    parts.push({
      geo: roughPrism(tr.rb, tr.rt, tr.h)
        .rotateY(rng() * Math.PI)
        .translate(i === tiers.length - 1 ? 0 : ox, tr.y, i === tiers.length - 1 ? 0 : oz),
      color: [STONE, STONE_WARM, STONE, STONE_WARM][i],
    });
    // A few shoulders of loose rock and lichen about each tier.
    for (let k = 0; k < 2; k++) {
      const a = rng() * Math.PI * 2;
      parts.push({
        geo: new THREE.DodecahedronGeometry(0.5 + rng() * 0.5, 0)
          .scale(1, 0.7, 1)
          .translate(ox + Math.cos(a) * tr.rb * 0.85, tr.y - tr.h * 0.25 + rng() * tr.h * 0.4, oz + Math.sin(a) * tr.rb * 0.85),
        color: k ? LICHEN : STONE_DARK,
      });
    }
  });
  // The nest on the flat of the top: a broad ring of sticks round a dished
  // floor, a few sticks jutting out past the rim.
  const top = CRAG_H;
  parts.push({
    geo: new THREE.TorusGeometry(1.05, 0.28, 5, 12).toNonIndexed()
      .rotateX(Math.PI / 2).scale(1, 0.8, 1).translate(0, top + 0.28, 0),
    color: STICK,
  });
  parts.push({
    geo: new THREE.CylinderGeometry(1.05, 0.7, 0.3, 12).toNonIndexed().translate(0, top + 0.12, 0),
    color: STICK_PALE,
  });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rng() * 0.4;
    parts.push({
      geo: new THREE.CylinderGeometry(0.035, 0.035, 1.1 + rng() * 0.5, 4).toNonIndexed()
        .rotateZ(Math.PI / 2)
        .rotateY(-a + (rng() - 0.5) * 0.6)
        .translate(Math.cos(a) * 1.25, top + 0.2 + rng() * 0.25, Math.sin(a) * 1.25),
      color: k % 2 ? STICK : STICK_PALE,
    });
  }
  return parts;
}

// One eaglet: a downy body, a head, a dark hooked beak. Built facing +z
// about its own feet.
function eagletGeometry() {
  return mergeColored([
    { geo: new THREE.SphereGeometry(0.3, 7, 5).toNonIndexed().scale(1, 0.85, 1.1).translate(0, 0.27, 0), color: DOWN },
    { geo: new THREE.SphereGeometry(0.19, 7, 5).toNonIndexed().translate(0, 0.62, 0.12), color: DOWN_GREY },
    { geo: new THREE.ConeGeometry(0.055, 0.17, 4).toNonIndexed().rotateX(Math.PI / 2 + 0.5).translate(0, 0.58, 0.32), color: BEAK },
  ]);
}

export function createEyrie(scene) {
  // Own seeded stream: the crag's own shape shifts nothing already planted.
  const rng = mulberry32(20260843);

  const crag = new THREE.Mesh(
    mergeColored(cragParts(rng)),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  crag.position.set(AT.x, GROUND, AT.z);
  scene.add(crag);

  const young = new THREE.InstancedMesh(
    eagletGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    2,
  );
  young.frustumCulled = false;
  scene.add(young);

  const SEATS = [
    { x: -0.35, z: 0.1, yaw: 0.9 + rng() * 0.4, beat: rng() * Math.PI * 2 },
    { x: 0.38, z: -0.12, yaw: -2.2 + rng() * 0.4, beat: rng() * Math.PI * 2 },
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');   // yaw first, so the stretch pitches each about its own axis
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  let t = 0;
  let stir = 0;     // 0 still → 1 the mother hanging over them, beating her wings
  let tuck = 0;     // 0 up → 1 sat on and tucked down under her for the night

  // `eagle`: the mother's present mode, from creatures.js — 'stir' while she
  // flutters over them, 'nest' while she sits on them.
  function update(dt, eagle = 'fly') {
    t += dt;
    stir = damp(stir, eagle === 'stir' ? 1 : 0, 2.4, dt);
    tuck = damp(tuck, eagle === 'nest' ? 1 : 0, 1.2, dt);
    for (let i = 0; i < SEATS.length; i++) {
      const S = SEATS[i];
      // Stirred up, they stretch tall toward her and bob, quick and eager;
      // left alone, they sit and only now and then lift their heads.
      const bob = Math.abs(Math.sin(t * 6.5 + S.beat)) * 0.12 * stir
        + Math.max(0, Math.sin(t * 0.7 + S.beat * 2)) * 0.03 * (1 - stir);
      const stretch = 1 + 0.32 * stir;
      e.set(-0.35 * stir + Math.sin(t * 5 + S.beat) * 0.08 * stir, S.yaw + Math.sin(t * 0.4 + S.beat) * 0.3, 0);
      p.set(AT.x + S.x, GROUND + CRAG_H + 0.2 + bob - 0.35 * tuck, AT.z + S.z);
      s.set(1, stretch * (1 - 0.45 * tuck), 1);
      young.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    }
    young.instanceMatrix.needsUpdate = true;
  }
  update(0);

  function state() {
    return { x: AT.x, z: AT.z, young: SEATS.length, stir };
  }

  return { update, state };
}
