// "And when the dew that lay was gone up, behold, upon the face of the
// wilderness there lay a small round thing, as small as the hoar frost on
// the ground" (Exodus 16:14).
//
// Through the first of the morning the dew lies on the meadow (dew.js). As
// it goes up, patches of small white rounds are found lying where it was —
// "like coriander seed, white" (Exodus 16:31) — and "when the sun waxed hot,
// it melted" (16:21): by the turn toward noon it has sunk away into the
// ground. On the seventh day there is none (16:26): the meadow keeps the
// sabbath bare. Come up to a patch while it lies and it is named the way
// the people named it, asking one another what it was (16:15).
//
// One InstancedMesh of tiny rounds over the whole meadow, one shared opacity
// (dew's and puddles' trick) and one shared sink into the ground as it melts —
// so nothing is rewritten per grain, ever. One draw call while it lies; none
// for the rest of the day.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32, damp, smoothstep } from '../util.js';
import { dewOf } from './dew.js';

const PATCHES = 16;
const PER_PATCH = 40;

// How much manna lies, from the sky's clock t in [0,1): none while the dew
// still lies, coming as the dew goes up, gone again before the noon heat.
export function mannaOf(t, sabbath = false) {
  if (sabbath) return 0;
  const tt = ((t % 1) + 1) % 1;
  if (tt > 0.5) return 0;
  const found = 1 - dewOf(tt);                 // the dew "gone up"
  const melted = smoothstep(0.26, 0.33, tt);   // "when the sun waxed hot"
  return found * (1 - melted);
}

export function createManna(scene) {
  // Own seeded stream: a scatter over the meadow shifts nothing already
  // planted.
  const rng = mulberry32(20260842);

  const geo = new THREE.IcosahedronGeometry(0.05, 0);
  geo.scale(1, 0.62, 1);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshLambertMaterial({
      color: 0xF6F1E2, emissive: 0x3A372E, transparent: true, opacity: 0, depthWrite: false,
    }),
    PATCHES * PER_PATCH,
  );
  mesh.frustumCulled = false;   // the instances span the whole meadow
  mesh.visible = false;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const spots = [];
  let placed = 0, guard = 0;
  while (spots.length < PATCHES && guard++ < PATCHES * 40) {
    const a = rng() * Math.PI * 2;
    const r = 5 + Math.sqrt(rng()) * 31;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (riverEdgeDist(cx, cz) < 2.2 || heightAt(cx, cz) < -0.25) continue;
    let here = 0, tries = 0;
    while (here < PER_PATCH && tries++ < PER_PATCH * 4) {
      // Thick at the heart of a patch, thinning out toward its edge.
      const ga = rng() * Math.PI * 2;
      const gr = Math.pow(rng(), 0.7) * 1.5;
      const x = cx + Math.cos(ga) * gr, z = cz + Math.sin(ga) * gr;
      if (riverEdgeDist(x, z) < 1.4) continue;
      e.set(0, rng() * Math.PI, 0);
      p.set(x, heightAt(x, z) + 0.025, z);
      s.setScalar(0.75 + rng() * 0.5);
      m.compose(p, q.setFromEuler(e), s);
      mesh.setMatrixAt(placed++, m);
      here++;
    }
    spots.push({
      pos: new THREE.Vector3(cx, heightAt(cx, cz), cz),
      ground: heightAt(cx, cz),
      name: 'Man', label: 'manna', kind: 'manna',
    });
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;

  let lay = 0;
  let shown = null;   // whether the spots are presently within naming reach

  function update(dt, cycleT = 0.1, sabbath = false) {
    // Damped, so a jump of the clock still settles rather than snapping.
    lay = damp(lay, mannaOf(cycleT, sabbath), 1.6, dt);
    if (lay < 0.004) lay = 0;
    mesh.visible = lay > 0.01;
    if (mesh.visible) {
      mesh.material.opacity = Math.min(1, lay * 1.15);
      mesh.position.y = -0.05 * (1 - lay);   // melting, it sinks into the ground
    }
    // Only manna that is actually lying there can be named: otherwise its
    // spots are held far below the walker, past any naming's vertical reach.
    const present = lay > 0.35;
    if (present !== shown) {
      shown = present;
      for (const sp of spots) sp.pos.y = present ? sp.ground : -1000;
    }
  }
  update(0);

  function state() {
    return { lay, grains: placed, patches: spots.length };
  }

  // The naming list only ever reads `pos`, `name`, `label` and `kind`.
  return { update, spots, state };
}
