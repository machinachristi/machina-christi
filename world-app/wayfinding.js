// Tap to walk there (v26, Proverbs 16:9: "a man's heart deviseth his way:
// but the LORD directeth his steps"). A drag held for a long walk tires the
// thumb; now a single tap on the ground is enough — he turns, walks to the
// place, and stops on it. A faint ring lies on the grass where the tap fell
// and fades as he arrives: it is part of the world, not a mark on the
// screen, so there is still no HUD.
//
// He also stops of his own accord when, on the way, he comes up to a
// creature near the place he was sent to and its name is given (Genesis
// 2:19, "brought them unto Adam to see what he would call them") — so a tap
// on the lamb walks him to the lamb, not on through it. (A tap on a
// creature's body finds the ground some way behind it, which is why "near
// the place" is generous.)
//
// Any drag or key takes back over at once and the walk is forgotten. A walk
// that stops making headway (a bank too steep, the rim of the garden) is
// given up quietly after a moment instead of pressing on for ever.

import * as THREE from 'three';
import { clamp, damp } from './util.js';

const WATER_Y = -0.5;     // water.js's own surface: a tap on the river lands on it
const REACH = 80;         // how far out along the ray a tap may find ground
const STEP = 0.35;        // the march along it, then bisected to a fine point
const ARRIVE = 0.3;       // this near, he has come to the place
const SLOW_FROM = 1.2;    // he eases his step over the last of the way
const NEAR_PLACE = 5.5;   // a creature this near the place he was sent to is the place…
const BESIDE = 2.8;       // …and once he is this near it, he has come to it
const ON_LINE = 1.6;      // …provided it stands on his way there, where the tap was aimed
const STALL = 1.6;        // seconds without headway before the walk is let go
const LIFT = 0.12;        // the ring rides this far over the ground (springs.js's lesson)

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _p = new THREE.Vector3();

export function createWayfinding(scene, camera, canvas, heightAt, radius) {
  const ground = (x, z) => Math.max(heightAt(x, z), WATER_Y);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.36, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xF4E6BA, transparent: true, opacity: 0, depthWrite: false }),
  );
  ring.visible = false;
  scene.add(ring);

  let target = null;     // { x, z } — where he is going, or null
  let startThing = null; // whatever was named when the walk began — not a reason to stop
  let from = null;        // where he set out from, taken on the walk's first frame
  let best = Infinity;   // nearest he has come so far
  let stall = 0;
  let shown = 0;         // the ring's own fade, 0..1
  let t = 0;
  let arrivals = 0;
  let how = null;        // 'here' | 'beside' | 'stopped' — how the last walk ended

  // Where on the ground (or the water) a ray through this screen point
  // first comes down, or null if it only finds sky.
  function groundAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const o = _ray.ray.origin, d = _ray.ray.direction;
    let prev = 0;
    for (let s = STEP; s <= REACH; s += STEP) {
      _p.copy(o).addScaledVector(d, s);
      if (_p.y > ground(_p.x, _p.z)) { prev = s; continue; }
      // Crossed under the ground between prev and s: close in on the crossing.
      let lo = prev, hi = s;
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2;
        _p.copy(o).addScaledVector(d, mid);
        if (_p.y > ground(_p.x, _p.z)) lo = mid; else hi = mid;
      }
      _p.copy(o).addScaledVector(d, hi);
      return { x: _p.x, z: _p.z };
    }
    return null;
  }

  function walkTo(x, z, namedThing = null) {
    // Never past the rim the walk itself is held inside.
    const r = Math.hypot(x, z), lim = radius - 0.5;
    if (r > lim) { x *= lim / r; z *= lim / r; }
    target = { x, z };
    startThing = namedThing;
    from = null;
    best = Infinity;
    stall = 0;
    ring.position.set(x, ground(x, z) + LIFT, z);
    return target;
  }

  function tapAt(clientX, clientY, namedThing = null) {
    const hit = groundAt(clientX, clientY);
    return hit ? walkTo(hit.x, hit.z, namedThing) : null;
  }

  function end(kind) {
    if (!target) return;
    target = null;
    how = kind;
    if (kind !== 'cancelled') arrivals++;
  }

  // Once a frame, while no drag or key has the walker: the world-space step
  // toward the place (unit length, eased down over the last of the way), or
  // null when there is nowhere to go. `namedThing` is the creature (or
  // fruit, or tree) whose name is presently given in the garden, or null —
  // creatures.js's own object, read here only for where it stands.
  function intent(pos, namedThing, dt) {
    if (!target) return null;
    const dx = target.x - pos.x, dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE) { end('here'); return null; }
    if (!from) from = { x: pos.x, z: pos.z };
    if (namedThing && namedThing !== startThing && aimedAt(namedThing, pos)) { end('beside'); return null; }
    if (dist < best - 0.05) { best = dist; stall = 0; } else { stall += dt; }
    if (stall > STALL) { end('stopped'); return null; }
    const mag = clamp(dist / SLOW_FROM, 0.3, 1);
    return { x: (dx / dist) * mag, z: (dz / dist) * mag, quick: false };
  }

  // Whether the thing just named is what the tap was meant for: near the
  // place, close to the straight way there from where he set out (so a
  // plant he merely brushes past on the way does not stop him), and he
  // has come up beside it.
  function aimedAt(thing, pos) {
    const p = thing.group ? thing.group.position : thing.pos;
    if (Math.hypot(p.x - target.x, p.z - target.z) >= NEAR_PLACE) return false;
    if (Math.hypot(p.x - pos.x, p.z - pos.z) >= BESIDE) return false;
    const lx = target.x - from.x, lz = target.z - from.z;
    const len = Math.hypot(lx, lz);
    if (len < 0.01) return false;
    const vx = p.x - from.x, vz = p.z - from.z;
    return Math.abs(vx * lz - vz * lx) / len < ON_LINE;
  }

  function cancel() { end('cancelled'); }

  // The ring: drawn in while there is a place to go, a slow breath on it,
  // and let go softly once he is there.
  function update(dt) {
    t += dt;
    shown = damp(shown, target ? 1 : 0, target ? 7 : 3.5, dt);
    if (!target && shown < 0.01) shown = 0;
    ring.visible = shown > 0;
    if (ring.visible) {
      ring.material.opacity = 0.7 * shown;
      ring.scale.setScalar(1 + 0.12 * Math.sin(t * 3.2) + 0.5 * (1 - shown) * (target ? 0 : 1));
    }
  }

  function state() {
    return { target: target ? { x: target.x, z: target.z } : null, arrivals, how };
  }

  return { tapAt, walkTo, intent, cancel, update, state, get active() { return !!target; } };
}
