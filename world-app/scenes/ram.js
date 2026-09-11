// "And Abraham lifted up his eyes, and looked, and behold behind him a ram
// caught in a thicket by his horns" (Genesis 22:13). He is standing on the
// eastern rim, in a low tangle of thorn, and he has been there some while.
//
// Nothing in the garden is afraid (v15), and he is not either. He is only
// held: every so often he leans back against the horns, finds the thicket
// still has him, and gives it up again, and goes on cropping what he can
// reach. The verse is not about his distress — Abraham looks up and the ram
// is simply there, provided, before anyone thought to want one — so what is
// wanted here is patience, not panic.
//
// He does not walk, and the thicket does not give, so the thicket is baked
// into the same still geometry as his body and his planted legs: two draw
// calls for the whole of it, plus the blob shadow. Everything that moves
// here moves on the head's own pivot — which is right, because a thicket
// holding steady while the head works against it is the whole picture.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32, damp, clamp } from '../util.js';

// The eastern rim, south of the flaming gate (scenes/gate.js at x = 49), on
// ground that is climbing and well clear of every channel of the river.
const NEAR = { x: 39, z: -24 };

const FLEECE = new THREE.Color(0xD8CBB2);
const FLEECE_DARK = new THREE.Color(0xB0A183);
const FACE = new THREE.Color(0x8A7A62);
const HORN = new THREE.Color(0xC9B688);
const HOOF = new THREE.Color(0x4C4335);
const THORN = new THREE.Color(0x6A5A3E);
const THORN_LEAF = new THREE.Color(0x5A6B41);

const PULL_EVERY = 9;     // how often he tries the thicket again
const PULL_FOR = 1.9;     // and how long he leans into it before letting go
const HEAD_CROP = 0.42;   // muzzle down among the thorns, where it mostly is
const HEAD_PULL = -0.5;   // and drawn back against the horns
const HEAD_AT_Z = 0.58;   // where the neck joins him

function bodyParts() {
  const parts = [];
  // The barrel, deep and woolly, and standing square rather than mid-stride.
  parts.push({
    geo: new THREE.CapsuleGeometry(0.32, 0.56, 4, 8).toNonIndexed()
      .rotateX(Math.PI / 2).scale(1, 0.95, 1).translate(0, 0.66, 0),
    color: FLEECE,
  });
  // The shoulder, heavier than the haunch on a ram, and carried forward.
  parts.push({
    geo: new THREE.IcosahedronGeometry(0.33, 1).toNonIndexed()
      .scale(1, 0.95, 0.85).translate(0, 0.68, 0.44),
    color: FLEECE,
  });
  parts.push({
    geo: new THREE.IcosahedronGeometry(0.29, 1).toNonIndexed()
      .scale(1, 0.95, 0.9).translate(0, 0.64, -0.5),
    color: FLEECE_DARK,
  });
  // Four legs, planted — he is not going anywhere, so they are part of the
  // one still mass rather than an instanced set with a walk to animate.
  for (const [dx, dz] of [[-0.2, 0.34], [0.2, 0.34], [-0.21, -0.36], [0.21, -0.36]]) {
    parts.push({
      geo: new THREE.CylinderGeometry(0.055, 0.05, 0.42, 5).toNonIndexed()
        .translate(dx, 0.21, dz),
      color: FACE,
    });
    parts.push({
      geo: new THREE.CylinderGeometry(0.06, 0.07, 0.08, 5).toNonIndexed()
        .translate(dx, 0.04, dz),
      color: HOOF,
    });
  }
  // A short tail, and the fleece hanging past the line of the belly.
  parts.push({
    geo: new THREE.CapsuleGeometry(0.07, 0.12, 3, 5).toNonIndexed()
      .rotateX(0.9).translate(0, 0.6, -0.78),
    color: FLEECE_DARK,
  });
  parts.push({
    geo: new THREE.CapsuleGeometry(0.28, 0.5, 3, 7).toNonIndexed()
      .rotateX(Math.PI / 2).scale(1.05, 0.5, 1).translate(0, 0.42, -0.04),
    color: FLEECE_DARK,
  });
  return parts;
}

function headParts() {
  const parts = [];
  parts.push({
    geo: new THREE.CylinderGeometry(0.13, 0.17, 0.3, 6).toNonIndexed()
      .rotateX(1.1).translate(0, -0.02, 0.12),
    color: FLEECE,
  });
  parts.push({
    geo: new THREE.BoxGeometry(0.22, 0.22, 0.34).toNonIndexed()
      .translate(0, 0.02, 0.38),
    color: FACE,
  });
  parts.push({
    geo: new THREE.BoxGeometry(0.15, 0.13, 0.16).toNonIndexed()
      .translate(0, -0.05, 0.6),
    color: FLEECE_DARK,
  });
  for (const dx of [-0.14, 0.14]) {
    // The ears, laid back along the head.
    parts.push({
      geo: new THREE.ConeGeometry(0.05, 0.16, 4).toNonIndexed()
        .rotateZ(dx > 0 ? -1.2 : 1.2).translate(dx * 1.3, 0.08, 0.3),
      color: FACE,
    });
    // The horns — which is the whole of why he is here. They curl round and
    // down past the jaw, and they are what the thicket has hold of.
    for (let i = 0; i < 7; i++) {
      const a = 0.5 + i * 0.78;
      const r = 0.19 - i * 0.008;
      parts.push({
        geo: new THREE.SphereGeometry(0.072 - i * 0.006, 6, 4).toNonIndexed()
          .scale(1, 1, 1.15)
          .translate(
            dx * (1.2 + i * 0.055),
            0.17 + Math.sin(a) * r,
            0.2 + Math.cos(a) * r,
          ),
        color: HORN,
      });
    }
  }
  return parts;
}

