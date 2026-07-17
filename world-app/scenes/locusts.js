// "The locusts have no king, yet go forth all of them by bands" (Proverbs
// 30:27) — small swarms drift the open meadow on their own restless paths.
// No single leader drives them: each band ambles its own way, gently reined
// home so none ever strays as far as the river.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';

const BAND_COUNT = 4;
const PER_BAND = 10;
const BAND_ROAM = 5.5;     // how far a band's own centre wanders from its home
const CLEARANCE = 7;       // rejection-sample margin, home + roam never nears the river

function bandHome(rng) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 10 + rng() * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > CLEARANCE + BAND_ROAM) return { x, z };
  }
  return { x: -16, z: -30 };
}

export function createLocusts(scene) {
  // Own seeded stream: a meadow scatter shifts nothing already planted.
  const rng = mulberry32(20260726);

  const geo = new THREE.ConeGeometry(0.028, 0.09, 3);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0x8C9B4E, flatShading: true }),
    BAND_COUNT * PER_BAND,
  );
  mesh.frustumCulled = false;   // spread across the whole meadow, always drifting
  scene.add(mesh);

  const bands = [];
  const locusts = [];
  for (let b = 0; b < BAND_COUNT; b++) {
    const home = bandHome(rng);
    const band = {
      home, x: home.x, z: home.z,
      angle: rng() * Math.PI * 2,
      turnRate: (0.08 + rng() * 0.1) * (rng() < 0.5 ? -1 : 1),
      speed: 0.6 + rng() * 0.5,
    };
    bands.push(band);
    for (let i = 0; i < PER_BAND; i++) {
      locusts.push({
        band, idx: b * PER_BAND + i,
        r: 0.4 + rng() * 1.8,
        theta: rng() * Math.PI * 2,
        rate: (1.2 + rng() * 1.6) * (rng() < 0.5 ? -1 : 1),
        bob: rng() * Math.PI * 2,
        wing: rng() * Math.PI * 2,
      });
    }
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  let t = 0;

  function update(dt) {
    t += dt;
    for (const band of bands) {
      // No king over any of them: each band ambles its own drifting path,
      // gently reined home so none ever wanders as far as the river.
      band.angle += band.turnRate * dt;
      band.x += Math.cos(band.angle) * band.speed * dt;
      band.z += Math.sin(band.angle) * band.speed * dt;
      const dx = band.home.x - band.x, dz = band.home.z - band.z;
      const dHome = Math.hypot(dx, dz);
      if (dHome > BAND_ROAM) {
        band.x += (dx / dHome) * (dHome - BAND_ROAM);
        band.z += (dz / dHome) * (dHome - BAND_ROAM);
        band.angle = Math.atan2(dz, dx);
      }
    }
    for (const L of locusts) {
      L.theta += L.rate * dt;
      L.wing += dt * 22;
      const x = L.band.x + Math.cos(L.theta) * L.r;
      const z = L.band.z + Math.sin(L.theta) * L.r * 0.6;
      const y = Math.max(heightAt(x, z), -0.45) + 0.35
        + Math.sin(L.wing) * 0.12 + Math.sin(t * 0.7 + L.bob) * 0.08;
      p.set(x, y, z);
      q.setFromEuler(new THREE.Euler(0, L.theta, Math.sin(L.wing) * 0.3));
      m.compose(p, q, s);
      mesh.setMatrixAt(L.idx, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { update, state: () => ({ bands: BAND_COUNT, count: locusts.length }) };
}
