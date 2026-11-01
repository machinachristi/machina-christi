// "His eyes are as the eyes of doves by the rivers of waters, washed with
// milk, and fitly set" (Song of Solomon 5:12).
//
// A few white doves keep a shallow at the edge of the slow western reach,
// standing in the water up to their feet. Each in its own time ducks its
// head and breast under, once, twice, and comes up and shakes itself, wings
// flung half open and shivering, so that a little shower of drops flies off
// it and falls back sparkling onto the water; then it settles its feathers
// and stands a while. Wade in among them and they are not afraid: they turn
// to look at him, and every one of them washes and shakes at once, as if
// for joy. By night they are gone to roost.
//
// Three draw calls at most, and none at all while they are out of sight:
// the bodies are one instanced mesh, the wings another (two to a dove,
// shown only while it shakes), and the drops one point cloud.

import * as THREE from 'three';
import { riverZ, riverEdgeDist, heightAt } from './terrain.js';
import { mergeColored, mulberry32, damp, clamp, smoothstep, shortestAngle } from '../util.js';

const DOVES = 5;
const AT_X = -37;              // the middle of their shallow, on the slow reach
const SPREAD = 2.6;            // how far along the bank they stand from it
const SIZE = 1.25;
const NEAR = 3.6;              // he comes this near: they all wash for joy
const DROPS = 96;
const GRAVITY = 5.5;
const NAME = 'Yonim';
const LABEL = 'doves by the rivers of waters';

const WHITE = new THREE.Color(0xFBFAF4);
const SHADE = new THREE.Color(0xE4E1D8);
const BEAK = new THREE.Color(0xC98E86);
const EYE = new THREE.Color(0x2A211C);

function doveGeometry() {
  return mergeColored([
    { geo: new THREE.SphereGeometry(0.1, 8, 6).toNonIndexed().scale(0.8, 0.78, 1.25).translate(0, 0.17, 0), color: WHITE },
    // The folded wings, a shade warmer, along the flanks.
    { geo: new THREE.SphereGeometry(0.06, 6, 4).toNonIndexed().scale(0.45, 0.8, 1.9).translate(0.072, 0.19, -0.02), color: SHADE },
    { geo: new THREE.SphereGeometry(0.06, 6, 4).toNonIndexed().scale(0.45, 0.8, 1.9).translate(-0.072, 0.19, -0.02), color: SHADE },
    { geo: new THREE.SphereGeometry(0.058, 8, 6).toNonIndexed().translate(0, 0.27, 0.1), color: WHITE },
    { geo: new THREE.ConeGeometry(0.016, 0.05, 4).toNonIndexed().rotateX(Math.PI / 2).translate(0, 0.262, 0.17), color: BEAK },
    { geo: new THREE.SphereGeometry(0.011, 4, 3).toNonIndexed().translate(0.04, 0.285, 0.13), color: EYE },
    { geo: new THREE.SphereGeometry(0.011, 4, 3).toNonIndexed().translate(-0.04, 0.285, 0.13), color: EYE },
    // The tail, fanned a little.
    { geo: new THREE.ConeGeometry(0.05, 0.14, 4).toNonIndexed().scale(1, 0.3, 1).rotateX(-Math.PI / 2 - 0.2).translate(0, 0.19, -0.17), color: SHADE },
  ]);
}

// A wing laid out from its hinge at the origin along +x, so one geometry
// serves both sides: the left is the right turned half round about the
// body's long axis.
function wingGeometry() {
  return new THREE.SphereGeometry(0.075, 6, 4).toNonIndexed().scale(1.4, 0.12, 0.85).translate(0.095, 0, -0.01);
}

