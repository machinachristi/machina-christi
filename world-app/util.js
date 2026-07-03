// Small shared helpers for the garden.

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

// Shortest signed angular distance from a to b, in (-PI, PI].
export function shortestAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
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
