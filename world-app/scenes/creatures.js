// The garden's creatures: birds wheeling over the trees, a lamb grazing the
// meadow, and a small school of fish swimming the river's wadable stretch.
// A fuller bestiary (doves, cattle, perching birds) is noted in the manifest.

import * as THREE from 'three';
import { heightAt, riverZ, riverEdgeDist } from './terrain.js';
import { clamp, shortestAngle } from '../util.js';

function makeBird(tone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: tone, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), mat);
  body.rotation.x = Math.PI / 2;   // nose forward along +z
  g.add(body);
  const wingGeo = new THREE.BoxGeometry(0.55, 0.02, 0.18);
  const wingL = new THREE.Mesh(wingGeo, mat);
  wingL.position.x = -0.3;
  const wingR = new THREE.Mesh(wingGeo, mat);
  wingR.position.x = 0.3;
  g.add(wingL, wingR);
  return { group: g, wingL, wingR };
}

function makeLamb() {
  const g = new THREE.Group();
  const wool = new THREE.MeshLambertMaterial({ color: 0xEEE6D2, flatShading: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 3, 7), wool);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.42;
  g.add(body);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.55, 0.34);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), wool);
  head.position.set(0, 0, 0.12);
  headPivot.add(head);
  const earGeo = new THREE.ConeGeometry(0.045, 0.14, 4);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, wool);
    ear.position.set(sx * 0.12, 0.06, 0.1);
    ear.rotation.z = sx * 1.25;
    headPivot.add(ear);
  }
  g.add(headPivot);

  const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.34, 5);
  const legs = [];
  for (const [lx, lz] of [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.2], [0.12, -0.2]]) {
    const leg = new THREE.Mesh(legGeo, wool);
    leg.position.set(lx, 0.17, lz);
    g.add(leg);
    legs.push(leg);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 14),
    new THREE.MeshBasicMaterial({ color: 0x1c2814, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);

  return { group: g, headPivot, legs };
}

// A lamb wander target on open meadow south of the river.
function lambSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const x = (rng() * 2 - 1) * 24;
    const z = -2 - rng() * 20;
    if (riverEdgeDist(x, z) > 3.9 && Math.hypot(x, z) > 7) return { x, z };
  }
  return { x: -10, z: -14 };
}

// A fish: a low-poly body nosing forward along +z, with a tail fin that
// sculls. Small enough that two cones read as life through the water.
function makeFish(tone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: tone, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.34, 4), mat);
  body.rotation.x = Math.PI / 2;   // nose forward along +z
  body.position.z = 0.05;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3), mat);
  tail.rotation.x = Math.PI / 2;   // apex tucks into the body's rear
  tail.position.z = -0.18;
  g.add(tail);
  return { group: g, tail };
}

