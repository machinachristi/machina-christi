// Adam or Eve — "naked and unashamed" (Genesis 2:25) — built from abstracted
// low-poly primitives: dignity through simplicity. A uniform skin tone over
// simple capsule forms reads as iconography, not anatomy; there is nothing to
// model carefully because there is no detail at all. The walk cycle is
// procedural (sine-swung limbs keyed to speed), so no rigs and no binary
// model files — every future change to the figure stays a readable diff.

import * as THREE from 'three';
import { clamp, damp, shortestAngle, smoothstep } from './util.js';
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
// v27 (Psalm 18:33, "he maketh my feet like hinds' feet, and setteth me upon
// my high places"): his body follows the ground's height on an easing, not
// frame by frame, so stepping up onto a stone of the crossing or down off
// it reads as a step rather than a jolt of half his own height in one frame.
// Rising is quicker than settling, so on a climb his feet never sink.
const RISE_LAMBDA = 30;
const SETTLE_LAMBDA = 16;
const SNAP_Y = 2.5;          // a drop this far is a teleport, not a step: take it outright
// Climbing Jacob's ladder (Genesis 28:12, AB#106): while he is on it, realm.js
// sets where he is, and here the limbs only keep the rungs — hands reaching
// up in turn, feet stepping up after them.
const CLIMB_FREQ = 0.85;     // hand-over-hand cycles per second at the full climb
// Lying back to look up (v34, Psalm 8:3): down onto the grass, legs out,
// then back. Getting up is quicker than lying down, and he only walks off
// once he is most of the way up.
const LIE_DOWN = 1.9;        // seconds from standing to lying back
const LIE_UP = 0.65;         // seconds from lying back to standing
const LIE_WALKS = 0.12;      // he may walk once lying back has eased below this
const LIE_SLOPE = 0.6;       // the most (radians) he lies tilted along a slope
const HIP = 0.9;             // the hips' height standing, which he lies back about
const HIP_LYING = 0.21;      // …and lying, so his back rests on the grass

