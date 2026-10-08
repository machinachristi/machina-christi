// Adam or Eve — "naked and unashamed" (Genesis 2:25) — built from abstracted
// low-poly primitives: dignity through simplicity. A uniform skin tone over
// simple capsule forms reads as iconography, not anatomy; there is nothing to
// model carefully because there is no detail at all. The walk cycle is
// procedural (sine-swung limbs keyed to speed), so no rigs and no binary
// model files — every future change to the figure stays a readable diff.

import * as THREE from 'three';
import { clamp, damp, shortestAngle } from './util.js';
import { riverEdgeDist } from './scenes/terrain.js';

// Two gaits, not a continuous speed (v25, Psalm 37:23): any input is the
// steady walk, and only a clearly extended drag (or Shift) the quickened
// pace. Each pace holds constant for as long as the input does.
const WALK_SPEED = 3.0;     // m/s, the steady walk
const QUICK_SPEED = 4.6;    // m/s, the quickened pace (Isaiah 40:31)
const STRIDE_REF = 3.6;     // the speed the stride animation was drawn for
const TURN_LAMBDA = 9;      // how eagerly the body turns to face travel
// v26 (Psalm 17:5, "that my footsteps slip not"): he gathers pace at the
// old easy rate, but halts on a much quicker one, so letting go stops him
// within a short step instead of sliding on with his legs still swinging.
const START_LAMBDA = 6;
const STOP_LAMBDA = 13;
const HALTED = 0.05;        // below this he simply stands
const WALK_FREQ = 3.1;      // stride cycles per second at full speed