export function createDoves(scene) {
  // Own seeded stream, above every seed in either realm: nothing already
  // planted shifts.
  const rng = mulberry32(20260863);

  const doves = [];
  for (let i = 0; i < DOVES; i++) {
    const x = AT_X + ((i + 0.5) / DOVES - 0.5) * 2 * SPREAD + (rng() - 0.5) * 0.6;
    // The south bank, the side the garden is walked from: march in from
    // the grass toward the middle of the stream to the water's edge, and a
    // step on into it. (Along this reach the bed is carved out well beyond
    // the water itself, so it is the water's edge that is sought, not the
    // ground's height.)
    const zc = riverZ(x);
    let z = zc - 5;
    for (let k = 0; k < 120 && riverEdgeDist(x, z) > 0.01; k++) z += 0.05;
    z += 0.2 + rng() * 0.25;
    // Standing in the shallow: its feet just under the surface (-0.5),
    // whatever the bed does below.
    const ground = Math.max(heightAt(x, z), -0.58);
    doves.push({
      x, z, ground,
      yaw: Math.PI * 0.5 + (rng() - 0.5) * 2.2,
      face: 0,
      // Each keeps its own time: a wash every so often, never in step.
      wait: 1 + rng() * 7,
      act: 'stand', t: 0, dips: 0,
      dip: 0, shake: 0,
      wingPhase: rng() * 6,
      joy: false,
      pos: new THREE.Vector3(x, ground, z),   // for the naming
    });
  }

  const bodies = new THREE.InstancedMesh(
    doveGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x2E2C26 }),
    DOVES,
  );
  const wings = new THREE.InstancedMesh(
    wingGeometry(),
    new THREE.MeshLambertMaterial({ color: 0xF3F1EA, flatShading: true, emissive: 0x2E2C26 }),
    DOVES * 2,
  );
  // Drawn only when the shallow is in view: they stand in one small place,
  // so one sphere bounds them all.
  const heart = new THREE.Vector3(AT_X, -0.4, riverZ(AT_X) - 2.2);
  const bound = new THREE.Sphere(heart, SPREAD + 1);
  for (const D of doves) D.face = D.yaw;
  for (const m of [bodies, wings]) {
    m.boundingSphere = bound.clone();
    scene.add(m);
  }

  // The drops: a small recycled pool, each flung up and out and falling back.
  const dropPos = new Float32Array(DROPS * 3);
  const dropVel = new Float32Array(DROPS * 3);
  const dropLife = new Float32Array(DROPS);
  for (let i = 0; i < DROPS; i++) dropPos[i * 3 + 1] = -1000;
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  dropGeo.boundingSphere = bound.clone();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g2 = canvas.getContext('2d');
  const grad = g2.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, 'rgba(250, 253, 255, 1)');
  grad.addColorStop(0.45, 'rgba(225, 240, 250, 0.7)');
  grad.addColorStop(1, 'rgba(225, 240, 250, 0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 32, 32);
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({
    size: 0.07,
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  scene.add(drops);
  let nextDrop = 0;
  let flying = 0;

  function fling(D, n, up) {
    for (let k = 0; k < n; k++) {
      const i = nextDrop;
      nextDrop = (nextDrop + 1) % DROPS;
      // Spread round the dove from its shoulders, out and up.
      const a = (k / n) * Math.PI * 2 + D.wingPhase;
      const out = 0.5 + ((k * 0.618) % 1) * 0.7;
      dropPos[i * 3] = D.x + Math.cos(a) * 0.08 * SIZE;
      dropPos[i * 3 + 1] = D.ground + 0.2 * SIZE;
      dropPos[i * 3 + 2] = D.z + Math.sin(a) * 0.08 * SIZE;
      dropVel[i * 3] = Math.cos(a) * out;
      dropVel[i * 3 + 1] = up * (0.7 + ((k * 0.381) % 1) * 0.6);
      dropVel[i * 3 + 2] = Math.sin(a) * out;
      dropLife[i] = 1;
    }
  }

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _o = new THREE.Vector3();
  const _s = new THREE.Vector3(SIZE, SIZE, SIZE);
  const _e = new THREE.Euler();
  const Z = new THREE.Vector3(0, 0, 1);
  const ZERO = new THREE.Vector3(0, 0, 0);
  let washes = 0;
  let shakes = 0;
  let joys = 0;
  let near = false;
  let shown = true;

  function update(dt, walker, night = 0) {
    // By night they are gone to roost; by day back on their shallow. (The
    // sky's own dusk is the gentle part: they go once it is half dark.)
    const away = night > 0.5;
    if (away !== !shown) {
      shown = !away;
      bodies.visible = shown;
      if (!shown) wings.visible = drops.visible = false;
      for (const D of doves) D.pos.y = shown ? D.ground : -1000;   // nothing to name while they are gone
    }
    if (!shown) return;

    // He comes in among them: they turn to him and all wash at once.
    const d = walker ? Math.hypot(walker.x - heart.x, walker.z - heart.z) : Infinity;
    const nowNear = d < NEAR + SPREAD;
    if (nowNear && !near) {
      joys++;
      doves.forEach((D, i) => {
        if (D.act === 'stand') { D.act = 'dip'; D.t = -i * 0.18; D.dips = 0; D.joy = true; }
      });
    }
    near = nowNear;

    let k = 0;
    let opening = false;
    for (const D of doves) {
      D.t += dt;
      if (D.act === 'stand') {
        D.wait -= dt;
        if (D.wait <= 0) { D.act = 'dip'; D.t = 0; D.dips = 0; washes++; }
      } else if (D.act === 'dip') {
        // Head and breast down under the water, and up again.
        const u = clamp(D.t / 0.55, 0, 1);
        D.dip = Math.sin(Math.PI * u);
        if (D.t >= 0.55) {
          fling(D, 4, 0.6);
          D.dips++;
          D.t = 0;
          if (D.dips >= 2) {
            // Up out of the second dip it shakes itself, and the drops fly.
            D.act = 'shake';
            fling(D, 14, 1.3);
            shakes++;
          }
        }
      } else if (D.act === 'shake') {
        D.dip = 0;
        if (D.t >= 0.9) {
          D.act = 'stand';
          D.t = 0;
          D.wait = D.joy ? 2 + (D.x % 1 + 1) * 2 : 5 + ((D.x * 7.13) % 1 + 1) * 4;
          D.joy = false;
        }
      }
      D.shake = damp(D.shake, D.act === 'shake' ? 1 : 0, D.act === 'shake' ? 18 : 6, dt);
      D.wingPhase += dt * 32 * D.shake;

      // Facing: turned toward him while he is near, else back its own way —
      // always the short way round, and easing, never a snap.
      const want = near && walker ? Math.atan2(walker.x - D.x, walker.z - D.z) : D.yaw;
      D.face += shortestAngle(D.face, want) * clamp(dt * 3, 0, 1);
      const face = D.face;
      const shiver = Math.sin(D.wingPhase * 1.3) * 0.08 * D.shake;
      _e.set(D.dip * 1.1, face + shiver, Math.sin(D.wingPhase * 0.7) * 0.06 * D.shake, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(D.x, D.ground - D.dip * 0.06, D.z);
      bodies.setMatrixAt(k, _m.compose(_p, _q, _s));

      // Wings: out from the shoulders while it shakes, shivering; folded
      // (and not drawn) otherwise.
      const open = D.shake;
      if (open >= 0.03) opening = true;
      for (let side = 0; side < 2; side++) {
        const sx = side ? -1 : 1;
        if (open < 0.03) {
          wings.setMatrixAt(k * 2 + side, _m.compose(_p, _q, ZERO));
          continue;
        }
        // Raised by `flap` from level: the right wing turned up about the
        // long axis, the left the same wing turned half round and up.
        const flap = (0.6 + Math.sin(D.wingPhase + side * 0.4) * 0.45) * open;
        _q2.setFromAxisAngle(Z, side ? Math.PI - flap : flap);
        _q2.premultiply(_q);
        _o.set(sx * 0.045, 0.2, 0).multiplyScalar(SIZE).applyQuaternion(_q).add(_p);
        _s.setScalar(SIZE * smoothstep(0, 0.4, open));
        wings.setMatrixAt(k * 2 + side, _m.compose(_o, _q2, _s));
        _s.setScalar(SIZE);
      }
      k++;
    }
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
    wings.visible = opening;   // drawn only while some dove has its wings out

    // The drops fly and fall back onto the water, and are gone.
    flying = 0;
    for (let i = 0; i < DROPS; i++) {
      if (dropLife[i] <= 0) continue;
      dropVel[i * 3 + 1] -= GRAVITY * dt;
      dropPos[i * 3] += dropVel[i * 3] * dt;
      dropPos[i * 3 + 1] += dropVel[i * 3 + 1] * dt;
      dropPos[i * 3 + 2] += dropVel[i * 3 + 2] * dt;
      if (dropPos[i * 3 + 1] < -0.5) {
        dropLife[i] = 0;
        dropPos[i * 3 + 1] = -1000;
      } else {
        flying++;
      }
    }
    dropGeo.attributes.position.needsUpdate = true;
    drops.visible = flying > 0;
  }
  update(0, null, 0);

  return {
    update,
    spots: doves.map(D => ({ pos: D.pos, name: NAME, label: LABEL, kind: 'dove' })),
    state: () => ({
      count: DOVES,
      shown,
      washes,
      shakes,
      joys,
      drops: flying,
      at: { x: heart.x, z: heart.z },
      // `wet`: standing in the water itself, not on the bank.
      doves: doves.map(D => ({ x: D.x, z: D.z, act: D.act, wet: riverEdgeDist(D.x, D.z) < 0.01 })),
    }),
  };
}
