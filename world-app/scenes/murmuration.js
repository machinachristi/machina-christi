// "Behold the fowls of the air" (Matthew 6:26) — "and let fowl fly above
// the earth in the open firmament of heaven" (Genesis 1:20).
//
// A great flock of small birds keeps the garden's sky: more than a thousand
// of them, wheeling together as one body — a swirling disc that tilts and
// folds, stretches into a long ribbon and gathers again into a ball, with
// dark waves rolling through it as the birds bunch and part. It is up from
// first light, dances through the morning, goes off beyond the rim through
// the heat of the day, and comes back out of the sunset to dance again in
// the evening light, before pouring down, bird by bird, into the reeds by
// the river for the night.
//
// Stand still and look, and the flock comes to you: it leaves its own
// wandering and wheels low over the meadow just before you, so close the
// rush of all those wings is heard.
//
// One draw call. Every bird is an instance of one tiny three-triangle shape,
// and where each bird is — its place in the flock, its flight round it, its
// wingbeat, and its turn to drop into the reeds — is worked out on the
// graphics chip from a few numbers the frame loop hands over (the flock's
// centre, tilt, shape). The frame loop never touches a single bird. Each one
// turns about its own line of flight to show the watcher its wings (an
// "axial billboard"), so a flock seen from below or far off still reads as
// birds, not slivers.
//
// Its own seeded stream, drawn only at build time; nothing planted shifts.

import * as THREE from 'three';
import { heightAt, riverZ } from './terrain.js';
import { clamp, damp, mulberry32, smoothstep } from '../util.js';

const BIRDS = 1100;
const SPAN = 0.42;              // wingtip to wingtip, metres
const COLOR = 0x2A2B33;

// The flock's day, as fractions of the sky's own cycle (scenes/sky.js).
const RISE = [0.965, 0.995];    // up out of the reeds at first light
const LEAVE = [0.26, 0.31];     // off beyond the rim as the day grows hot
const RETURN = [0.45, 0.50];    // back out of the westering sun
const SETTLE = [0.615, 0.645];  // down into the reeds as the light goes
const SWITCH = 0.38;            // (while away) the morning stage gives way to the evening's

const MORNING = new THREE.Vector3(0, 13, 34);   // north, over the river, before the sacred trees
const EVENING_OUT = 24;         // the evening dance hangs this far out toward the sun
const EVENING_Y = 12;
const FAR = 140;                // past the fog's far edge: gone from sight
const ROOST_X = -10;            // the reeds on the south bank of the west reach

const STILL_SPEED = 0.25;       // m/s; slower than this he is standing
const CALL_AFTER = 3;           // seconds of standing before the flock comes
const BEFORE = 22;             // …to wheel this far out in front of him
const BEFORE_Y = 4.5;           // …and this high over the ground there
// v34 (Psalm 8:3): lying back to look up, it comes to wheel right over him
// instead — a little way out past his feet, high enough to fill his eyes.
const OVER = 9;
const OVER_Y = 17;
const CAPTION_FOR = 4;          // seconds the flock's name is shown

const CAPTION = { name: 'Of ha-shamayim', label: 'the fowls of the air' };

// How far into the reeds the flock has gone: 0 all aloft, 1 all roosting.
export function settleOf(t) {
  if (t >= SETTLE[1] && t < RISE[0]) return 1;
  if (t >= SETTLE[0] && t < SETTLE[1]) return smoothstep(SETTLE[0], SETTLE[1], t);
  if (t >= RISE[0] && t < RISE[1]) return 1 - smoothstep(RISE[0], RISE[1], t);
  return 0;
}

// How far off beyond the rim the flock has gone through the middle of the day.
export function awayOf(t) {
  return smoothstep(LEAVE[0], LEAVE[1], t) * (1 - smoothstep(RETURN[0], RETURN[1], t));
}

// One bird, wings spread, flying toward +z with its back to +y: a slim body
// and two swept wings. `aWing` is 1 at the wingtips, which are the only
// vertices the wingbeat moves.
function birdGeometry() {
  const h = SPAN / 2;
  const pos = [
    // body
    0, 0, 0.13,   -0.03, 0, -0.1,   0.03, 0, -0.1,
    // left wing
    0, 0, 0.05,   -h, 0, -0.035,   0, 0, -0.045,
    // right wing
    0, 0, 0.05,   0, 0, -0.045,    h, 0, -0.035,
  ];
  const wing = [0, 0, 0, 0, 1, 0, 0, 0, 1];
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  return geo;
}

