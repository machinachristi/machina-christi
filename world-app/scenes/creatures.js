// The garden's first creatures: birds wheeling over the trees and a lamb
// grazing the meadow — just enough life for Eden to feel inhabited. A fuller
// bestiary (fish in the river, doves, cattle) is noted in the manifest.

import * as THREE from 'three';
import { heightAt, riverZ } from './terrain.js';
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
    if (Math.abs(z - riverZ(x)) > 6.5 && Math.hypot(x, z) > 7) return { x, z };
  }
  return { x: -10, z: -14 };
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
