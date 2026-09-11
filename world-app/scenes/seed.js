// "And God said, Let the earth bring forth grass, the herb yielding seed
// after his kind... and God saw that it was good" (Genesis 1:11-12). Twice in
// two verses the herb is named by the one thing it does, which is carry seed;
// and the whole point of the seed is that it goes somewhere.
//
// So the meadow stands full of seed heads gone to down, and they wait. They
// are not loosed by the hour of the day or by the evening gust — the wind
// already has the leaves and the grain and the camphire. These are loosed by
// the walker: brush past a head and the down comes off it and goes up, and
// what carries it from there is whatever wind there happens to be. Walk the
// same meadow twice and it lets go twice, because it is always seeding.
//
// Two draw calls: the standing heads in one instanced mesh, baked once and
// never touched again (scenes/wildflowers.js's idiom), and every mote of down
// in the garden sharing a second, recycled the way the walker's own wake is
// (scenes/wake.js).

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { gustAt } from './wind.js';
import { mulberry32, clamp, smoothstep } from '../util.js';

const HEADS = 42;
const MOTES = 30;         // recycled pool — plenty for one walker's passage
const BRUSH = 0.95;       // how near a head must be brushed to let go
const REGROW = 7;         // before that same head has down to give again
const LOOSED = 3;         // motes off one head
const LIFE = 5.5;         // how long a mote is in the air
const RISE = 0.5;         // and how fast it lifts while it is

const STALK = new THREE.Color(0xA9A06B);
const DOWN = new THREE.Color(0xF2EEDC);

export function createSeed(scene) {
  // Own seeded stream: a scatter through the meadow shifts nothing already
  // planted.
  const rng = mulberry32(20260832);

  const heads = [];
  let guard = 0;
  while (heads.length < HEADS && guard++ < HEADS * 40) {
    const a = rng() * Math.PI * 2;
    const r = 11 + rng() * 23;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) < 2.2) continue;
    heads.push({
      x, z,
      y: heightAt(x, z),
      scale: 0.8 + rng() * 0.5,
      yaw: rng() * Math.PI * 2,
      ripe: 0,           // counts down after it is brushed
    });
  }

  // ── The standing heads ────────────────────────────────────
  const stalks = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.075, 0.62, 5).translate(0, 0.31, 0),
    new THREE.MeshLambertMaterial({ color: STALK, flatShading: true }),
    heads.length,
  );
  stalks.frustumCulled = false;
  scene.add(stalks);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i];
      p.set(h.x, h.y, h.z);
      e.set(0, h.yaw, 0);
      s.set(h.scale, h.scale, h.scale);
      stalks.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    }
    stalks.instanceMatrix.needsUpdate = true;
  }

  // ── The down, once it is off ──────────────────────────────
  const motes = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.055, 0),
    new THREE.MeshBasicMaterial({
      color: DOWN, transparent: true, opacity: 0.85, depthWrite: false,
    }),
    MOTES,
  );
  motes.frustumCulled = false;
  scene.add(motes);

  const adrift = [];
  for (let i = 0; i < MOTES; i++) {
    adrift.push({ age: LIFE, x: 0, y: 0, z: 0, drift: 0, spin: rng() * Math.PI * 2 });
  }
  let next = 0;

  function loose(h) {
    for (let i = 0; i < LOOSED; i++) {
      const mote = adrift[next];
      next = (next + 1) % MOTES;
      mote.age = 0;
      // Off the head itself, not off the walker — a little spread either way.
      mote.x = h.x + (rng() - 0.5) * 0.3;
      mote.y = h.y + 0.5 + rng() * 0.25;
      mote.z = h.z + (rng() - 0.5) * 0.3;
      mote.drift = (rng() - 0.5) * 0.35;
      mote.spin = rng() * Math.PI * 2;
    }
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  let t = 0;
  let flying = 0;

  function update(dt, walker = null, cycleT = 0.075, sabbath = false) {
    t += dt;

    if (walker) {
      for (const h of heads) {
        if (h.ripe > 0) { h.ripe -= dt; continue; }
        if (Math.hypot(h.x - walker.x, h.z - walker.z) > BRUSH) continue;
        loose(h);
        h.ripe = REGROW;
      }
    }

    flying = 0;
    for (let i = 0; i < MOTES; i++) {
      const mote = adrift[i];
      if (mote.age >= LIFE) {
        // Spent motes scale away rather than being hidden one by one.
        s.set(0, 0, 0);
        p.set(mote.x, mote.y, mote.z);
        motes.setMatrixAt(i, m.compose(p, q, s));
        continue;
      }
      mote.age += dt;
      flying++;
      // Whatever wind there is carries it east; otherwise it only wanders.
      const gust = gustAt(cycleT, mote.x, sabbath);
      mote.x += (0.16 + gust * 2.6) * dt;
      mote.z += (mote.drift + Math.sin(t * 0.7 + mote.spin) * 0.12) * dt;
      mote.y += RISE * (1 - clamp(mote.age / LIFE, 0, 1)) * dt;
      const fade = 1 - smoothstep(0.65, 1, mote.age / LIFE);
      const size = 0.55 + 0.45 * fade;
      p.set(mote.x, mote.y, mote.z);
      e.set(t * 0.9 + mote.spin, t * 0.6 + mote.spin, 0);
      s.set(size, size, size);
      motes.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    }
    motes.instanceMatrix.needsUpdate = true;
  }
  update(0);

  return {
    update,
    state: () => ({ heads: heads.length, adrift: flying }),
  };
}