export function createMurmuration(scene) {
  const rng = mulberry32(20260851);

  const geo = birdGeometry();
  // Each bird's own four numbers: where it rides in the flock (u round it,
  // v out from its heart, w through its depth) and its own phase, which
  // sets its wingbeat, its size and its turn to come down to the reeds.
  const seeds = new Float32Array(BIRDS * 4);
  for (let i = 0; i < BIRDS; i++) {
    seeds[i * 4] = rng();
    seeds[i * 4 + 1] = rng();
    seeds[i * 4 + 2] = rng();
    seeds[i * 4 + 3] = rng();
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = BIRDS;

  const roostZ = riverZ(ROOST_X) - 3.3;
  const ROOST = new THREE.Vector3(ROOST_X, heightAt(ROOST_X, roostZ) + 0.45, roostZ);

  const u = {
    uTime: { value: 0 },
    uCentre: { value: MORNING.clone() },
    uBasis: { value: new THREE.Matrix3() },
    uSize: { value: new THREE.Vector3(13, 3.5, 13) },
    uShape: { value: 0.3 },
    uFold: { value: 0.6 },
    uWaveDir: { value: new THREE.Vector3(1, 0, 0) },
    uSettle: { value: 0 },
    uRoost: { value: ROOST },
  };

  const material = new THREE.MeshBasicMaterial({ color: COLOR, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform vec3 uCentre;
        uniform mat3 uBasis;
        uniform vec3 uSize;
        uniform float uShape;
        uniform float uFold;
        uniform vec3 uWaveDir;
        uniform float uSettle;
        uniform vec3 uRoost;
        attribute vec4 aSeed;
        attribute float aWing;`)
      .replace('#include <begin_vertex>', `
        vec3 transformed;
        {
          float T = uTime;
          float u = aSeed.x, v = aSeed.y, w = aSeed.z, ph = aSeed.w;
          // Round the flock it flies: a disc that turns, with bands where
          // the birds bunch closer drifting round it — the dark waves.
          float th = 6.2832 * u + T * (0.6 + 0.04 * v);
          th += 0.35 * sin(2.0 * th - T * 0.4);
          float r = 0.3 + 0.9 * sqrt(v);
          vec3 disc = vec3(cos(th) * r, (w - 0.5) * 0.3, sin(th) * r * 0.45);
          disc.y += uFold * (0.55 * sin(3.4 * cos(th) + T * 0.37) + 0.3 * sin(2.6 * v - T * 0.29));
          vec3 discGo = vec3(-sin(th), 0.0, cos(th) * 0.45);
          // …or gathered up into a ball, the same birds circling inside it.
          float cz = v * 2.0 - 1.0;
          float sz = sqrt(max(0.0, 1.0 - cz * cz));
          float rr = pow(w, 0.4);
          vec3 ball = rr * vec3(sz * cos(th), cz * 0.7, sz * sin(th));
          vec3 ballGo = vec3(-sin(th), 0.0, cos(th));
          vec3 L = mix(disc, ball, uShape);
          vec3 go = mix(discGo, ballGo, uShape);
          // A pulse rolling through the whole body of it.
          L *= 1.0 + 0.16 * sin(dot(L, uWaveDir) * 3.2 - T * 1.9);
          L += 0.03 * vec3(sin(T * 1.3 + ph * 6.3), sin(T * 1.1 + ph * 9.1), cos(T * 1.7 + ph * 4.3));
          vec3 P = uCentre + uBasis * (L * uSize);
          vec3 H = normalize(uBasis * (go * uSize) + 0.0001);
          H = normalize(H + 0.22 * vec3(sin(T * 0.9 + ph * 13.0), 0.3 * sin(T * 1.1 + ph * 7.0), cos(T * 0.7 + ph * 17.0)));

          // Down into the reeds at dusk (and up out of them at first light),
          // each bird in its own turn.
          float k = clamp(uSettle * 1.7 - ph * 0.7, 0.0, 1.0);
          k = k * k * (3.0 - 2.0 * k);
          vec3 R = uRoost + vec3(sin(ph * 40.0), 0.0, cos(ph * 40.0)) * (0.6 + 2.2 * w);
          P = mix(P, R, k);
          float shown = 1.0 - smoothstep(0.85, 1.0, k);

          // The bird itself, turned about its line of flight to face the watcher.
          vec3 V = normalize(cameraPosition - P);
          vec3 S = cross(H, V);
          float sl = length(S);
          S = sl > 0.12 ? S / sl : normalize(cross(H, vec3(0.0, 1.0, 0.0)) + 0.0001);
          // Flapping a while, then gliding a while; the tips foreshorten as
          // the wings beat, which is how a wingbeat reads from far off.
          float beat = smoothstep(0.35, 0.6, 0.5 + 0.5 * sin(T * 0.8 + ph * 23.0));
          float flap = mix(1.0, 0.25 + 0.75 * abs(cos(T * 13.0 + ph * 41.0)), beat);
          float scale = (0.85 + 0.3 * fract(ph * 7.13)) * shown;
          vec3 b = position;
          b.x *= mix(1.0, flap, aWing);
          transformed = P + (S * b.x + H * b.z) * scale;
        }`);
  };
  material.customProgramCacheKey = () => 'murmuration';

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;   // the birds are placed in the shader, far from any bounds
  scene.add(mesh);

  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _m4 = new THREE.Matrix4();
  const stage = new THREE.Vector3();
  const before = new THREE.Vector3();
  const meet = new THREE.Vector3();
  const centre = u.uCentre.value;

  let clock = 0;
  let still = 0;
  let speed = 0;
  let last = null;
  let call = 0;           // 0 at its own wandering → 1 come to wheel before him
  let arrived = false;    // armed again once the flock has gone back to its wandering
  let arrivals = 0;
  let caption = null;
  let captionLeft = 0;
  let rush = 0;
  let near = Infinity;
  let settle = 0;
  let away = 0;
  let hourNow = 0;
  let over = 0;           // 0 wheeling before him → 1 over him as he lies looking up (v34)

  const _above = new THREE.Vector3();
  function roostAbove() { return _above.copy(ROOST).setY(ROOST.y + 4); }

  // Where the flock would be if no one were watching: wandering over its
  // morning ground north of the sacred trees, or out toward the evening sun.
  function stageAt(t, sunAz) {
    const evening = t >= SWITCH && t < 0.8;
    if (evening) {
      stage.set(Math.sin(sunAz) * EVENING_OUT, EVENING_Y, Math.cos(sunAz) * EVENING_OUT);
    } else {
      stage.copy(MORNING);
    }
    stage.x += 16 * Math.sin(clock * 0.071);
    stage.y += 3 * Math.sin(clock * 0.093 + 1);
    stage.z += 9 * Math.sin(clock * 0.053 + 2);
    // Gone off beyond the rim through the middle of the day: north in the
    // morning, out of the sun's own quarter for the evening return.
    const a = smoothstep(0, 1, away);
    if (a > 0) {
      const dx = evening ? Math.sin(sunAz) : 0;
      const dz = evening ? Math.cos(sunAz) : 1;
      stage.x += dx * FAR * a;
      stage.z += dz * FAR * a;
      stage.y += 25 * a;
    }
    return stage;
  }

  // overhead (v34): whether he lies looking up — the flock then comes to
  // wheel over him rather than low before him.
  function update(dt, cycleT, walker, facing = 0, sunAz = 0, overhead = false) {
    clock += dt;
    hourNow = cycleT;
    u.uTime.value = clock;
    settle = settleOf(cycleT);
    away = awayOf(cycleT);
    u.uSettle.value = settle;
    const aloft = settle < 0.999 && away < 0.999;
    mesh.visible = aloft;

    // Is he standing still? (Measured from his own steps, as the blossom does.)
    if (walker) {
      if (!last) last = { x: walker.x, z: walker.z };
      const moved = Math.hypot(walker.x - last.x, walker.z - last.z);
      last.x = walker.x; last.z = walker.z;
      if (moved > 3) { still = 0; speed = 0; }   // a teleport is not a walk
      else {
        speed += (moved / Math.max(dt, 1e-4) - speed) * Math.min(1, dt * 10);
        still = speed < STILL_SPEED ? still + dt : 0;
      }
    }
    const free = settle < 0.02 && away < 0.02;
    const want = walker && free && still >= CALL_AFTER ? 1 : 0;
    call = damp(call, want, want ? 0.35 : 0.22, dt);
    if (!free) call = Math.min(call, 1 - Math.max(settle, away));

    stageAt(cycleT, sunAz);
    centre.copy(stage);
    const c = smoothstep(0, 1, call);
    // Over him or before him: eased, so a flock already come to him rises
    // to its new place rather than leaping there.
    over = damp(over, overhead ? 1 : 0, 0.8, dt);
    const out = BEFORE + (OVER - BEFORE) * over;
    // Where it comes to wheel: out before him, fixed while he stands. Once he
    // walks on it stays over that spot and drifts back to its own wandering,
    // rather than swinging round with him as he turns.
    if (want) meet.set(walker.x + Math.sin(facing) * out, 0, walker.z + Math.cos(facing) * out);
    if (c > 0.001 && walker) {
      before.set(meet.x + 4 * Math.sin(clock * 0.3), 0, meet.z + 4 * Math.cos(clock * 0.3));
      before.y = Math.max(heightAt(before.x, before.z), -0.5) + BEFORE_Y + (OVER_Y - BEFORE_Y) * over;
      centre.lerp(before, c);
    }
    // Down to the reeds: the whole body sinks toward them as the birds drop in.
    const s = smoothstep(0, 0.6, settle);
    if (s > 0) centre.lerp(roostAbove(), s);

    // Its shape and tilt, never still: incommensurate slow swings, so it
    // never quite repeats.
    const shape = 0.5 + 0.32 * Math.sin(clock * 0.051) + 0.18 * Math.sin(clock * 0.123 + 1.3);
    u.uShape.value = clamp(Math.max(shape, settle), 0, 1);
    u.uFold.value = 0.6 + 0.4 * Math.sin(clock * 0.067);
    const shrink = (1 - 0.5 * c) * (1 - 0.55 * settle);
    u.uSize.value.set(
      13 * (1 + 0.2 * Math.sin(clock * 0.083)) * shrink,
      3.5 * (1 + 0.3 * Math.sin(clock * 0.06 + 2)) * shrink,
      13 * (1 + 0.25 * Math.sin(clock * 0.07 + 4)) * shrink,
    );
    _e.set(
      0.32 * Math.sin(clock * 0.057),
      clock * 0.05 + 0.6 * Math.sin(clock * 0.041),
      0.45 * Math.sin(clock * 0.036 + 1),
    );
    u.uBasis.value.setFromMatrix4(_m4.makeRotationFromEuler(_e));
    u.uWaveDir.value.set(Math.cos(clock * 0.13), 0.3 * Math.sin(clock * 0.2), Math.sin(clock * 0.13));

    // The rush of wings, loudest as it comes close and swells with each
    // wave through the flock.
    near = walker && aloft ? Math.hypot(centre.x - walker.x, centre.y - walker.y, centre.z - walker.z) : Infinity;
    const close = aloft ? 1 - clamp((near - 8) / 30, 0, 1) : 0;
    rush = close * (1 - settle) * (0.65 + 0.35 * Math.sin(clock * 1.9));

    // Each time it comes to him, its name is given.
    if (call > 0.6 && !arrived) {
      arrived = true;
      arrivals++;
      caption = CAPTION;
      captionLeft = CAPTION_FOR;
    } else if (call < 0.1) {
      arrived = false;
    }
    if (captionLeft > 0) {
      captionLeft -= dt;
      if (captionLeft <= 0) caption = null;
    }
  }

  function mode() {
    if (settle >= 0.999) return 'roost';
    if (settle > 0) return hourNow >= RISE[0] ? 'rising' : 'settling';
    if (away >= 0.999) return 'away';
    if (away > 0) return 'travelling';
    return call > 0.5 ? 'before' : 'dance';
  }

  function state() {
    return {
      birds: BIRDS,
      mode: mode(),
      visible: mesh.visible,
      call: +call.toFixed(3),
      arrivals,
      near: Number.isFinite(near) ? +near.toFixed(2) : null,
      over: +over.toFixed(3),
      x: centre.x, y: centre.y, z: centre.z,
      roost: { x: ROOST.x, z: ROOST.z },
    };
  }

  // Where it wheels, while it has come to wheel over a watcher lying in the
  // grass (v34) — so his eyes can follow it.
  function aboveHim(out) {
    if (!mesh.visible || call < 0.5 || over < 0.5) return false;
    out.copy(centre);
    return true;
  }

  return {
    update, state, aboveHim,
    caption: () => caption,
    get rush() { return rush; },
  };
}
