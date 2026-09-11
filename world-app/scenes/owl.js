// "I am like a pelican of the wilderness: I am like an owl of the desert. I
// watch, and am as a sparrow alone upon the house top" (Psalm 102:6-7). One
// owl keeps the night watch high in the cedars of the northern rim
// (scenes/cedars.js), and she is gone by morning.
//
// Almost nothing about her moves. She does not hunt, does not call, does not
// fly the garden — the whole of what the psalm gives her is that she is awake
// while everything else sleeps, and that she is alone. So she sits, and turns
// her head, and breathes; and when the dark lifts she is simply not there any
// more. Each night she keeps a different cedar, taking them in turn, so a
// long visit finds her somewhere new rather than always on the same bough.
//
// Like the eagle (scenes/creatures.js) she is never named: she keeps the high
// air of the cedar crowns, far above any reach a walker on the grass has.
//
// Two draw calls while she is there, and none at all through the whole of the
// day — her still parts merged into one vertex-coloured geometry, her head
// merged into another on its own pivot, and the group hidden outright as soon
// as the watch is over.

import * as THREE from 'three';
import { mergeColored, mulberry32, damp, smoothstep } from '../util.js';

// How deep into the night she keeps the watch: full dark to full dark, with a
// little of the dusk and a little of the dawn at either end.
const COMES = 0.30;
const FULL = 0.52;

// Pale, because she has to be found. A dark bird high in a dark crown at
// midnight is simply not there — the first build was the colour of the bark
// and vanished into it. An owl of the *desert* is a buff, sand-coloured bird
// anyway, and a pale one on a black cedar is what the psalm is describing:
// the one thing awake, and conspicuous about it.
const FEATHER = new THREE.Color(0xBCAA8B);
const FEATHER_PALE = new THREE.Color(0xD3C4A7);
const BREAST = new THREE.Color(0xEBE2CD);
const BEAK = new THREE.Color(0x6B5B44);
const EYE = new THREE.Color(0xF0CE61);
const PUPIL = new THREE.Color(0x1A1611);
// How big she stands on the bough. She is the only thing in a cedar crown
// nine to thirteen units up, so at the scale of the animals on the grass she
// would be a speck; this is what makes her a bird from the meadow below.
const SIZE = 1.7;

// How much of the night she turns her head: an owl looks, holds a long while,
// and then turns to look somewhere else entirely.
const LOOK_HOLD = 5.5;
const LOOK_SWING = 1.15;

export function watchOf(night) {
  return smoothstep(COMES, FULL, night);
}

function bodyParts() {
  const parts = [];
  // The whole of her: an upright rounded mass, wider at the shoulder than at
  // the foot, with the wings folded flat against it rather than modelled
  // apart — a sitting owl is very nearly one shape.
  parts.push({
    geo: new THREE.CapsuleGeometry(0.2, 0.22, 3, 8).toNonIndexed()
      .scale(1, 1, 0.86).translate(0, 0.24, 0),
    color: FEATHER,
  });
  // The breast, paler, so she is not one flat silhouette against the crown.
  parts.push({
    geo: new THREE.CapsuleGeometry(0.13, 0.18, 3, 7).toNonIndexed()
      .scale(1, 1, 0.6).translate(0, 0.2, 0.13),
    color: BREAST,
  });
  // The folded wings, laid down either side and slightly proud of the body.
  for (const dx of [-0.19, 0.19]) {
    parts.push({
      geo: new THREE.CapsuleGeometry(0.07, 0.3, 3, 6).toNonIndexed()
        .rotateZ(dx > 0 ? -0.1 : 0.1)
        .scale(1, 1, 0.5)
        .translate(dx, 0.24, 0.01),
      color: FEATHER_PALE,
    });
  }
  // The tail, short and squared off behind her.
  parts.push({
    geo: new THREE.BoxGeometry(0.17, 0.04, 0.2).toNonIndexed()
      .rotateX(0.5).translate(0, 0.05, -0.15),
    color: FEATHER_PALE,
  });
  // Two feet gripping the bough.
  for (const dx of [-0.08, 0.08]) {
    parts.push({
      geo: new THREE.CylinderGeometry(0.02, 0.025, 0.09, 4).toNonIndexed()
        .translate(dx, 0.02, 0.03),
      color: BEAK,
    });
  }
  return parts;
}

