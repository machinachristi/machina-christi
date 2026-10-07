// Journey-style input: one continuous drag anywhere on screen both steers and
// walks. pointerdown anchors an invisible origin; the vector dragged away from
// it becomes a camera-relative walk direction; lift to stop. No joystick is
// ever drawn. Pointer Events cover touch, mouse, and pen with one listener
// set. Arrow keys / WASD are a desktop courtesy mapped onto the same vector.
//
// v25 (Psalm 37:23, "the steps of a good man are ordered"): the drag no
// longer sets a continuous speed. Any drag past the deadzone is a steady
// walk; only a clearly extended one is the quickened pace — two gaits, with
// hysteresis between them, so a wobbling thumb can never change the pace.
// The origin trails a long drag, so the thumb never runs out of screen
// ("thou hast enlarged my steps under me", Psalm 18:36), and the heading is
// eased so a nervous finger doesn't zigzag the walker (Proverbs 4:26).

import { clamp } from './util.js';

const DEADZONE = 8;     // px of drag before walking starts, so taps don't jitter
const QUICK_ON = 110;   // px from the origin at which the walk quickens…
const QUICK_OFF = 80;   // …and only below this does it ease back to a walk
const TRAIL = 140;      // the origin follows the thumb past this reach
const HEAD_LAMBDA = 10; // how eagerly the drag's heading follows the thumb

export function createControls(el, onFirstInput) {
  const drag = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, quick: false, angle: 0, live: false };
  const keys = new Set();
  let shift = false;
  let first = onFirstInput;

  function notifyFirst() {
    if (first) { const f = first; first = null; f(); }
  }

  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (drag.id !== null) return;           // first finger steers; ignore extras
    drag.id = e.pointerId;
    drag.ox = e.clientX; drag.oy = e.clientY;
    drag.dx = 0; drag.dy = 0;
    drag.quick = false;
    drag.live = false;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* not critical */ }
    notifyFirst();
  });

  el.addEventListener('pointermove', e => {
    if (e.pointerId !== drag.id) return;
    let dx = e.clientX - drag.ox;
    let dy = e.clientY - drag.oy;
    let len = Math.hypot(dx, dy);
    // The origin trails a long drag: the thumb can keep going as far as the
    // screen lets it and the drag still reads the same, held at full reach.
    if (len > TRAIL) {
      const pull = (len - TRAIL) / len;
      drag.ox += dx * pull; drag.oy += dy * pull;
      dx = e.clientX - drag.ox; dy = e.clientY - drag.oy;
      len = TRAIL;
    }
    drag.dx = dx; drag.dy = dy;
    if (drag.quick ? len < QUICK_OFF : len > QUICK_ON) drag.quick = !drag.quick;
  });

  function release(e) {
    if (e.pointerId !== drag.id) return;
    drag.id = null;
    drag.dx = 0; drag.dy = 0;
    drag.quick = false;
    drag.live = false;
  }
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  const KEYMAP = {
    ArrowUp: 'f', KeyW: 'f',
    ArrowDown: 'b', KeyS: 'b',
    ArrowLeft: 'l', KeyA: 'l',
    ArrowRight: 'r', KeyD: 'r',
  };
  window.addEventListener('keydown', e => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { shift = true; return; }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    keys.add(k);
    notifyFirst();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { shift = false; return; }
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  });
  window.addEventListener('blur', () => { keys.clear(); shift = false; });

  // Once a frame: ease the drag's heading toward where the thumb points. The
  // first frame past the deadzone takes the thumb's heading outright, so a
  // drag starts the way it was meant without any lag.
  function update(dt) {
    if (drag.id === null) return;
    const len = Math.hypot(drag.dx, drag.dy);
    if (len <= DEADZONE) { drag.live = false; return; }
    const raw = Math.atan2(drag.dx, -drag.dy);   // 0 = screen-up = away
    if (!drag.live) { drag.angle = raw; drag.live = true; return; }
    let d = (raw - drag.angle) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    drag.angle += d * (1 - Math.exp(-HEAD_LAMBDA * clamp(dt, 0, 0.1)));
  }

  // Current input as a camera-space vector: x = right, z = forward, of unit
  // length while walking (0 at rest) — the pace is carried apart from it, in
  // `quick`. The drag wins while a finger is down; keys otherwise.
  function vector() {
    if (drag.id !== null) {
      if (!drag.live) return { x: 0, z: 0, quick: false };
      return { x: Math.sin(drag.angle), z: Math.cos(drag.angle), quick: drag.quick };
    }
    const x = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
    const z = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0);
    if (!x && !z) return { x: 0, z: 0, quick: false };
    const len = Math.hypot(x, z);
    return { x: x / len, z: z / len, quick: shift };
  }

  return { vector, update };
}
