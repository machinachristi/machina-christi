// Reflections on the water (v9): the river's slow surface gives back what
// stands over it. Three cheap impressions in place of true mirroring — the
// low-poly idiom holds: (1) the water's own colour wears the hour (that part
// lives in water.js); (2) trees whose crowns overhang the banks lay a dark
// flattened image on the surface beside them; (3) the eastern gate's standing
// light stretches a golden glint down the two channels that pass its island,
// brightest at night when the gate itself burns highest.

import * as THREE from 'three';
import { riverCourse, riverEdgeDist } from './terrain.js';
import { mulberry32, clamp } from '../util.js';

const IMPRESSION_Y = -0.36;   // just above the ripple crests (crest ≈ -0.4)
const GLINT_Y = -0.33;

export function createReflections(scene, treeSpots) {
  // Own seeded stream (the v7/v8 pattern): jitter here shifts nothing planted.
  const rng = mulberry32(20260711);

  // ── Tree impressions ──────────────────────────────────────
  // Trees standing near the banks (the scatter keeps them ≥1.9 from the
  // water's edge) cast a squashed dark crown-shape onto the nearest channel.
  const spots = [];
  for (const s of treeSpots) {
    if (riverEdgeDist(s.x, s.z) > 6) continue;
    const { centers, halfWidth } = riverCourse(s.x);
    let zc = centers[0];
    for (const c of centers) if (Math.abs(s.z - c) < Math.abs(s.z - zc)) zc = c;
    // Lie the impression on the water, leaning toward the tree's own bank.
    const zr = zc + clamp(s.z - zc, -halfWidth * 0.45, halfWidth * 0.45);
    spots.push({
      x: s.x + (rng() - 0.5) * 0.5,
      z: zr,
      s: 0.8 + rng() * 0.7,
      phase: rng() * Math.PI * 2,
    });
  }

  const impressions = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({
      color: 0x2F5040,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    }),
    Math.max(spots.length, 1),
  );
  impressions.count = spots.length;
  impressions.frustumCulled = false;   // instances spread along the river
  if (spots.length > 0) scene.add(impressions);

  // ── The gate's glint ──────────────────────────────────────
  // Two long golden streaks on the inner channels beside the gate's island
  // (the gate stands at x≈49 between them), shimmering like light lain on
  // moving water. Additive, so they read as light and not as paint.
  const glintCourse = riverCourse(45.5);
  const glints = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xFFD98A,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    2,
  );
  glints.frustumCulled = false;
  scene.add(glints);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();

  let t = 0;
  function update(dt, night = 0) {
    t += dt;

    // Impressions ride the ripples' breath and thin out after dark, when the
    // water gives back the moon and the gate instead of the trees.
    impressions.material.opacity = 0.26 * (1 - night * 0.6);
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const breathe2 = 1 + Math.sin(t * 0.7 + s.phase) * 0.06;
      p.set(s.x, IMPRESSION_Y, s.z);
      sc.set(s.s * 1.15 * breathe2, 0.05, s.s * 0.9);
      m.compose(p, q, sc);
      impressions.setMatrixAt(i, m);
    }
    if (spots.length > 0) impressions.instanceMatrix.needsUpdate = true;

    // The glint stretches and shivers, and burns up with the night.
    const shimmer = 0.8 + Math.sin(t * 1.9) * 0.12 + Math.sin(t * 4.7) * 0.08;
    glints.material.opacity = (0.07 + night * 0.24) * shimmer;
    for (let g = 0; g < 2; g++) {
      const zc = glintCourse.centers[g + 1];   // the two inner heads
      p.set(45.5, GLINT_Y, zc);
      sc.set(6.5 + Math.sin(t * 1.1 + g * 2) * 0.7, 1, 0.85);
      m.compose(p, q, sc);
      glints.setMatrixAt(g, m);
    }
    glints.instanceMatrix.needsUpdate = true;
  }

  update(0);   // seat every matrix before the pre-ready warm-up frame
  return { update, count: spots.length };
}
