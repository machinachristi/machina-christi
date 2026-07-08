// The cool of the day (Genesis 3:8, foreshadowed): at evening a wind walks
// through the garden — one gust that sweeps west to east across the whole
// width of it, so whatever it touches bows and settles again as it passes
// on. Pure functions of the sky's own clock (no state, no seed of its own),
// so every tree, the reeds, and the ambience all agree on exactly when and
// where it moves without sharing anything but the hour.

import { clamp, smoothstep } from '../util.js';

const CENTER = 0.55;   // evening, inside sky.js's evening window (0.46–0.585)
const HALF = 0.05;     // half-width of the event in cycle-time (~42s of a 7-min day)
const SPAN = 120;      // how far the leading edge sweeps, west to east, in world units

// How strong the gust is overall right now, 0 (still) to 1 (full breath) —
// one triangular pulse centred on the evening.
export function windOf(t) {
  return Math.max(0, 1 - Math.abs(t - CENTER) / HALF);
}

// Where the gust's leading edge presently stands, sweeping west to east
// across the garden over the whole window.
function frontOf(t) {
  const k = clamp((t - (CENTER - HALF)) / (2 * HALF), 0, 1);
  return -SPAN / 2 + k * SPAN;
}

// How strongly the gust presently touches position x: the overall breath,
// shaped by a soft bump around the sweeping front — so a tree bows as the
// front nears, most as it passes directly over it, and settles again after.
export function gustAt(t, x) {
  const w = windOf(t);
  if (w <= 0) return 0;
  const d = Math.abs(x - frontOf(t));
  return w * (1 - smoothstep(8, 26, d));
}