export function createCharacter({ eve = false } = {}) {
  const skin = new THREE.MeshLambertMaterial({ color: 0xC69572, flatShading: true });
  const hair = new THREE.MeshLambertMaterial({ color: 0x3A2C1E, flatShading: true });

  const group = new THREE.Group();          // root sits at the feet
  const scale = eve ? 0.955 : 1;

  // Torso — a single tapered capsule; shoulders slightly narrower for Eve.
  const torso = new THREE.Group();
  const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.205, 0.42, 3, 8), skin);
  torsoMesh.position.y = 0.32;
  torsoMesh.scale.x = eve ? 0.9 : 1.04;
  torso.add(torsoMesh);
  torso.position.y = 0.9;
  group.add(torso);

  // Head + hair. Adam: a close cap. Eve: the cap plus hair falling down the back.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), skin);
  head.position.y = 0.88;
  torso.add(head);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8), hair);
  cap.scale.set(1, 0.72, 1);
  cap.position.set(0, 0.95, -0.03);
  torso.add(cap);
  if (eve) {
    const fall = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.38, 3, 7), hair);
    fall.position.set(0, 0.62, -0.16);
    fall.rotation.x = 0.16;
    torso.add(fall);
  }

  // Limbs pivot at shoulder/hip; meshes hang below their pivots.
  function limb(radius, length, px, py, parent) {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 7), skin);
    mesh.position.y = -(length / 2 + radius);
    pivot.add(mesh);
    parent.add(pivot);
    return pivot;
  }
  const armL = limb(0.062, 0.5, -0.285, 0.62, torso);
  const armR = limb(0.062, 0.5, 0.285, 0.62, torso);
  const legL = limb(0.082, 0.6, -0.115, 0.9, group);
  const legR = limb(0.082, 0.6, 0.115, 0.9, group);

  // Simple feet grounded at the base of each leg.
  for (const leg of [legL, legR]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), skin);
    foot.position.set(0, -0.845, 0.05);
    leg.add(foot);
  }

  // A soft blob shadow grounds the figure without shadow maps.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 18),
    new THREE.MeshBasicMaterial({ color: 0x1c2814, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  group.scale.setScalar(scale);

  let speed = 0;
  let phase = 0;
  let idle = Math.random() * Math.PI * 2;
  let sitting = false;
  let seat = 0;             // 0 standing → 1 fully settled; damped, never a snap

  let gait = 'still';       // still | walk | quick — what the input asks for
  let align = 1;            // how nearly he faces the way he is asked to go

  // move: camera-space input { x: right, z: forward, |v| ≤ 1, quick? }.
  // camYaw: yaw of the camera's view line, from the rig — or null when
  // `move` is already a world-space direction (the companion's own walks).
  function update(dt, move, camYaw, heightAt, boundsRadius) {
    // Seated, the figure neither walks nor turns — it rests where it is.
    if (sitting) move = { x: 0, z: 0 };
    const mag = clamp(Math.hypot(move.x, move.z), 0, 1);

    if (mag > 0.001) {
      // Rotate camera-space input into the world: "drag up" is always
      // "away from the camera", whichever way the body currently faces.
      // The view's forward is (sin, cos) and — three.js's lookAt builds the
      // camera's right as up × back — its right is (−cos, sin). Until v25
      // the right was taken as (cos, −sin), so every drag or key to the
      // right walked him off to the left of the screen and the reverse
      // (Isaiah 30:21: "when ye turn to the right hand, and when ye turn to
      // the left").
      let wx = move.x, wz = move.z;
      if (camYaw !== null) {
        const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
        wx = -cos * move.x + sin * move.z;
        wz = sin * move.x + cos * move.z;
      }
      const targetYaw = Math.atan2(wx, wz);
      const off = shortestAngle(group.rotation.y, targetYaw);
      group.rotation.y += off * (1 - Math.exp(-TURN_LAMBDA * dt));
      // Turned well away from where he is asked to go, he turns before he
      // strides off (Proverbs 14:15, "the prudent man looketh well to his
      // going"): the pace is held back while he comes round, so a drag to
      // the side or behind him no longer sends him wheeling off in a wide
      // loop along the way he happened to be facing. Within ~35° it is the
      // full pace, as before.
      align = clamp((Math.cos(off) + 0.25) / 1.07, 0.18, 1);
    } else {
      align = 1;
    }

    // Wading slows the stride: below the banks the water takes its share.
    // Only in the water itself (wake.js's own test) — a dry hollow that
    // merely lies low used to slow him too, which read as his pace changing
    // for no reason on open grass (v25).
    const wading = group.position.y < -0.6
      && riverEdgeDist(group.position.x, group.position.z) <= 0;
    gait = mag > 0.001 ? (move.quick ? 'quick' : 'walk') : 'still';
    const pace = gait === 'quick' ? QUICK_SPEED : WALK_SPEED;
    const want = mag * pace * align * (wading ? 0.6 : 1);
    speed = damp(speed, want, want < speed ? STOP_LAMBDA : START_LAMBDA, dt);
    if (want === 0 && speed < HALTED) speed = 0;

    // Walk along the facing direction — turning carves smooth arcs.
    if (speed > 0.01) {
      group.position.x += Math.sin(group.rotation.y) * speed * dt;
      group.position.z += Math.cos(group.rotation.y) * speed * dt;

      // Keep the walk inside the garden; the rim and fog do the storytelling.
      const r = Math.hypot(group.position.x, group.position.z);
      if (r > boundsRadius) {
        group.position.x *= boundsRadius / r;
        group.position.z *= boundsRadius / r;
      }
    }
    group.position.y = heightAt(group.position.x, group.position.z);

    // Stride: limbs swing opposite pairs; a light bob; a slight lean forward.
    // The quickened pace lengthens and quickens the stride past the walk's.
    const stride = Math.min(speed / STRIDE_REF, 1.3);
    phase += dt * WALK_FREQ * Math.PI * 2 * (0.35 + 0.65 * stride) * (stride > 0.02 ? 1 : 0);
    idle += dt;

    const swing = Math.sin(phase) * 0.62 * stride;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.72;
    armR.rotation.x = swing * 0.72;

    const breathe = Math.sin(idle * 1.7) * 0.012;
    torso.position.y = 0.9 + Math.abs(Math.cos(phase)) * 0.05 * stride + breathe;
    torso.rotation.x = 0.10 * Math.min(stride, 1) + 0.12 * Math.max(0, stride - 1);

    // At rest the arms settle just off the body.
    armL.rotation.z = 0.10 + Math.sin(idle * 1.7) * 0.015 * Math.max(0, 1 - stride);
    armR.rotation.z = -0.10 - Math.sin(idle * 1.7) * 0.015 * Math.max(0, 1 - stride);

    // Sitting down by the water: hips fold so the legs reach forward along the
    // ground, the torso settles and leans back a touch, and the hands come
    // back to prop. Blended in and out of the walk pose so it reads as a slow,
    // natural settling — not a snap between two stances.
    seat = damp(seat, sitting ? 1 : 0, 6, dt);
    if (seat > 0.001) {
      const rest = 0.5 + Math.sin(idle * 1.1) * 0.03;   // faint breathing at rest
      legL.rotation.x = legL.rotation.x * (1 - seat) + 1.5 * seat;
      legR.rotation.x = legR.rotation.x * (1 - seat) + 1.5 * seat;
      armL.rotation.x = armL.rotation.x * (1 - seat) + rest * seat;
      armR.rotation.x = armR.rotation.x * (1 - seat) + rest * seat;
      torso.position.y = torso.position.y * (1 - seat) + 0.62 * seat;
      torso.rotation.x = torso.rotation.x * (1 - seat) + (-0.16) * seat;
    }
  }

  function setSitting(b) { sitting = !!b; }

  return {
    group, update, setSitting,
    get speed() { return speed; },
    get gait() { return gait; },
    get sitting() { return sitting; },
  };
}
