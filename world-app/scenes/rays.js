// "By what way is the light parted, which scattereth the east wind upon the
// earth?" (Job 38:24). Twice a day the sun comes at the garden almost
// level, and the canopies part the light instead of simply stopping it:
// where a crown breaks the low beam, a shaft of it comes through and lies
// out across the grass, long and slanting and full of the day's dust.
//
// This is scenes/shadows.js's other half, and it reads exactly the same two
// numbers off the sky — where the sun stands, and how high. Where a shadow
// is what the tree keeps, a shaft is what it lets past; so the two are
// strongest at opposite hours, the shadows through the broad of the day and
// the shafts only while the sun is low enough to reach in under the leaves.
//
// One instanced mesh for every shaft in the garden — a single draw call
// while they are lit, and nothing at all the rest of the day.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { mulberry32, clamp, smoothstep } from '../util.js';

const SHAFTS = 16;        // of the garden's trees let a beam through
const MAX_LEN = 17;       // how far one carries before the air has eaten it
const BASE_OPACITY = 0.22;   // it fades to nothing by the mouth, so it starts stronger

const Z_AXIS = new THREE.Vector3(0, 0, 1);

// How much light is presently being parted, 0 to 1, from the sun's own
// height. Only while it is low: too far down and there is no light left to
// part, too far up and the beam comes in over the canopies instead of
// through them. Pure, so a test can ask the same question the shafts are
// answering.
export function partedAt(sunElev, rain = 0) {
  return smoothstep(0.015, 0.11, sunElev)
       * (1 - smoothstep(0.24, 0.44, sunElev))
       * (1 - 0.9 * clamp(rain, 0, 1));
}

export function createRays(scene, treeSpots) {
  // Own seeded stream: choosing which crowns let a beam through shifts
  // nothing already planted.
  const rng = mulberry32(20260827);

  // The two sacred trees stand far above the rest and part the most light of
  // any of them, so they always carry a shaft; the others are drawn for.
  const casters = [];
  for (const p of [TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS]) {
    casters.push({ x: p.x, z: p.z, groundY: heightAt(p.x, p.z), r: 1.8, h: 5.6 });
  }
  const order = treeSpots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const drawn = Math.min(SHAFTS - casters.length, order.length);
  for (let i = 0; i < drawn; i++) {
    const s = treeSpots[order[i]];
    const scale = 0.85 + rng() * 0.65;
    casters.push({
      x: s.x, z: s.z,
      groundY: heightAt(s.x, s.z),
      r: 0.7 * scale,
      h: 2.6 * scale,
    });
  }

  // A shaft: an open cone with its apex at the crown and its mouth on the
  // grass — open-ended so there is no disc to give it away as a solid, and
  // double-sided so it holds together looked at from any quarter.
  const geo = new THREE.ConeGeometry(1, 1, 7, 1, true)
    .translate(0, -0.5, 0)
    .rotateX(-Math.PI / 2);   // apex at the origin, mouth out along +z

  // A beam has to end in nothing, or it reads as a pale plank laid on the
  // grass. There is no shader here to fade it with, but the blending is
  // additive — and additive black is invisible — so the falloff is painted
  // straight into the geometry: full light at the apex, dark by the mouth.
  {
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const f = 1 - clamp(pos.getZ(i), 0, 1);   // 1 at the crown, 0 at the grass
      const v = f * f;
      col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  const mat = new THREE.MeshBasicMaterial({
    color: 0xFFF0C8,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const pool = new THREE.InstancedMesh(geo, mat, casters.length);
  pool.frustumCulled = false;   // instances reach far past the base bounds
  pool.renderOrder = 2;         // the light lies over what it falls on
  scene.add(pool);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let lit = 0;
  let reach = 0;

  // `sunElev` is the sun's height as a unit vector's y, `sunAz` its compass
  // bearing — the same pair scenes/shadows.js reads, and for the same reason.
  function update(dt, sunElev = 0, sunAz = 0, rain = 0) {
    lit = partedAt(sunElev, rain);
    mat.opacity = BASE_OPACITY * lit;
    pool.visible = lit > 0.01;
    if (!pool.visible) return;

    // The way the light itself is travelling: away from the sun, and down.
    const horiz = Math.sqrt(Math.max(0, 1 - sunElev * sunElev));
    dir.set(-Math.sin(sunAz) * horiz, -sunElev, -Math.cos(sunAz) * horiz).normalize();
    q.setFromUnitVectors(Z_AXIS, dir);
    reach = 1 / Math.max(sunElev, 0.001);

    for (let i = 0; i < casters.length; i++) {
      const c = casters[i];
      // How far the beam runs from the crown before it meets the ground.
      const len = clamp(c.h * reach, 0, MAX_LEN);
      p.set(c.x, c.groundY + c.h, c.z);
      s.set(c.r, c.r, len);
      m.compose(p, q, s);
      pool.setMatrixAt(i, m);
    }
    pool.instanceMatrix.needsUpdate = true;
  }

  return {
    update,
    count: casters.length,
    state: () => ({ count: casters.length, lit, reach }),
  };
}
