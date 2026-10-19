// The leaves of the Tree of Life (v33): "and the leaves of the tree were for
// the healing of the nations" (Revelation 22:2).
//
// Now and then a leaf lets go of the crown over the river, flutters down onto
// the water, and is carried away downstream on the river of the water of
// life — south, past the saints on both banks, toward the head of the ladder,
// where the river comes to its end in the glass and the leaf goes down with
// it. A visitor coming up the ladder sees them floating toward him.
//
// One draw call: one small leaf, instanced. Where each leaf is is a pure
// function of heaven's clock and its own seeded place in the round, so
// nothing is stored from frame to frame and nothing can drift.

import * as THREE from 'three';
import { mulberry32, smoothstep, clamp } from '../util.js';
import { RIVER, TREE } from './layout.js';

const COUNT = 42;
const ROUND = 66;              // seconds for one leaf's whole round, fall and float
const FALL = 5.5;              // seconds of it falling from the crown to the water
const FROM_Y = 7.4;            // where under the crown it lets go
const END_Z = RIVER.from + 3;  // where the river ends in the glass (south)
const SINK = 3.5;              // metres before that end over which it goes down
const LANE = RIVER.halfWidth * 0.62;
const NEAR = 1.6;              // this near a floating leaf, its word is given

const GREENS = [0x7FC36A, 0x9BD46E, 0x67B97C, 0xB5DC72, 0xE2D46C, 0x8CCB8A].map(c => new THREE.Color(c));

function leafGeometry() {
  // A leaf lying flat, its tip toward +z, folded a little along the midrib.
  const L = 0.44, W = 0.21;
  const B = [0, 0.018, -L / 2], T = [0, 0.018, L / 2];
  const l1 = [-W / 2, 0, -L * 0.12], l2 = [-W * 0.36, 0, L * 0.22];
  const r1 = [W / 2, 0, -L * 0.12], r2 = [W * 0.36, 0, L * 0.22];
  const tris = [B, l1, l2, B, l2, T, B, T, r2, B, r2, r1];
  const pos = new Float32Array(tris.flat());
  const col = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => {
    const rib = v[0] === 0 ? 1 : 0.78;      // the midrib paler than the edges
    col[i * 3] = rib; col[i * 3 + 1] = rib; col[i * 3 + 2] = rib;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function createLeaves(scene) {
  const rng = mulberry32(20260858);
  const mesh = new THREE.InstancedMesh(
    leafGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    COUNT,
  );
  mesh.frustumCulled = false;   // the leaves are spread far past the one leaf's bounds
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const leaves = [];
  for (let i = 0; i < COUNT; i++) {
    leaves.push({
      at: (i + rng() * 0.7) / COUNT,         // where in the round it starts
      lane: (rng() * 2 - 1) * LANE,          // its line down the river
      fromX: (rng() * 2 - 1) * 1.1,          // where under the crown it lets go
      fromZ: TREE.z + (rng() - 0.5) * 3.2,
      yaw: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 0.5,
      flutter: 1.7 + rng() * 1.2,
      size: 0.85 + rng() * 0.4,
      x: 0, z: 0, floating: false,
    });
    mesh.setColorAt(i, GREENS[Math.floor(rng() * GREENS.length)]);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const floatSpan = TREE.z - END_Z;

  function update(time) {
    for (let i = 0; i < COUNT; i++) {
      const f = leaves[i];
      const t = ((time / ROUND + f.at) % 1) * ROUND;
      let x, y, z, tilt = 0, roll = 0, k = f.size;
      // How it rides the water: drifting across its lane, bobbing, rocking.
      const wx = f.lane + Math.sin(time * 0.37 + f.at * 40) * 0.18;
      const wy = 0.045 + Math.sin(time * 1.3 + f.at * 21) * 0.008;
      const wt = Math.sin(time * 1.1 + f.at * 9) * 0.05;
      if (t < FALL) {
        // Fluttering down from the crown, swinging from side to side, and
        // coming down onto the water just where it then rides it.
        const u = t / FALL;
        const swing = Math.sin(t * f.flutter);
        x = f.fromX + (wx - f.fromX) * u + swing * 0.45 * (1 - u);
        y = wy + (FROM_Y - wy) * (1 - u * u * (3 - 2 * u));
        z = f.fromZ + (TREE.z - 0.6 - f.fromZ) * u;
        roll = swing * 0.7 * (1 - u);
        tilt = wt * u + Math.cos(t * f.flutter) * 0.35 * (1 - u);
        k *= smoothstep(0, 0.6, t);   // it comes out of the crown, not out of nothing
        f.floating = false;
      } else {
        // Carried downstream, turning slowly and riding the ripples.
        const u = (t - FALL) / (ROUND - FALL);
        z = TREE.z - 0.6 - u * floatSpan;
        x = wx;
        y = wy;
        tilt = wt;
        // Going down with the river where it ends in the glass.
        k *= clamp((z - END_Z) / SINK, 0, 1);
        f.floating = k > 0.05;
      }
      f.x = x; f.z = z;
      _e.set(tilt, f.yaw + time * f.spin, roll);
      _q.setFromEuler(_e);
      _p.set(x, y, z);
      _s.setScalar(Math.max(k, 0.0001));
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // The leaf floating nearest the walker, if one is within reach — for its
  // word on the line under the screen.
  function near(walker) {
    if (!walker) return false;
    for (const f of leaves) {
      if (f.floating && Math.hypot(walker.x - f.x, walker.z - f.z) < NEAR) return true;
    }
    return false;
  }

  function floating() {
    let n = 0;
    for (const f of leaves) if (f.floating) n++;
    return n;
  }

  return { update, near, floating, count: COUNT };
}