export function createCreatures(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);

  // ── Birds ─────────────────────────────────────────────────
  const birds = [];
  const tones = [0xF5F0E4, 0xD9C9AC, 0xFFFFFF];
  for (let i = 0; i < 3; i++) {
    const bird = makeBird(tones[i]);
    const orbit = {
      cx: -8 + i * 9,
      cz: -4 + (i % 2) * 10,
      radius: 13 + i * 5,
      height: 9 + i * 2.6,
      speed: (0.14 + i * 0.035) * (i % 2 ? -1 : 1),
      theta: rng() * Math.PI * 2,
      flap: rng() * Math.PI * 2,
    };
    group.add(bird.group);
    birds.push({ ...bird, orbit });
  }

  // ── The lamb ──────────────────────────────────────────────
  const lamb = makeLamb();
  const start = lambSpot(rng);
  lamb.group.position.set(start.x, heightAt(start.x, start.z), start.z);
  group.add(lamb.group);
  const lambState = { mode: 'graze', until: 2 + rng() * 3, target: null, phase: 0 };

  // ── Fish ──────────────────────────────────────────────────
  // Five fish — one gold — in the wadable stretch west of the parting. Each
  // swims a slow elongated loop that follows the river's meander, staying
  // well inside the channel (offsets ≤ ±1.3 against a 2.6 half-width), and
  // rises now and then so its back just breaks the rippling surface.
  const fishTones = [0x8FA8B8, 0x7C97A8, 0xA9BDC4, 0xD9B36A, 0x93A9A0];
  const fish = [];
  for (let i = 0; i < 5; i++) {
    const f = makeFish(fishTones[i]);
    const loop = {
      cx: -34 + i * 11 + rng() * 4,               // anchors spread along the stretch
      lx: 3.5 + rng() * 2.5,                      // half-length of the loop
      lz: 0.8 + rng() * 0.5,                      // half-width, inside the channel
      speed: (0.35 + rng() * 0.25) * (i % 2 ? -1 : 1),
      theta: rng() * Math.PI * 2,
      wig: rng() * Math.PI * 2,
      bob: rng() * Math.PI * 2,
    };
    const x0 = loop.cx + Math.cos(loop.theta) * loop.lx;
    f.group.position.set(x0, -0.8, riverZ(x0) + Math.sin(loop.theta) * loop.lz);
    group.add(f.group);
    fish.push({ ...f, loop });
  }

  let t = 0;
  function update(dt) {
    t += dt;

    for (const b of birds) {
      const o = b.orbit;
      o.theta += o.speed * dt;
      const x = o.cx + Math.cos(o.theta) * o.radius;
      const z = o.cz + Math.sin(o.theta) * o.radius;
      const y = o.height + Math.sin(o.theta * 2.3) * 0.8;
      b.group.position.set(x, y, z);
      // Face along the direction of travel (the orbit's tangent).
      const dir = Math.sign(o.speed);
      b.group.rotation.y = Math.atan2(-Math.sin(o.theta) * dir, Math.cos(o.theta) * dir);
      o.flap += dt * 9;
      const flap = Math.sin(o.flap) * 0.55 + 0.15;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }

    for (const f of fish) {
      const o = f.loop;
      o.theta += o.speed * dt;
      const nx = o.cx + Math.cos(o.theta) * o.lx;
      const nz = riverZ(nx) + Math.sin(o.theta) * o.lz;
      const p = f.group.position;

      // Face the way it moves — the frame-to-frame delta already folds the
      // meander in, so no derivative of the centreline is needed.
      const dx = nx - p.x, dz = nz - p.z;
      if (Math.hypot(dx, dz) > 1e-5) {
        const targetYaw = Math.atan2(dx, dz);
        f.group.rotation.y += shortestAngle(f.group.rotation.y, targetYaw) * clamp(dt * 6, 0, 1);
      }

      // Glide below the surface (-0.5), dipping toward the bed (-1.3) and
      // rising so the back just crests; never into the ground.
      const y = -0.78 + Math.sin(o.theta * 3 + o.bob) * 0.22;
      p.set(nx, Math.max(y, heightAt(nx, nz) + 0.12), nz);

      o.wig += dt * (6 + Math.abs(o.speed) * 4);
      f.tail.rotation.y = Math.sin(o.wig) * 0.6;
    }

    // Lamb: graze a while, wander to a new patch, graze again.
    const L = lambState;
    L.until -= dt;
    if (L.mode === 'graze') {
      lamb.headPivot.rotation.x = Math.min(0.95, lamb.headPivot.rotation.x + dt * 1.6);
      if (L.until <= 0) {
        L.mode = 'walk';
        L.target = lambSpot(rng);
        L.until = 30;   // generous cap; arrival ends the walk
      }
    } else {
      lamb.headPivot.rotation.x = Math.max(0, lamb.headPivot.rotation.x - dt * 2.2);
      const p = lamb.group.position;
      const dx = L.target.x - p.x, dz = L.target.z - p.z;
      const dist = Math.hypot(dx, dz);
      const targetYaw = Math.atan2(dx, dz);
      lamb.group.rotation.y += shortestAngle(lamb.group.rotation.y, targetYaw) * clamp(dt * 4, 0, 1);
      const step = 0.72 * dt;
      p.x += Math.sin(lamb.group.rotation.y) * step;
      p.z += Math.cos(lamb.group.rotation.y) * step;
      p.y = heightAt(p.x, p.z);
      L.phase += dt * 7;
      for (let i = 0; i < 4; i++) {
        lamb.legs[i].rotation.x = Math.sin(L.phase + (i % 2) * Math.PI) * 0.45;
      }
      if (dist < 0.5 || L.until <= 0) {
        L.mode = 'graze';
        L.until = 2.5 + rng() * 4;
        for (const leg of lamb.legs) leg.rotation.x = 0;
      }
    }
  }

  return { update };
}
