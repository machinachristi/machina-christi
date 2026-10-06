// "Gavest thou... wings and feathers unto the ostrich? Which leaveth her
// eggs in the earth, and warmeth them in dust, and forgetteth that the foot
// may crush them... She is hardened against her young ones, as though they
// were not hers... What time she lifteth up herself on high, she scorneth
// the horse and his rider" (Job 39:13-18).
//
// Her eggs lie in a shallow scrape on the open southern meadow, half sunk
// in the warm dust, and she is almost never at them. She ranges the whole
// south of the garden at a run, stands a while wherever she fetches up,
// pecks about, and runs on again — and once in every round she goes right
// past the scrape without so much as slowing. God gave her no wisdom about
// it (39:17), and it is Him, in the verse, who keeps the eggs: the dust
// warms them, and nothing in the garden treads on them.
//
// Her round is laid out once, at build time, from her own seeded stream —
// nothing is drawn while she runs, so where she is depends only on the
// clock. Body and neck are two merged meshes (the neck on its own pivot,
// for the pecking); both legs share one two-instance mesh; the eggs and
// their scrape are baked into one more. Four draw calls in all.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32, damp, shortestAngle } from '../util.js';

// The scrape, on open dry ground south of the heart of the garden — clear of
// the butterflies' flower band, the ants' road and the coneys' rocks.
const NEST_NEAR = { x: 6, z: -30 };

const PLUME = new THREE.Color(0x2B2724);
const PLUME_WHITE = new THREE.Color(0xEDE6D8);
const SKIN = new THREE.Color(0xC9A58C);
const BEAK = new THREE.Color(0xB89A72);
const EGG = new THREE.Color(0xFBF4E2);
const DUST = new THREE.Color(0xCDB98A);
const DUST_DARK = new THREE.Color(0xAE9A6E);

const RUN = 5.6;            // she scorneth the horse and his rider
const STRIDE = 2.4;         // ground covered per full stride
const HIP_Y = 1.05;         // how high the hips stand
const LEG_LEN = 1.05;
const WAYPOINTS = 9;

function bodyParts() {
  const parts = [];
  // The great round body, black-plumed, carried level.
  parts.push({
    geo: new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed()
      .scale(0.85, 0.72, 1.15).translate(0, HIP_Y + 0.28, 0),
    color: PLUME,
  });
  // The white of the wings and the tail — "the goodly wings", folded.
  for (const dx of [-0.42, 0.42]) {
    parts.push({
      geo: new THREE.IcosahedronGeometry(0.3, 0).toNonIndexed()
        .scale(0.35, 0.6, 1.1).translate(dx, HIP_Y + 0.3, -0.1),
      color: PLUME_WHITE,
    });
  }
  parts.push({
    geo: new THREE.ConeGeometry(0.26, 0.45, 6).toNonIndexed()
      .rotateX(-2.1).translate(0, HIP_Y + 0.42, -0.62),
    color: PLUME_WHITE,
  });
  // The thighs, bare, into the body.
  for (const dx of [-0.17, 0.17]) {
    parts.push({
      geo: new THREE.CylinderGeometry(0.1, 0.07, 0.34, 5).toNonIndexed()
        .translate(dx, HIP_Y + 0.08, 0.04),
      color: SKIN,
    });
  }
  return parts;
}

// The long bare neck and the small head, built hinged at the base of the
// neck (0, 0, 0) so the pivot can bow it to the ground.
function neckParts() {
  const parts = [];
  parts.push({
    geo: new THREE.CylinderGeometry(0.05, 0.085, 1.05, 6).toNonIndexed()
      .translate(0, 0.52, 0).rotateX(0.18),
    color: SKIN,
  });
  parts.push({
    geo: new THREE.IcosahedronGeometry(0.12, 1).toNonIndexed()
      .scale(0.9, 0.85, 1.2).translate(0, 1.06, 0.2),
    color: SKIN,
  });
  parts.push({
    geo: new THREE.ConeGeometry(0.06, 0.2, 5).toNonIndexed()
      .rotateX(Math.PI / 2).translate(0, 1.04, 0.38),
    color: BEAK,
  });
  // A collar of plume where the neck meets the body.
  parts.push({
    geo: new THREE.CylinderGeometry(0.18, 0.24, 0.16, 7).toNonIndexed()
      .translate(0, 0.02, -0.04),
    color: PLUME,
  });
  return parts;
}

