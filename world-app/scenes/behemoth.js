// "Behold now behemoth, which I made with thee; he eateth grass as an ox...
// He lieth under the shady trees, in the covert of the reed, and fens. The
// shady trees cover him with their shadow; the willows of the brook compass
// him about" (Job 40:15, 21-22). The chief of the ways of God, and what he
// is doing is lying down in the reeds. Nothing in the passage has him fight
// or hunt or go anywhere at all: "he eateth grass as an ox," and the river
// could rise to his mouth and he would not hurry.
//
// So he does not wander. He is placed once, on the bank beside one of the
// willows of the brook (scenes/willows.js), with the reeds about him and the
// water a step away, and from then on the only things that move are his
// breathing and the slow lifting and lowering of his head. He is by a long
// way the largest creature in the garden, and by a long way the stillest.
//
// Two draw calls: his still parts merged into one vertex-coloured geometry
// (the wallow he has worn into the bank baked in with them), his head merged
// into another on its own pivot — the grazers' own build in
// scenes/creatures.js, minus the legs he has no use for.

import * as THREE from 'three';
import { heightAt, riverZ, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32, damp, clamp } from '../util.js';

// Hide, not stone. An earlier grey-brown put him within a shade of the
// garden's own boulders (0xB3A78D, and darker in shadow) and he read as one:
// a rounded mass at the water's edge with nothing to say it was alive. These
// are warmer and browner, and the belly is pale enough to give him an
// underside — which is half of what tells a beast from a rock.
const HIDE = new THREE.Color(0x7C6244);
const HIDE_DARK = new THREE.Color(0x5C4730);
const BELLY = new THREE.Color(0xA48A63);
const RIDGE = new THREE.Color(0x4B3927);
const WALLOW = new THREE.Color(0x4A4033);

const HEAD_LOW = 0.34;    // muzzle down in the grass, where it mostly is
const HEAD_HIGH = -0.16;  // and lifted, now and then, to look at the water

// Out from the river's centreline on `side` until the ground is genuinely
// proud of the water (the surface sits at y = -0.5) and clear of the
// channel — the bank, in other words, and not the fen itself, so the whole
// bulk of him is seen rather than sunk.
function bankNear(x, side) {
  const zc = riverZ(x);
  for (let d = 2.8; d <= 10; d += 0.2) {
    const z = zc + side * d;
    if (riverEdgeDist(x, z) > 1.2 && heightAt(x, z) > -0.3) return z;
  }
  return zc + side * 6;
}

function bodyParts() {
  const parts = [];
  // The barrel of him: one long cask lying along his own length.
  parts.push({
    geo: new THREE.CapsuleGeometry(0.86, 1.9, 4, 8)
      .toNonIndexed()
      .rotateX(Math.PI / 2)
      .translate(0, 0.82, 0),
    color: HIDE,
  });
  // The haunch — the heaviest thing about him, and set well back, so the
  // front of him narrows toward the neck instead of carrying on as one mass.
  parts.push({
    geo: new THREE.IcosahedronGeometry(1.02, 1)
      .toNonIndexed()
      .scale(1, 0.84, 1)
      .translate(0, 0.82, -1.3),
    color: HIDE_DARK,
  });
  // The shoulder, lower and narrower, and stopping short of the head.
  parts.push({
    geo: new THREE.IcosahedronGeometry(0.72, 1)
      .toNonIndexed()
      .scale(1, 0.84, 0.9)
      .translate(0, 0.76, 1.16),
    color: HIDE,
  });
  // A ridge of plates down his spine — nothing else in the garden has one,
  // and at any distance it is what says this is not a stone.
  for (let i = 0; i < 6; i++) {
    const z = 1.0 - i * 0.52;
    const s = 1 - Math.abs(i - 2) * 0.14;
    parts.push({
      geo: new THREE.ConeGeometry(0.16 * s, 0.42 * s, 4)
        .toNonIndexed()
        .scale(1, 1, 0.5)
        .translate(0, 1.5 + (i < 2 ? -0.06 : 0), z),
      color: RIDGE,
    });
  }
  // The belly, spread out flat where he presses into the bank.
  parts.push({
    geo: new THREE.CapsuleGeometry(0.78, 2.1, 3, 7)
      .toNonIndexed()
      .rotateX(Math.PI / 2)
      .scale(1.02, 0.42, 1)
      .translate(0, 0.3, -0.1),
    color: BELLY,
  });
  // Four legs, folded away under him — nothing of them shows but the knees.
  for (const [dx, dz] of [[-0.72, 1.0], [0.72, 1.0], [-0.76, -1.05], [0.76, -1.05]]) {
    parts.push({
      geo: new THREE.CylinderGeometry(0.3, 0.34, 0.62, 6)
        .toNonIndexed()
        .rotateZ(Math.PI / 2)
        .scale(1, 1, 0.8)
        .translate(dx, 0.3, dz),
      color: HIDE_DARK,
    });
  }
  // "He moveth his tail like a cedar" (Job 40:17) — so it is a heavy thing
  // laid out along the ground behind him, not a switch.
  parts.push({
    geo: new THREE.ConeGeometry(0.3, 2.0, 6)
      .toNonIndexed()
      .rotateX(-Math.PI / 2)
      .rotateY(0.22)
      .translate(0, 0.34, -2.55),
    color: HIDE_DARK,
  });
  // The wallow he has worn into the bank by lying here — flat to the ground
  // and baked in with the rest of him, so it costs nothing of its own.
  parts.push({
    geo: new THREE.CircleGeometry(2.4, 16)
      .toNonIndexed()
      .rotateX(-Math.PI / 2)
      .scale(0.8, 1, 1.15)
      .translate(0, 0.03, -0.2),
    color: WALLOW,
  });
  return parts;
}