function headParts() {
  const parts = [];
  parts.push({
    geo: new THREE.SphereGeometry(0.16, 8, 6).toNonIndexed().scale(1, 0.92, 0.9),
    color: FEATHER,
  });
  // The facial disc: the flat pale front that makes an owl an owl at any
  // distance, before either eye is made out.
  parts.push({
    geo: new THREE.CylinderGeometry(0.135, 0.135, 0.03, 10).toNonIndexed()
      .rotateX(Math.PI / 2).translate(0, -0.01, 0.135),
    color: BREAST,
  });
  for (const dx of [-0.06, 0.06]) {
    parts.push({
      geo: new THREE.CircleGeometry(0.048, 8).toNonIndexed().translate(dx, 0.015, 0.153),
      color: EYE,
    });
    parts.push({
      geo: new THREE.CircleGeometry(0.022, 6).toNonIndexed().translate(dx, 0.015, 0.156),
      color: PUPIL,
    });
    // The ear tufts, which is the other half of the silhouette.
    parts.push({
      geo: new THREE.ConeGeometry(0.045, 0.16, 4).toNonIndexed()
        .rotateZ(dx > 0 ? -0.3 : 0.3).rotateX(-0.2)
        .translate(dx * 1.5, 0.16, -0.01),
      color: FEATHER,
    });
  }
  parts.push({
    geo: new THREE.ConeGeometry(0.028, 0.08, 4).toNonIndexed()
      .rotateX(Math.PI / 2).translate(0, -0.035, 0.18),
    color: BEAK,
  });
  return parts;
}

// `cedarSpots`: the northern stand as planted — {x, z, y, height} each.
export function createOwl(scene, cedarSpots = []) {
  // Own seeded stream: one bird in a stand already planted shifts nothing.
  const rng = mulberry32(20260828);

  // Her boughs: a few of the cedars, each perch set out from the trunk and
  // high in the crown, where the tiers are thin enough to sit in.
  const boughs = [];
  const pool = cedarSpots.slice();
  const wanted = Math.min(4, pool.length);
  for (let i = 0; i < wanted; i++) {
    const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const a = rng() * Math.PI * 2;
    const out = 0.9 + rng() * 0.5;
    boughs.push({
      x: pick.x + Math.cos(a) * out,
      y: pick.y + pick.height * (0.74 + rng() * 0.06),
      z: pick.z + Math.sin(a) * out,
      // Looking out the way the bough took her, never back into the trunk:
      // a yaw of `y` points the model's +z along (sin y, cos y), which is
      // not the same angle the offset was laid out on.
      facing: Math.atan2(Math.cos(a), Math.sin(a)),
    });
  }

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // A faint self-light, since the only light she is ever under is the moon's
  // and the garden's night is genuinely dark — without it a pale bird still
  // renders as a black one.
  const lambert = () => new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true,
    emissive: 0x6A5F49, emissiveIntensity: 0.55,
  });

  const bodyBits = bodyParts();
  const body = new THREE.Mesh(mergeColored(bodyBits), lambert());
  group.add(body);
  for (const part of bodyBits) part.geo.dispose();

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.46, 0);
  const headBits = headParts();
  headPivot.add(new THREE.Mesh(mergeColored(headBits), lambert()));
  group.add(headPivot);
  for (const part of headBits) part.geo.dispose();

  let at = 0;            // which bough she is keeping tonight
  let watch = 0;
  let t = 0;
  let look = 0;          // where the head presently faces, relative to her
  let lookTo = 0;
  let holdFor = LOOK_HOLD;

  if (boughs.length) {
    group.position.set(boughs[0].x, boughs[0].y, boughs[0].z);
    group.rotation.y = boughs[0].facing;
  }

  function update(dt, night = 0) {
    const was = watch;
    watch = watchOf(night);
    group.visible = boughs.length > 0 && watch > 0.02;
    if (!group.visible) {
      // Gone by morning — and when she comes back tonight it is to the next
      // cedar along, not the one she left. No draw taken in the meantime.
      if (was > 0.02 && boughs.length) at = (at + 1) % boughs.length;
      return;
    }
    if (was <= 0.02) {
      const b = boughs[at];
      group.position.set(b.x, b.y, b.z);
      group.rotation.y = b.facing;
      look = 0;
      lookTo = 0;
      holdFor = LOOK_HOLD;
    }

    t += dt;
    // She arrives and leaves by drawing herself up out of the dark rather
    // than blinking into it — nothing about an owl is sudden.
    const size = SIZE * (0.55 + 0.45 * watch);
    group.scale.set(size, size, size);

    // The watch itself: a long hold, then the head turns right round to look
    // somewhere else, and holds there.
    if ((holdFor -= dt) <= 0) {
      lookTo = (Math.abs(Math.sin(t * 1.7)) * 2 - 1) * LOOK_SWING;
      holdFor = LOOK_HOLD + Math.abs(Math.cos(t * 0.43)) * 7;
    }
    look = damp(look, lookTo, 2.2, dt);
    headPivot.rotation.y = look;
    // The smallest tilt, and the breathing under the feathers.
    headPivot.rotation.z = Math.sin(t * 0.31) * 0.06;
    const breath = Math.sin(t * 0.9);
    body.scale.set(1 + breath * 0.012, 1 + breath * 0.016, 1 + breath * 0.012);
  }

  return {
    update,
    state: () => ({
      watching: watch,
      boughs: boughs.length,
      at: boughs.length ? { x: boughs[at].x, y: boughs[at].y, z: boughs[at].z } : null,
    }),
  };
}
