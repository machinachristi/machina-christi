// "Let the waters bring forth abundantly the moving creature that hath
// life" (Genesis 1:20).
//
// The river has always had its few great fish turning their slow loops. Now
// the shallows of the slow western reach also swarm with the small: a few
// shoals of fry, each a little cloud of pale slips of life just under the
// surface, wheeling together round a centre that itself wanders slowly up
// and down the reach. Wade in among one and it scatters — every fish
// darting out at once — then, as he stands still or goes on, it draws
// together again where it was. Nothing is caught and nothing is afraid for
// long.
//
// One draw call: every fish of every shoal is an instance of one tiny
// merged body. The layout is drawn once from its own seeded stream; the
// update reads only the clock and where the walker stands.

import * as THREE from 'three';
import { riverZ, riverEdgeDist, heightAt } from './terrain.js';
import { mergeColored, mulberry32, damp, clamp } from '../util.js';

const SHOALS = 3;
const PER_SHOAL = 13;
const FROM_X = -38, TO_X = -12;  // the slow reach (flags.js's), clear of the great fish's own loops further east
const DEPTH = -0.6;              // just under the surface (-0.5)
const WANDER = 3.2;              // how far a shoal's centre roams along the reach
const STARTLE = 2.6;             // a walker in the water this near scatters it
const KEEP_IN = 2.25;            // never further than this from the centreline (edge at 2.6)

const BODY = new THREE.Color(0xCFDAD6);
const BACK = new THREE.Color(0x7E9690);

function fishGeometry() {
  return mergeColored([
    { geo: new THREE.ConeGeometry(0.03, 0.14, 4).toNonIndexed().rotateX(Math.PI / 2), color: BODY },
    { geo: new THREE.ConeGeometry(0.03, 0.05, 3).toNonIndexed().scale(0.3, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.085), color: BACK },
  ]);
}

export function createFry(scene) {
  // Own seeded stream: nothing already planted shifts.
  const rng = mulberry32(20260849);

  const shoals = [];
  for (let s = 0; s < SHOALS; s++) {
    const home = FROM_X + ((s + 0.2 + rng() * 0.6) / SHOALS) * (TO_X - FROM_X);
    const fish = [];
    for (let i = 0; i < PER_SHOAL; i++) {
      fish.push({
        r: 0.15 + rng() * 0.5,
        a: rng() * Math.PI * 2,
        w: (0.9 + rng() * 0.8) * (rng() < 0.15 ? -1 : 1),   // a few go against the wheel
        bob: rng() * Math.PI * 2,
        flee: rng() * Math.PI * 2,                          // the way it darts when startled
      });
    }
    shoals.push({
      home, side: (rng() - 0.5) * 2.2, t: rng() * 100, rate: 0.05 + rng() * 0.04,
      fish, scatter: 0, x: home, z: riverZ(home), y: DEPTH,
    });
  }

  const mesh = new THREE.InstancedMesh(
    fishGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x24302E }),
    SHOALS * PER_SHOAL,
  );
  mesh.frustumCulled = false;
  scene.add(mesh);

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _up = new THREE.Vector3(0, 1, 0);
  let clock = 0;
  let scattered = 0;

  function update(dt, walker) {
    clock += dt;
    // In the water himself (wake.js's own test), not merely on the bank.
    const wading = walker && walker.y < -0.6 && riverEdgeDist(walker.x, walker.z) < 0.01;
    let k = 0;
    scattered = 0;
    for (const S of shoals) {
      S.t += dt * S.rate;
      S.x = S.home + Math.sin(S.t * Math.PI * 2) * WANDER;
      S.z = riverZ(S.x) + S.side * (0.8 + 0.2 * Math.sin(S.t * 5.3));
      const near = wading && Math.hypot(walker.x - S.x, walker.z - S.z) < STARTLE;
      // Out at once; back together slowly.
      S.scatter = damp(S.scatter, near ? 1 : 0, near ? 7 : 0.5, dt);
      if (S.scatter > 0.5) scattered++;
      const spread = 1 + 2.4 * S.scatter;
      const zc = riverZ(S.x);
      for (const f of S.fish) {
        f.a += f.w * dt * (1 + 2.5 * S.scatter);
        const dx = Math.cos(f.a) * f.r * spread + Math.cos(f.flee) * 1.4 * S.scatter;
        const dz = Math.sin(f.a) * f.r * spread * 0.7 + Math.sin(f.flee) * 1.4 * S.scatter;
        const x = S.x + dx;
        const z = clamp(S.z + dz, zc - KEEP_IN, zc + KEEP_IN);
        // Never under the bed — bank shelves rise toward the edge.
        const y = Math.max(DEPTH + Math.sin(clock * 3 + f.bob) * 0.03, heightAt(x, z) + 0.05);
        _p.set(x, y, z);
        // Nose along its wheel: the tangent of its own little orbit.
        _q.setFromAxisAngle(_up, Math.atan2(-Math.sin(f.a) * Math.sign(f.w), Math.cos(f.a) * Math.sign(f.w)));
        mesh.setMatrixAt(k++, _m.compose(_p, _q, _s));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, null);

  return {
    update,
    state: () => ({ shoals: SHOALS, fish: SHOALS * PER_SHOAL, scattered, at: shoals.map(S => ({ x: S.x, z: S.z })) }),
  };
}