// A leg, hinged at the hip (0, 0, 0) and hanging straight down from it.
function legGeometry() {
  return mergeColored([
    { geo: new THREE.CylinderGeometry(0.045, 0.04, LEG_LEN, 5).toNonIndexed()
      .translate(0, -LEG_LEN / 2, 0), color: SKIN },
    { geo: new THREE.BoxGeometry(0.12, 0.05, 0.26).toNonIndexed()
      .translate(0, -LEG_LEN + 0.02, 0.07), color: BEAK },
  ]);
}

// Built about the scrape's own centre; `lift(dx, dz)` is the ground's rise
// or fall there relative to it, so nothing sinks into a slope.
function nestParts(rng, lift) {
  const parts = [];
  // The scrape: a low hump of loose dust, pale in the middle.
  parts.push({
    geo: new THREE.CylinderGeometry(1.15, 1.35, 0.14, 14).toNonIndexed()
      .translate(0, 0.02, 0),
    color: DUST_DARK,
  });
  parts.push({
    geo: new THREE.CircleGeometry(1.0, 14).toNonIndexed()
      .rotateX(-Math.PI / 2).translate(0, 0.095, 0),
    color: DUST,
  });
  // The eggs, half sunk in it, every one lying a little its own way.
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const r = i === 0 ? 0 : 0.36 + rng() * 0.5;
    const ex = Math.cos(a) * r, ez = Math.sin(a) * r;
    parts.push({
      geo: new THREE.SphereGeometry(0.2, 8, 6).toNonIndexed()
        .scale(1, 0.85, 1.25)
        .rotateY(rng() * Math.PI)
        .translate(ex, Math.max(0, lift(ex, ez)) + 0.16 + rng() * 0.03, ez),
      color: EGG,
    });
  }
  return parts;
}

// Open, dry, southern meadow — the whole of her range lies well south of the
// river (whose course never comes below z ≈ 5) and outside the clearing.
function goodGround(x, z) {
  const r = Math.hypot(x, z);
  return r > 13 && r < 44 && z < -10 && riverEdgeDist(x, z) > 6 && heightAt(x, z) > -0.2;
}

