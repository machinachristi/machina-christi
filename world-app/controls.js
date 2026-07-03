// Journey-style input: one continuous drag anywhere on screen both steers and
// walks. pointerdown anchors an invisible origin; the vector dragged away from
// it becomes a camera-relative walk direction; lift to stop. No joystick is
// ever drawn. Pointer Events cover touch, mouse, and pen with one listener
// set. Arrow keys / WASD are a desktop courtesy mapped onto the same vector.

import { clamp } from './util.js';

const DEADZONE = 8;    // px of drag before walking starts, so taps don't jitter
const FULL_DRAG = 60;  // px of drag past the deadzone for full walking speed

export function createControls(el, onFirstInput) {
  const drag = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  const keys = new Set();
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
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* not critical */ }
    notifyFirst();
  });

  el.addEventListener('pointermove', e => {
    if (e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.ox;
    drag.dy = e.clientY - drag.oy;
  });

  function release(e) {
    if (e.pointerId !== drag.id) return;
    drag.id = null;
    drag.dx = 0; drag.dy = 0;
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
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    keys.add(k);
    notifyFirst();
  });
  window.addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  });
  window.addEventListener('blur', () => keys.clear());

  // Current input as a camera-space vector: x = right, z = forward,
  // length 0..1. The drag wins while a finger is down; keys otherwise.
  function vector() {
    if (drag.id !== null) {
      const len = Math.hypot(drag.dx, drag.dy);
      if (len <= DEADZONE) return { x: 0, z: 0 };
      const mag = clamp((len - DEADZONE) / FULL_DRAG, 0, 1);
      // Screen up (negative dy) means "walk away from the camera".
      return { x: (drag.dx / len) * mag, z: (-drag.dy / len) * mag };
    }
    const x = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
    const z = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0);
    if (!x && !z) return { x: 0, z: 0 };
    const len = Math.hypot(x, z);
    return { x: x / len, z: z / len };
  }

  return { vector };
}
