// "And he carried me away in the spirit to a great and high mountain, and
// shewed me that great city, the holy Jerusalem" (Revelation 21:10).
//
// In heaven, tap the sky (v43), and the view is carried up and back, out over
// the south wall to a great height, and the whole city is shown at once: the
// wall foursquare with its twelve gates, the river and the street of gold
// running up the middle of it, the Tree of Life, the saints, the multitude
// and the glory. He himself stays standing where he was, small on the glass.
// The view drifts slowly from side to side, and a sideways drag turns it by
// hand. Any tap, or a drag to walk, brings the view down to him again.
//
// (In the garden the same tap lays him down to look up into the sky —
// consider.js. Here it is the other way about: he is lifted up to look down.)
//
// Only the camera moves. It rides on the same hook the lying-back view uses
// (CameraRig.setGaze), blended over the follow camera, which keeps easing
// along underneath — so coming down, the view returns to exactly where it
// would have been. What heaven itself does while he looks (the golden reed
// measuring the wall, heaven/reed.js; the air cleared so the far wall can be
// seen) is told to it by main.js through realm.js, inside heaven's own guard.

import * as THREE from 'three';
import { clamp, smoothstep } from './util.js';
import { fovFor } from './camera-rig.js';

const CENTRE = { x: 0, z: 32 };     // the middle of the city (heaven/city.js: its wall runs z −54 … 118)
const FIT = 114;                    // metres either side of the middle the view takes in
const NEAREST = 215;                // never nearer the middle than this…
const FURTHEST = 340;               // …nor further (a narrow phone stands furthest off)
// How steeply the view looks down on the city: an upright phone looks down
// more steeply, so the square fills its tall picture; a wide screen less.
const ELEVATION = { tall: 0.95, wide: 0.55 };
const AIM = { y: 4, north: -2 };    // it looks at a point this high, this far north of the middle
const RISE = 6;                     // seconds up…
const FALL = 3.2;                   // …and down
const DRIFT = 0.16;                  // radians the view idly swings either way
const DRIFT_RATE = 0.07;            // …and how slowly (rad/s of its phase)
const TURN_MAX = 1.0;               // a drag may turn it this far either way
const TURN_GAIN = 0.7;
const SETTLED = 0.9;                // how far up counts as "on high" (the reed sets out)

const WORD = { name: 'Har gavoah', label: 'a great and high mountain: he shewed me that great city' };
const WORD_FOR = 5.5;               // seconds the word is given once he is on high

const DEG = Math.PI / 180;

export function createBehold({ camera, rig, character }) {
  let on = false;
  let a = 0;                // 0 with him … 1 on high
  let clock = 0;            // seconds on high, for the slow swing
  let turned = 0;           // how far a drag has turned the view
  let times = 0;
  let wordLeft = 0;
  let quick = false;
  try { quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { /* fine */ }

  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const from = new THREE.Vector3();
  const over = new THREE.Vector3();
  const high = new THREE.Vector3();
  const aim = new THREE.Vector3();

  // How far off the view stands, by the screen's shape: far enough that the
  // city's breadth fits across it.
  function range() {
    const aspect = camera.aspect || 1;
    const across = Math.tan((fovFor(aspect) / 2) * DEG) * aspect;
    return clamp(FIT / Math.max(across, 0.05), NEAREST, FURTHEST);
  }

  function begin() {
    if (on) return true;
    on = true;
    if (a < 0.02) {
      times++;
      clock = 0;
      turned = 0;
      wordLeft = 0;
    }
    return true;
  }

  function end() { on = false; }

  // Straight back to him, with no easing: the realm has him (a fault in
  // heaven, the way down), or he is not in heaven at all.
  function reset() {
    on = false;
    a = 0;
    wordLeft = 0;
  }

  function turn(d) {
    if (!on) return;
    turned = clamp(turned + d * TURN_GAIN, -TURN_MAX, TURN_MAX);
  }

  // Once a frame, after consider.update and before the camera's own update.
  // allowed: he is in heaven and the realm does not have him.
  function update(dt, allowed) {
    if (!allowed) { reset(); return; }
    const up = quick ? 1.2 : RISE, down = quick ? 1.0 : FALL;
    a = clamp(a + (on ? dt / up : -dt / down), 0, 1);
    if (a <= 0) return;
    if (a >= SETTLED && on) {
      if (clock === 0) wordLeft = WORD_FOR;
      clock += dt;
    }
    if (wordLeft > 0) wordLeft -= dt;

    // Where the view is carried to: out beyond the wall, high, swinging
    // slowly round the middle of the city.
    const bearing = turned + (quick ? 0 : DRIFT * Math.sin(clock * DRIFT_RATE));
    const r = range();
    const elevation = ELEVATION.tall + (ELEVATION.wide - ELEVATION.tall) * smoothstep(0.6, 1.4, camera.aspect || 1);
    const flat = r * Math.cos(elevation);
    high.set(CENTRE.x - Math.sin(bearing) * flat, r * Math.sin(elevation), CENTRE.z - Math.cos(bearing) * flat);
    aim.set(CENTRE.x, AIM.y, CENTRE.z + AIM.north);

    // The way up: from a little above and behind him, steeply at first (so
    // it clears the wall with room to spare), then out and back.
    const p = character.group.position;
    const s = Math.sin(rig.yaw), c = Math.cos(rig.yaw);
    from.set(p.x - s * 9, p.y + 9, p.z - c * 9);
    over.set((from.x + high.x) * 0.5, high.y * 0.92, from.z + (high.z - from.z) * 0.22);
    const k = smoothstep(0, 1, a);
    const q = 1 - k;
    eye.set(
      q * q * from.x + 2 * q * k * over.x + k * k * high.x,
      q * q * from.y + 2 * q * k * over.y + k * k * high.y,
      q * q * from.z + 2 * q * k * over.z + k * k * high.z,
    );
    // He looks on past himself toward the glory as he rises, then down on
    // the whole city.
    const m = smoothstep(0.1, 0.85, a);
    look.set(
      p.x + (aim.x - p.x) * m,
      (p.y + 3) + (aim.y - (p.y + 3)) * m,
      (p.z + 12) + (aim.z - (p.z + 12)) * m,
    );
    rig.setGaze(smoothstep(0, 0.3, a), eye, look);
  }

  return {
    begin, end, reset, turn, update,
    // The line under the screen as he comes to the height.
    caption: () => (on && wordLeft > 0 ? WORD : null),
    get on() { return on; },
    // 0..1 how far up the view is.
    get k() { return a; },
    // Whether it is on high and looking (the reed measures only then).
    get settled() { return on && a >= SETTLED; },
    state() {
      return {
        on,
        k: +a.toFixed(3),
        settled: on && a >= SETTLED,
        turned: +turned.toFixed(3),
        range: Math.round(range()),
        word: on && wordLeft > 0 ? WORD.name : null,
        times,
      };
    },
  };
}
