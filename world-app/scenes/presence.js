// A subtle presence (Genesis 3:1, foreshadowed). Rarely, and only near the
// Tree of the Knowledge of Good and Evil, something long and quiet stirs the
// grass: a low dark form that slips in an unhurried arc through the meadow at
// the dark tree's foot, then is gone — never named, never fully shown, more a
// misgiving than a creature. Long stretches of the garden pass with no sign of
// it at all. Its own seeded clock keeps the timing the same for every visitor,
// and it can be called at will for a passing glimpse (window.__world.stir()).

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { mulberry32 } from '../util.js';

const SEGMENTS = 9;          // the low dark body, head to tail
const SEG_GAP = 0.34;        // spacing between segments along its path

export function createPresence(scene) {
  const rng = mulberry32(20260709);

  // A chain of small dark beads, laid along the body's sinuous line each
  // frame. One instanced mesh, matte and unlit-dark, so it reads as shadow in
  // the grass rather than a modelled animal.
  const mat = new THREE.MeshLambertMaterial({
    color: 0x1B241B,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), mat, SEGMENTS);
  mesh.visible = false;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  // The rare clock: long idle waits, brief stirrings.
  let idle = 40 + rng() * 60;   // first sign comes well after arrival
  let active = false;
  let elapsed = 0;
  let path = null;

  function begin() {
    active = true;
    elapsed = 0;
    path = {
      a0: rng() * Math.PI * 2,
      dir: rng() < 0.5 ? -1 : 1,
      w: 0.22 + rng() * 0.16,        // angular speed of the head
      radius: 2.7 + rng() * 1.5,     // how far out from the tree it circles
      dur: 6 + rng() * 4,
    };
    mesh.visible = true;
  }

  const TK = TREE_OF_KNOWLEDGE_POS;

  function update(dt) {
    if (!active) {
      idle -= dt;
      if (idle <= 0) begin();
      return;
    }

    elapsed += dt;
    if (elapsed >= path.dur) {
      active = false;
      mesh.visible = false;
      mat.opacity = 0;
      idle = 90 + rng() * 110;
      path = null;
      return;
    }

    // Fade in over the first breath, hold, fade out over the last — it never
    // simply appears or vanishes.
    const fadeIn = Math.min(1, elapsed / 1.2);
    const fadeOut = Math.min(1, (path.dur - elapsed) / 1.2);
    mat.opacity = 0.5 * Math.min(fadeIn, fadeOut);

    // Head rides a slow arc about the tree; the body trails behind it along
    // the same arc, with a small undulation so the line is never straight.
    const aHead = path.a0 + path.dir * path.w * elapsed;
    let hx = 0, hz = 0;
    for (let i = 0; i < SEGMENTS; i++) {
      const back = (i * SEG_GAP) / path.radius;      // trail along the arc
      const a = aHead - path.dir * back;
      const wob = Math.sin(elapsed * 5 + i * 0.8) * 0.12;
      const r = path.radius + wob;
      const x = TK.x + Math.cos(a) * r;
      const z = TK.z + Math.sin(a) * r;
      if (i === 0) { hx = x; hz = z; }
      const y = heightAt(x, z) + 0.07;
      p.set(x, y, z);
      // Taper the body toward the tail.
      const taper = 1 - (i / SEGMENTS) * 0.55;
      s.setScalar(taper);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    presenceState.x = hx;
    presenceState.z = hz;
  }

  const presenceState = { active: false, x: 0, z: 0 };
  function state() {
    presenceState.active = active;
    return presenceState;
  }

  // Call it now (skips the wait) — for a deliberate glimpse and for tests.
  function stir() {
    if (!active) begin();
    return state();
  }

  return { update, state, stir };
}
