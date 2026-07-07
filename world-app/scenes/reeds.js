// Reeds and rushes (the banks grown soft with swaying green). Along the
// river's margins — the shallow, sandy verge between open water and dry
// meadow — stand clumps of tall thin blades that lean and sway together on
// the same slow wind that moves the wider garden. They tie the water to the
// land, and they are the first sign of the river: seen swaying at the bank
// before the water itself comes into view. Their placement rides the very
// same riverCourse() the terrain is carved from, so a reed never stands in
// open water nor out on the dry meadow — always on the living edge.

import * as THREE from 'three';
import { riverCourse, riverEdgeDist, heightAt } from './terrain.js';
import { mulberry32 } from '../util.js';

// The stretch of bank that falls within the seen garden; past this the river
// runs on into the fog and reeds there would only be drawn for no one.
const X_MIN = -44;
const X_MAX = 34;
const CLUMPS = 30;          // clusters of blades along the banks
const PER_CLUMP = 3;        // blades to a clump

export function createReeds(scene) {
  // Own seeded stream, independent of the garden's shared planting rng, so
  // adding the reeds shifts nothing already planted (trees, creatures, motes).
  const rng = mulberry32(20260708);

  // Gather bank points: walk the stretch, and for a scatter of x's drop a
  // clump just off the water on one of the four heads' banks.
  const blades = [];
  let guard = 0;
  while (blades.length < CLUMPS * PER_CLUMP && guard++ < CLUMPS * 40) {
    const x = X_MIN + rng() * (X_MAX - X_MIN);
    const { centers, halfWidth } = riverCourse(x);
    const head = Math.floor(rng() * centers.length);
    const side = rng() < 0.5 ? -1 : 1;
    // Just beyond the water's edge, in the shallow verge (still low ground).
    const off = halfWidth + 0.15 + rng() * 0.7;
    const cz = centers[head] + side * off;
    // Guard against a neighbouring head's channel falling right here.
    if (riverEdgeDist(x, cz) < 0.05) continue;
    for (let k = 0; k < PER_CLUMP; k++) {
      const bx = x + (rng() - 0.5) * 0.5;
      const bz = cz + (rng() - 0.5) * 0.5;
      blades.push({
        x: bx, z: bz,
        y: heightAt(bx, bz),
        h: 0.55 + rng() * 0.7,
        lean: (rng() - 0.5) * 0.14,
        phase: rng() * Math.PI * 2,
        rate: 0.7 + rng() * 0.5,
        yaw: rng() * Math.PI * 2,
      });
    }
  }

  // One thin tapered blade, its base translated to the origin so a per-blade
  // scale grows it upward and a per-blade tilt sways it from the root.
  const geo = new THREE.ConeGeometry(0.055, 1, 4).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshLambertMaterial({ flatShading: true }),
    blades.length,
  );

  const lo = new THREE.Color(0x6E8F4A);
  const hi = new THREE.Color(0x9DB06A);
  const c = new THREE.Color();
  for (let i = 0; i < blades.length; i++) {
    c.copy(lo).lerp(hi, rng());
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  let t = 0;
  function update(dt) {
    t += dt;
    for (let i = 0; i < blades.length; i++) {
      const b = blades[i];
      // The reed leans on the wind: a slow base tilt plus a small quick tremor.
      const sway = b.lean + Math.sin(t * b.rate + b.phase) * 0.12
                 + Math.sin(t * 2.6 + b.phase) * 0.03;
      e.set(sway, b.yaw, sway * 0.6);
      p.set(b.x, b.y, b.z);
      s.set(1, b.h, 1);
      m.compose(p, q.setFromEuler(e), s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0);   // seat the blades before the first (pre-ready) frame renders
  return { update, count: blades.length };
}