export function createOstrich(scene) {
  // Own seeded stream: nothing already planted shifts.
  const rng = mulberry32(20260839);

  // The scrape.
  let nx = NEST_NEAR.x, nz = NEST_NEAR.z;
  for (let i = 0; i < 24; i++) {
    const cx = NEST_NEAR.x + (rng() - 0.5) * 4;
    const cz = NEST_NEAR.z + (rng() - 0.5) * 4;
    if (goodGround(cx, cz)) { nx = cx; nz = cz; break; }
  }
  const nestGroundY = heightAt(nx, nz);
  const nestBits = nestParts(rng, (dx, dz) => heightAt(nx + dx, nz + dz) - nestGroundY);
  const nest = new THREE.Mesh(mergeColored(nestBits),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  nest.position.set(nx, nestGroundY, nz);
  scene.add(nest);
  for (const p of nestBits) p.geo.dispose();

  // Her round across the south of the garden. One stop in it is the scrape
  // itself — and that is the one stop she never stands at: she runs on by.
  const round = [];
  let guard = 0;
  while (round.length < WAYPOINTS && guard++ < 600) {
    const x = (rng() * 2 - 1) * 42;
    const z = -10 - rng() * 34;
    if (!goodGround(x, z)) continue;
    const prev = round[round.length - 1];
    if (prev && Math.hypot(prev.x - x, prev.z - z) < 12) continue;
    round.push({ x, z, stand: 4 + rng() * 7, passing: false });
  }
  round.splice(Math.floor(round.length / 2), 0,
    { x: nx + 1.6, z: nz - 0.4, stand: 0, passing: true });

  const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const group = new THREE.Group();
  scene.add(group);
  const bodyBits = bodyParts();
  group.add(new THREE.Mesh(mergeColored(bodyBits), lambert()));
  for (const p of bodyBits) p.geo.dispose();

  const neck = new THREE.Group();
  neck.position.set(0, HIP_Y + 0.5, 0.42);
  const neckBits = neckParts();
  neck.add(new THREE.Mesh(mergeColored(neckBits), lambert()));
  group.add(neck);
  for (const p of neckBits) p.geo.dispose();

  const legs = new THREE.InstancedMesh(legGeometry(), lambert(), 2);
  group.add(legs);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  // Where she presently stands, and where in her round.
  const at = round[0];
  const posV = new THREE.Vector3(at.x, heightAt(at.x, at.z), at.z);
  let leg = 1;
  let yaw = 0;
  let mode = 'stand';
  let standFor = 2;
  let stride = 0;
  let speed = 0;
  let peck = 0;
  let t = 0;
  let passes = 0;

  function update(dt, sabbath = false) {
    t += dt;
    const target = round[leg];
    const dx = target.x - posV.x, dz = target.z - posV.z;
    const d = Math.hypot(dx, dz);

    if (mode === 'stand') {
      speed = damp(speed, 0, 6, dt);
      // On the seventh day she stands twice as long wherever she is.
      if ((standFor -= dt * (sabbath ? 0.5 : 1)) <= 0) mode = 'run';
    } else {
      speed = damp(speed, RUN, 2.2, dt);
      yaw += shortestAngle(yaw, Math.atan2(dx, dz)) * (1 - Math.exp(-6 * dt));
      const step = Math.min(d, speed * dt);
      posV.x += Math.sin(yaw) * step;
      posV.z += Math.cos(yaw) * step;
      if (d < 0.6) {
        if (target.passing) passes++;
        else { mode = 'stand'; standFor = target.stand; }
        leg = (leg + 1) % round.length;
      }
    }
    posV.y = heightAt(posV.x, posV.z);
    stride += (speed * dt) / STRIDE;

    group.position.copy(posV);
    // A little bounce in the run, nothing at a stand.
    const runK = speed / RUN;
    group.position.y += Math.abs(Math.sin(stride * Math.PI * 2)) * 0.1 * runK;
    group.rotation.y = yaw;
    group.rotation.x = 0.12 * runK;   // leaning into it

    // Standing, she bows the long neck right down and pecks about; running,
    // she carries it up and a little forward.
    const pecking = mode === 'stand' ? Math.max(0, Math.sin(t * 1.3 + 1)) : 0;
    peck = damp(peck, pecking > 0.55 ? 1 : 0, 5, dt);
    neck.rotation.x = 0.1 + 0.15 * runK + peck * 1.55 + Math.sin(t * 9) * 0.03 * peck;

    for (let i = 0; i < 2; i++) {
      const swing = Math.sin((stride + i * 0.5) * Math.PI * 2) * 0.75 * runK;
      p.set(i === 0 ? -0.17 : 0.17, HIP_Y, 0.04);
      q.setFromEuler(e.set(swing, 0, 0));
      m.compose(p, q, one);
      legs.setMatrixAt(i, m);
    }
    legs.instanceMatrix.needsUpdate = true;
  }
  update(0);

  // `ya'anah` is the ostrich of Leviticus 11:16; Job's own word for her is
  // the plural renanim, "the cries", which is not a name one gives a bird.
  const spots = [
    { pos: posV, name: "Ya'anah", label: 'the ostrich', kind: 'ostrich' },
    { pos: { x: nx, y: nestGroundY + 0.2, z: nz }, name: 'Beitzim', label: 'her eggs, left in the dust', kind: 'eggs' },
  ];

  return {
    update, spots,
    state: () => ({
      x: posV.x, z: posV.z, mode, speed,
      nest: { x: nx, z: nz, eggs: 9 },
      passes,
    }),
  };
}
