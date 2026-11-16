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
//
// v26 (Proverbs 16:9, "a man's heart deviseth his way: but the LORD
// directeth his steps"): a quick touch that never becomes a drag is a tap,
// and is kept for the frame loop to take (`takeTap`) — main.js turns it into
// a place on the ground to walk to (see wayfinding.js). Nothing is drawn.

//
// AB#164 (Psalm 18:33, "he maketh my feet like hinds' feet"): a second way of
// reading the same touches, tried beside the first — `scheme: 'new'`. On a
// phone the drag-anywhere stick began under a finger in the middle of the
// picture, hiding the walker; its reach was long; and nothing could turn the
// view. So the screen is given two parts. The LOWER part is his feet: a
// short-reach stick begins where the thumb lands there, and is drawn (a
// faint ring and a bead) so the thumb can see what it is doing. The UPPER
// part is his eyes: a sideways drag there turns the view (`takeLook`), and
// a second finger may do so while the first walks. A tap is a tap in either
// part, and is forgiven a little more time and a little more wobble.

import { clamp } from './util.js';

const OLD = {
  DEADZONE: 8,     // px of drag before walking starts, so taps don't jitter
  QUICK_ON: 110,   // px from the origin at which the walk quickens…
  QUICK_OFF: 80,   // …and only below this does it ease back to a walk
  TRAIL: 140,      // the origin follows the thumb past this reach
  TAP_MS: 320,     // a touch lifted sooner than this, never dragged, is a tap
};
const NEW = {
  DEADZONE: 12,    // a thumb's own wobble, on a tap, is not a walk
  QUICK_ON: 50,    // a short reach: the thumb stays low and out of the picture
  QUICK_OFF: 36,
  TRAIL: 62,       // also the drawn ring's radius
  TAP_MS: 500,
};
const HEAD_LAMBDA = 10; // how eagerly the drag's heading follows the thumb
export const FEET_FROM = 0.55;   // new scheme: touches below this share of the height are his feet
export const LOOK_SWEEP = Math.PI; // new scheme: a drag the whole width of the screen turns the view half round

export function createControls(el, onFirstInput, { scheme = 'old' } = {}) {
  const fresh = scheme === 'new';
  const { DEADZONE, QUICK_ON, QUICK_OFF, TRAIL, TAP_MS } = fresh ? NEW : OLD;
  const drag = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, quick: false, angle: 0, live: false, t0: 0, far: false, opening: false };
  // The eyes' own finger (new scheme): `turn` gathers radians until taken.
  const look = { id: null, x: 0, ox: 0, oy: 0, t0: 0, far: false, opening: false, turn: 0, total: 0 };

  // The stick as the thumb sees it (new scheme): a ring where it began and a
  // bead where the thumb is. They take no touches and are shown only while
  // a finger is down on the lower part.
  let ringEl = null, beadEl = null;
  if (fresh) {
    ringEl = document.createElement('div');
    ringEl.className = 'stick';
    beadEl = document.createElement('div');
    beadEl.className = 'stick__bead';
    ringEl.appendChild(beadEl);
    document.body.appendChild(ringEl);
  }
  function drawStick() {
    if (!ringEl) return;
    const on = drag.id !== null && drag.far;
    ringEl.classList.toggle('stick--shown', on);
    ringEl.classList.toggle('stick--quick', on && drag.quick);
    if (!on) return;
    ringEl.style.transform = `translate(${drag.ox}px, ${drag.oy}px)`;
    beadEl.style.transform = `translate(${drag.dx}px, ${drag.dy}px)`;
  }
  let tap = null;   // { x, y } in client px, waiting for the frame loop
  const keys = new Set();
  let shift = false;
  let first = onFirstInput;

  function notifyFirst() {
    if (first) { const f = first; first = null; f(); }
  }

  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (fresh) {
      const r = el.getBoundingClientRect();
      if (e.clientY - r.top < r.height * FEET_FROM) {
        if (look.id !== null) return;
        look.id = e.pointerId;
        look.x = look.ox = e.clientX; look.oy = e.clientY;
        look.t0 = e.timeStamp;
        look.far = false;
        look.opening = !!first;
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* not critical */ }
        notifyFirst();
        return;
      }
    }
    if (drag.id !== null) return;           // first finger steers; ignore extras
    drag.id = e.pointerId;
    drag.ox = e.clientX; drag.oy = e.clientY;
    drag.dx = 0; drag.dy = 0;
    drag.quick = false;
    drag.live = false;
    drag.t0 = e.timeStamp;
    drag.far = false;
    // The very first touch only skips the opening shot: it is not a tap to
    // walk somewhere seen from a camera still high above and behind him.
    drag.opening = !!first;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* not critical */ }
    notifyFirst();
  });

  el.addEventListener('pointermove', e => {
    if (e.pointerId === look.id) {
      if (!look.far && Math.hypot(e.clientX - look.ox, e.clientY - look.oy) > DEADZONE) {
        look.far = true;
        look.x = e.clientX;                 // the turn begins from here, without a jump
      }
      if (look.far) {
        const r = el.getBoundingClientRect();
        const d = ((e.clientX - look.x) / Math.max(r.width, 1)) * LOOK_SWEEP;
        look.turn += d; look.total += d;
        look.x = e.clientX;
      }
      return;
    }
    if (e.pointerId !== drag.id) return;
    let dx = e.clientX - drag.ox;
    let dy = e.clientY - drag.oy;
    let len = Math.hypot(dx, dy);
    if (len > DEADZONE) drag.far = true;   // once a drag, never a tap
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
    drawStick();
  });

  function release(e) {
    if (e.pointerId === look.id) {
      if (e.type === 'pointerup' && !look.far && !look.opening && e.timeStamp - look.t0 < TAP_MS) {
        tap = { x: e.clientX, y: e.clientY };
      }
      look.id = null;
      return;
    }
    if (e.pointerId !== drag.id) return;
    if (e.type === 'pointerup' && !drag.far && !drag.opening && e.timeStamp - drag.t0 < TAP_MS) {
      tap = { x: e.clientX, y: e.clientY };
    }
    drag.id = null;
    drag.dx = 0; drag.dy = 0;
    drag.quick = false;
    drag.live = false;
    drawStick();
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

  // The last tap, once: handed over and forgotten, so one tap is one walk.
  function takeTap() {
    const t = tap;
    tap = null;
    return t;
  }

  // How far the eyes' finger has asked the view to turn since last asked,
  // in radians — positive for a drag to the right. (Always 0 in the old way.)
  function takeLook() {
    const t = look.turn;
    look.turn = 0;
    return t;
  }

  function state() {
    return { scheme, stick: drag.id !== null && drag.far, looking: look.id !== null && look.far, looked: look.total };
  }

  return { vector, update, takeTap, takeLook, state };
}