export function createCharacter({ eve = false } = {}) {
  const skin = new THREE.MeshLambertMaterial({ color: 0xC69572, flatShading: true });
  const hair = new THREE.MeshLambertMaterial({ color: 0x3A2C1E, flatShading: true });

  const group = new THREE.Group();          // root sits at the feet
  const scale = eve ? 0.955 : 1;
  // Everything but the shadow, so that lying back (v34) can lay the whole
  // figure down at once; it stands as it always did when untouched.
  const body = new THREE.Group();
  group.add(body);

  // Torso — a single tapered capsule; shoulders slightly narrower for Eve.
  const torso = new THREE.Group();
  const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.205, 0.42, 3, 8), skin);
  torsoMesh.position.y = 0.32;
  torsoMesh.scale.x = eve ? 0.9 : 1.04;
  torso.add(torsoMesh);
  torso.position.y = 0.9;
  body.add(torso);

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
  const legL = limb(0.082, 0.6, -0.115, 0.9, body);
  const legR = limb(0.082, 0.6, 0.115, 0.9, body);

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
  let wading = false;
  let wade = 0;             // 0 on dry ground → 1 in the water; eased, for the stride
  let carrying = false;
  let carry = 0;            // 0 arms free → 1 hands cupped before him; eased
  let climbing = false;
  let climb = 0;            // 0 on the ground → 1 on the rungs; eased, never a snap
  let climbRate = 1;        // how quickly he is going up or down, 0..1
  let climbPhase = 0;
  let praying = false;
  let orans = 0;            // 0 hands down → 1 lifted up in prayer; eased slowly
  let lying = false;
  let lie = 0;              // 0 standing → 1 lying back looking up; eased in and out (v34)
  let laid = false;         // whether the body is presently turned from standing at all

  // Water held in his cupped hands (v27, Genesis 2:6) — shown only while he
  // carries it from the river to the ground he is going to water.
  const held = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x8FC3E4, emissive: 0x2A5470, transparent: true, opacity: 0.88 }),
  );
  held.scale.set(1.3, 0.75, 1.1);
  held.position.set(0, 0.29, 0.43);
  held.visible = false;
  torso.add(held);
  // A fruit given into the same cupped hands (v30, Genesis 2:16) — shown
  // while he holds it, growing smaller with each bite.
  let holding = null;
  const fruitHeld = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.12, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
  );
  // In his raised hand, held up before him to look at — which is also
  // where the follow camera can see it past his shoulder.
  fruitHeld.position.set(0.19, 0.56, 0.6);
  let lift = 0;             // 0 → 1 the hand raised with the fruit in it
  fruitHeld.visible = false;
  torso.add(fruitHeld);

  // move: camera-space input { x: right, z: forward, |v| ≤ 1, quick? }.
  // camYaw: yaw of the camera's view line, from the rig — or null when
  // `move` is already a world-space direction (the companion's own walks).
  // keepOut (v27): optional — pushes a position out of the garden's solid
  // rock (footing.js), so he slides round the crag rather than through it.
  function update(dt, move, camYaw, heightAt, boundsRadius, keepOut = null) {
    // Seated, the figure neither walks nor turns — it rests where it is. On
    // the ladder he goes only where realm.js sets him.
    // Lying back he stays where he lies until he is mostly up again.
    lie = lying ? Math.min(1, lie + dt / LIE_DOWN) : Math.max(0, lie - dt / LIE_UP);
    if (sitting || climbing || lying || lie > LIE_WALKS) move = { x: 0, z: 0 };
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
    wading = heightAt(group.position.x, group.position.z) < -0.6
      && riverEdgeDist(group.position.x, group.position.z) < 0.01;   // 0 on the water, give or take the seams between channels
    gait = mag > 0.001 ? (move.quick ? 'quick' : 'walk') : 'still';
    const pace = gait === 'quick' ? QUICK_SPEED : WALK_SPEED;
    const want = mag * pace * align * (wading ? 0.6 : 1);
    speed = damp(speed, want, want < speed ? STOP_LAMBDA : START_LAMBDA, dt);
    if (want === 0 && speed < HALTED) speed = 0;

    // Walk along the facing direction — turning carves smooth arcs.
    if (climbing) speed = 0;
    if (speed > 0.01) {
      group.position.x += Math.sin(group.rotation.y) * speed * dt;
      group.position.z += Math.cos(group.rotation.y) * speed * dt;

      // Keep the walk inside the garden; the rim and fog do the storytelling.
      const r = Math.hypot(group.position.x, group.position.z);
      if (r > boundsRadius) {
        group.position.x *= boundsRadius / r;
        group.position.z *= boundsRadius / r;
      }
      // Rock does not give way: he is set back out to its edge, which keeps
      // whatever part of his step ran along it — so a walk into the side of
      // the crag slides on round it instead of stopping dead.
      if (keepOut) keepOut(group.position);
    }
    if (!climbing) {
      const ground = heightAt(group.position.x, group.position.z);
      const dy = ground - group.position.y;
      group.position.y = Math.abs(dy) > SNAP_Y
        ? ground
        : damp(group.position.y, ground, dy > 0 ? RISE_LAMBDA : SETTLE_LAMBDA, dt);
    }

    // Stride: limbs swing opposite pairs; a light bob; a slight lean forward.
    // The quickened pace lengthens and quickens the stride past the walk's.
    const stride = Math.min(speed / STRIDE_REF, 1.3);
    // In the water (v27, Isaiah 43:2, "when thou passest through the
    // waters, I will be with thee") the stride itself changes, not only the
    // pace: a slower cadence, a shorter, higher-kneed step pushed through
    // the current, the body leaning into it and the arms lifted a little
    // out to the sides for balance.
    wade = damp(wade, wading ? 1 : 0, 5, dt);
    phase += dt * WALK_FREQ * Math.PI * 2 * (0.35 + 0.65 * stride) * (1 - 0.3 * wade) * (stride > 0.02 ? 1 : 0);
    idle += dt;

    const swing = Math.sin(phase) * 0.62 * stride;
    const kneeUp = 0.22 * wade * Math.min(stride * 2, 1);
    legL.rotation.x = swing * (1 - 0.3 * wade) - kneeUp * Math.max(0, -Math.sin(phase));
    legR.rotation.x = -swing * (1 - 0.3 * wade) - kneeUp * Math.max(0, Math.sin(phase));
    armL.rotation.x = -swing * 0.72 * (1 - 0.5 * wade);
    armR.rotation.x = swing * 0.72 * (1 - 0.5 * wade);

    const breathe = Math.sin(idle * 1.7) * 0.012;
    torso.position.y = 0.9 + Math.abs(Math.cos(phase)) * 0.05 * stride * (1 - 0.5 * wade) + breathe;
    torso.rotation.x = 0.10 * Math.min(stride, 1) + 0.12 * Math.max(0, stride - 1) + 0.1 * wade * Math.min(stride * 3, 1);

    // At rest the arms settle just off the body; wading, they lift out.
    armL.rotation.z = 0.10 - 0.42 * wade + Math.sin(idle * 1.7) * 0.015 * Math.max(0, 1 - stride);
    armR.rotation.z = -0.10 + 0.42 * wade - Math.sin(idle * 1.7) * 0.015 * Math.max(0, 1 - stride);

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

    // Lying back to look up (v34, Psalm 8:3): first down onto the grass with
    // his legs out before him, then back about his hips until he lies flat,
    // arms out on the grass and his face to the sky. The body is turned
    // about the hips and lowered with them; the legs keep along the ground
    // all the way.
    if (lie > 0.001) {
      laid = true;
      const low = smoothstep(0, 0.5, lie);
      const tilt = smoothstep(0.35, 1, lie) * Math.PI / 2;
      // On a slope he lies along it, his head neither sunk into the bank
      // behind him nor held up in the air (the water's surface counts as
      // ground for this).
      const f = group.rotation.y, fs = Math.sin(f), fc = Math.cos(f);
      const gx = group.position.x, gz = group.position.z;
      const behind = Math.max(heightAt(gx - fs * 0.88, gz - fc * 0.88), -0.5);
      const ahead = Math.max(heightAt(gx + fs * 0.9, gz + fc * 0.9), -0.5);
      const slope = clamp(Math.atan2(behind - ahead, 1.78), -LIE_SLOPE, LIE_SLOPE);
      const turn = -tilt + slope * (tilt / (Math.PI / 2));
      const hipY = HIP - (HIP - HIP_LYING) * low;
      body.rotation.x = turn;
      body.position.set(0, hipY - HIP * Math.cos(turn), -HIP * Math.sin(turn));
      const legs = (tilt - Math.PI / 2) * low;
      legL.rotation.x = legL.rotation.x * (1 - low) + legs;
      legR.rotation.x = legR.rotation.x * (1 - low) + legs;
      armL.rotation.x *= 1 - low;
      armR.rotation.x *= 1 - low;
      armL.rotation.z = armL.rotation.z * (1 - low) - 0.62 * low;
      armR.rotation.z = armR.rotation.z * (1 - low) + 0.62 * low;
      torso.rotation.x *= 1 - low;
    } else if (laid) {
      laid = false;
      body.rotation.x = 0;
      body.position.set(0, 0, 0);
    }

    // Carrying water (v27, Genesis 2:6): both hands brought together before
    // him and cupped, held there whatever his legs are doing, sitting or
    // walking, until he lets it go on the ground he came to water.
    carry = damp(carry, carrying || holding ? 1 : 0, 7, dt);
    if (carry > 0.001) {
      armL.rotation.x = armL.rotation.x * (1 - carry) - 0.9 * carry;
      armR.rotation.x = armR.rotation.x * (1 - carry) - 0.9 * carry;
      armL.rotation.z = armL.rotation.z * (1 - carry) + 0.4 * carry;
      armR.rotation.z = armR.rotation.z * (1 - carry) - 0.4 * carry;
    }
    // A fruit given him takes the hands' place until it is eaten; water he
    // was carrying shows again after.
    lift = damp(lift, holding ? 1 : 0, 7, dt);
    if (lift > 0.001) {
      armR.rotation.x = armR.rotation.x * (1 - lift) - 1.35 * lift;
      armR.rotation.z = armR.rotation.z * (1 - lift) - 0.15 * lift;
    }
    // In prayer (v33, Psalm 141:2, "the lifting up of my hands as the
    // evening sacrifice"): both hands lifted up and open, a little apart, and
    // the face lifted with them — coming up slowly, going down as soon as he
    // walks on.
    orans = damp(orans, praying ? 1 : 0, praying ? 2.2 : 6, dt);
    if (orans > 0.001) {
      const o = orans, sway = Math.sin(idle * 0.9) * 0.03;
      armL.rotation.x = armL.rotation.x * (1 - o) + (-2.3 + sway) * o;
      armR.rotation.x = armR.rotation.x * (1 - o) + (-2.3 - sway) * o;
      armL.rotation.z = armL.rotation.z * (1 - o) - 0.5 * o;
      armR.rotation.z = armR.rotation.z * (1 - o) + 0.5 * o;
      torso.rotation.x = torso.rotation.x * (1 - o) - 0.08 * o;
    }
    // On the ladder (AB#106): both hands up on the rungs, reaching higher in
    // turn; each knee lifted as the other hand goes up, the body close in to
    // the ladder. Blended over whatever else he was doing, like the seat.
    climb = damp(climb, climbing ? 1 : 0, 8, dt);
    if (climb > 0.001) {
      climbPhase += dt * CLIMB_FREQ * Math.PI * 2 * climbRate;
      const s = Math.sin(climbPhase);
      const mix = (from, to) => from * (1 - climb) + to * climb;
      armL.rotation.x = mix(armL.rotation.x, -2.55 - 0.32 * s);
      armR.rotation.x = mix(armR.rotation.x, -2.55 + 0.32 * s);
      armL.rotation.z = mix(armL.rotation.z, 0.16);
      armR.rotation.z = mix(armR.rotation.z, -0.16);
      legL.rotation.x = mix(legL.rotation.x, -0.62 * Math.max(0, s));
      legR.rotation.x = mix(legR.rotation.x, -0.62 * Math.max(0, -s));
      torso.rotation.x = mix(torso.rotation.x, 0.1);
      torso.position.y = mix(torso.position.y, 0.9 + 0.025 * Math.abs(s));
    }

    held.visible = carry > 0.6 && carrying && !holding && climb < 0.5;
    fruitHeld.visible = !!holding && climb < 0.5;
  }

  function setSitting(b) { sitting = !!b; }
  function setLying(b) { lying = !!b; }
  // on: whether he is on the ladder; rate: how quickly he is going, 0..1
  // (0 holds the rungs still).
  function setClimbing(on, rate = 1) {
    climbing = !!on;
    climbRate = rate;
  }
  function setCarrying(b) { carrying = !!b; }
  function setPraying(b) { praying = !!b; }
  // h: { color, left } while he holds a fruit, or null.
  function setHolding(h) {
    holding = h || null;
    if (!holding) return;
    fruitHeld.material.color.setHex(holding.color);
    fruitHeld.scale.setScalar(0.25 + 0.95 * holding.left);
  }

  return {
    group, update, setSitting, setCarrying, setHolding, setClimbing, setPraying, setLying,
    get climbing() { return climbing; },
    get lie() { return lie; },
    get speed() { return speed; },
    get gait() { return gait; },
    get sitting() { return sitting; },
    get wading() { return wading; },
  };
}
