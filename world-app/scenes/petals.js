// Blossom on the wind (v9): petals loosed from the planted trees, drifting
// downwind and settling into the grass. The garden blooms hardest at the
// golden hours — the low morning light and the hour before sunset — when
// nearly every petal that lands is answered by another let go; at plain noon
// and by night the fall thins to a stray petal here and there. Their own
// seeded stream, so the blossom drifts the same for every visitor.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mulberry32, smoothstep } from '../util.js';

const COUNT = 36;
const TONES = [0xF2D7E0, 0xF7F3E6, 0xE8C9A8, 0xD98A9B, 0xF2E6B8];

// How golden the hour is, from the sky's clock t in [0,1): full in the low
// morning light (just after the mist) and through the hour before sunset.
export function goldenOf(t) {
  const evening = smoothstep(0.46, 0.55, t) * (1 - smoothstep(0.61, 0.67, t));
  const morning = t < 0.5
    ? 1 - smoothstep(0.05, 0.14, t)
    : smoothstep(0.955, 0.99, t);
  return Math.max(evening, morning);
}

export function createPetals(scene, treeSpots) {
  const rng = mulberry32(20260710);

  const mesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.055),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    COUNT,
  );
  mesh.frustumCulled = false;   // petals drift wherever their trees stand
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    c.setHex(TONES[Math.floor(rng() * TONES.length)]);
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const petals = [];
  function loose(pt) {
    const spot = treeSpots[Math.floor(rng() * treeSpots.length)];
    pt.x = spot.x + (rng() - 0.5) * 1.8;
    pt.z = spot.z + (rng() - 0.5) * 1.8;
    pt.y = heightAt(spot.x, spot.z) + 2.0 + rng() * 1.3;
    pt.vy = 0.2 + rng() * 0.16;
    pt.drift = 0.35 + rng() * 0.45;      // the wind bears them gently east
    pt.sway = rng() * Math.PI * 2;
    pt.spin = rng() * Math.PI * 2;
    pt.spinRate = 1.2 + rng() * 2.2;
    pt.dormant = 0;
  }
  for (let i = 0; i < COUNT; i++) {
    const pt = {};
    loose(pt);
    pt.y = heightAt(pt.x, pt.z) + 0.2 + rng() * 2.8;   // first fall: mid-air
    if (rng() < 0.4) pt.dormant = rng() * 4;           // and not all at once
    petals.push(pt);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  let t = 0;
  let golden = 0;
  function update(dt, cycleT = 0.1) {
    t += dt;
    golden = goldenOf(cycleT);
    for (let i = 0; i < COUNT; i++) {
      const pt = petals[i];
      if (pt.dormant > 0) {
        pt.dormant -= dt;
        if (pt.dormant <= 0) loose(pt);
        s.setScalar(0);
        m.compose(p.set(pt.x, pt.y, pt.z), q, s);
        mesh.setMatrixAt(i, m);
        continue;
      }
      pt.y -= pt.vy * dt;
      pt.x += pt.drift * dt;
      const ground = heightAt(pt.x, pt.z) + 0.03;
      if (pt.y <= ground) {
        // At the golden hours nearly every landing petal is answered by
        // another let go; otherwise the tree keeps its blossom a while.
        if (rng() < 0.25 + 0.75 * golden) loose(pt);
        else pt.dormant = 2 + rng() * 5;
        continue;
      }
      p.set(
        pt.x + Math.sin(t * 0.9 + pt.sway) * 0.25,
        pt.y,
        pt.z + Math.cos(t * 0.7 + pt.sway) * 0.2,
      );
      e.set(t * pt.spinRate + pt.spin, pt.spin, t * pt.spinRate * 0.6);
      s.setScalar(Math.min(1, (pt.y - ground) / 0.4) * 0.8 + 0.2);
      m.compose(p, q.setFromEuler(e), s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function state() {
    let drifting = 0;
    for (const pt of petals) if (pt.dormant <= 0) drifting++;
    return { drifting, golden };
  }

  update(0);   // seat the petals before the pre-ready warm-up frame
  return { update, state };
}