// The thicket, in the ram's own local frame — a low tangle of thin stems
// going up at every angle out of one root, with enough of them crossing where
// his horns are that it is plain what has hold of him. `at` is where the root
// stands relative to him, and `lift` the ground's own difference there.
function thicketParts(rng, at, lift) {
  const parts = [];
  for (let i = 0; i < 34; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 1.15;
    // Shorter and thicker than the first build, which stood up so straight
    // and so bare that the whole thing read as a stack of firewood.
    const len = 0.42 + rng() * 0.72;
    const lean = 0.25 + rng() * 0.8;
    parts.push({
      geo: new THREE.CylinderGeometry(0.024, 0.044, len, 4).toNonIndexed()
        .translate(0, len / 2, 0)
        .rotateX(Math.cos(a) * lean)
        .rotateZ(Math.sin(a) * lean)
        .translate(at.x + Math.cos(a) * r, lift, at.z + Math.sin(a) * r),
      color: THORN,
    });
    if (i % 2 === 0) {
      parts.push({
        geo: new THREE.IcosahedronGeometry(0.1 + rng() * 0.07, 0).toNonIndexed()
          .scale(1, 0.6, 1)
          .translate(
            at.x + Math.cos(a) * (r + 0.2),
            lift + len * (0.55 + rng() * 0.35),
            at.z + Math.sin(a) * (r + 0.2),
          ),
        color: THORN_LEAF,
      });
    }
  }
  return parts;
}

export function createRam(scene) {
  // Own seeded stream: one animal on the rim shifts nothing already planted.
  const rng = mulberry32(20260830);

  // Settle him on ground that is genuinely dry and genuinely on the rise.
  let x = NEAR.x;
  let z = NEAR.z;
  for (let i = 0; i < 24; i++) {
    const cx = NEAR.x + (rng() - 0.5) * 5;
    const cz = NEAR.z + (rng() - 0.5) * 6;
    if (riverEdgeDist(cx, cz) > 8 && heightAt(cx, cz) > -0.2) { x = cx; z = cz; break; }
  }
  const groundY = heightAt(x, z);

  const group = new THREE.Group();
  group.position.set(x, groundY, z);
  // Facing into the thicket, which is between him and the rim.
  group.rotation.y = Math.atan2(x, z) + (rng() - 0.5) * 0.6;
  scene.add(group);

  const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // The thicket stands just ahead of his head, in among the horns. It is
  // baked into the same geometry as the animal because neither of them is
  // going anywhere: the whole point of him is that the tangle does not give.
  const thicketAt = { x: 0, z: 0.95 };
  const thicketX = x + Math.sin(group.rotation.y) * thicketAt.z;
  const thicketZ = z + Math.cos(group.rotation.y) * thicketAt.z;
  const bodyBits = [
    ...bodyParts(),
    ...thicketParts(rng, thicketAt, heightAt(thicketX, thicketZ) - groundY),
  ];
  const body = new THREE.Mesh(mergeColored(bodyBits), lambert());
  group.add(body);
  for (const part of bodyBits) part.geo.dispose();

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.78, HEAD_AT_Z);
  const headBits = headParts();
  headPivot.add(new THREE.Mesh(mergeColored(headBits), lambert()));
  group.add(headPivot);
  for (const part of headBits) part.geo.dispose();

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 14),
    new THREE.MeshBasicMaterial({ color: 0x1c2814, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  let t = 0;
  let head = HEAD_CROP;
  let pullIn = 4;
  let pulling = 0;

  function update(dt, sabbath = false) {
    t += dt;
    const REST = sabbath ? 0.4 : 1;

    // He tries it, finds it holds, and goes back to cropping. Nothing about
    // this is frantic — it is the same patience a tethered animal keeps.
    if (pulling > 0) {
      pulling -= dt;
    } else if ((pullIn -= dt * REST) <= 0) {
      pulling = PULL_FOR;
      pullIn = PULL_EVERY + Math.abs(Math.sin(t * 0.53)) * 11;
    }
    head = damp(head, pulling > 0 ? HEAD_PULL : HEAD_CROP, 1.6, dt);
    headPivot.rotation.x = head;
    // Held by the horns, so the head cannot turn far either way — it works
    // against the catch and comes back. Everything that moves about him moves
    // here: the thicket is baked into the same geometry as his body, and a
    // tangle that swayed when he leaned on it would not be holding anything.
    const strain = clamp(pulling / PULL_FOR, 0, 1);
    headPivot.rotation.y = Math.sin(t * 1.1) * 0.1 + Math.sin(t * 5.5) * 0.06 * strain;
    headPivot.rotation.z = Math.sin(t * 3.4) * 0.05 * strain;
    headPivot.position.z = HEAD_AT_Z - strain * 0.05;
  }
  update(0);

  // Namable at his shoulder — `ayil` is the very word Genesis 22:13 gives him.
  const spots = [{
    pos: { x, y: groundY + 0.8, z },
    name: 'Ayil', label: 'the ram', kind: 'ram',
  }];

  return {
    update, spots,
    state: () => ({ x, z, head, caught: true, pulling: pulling > 0 }),
  };
}
