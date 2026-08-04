// "My days are like a shadow that declineth" (Psalm 102:11) — the garden's
// own shadow, keeping the hour. Every tree lays a shadow that is a small
// circle under it at noon and draws out long across the meadow toward
// evening, swinging round through the whole day as the sun crosses.
//
// Not shadow maps: those would render the whole garden a second time and the
// establishing shot already draws very nearly everything at once. These are
// projected decals instead — the same trick sky.js already uses for its
// cloud shade, and the same one addShadow() uses to ground a creature — but
// where a creature's blob stays a blob, these stretch and turn with the sun.
// One instanced mesh for every tree in the garden: one draw call.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { mulberry32, clamp, smoothstep } from '../util.js';

const MAX_LEN = 13;        // how far a shadow may reach before the light fails
const BASE_OPACITY = 0.3;

export function createShadows(scene, treeSpots) {
  // Own seeded stream: the crown sizes jittered here shift nothing planted.
  // (vegetation.js scales its canopies 0.85–1.5 off the shared stream; these
  // match that range without reaching into it.)
  const rng = mulberry32(20260738);

  const casters = [];
  for (const s of treeSpots) {
    const scale = 0.85 + rng() * 0.65;
    casters.push({
      x: s.x, z: s.z,
      groundY: heightAt(s.x, s.z),
      r: 1.15 * scale,
      h: 2.4 * scale,
    });
  }
  // The two sacred trees stand far above the rest, and throw accordingly.
  for (const p of [TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS]) {
    casters.push({
      x: p.x, z: p.z,
      groundY: heightAt(p.x, p.z),
      r: 2.6, h: 5.4,
    });
  }

  const mat = new THREE.MeshBasicMaterial({
    color: 0x243318,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const pool = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
    mat,
    casters.length,
  );
  pool.frustumCulled = false;   // instances reach far past the base bounds
  pool.renderOrder = -1;        // under the grass dressing, never over it
  scene.add(pool);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  let cast = 0;
  let reach = 0;     // how far a tree of unit height presently throws
  let bearing = 0;   // which way it falls, radians

  // `sunElev` is the sun's height as a unit vector's y; `sunAz` its compass
  // bearing (both from sky.js). Together they say where the light comes from,
  // which is the whole of what a shadow needs to know.
  function update(dt, sunElev = 0, sunAz = 0, rain = 0) {
    // Fade out as the sun nears the horizon — by then the light is too flat
    // and too dim for any one shadow to be read — and under heavy cloud.
    cast = smoothstep(0.03, 0.2, sunElev) * (1 - 0.75 * rain);
    mat.opacity = BASE_OPACITY * cast;
    pool.visible = cast > 0.01;
    if (!pool.visible) return;

    // How far a shadow runs per unit of height: cot(elevation).
    const horiz = Math.sqrt(Math.max(0, 1 - sunElev * sunElev));
    const elong = horiz / Math.max(sunElev, 0.001);
    reach = elong;
    bearing = sunAz + Math.PI;
    // Away from the sun, along the ground.
    const dirX = -Math.sin(sunAz), dirZ = -Math.cos(sunAz);
    // The geometry's own +z lies along the shadow; spin it to that bearing.
    q.setFromAxisAngle(Y_AXIS, sunAz + Math.PI);

    for (let i = 0; i < casters.length; i++) {
      const c = casters[i];
      const len = clamp(c.h * elong, 0, MAX_LEN);
      // Anchored at the trunk and stretching away from it, rather than
      // sliding off across the grass as a detached blob.
      p.set(c.x + dirX * len * 0.5, c.groundY + 0.05, c.z + dirZ * len * 0.5);
      s.set(c.r, 1, c.r + len * 0.5);
      m.compose(p, q, s);
      pool.setMatrixAt(i, m);
    }
    pool.instanceMatrix.needsUpdate = true;
  }

  return {
    update,
    count: casters.length,
    state: () => ({ count: casters.length, cast, reach, bearing }),
  };
}
