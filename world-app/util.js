// Small shared helpers for the garden.

import * as THREE from 'three';

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Frame-rate-independent exponential smoothing — same idiom as the pilgrim's
// glide in game.js: eases `current` toward `target` at a rate set by lambda.
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

// Hermite-eased 0→1 as v crosses [a, b].
export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Yield to the event loop. The world boots inside a same-origin iframe,
// which shares the parent page's main thread — one long synchronous build
// would freeze the parent's "entering…" animation mid-breath. Awaiting this
// between build steps keeps the whole page responsive while Eden assembles.
export function breathe() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Shortest signed angular distance from a to b, in (-PI, PI].
export function shortestAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Concatenate non-indexed geometries into one, painting each its own flat
// colour into a shared vertex-colour attribute — the garden's standard way of
// baking anything that never moves into a single draw call (scenes/cedars.js
// and its kin each carry their own copy of this; new work reads it from here).
// Callers pass position-only or position+normal geometries, already placed by
// `.rotate*()`/`.translate()` and `.toNonIndexed()` where three.js indexes
// them; normals are recomputed, so the merge keeps the faceted look.
export function mergeColored(parts) {
  let count = 0;
  for (const part of parts) count += part.geo.attributes.position.count;
  const posArr = new Float32Array(count * 3);
  const colArr = new Float32Array(count * 3);
  let v = 0;
  for (const { geo, color } of parts) {
    const n = geo.attributes.position.count;
    posArr.set(geo.attributes.position.array, v * 3);
    for (let i = 0; i < n; i++) {
      colArr[(v + i) * 3] = color.r;
      colArr[(v + i) * 3 + 1] = color.g;
      colArr[(v + i) * 3 + 2] = color.b;
    }
    v += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  merged.computeVertexNormals();   // non-indexed → true per-face normals
  return merged;
}

// The same merge for parts that already share one material: no colour
// attribute at all, so the material they were drawn with — and anything that
// mutates it, like the Tree of Life's emissive answer to the dark — carries
// over untouched.
export function mergeGeos(geos) {
  let count = 0;
  for (const geo of geos) count += geo.attributes.position.count;
  const posArr = new Float32Array(count * 3);
  let v = 0;
  for (const geo of geos) {
    const n = geo.attributes.position.count;
    posArr.set(geo.attributes.position.array, v * 3);
    v += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.computeVertexNormals();
  return merged;
}

// Deterministic PRNG so the garden is planted the same way for everyone —
// and so tests and screenshots are stable run to run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