function headParts() {
  const parts = [];
  // A blunt, heavy head — "his bones are as strong pieces of brass" — and a
  // neck thin enough that the head is plainly its own thing. The first build
  // set it flush against the shoulder and the whole animal read as one
  // boulder; the gap is what makes him an animal.
  parts.push({
    geo: new THREE.CylinderGeometry(0.34, 0.44, 0.6, 6)
      .toNonIndexed()
      .rotateX(Math.PI / 2)
      .translate(0, -0.06, -0.2),
    color: HIDE_DARK,
  });
  parts.push({
    geo: new THREE.BoxGeometry(0.82, 0.72, 1.1).toNonIndexed().translate(0, 0.06, 0.6),
    color: HIDE,
  });
  // The muzzle, dropped and pushed forward, so the head has a front to it.
  parts.push({
    geo: new THREE.BoxGeometry(0.6, 0.46, 0.56)
      .toNonIndexed()
      .translate(0, -0.16, 1.34),
    color: BELLY,
  });
  // Two small ears set well back, the low brow between them, and the two
  // tusks Job's beast is always given.
  for (const dx of [-0.35, 0.35]) {
    parts.push({
      geo: new THREE.ConeGeometry(0.13, 0.3, 5)
        .toNonIndexed()
        .rotateZ(dx > 0 ? -0.55 : 0.55)
        .translate(dx, 0.42, 0.28),
      color: HIDE_DARK,
    });
    parts.push({
      geo: new THREE.ConeGeometry(0.055, 0.34, 4)
        .toNonIndexed()
        .rotateX(-0.35)
        .translate(dx * 0.62, -0.14, 1.5),
      color: BELLY,
    });
  }
  parts.push({
    geo: new THREE.BoxGeometry(0.7, 0.18, 0.36)
      .toNonIndexed()
      .translate(0, 0.4, 0.86),
    color: RIDGE,
  });
  return parts;
}

// `willowSpots` are the willows of the brook — {pos:{x, y, z}} each, the
// same list they hand the naming.
export function createBehemoth(scene, willowSpots) {
  // Own seeded stream: one beast on a bank already planted shifts nothing.
  const rng = mulberry32(20260826);

  // Which willow compasses him about, and which bank that puts him on.
  const willow = willowSpots[Math.floor(rng() * willowSpots.length)].pos;
  const side = Math.sign(willow.z - riverZ(willow.x)) || 1;
  const bx = willow.x + (rng() - 0.5) * 3.2;
  const bz = bankNear(bx, side);
  const groundY = heightAt(bx, bz);

  const group = new THREE.Group();
  group.position.set(bx, groundY, bz);
  // Lying along the bank rather than across it, so his whole length is seen
  // from the meadow — the river's own tangent at this point, give or take.
  const slope = 0.495 * Math.cos(bx * 0.055);
  group.rotation.y = Math.atan2(1, slope) + (rng() - 0.5) * 0.5;
  scene.add(group);

  const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const bodyBits = bodyParts();
  const body = new THREE.Mesh(mergeColored(bodyBits), lambert());
  group.add(body);
  for (const part of bodyBits) part.geo.dispose();

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.0, 1.68);
  const headBits = headParts();
  headPivot.add(new THREE.Mesh(mergeColored(headBits), lambert()));
  group.add(headPivot);
  for (const part of headBits) part.geo.dispose();

  let t = 0;
  let head = HEAD_LOW;
  let lookIn = 14;
  let looking = 0;
  let breath = 0;

  function update(dt, night = 0) {
    t += dt;
    // Breathing: the whole bulk of him rising and falling, slower than
    // anything else alive here, and slower again once it is dark.
    const rate = 0.55 - night * 0.2;
    breath = Math.sin(t * rate);
    body.scale.set(1 + breath * 0.006, 1 + breath * 0.022, 1);

    // Now and then he lifts his muzzle out of the grass, holds it a while,
    // and puts it back down. At night he does not bother.
    if (night > 0.5) {
      looking = 0;
    } else if (looking > 0) {
      looking -= dt;
    } else if ((lookIn -= dt) <= 0) {
      looking = 5 + Math.abs(Math.sin(t * 0.7)) * 7;
      lookIn = 22 + Math.abs(Math.cos(t * 0.31)) * 26;
    }
    head = damp(head, looking > 0 ? HEAD_HIGH : HEAD_LOW, 0.7, dt);
    headPivot.rotation.x = head;
    headPivot.rotation.y = Math.sin(t * 0.23) * 0.13;
  }
  update(0);

  // Namable at his shoulder, where a walker coming along the bank meets him
  // first — and the name is the one the book gives him.
  const spots = [{
    pos: { x: bx, y: groundY + 1.1, z: bz },
    name: 'Behemoth', label: 'the behemoth', kind: 'behemoth',
  }];

  return {
    update, spots,
    state: () => ({
      x: bx, z: bz,
      breath: clamp((breath + 1) / 2, 0, 1),
      head,
      looking: looking > 0,
    }),
  };
}
