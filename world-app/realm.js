// Two realms, one walker (AB#106). Eden and heaven are two separate scenes;
// only the one he is in is drawn, so heaven costs the garden nothing, and
// heaven is only built when he first heads for Jacob's ladder.
//
// The way between them is a small state machine, so the walker is always in
// exactly one known state and nothing can be left half-done:
//
//   Eden ──walk into the ladder's foot──▶ up (he climbs; the veil of light
//   gathers) ──▶ veiled ──heaven ready──▶ arriving (heaven; the veil lifts)
//   ──▶ heaven ──walk into the ladder's head──▶ leaving (the veil gathers)
//   ──▶ down (Eden, high on the ladder; he climbs down as the veil lifts)
//   ──▶ stepping (he steps off and turns for home) ──▶ Eden
//
// Above all, heaven can never take the world down with it. The parent page
// removes the whole world on any uncaught error, even one long after it has
// loaded, so everything heaven does — fetching the saints, building, every
// frame's update and drawing — runs inside a guard. On any fault he stays in
// Eden (or is brought back down to it), the fault is noted quietly in the
// console as a warning, and the ladder rests for the rest of the visit. The
// same happens if heaven is not ready a few seconds after the veil is full.
//
// Test hooks: ?debug=heavenError makes the build throw; ?debug=heavenFault
// makes heaven's update throw a moment after arriving; ?day=YYYY-MM-DD asks
// heaven for another day's saint.

import * as THREE from 'three';
import { clamp, lerp, smoothstep, shortestAngle, breathe } from './util.js';
import { LADDER_FOOT, ladderPoint } from './scenes/ladder.js';
import { createWayfinding } from './wayfinding.js';
import { createFooting } from './footing.js';
import { loadSaints } from './heaven/saints.js';
import { createHeaven } from './heaven/heaven.js';

const PRELOAD = 15;        // m from the foot: begin reading the saints and building heaven
const TRIGGER = 1.2;       // m from the foot: walking into it, the climb begins
const MIN_SPEED = 0.3;     // m/s — walked into, not merely set down beside it
const REARM = 3;           // m away again before the foot (or the head) carries him again
const IN_FRONT = 0.38;     // he climbs this far in front of the rungs, on the garden side
const ONTO = 0.4;          // s to step up onto the ladder and face it
const CLIMB_RATE = 1.6;    // m/s up the rungs
const CLIMB_TIME = 2.5;    // s on the ladder before the veil is full
const VEIL_UP_IN = 1.0;    // the veil gathers over the last second of the climb…
const VEIL_UP_OUT = 1.2;   // …and lifts over heaven
const WAIT_MAX = 8;        // s under the full veil for heaven to be ready
const HEAD_TRIGGER = 2.0;  // m from the ladder's head in heaven: the way down
const VEIL_DOWN_IN = 0.8;
const VEIL_DOWN_OUT = 1.0;
const DOWN_FROM = 12;      // m up the ladder he comes back into Eden
const DOWN_TIME = 3.6;     // s to climb down from there
const STEP_OFF = 1.5;      // m from the foot he steps off to, facing home
const STEP_MAX = 2.5;      // s at most for that step

const HOLD = { move: { x: 0, z: 0, quick: false }, world: true };
const STEP_AWAY = { move: { x: 0, z: -1, quick: false }, world: true };

// eden: { scene, heightAt, radius, footing, wayfinding, namedThing } — the
// garden's own kit, as main.js built it.
export function createRealm({ camera, canvas, character, rig, eden, params }) {
  const edenKit = { name: 'eden', ...eden };
  let heavenKit = null;
  let heaven = null;

  let now = 'eden';          // which realm he is in (whose scene is drawn)
  let passage = null;        // null | 'up' | 'veiled' | 'arriving' | 'leaving' | 'down' | 'stepping'
  let t = 0;                 // seconds into the present passage
  let armed = true;          // the foot may carry him up
  let armedHead = false;     // the head may carry him down
  let building = false;
  let built = false;
  let failed = false;
  let failure = null;
  let heavenTime = 0;
  let climbH = 0;            // how far up the ladder he is
  let downFrom = DOWN_FROM;
  let downTime = DOWN_TIME;
  let veilFrom = 0;
  const start = { x: 0, y: 0, z: 0, yaw: 0 };
  const _pt = { x: 0, y: 0, z: 0 };

  const debug = params.get('debug');
  const day = params.get('day');
  let reducedMotion = false;
  try { reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { /* fine */ }

  // The veil: warm light filling the whole view while the realms change.
  const veilEl = document.createElement('div');
  veilEl.className = 'passage';
  document.body.appendChild(veilEl);
  let veil = 0;
  let veilShown = -1;
  function setVeil(v) {
    veil = clamp(v, 0, 1);
    const ends = (veil === 0 || veil === 1) && veil !== veilShown;
    if (!ends && Math.abs(veil - veilShown) < 0.004) return;
    veilShown = veil;
    veilEl.style.opacity = veil.toFixed(3);
    veilEl.style.visibility = veil > 0 ? 'visible' : 'hidden';
  }
  setVeil(0);

  const pos = character.group.position;
  const distTo = p => Math.hypot(pos.x - p.x, pos.z - p.z);

  // Heaven is built once, in the background, with breaths between the
  // steps so walking never stalls. Nothing here may throw out of it.
  function startBuilding() {
    if (building || failed) return;
    building = true;
    (async () => {
      try {
        if (debug === 'heavenError') throw new Error('forced heaven error (debug=heavenError)');
        const data = await loadSaints(day);
        await breathe();
        const scene = new THREE.Scene();
        const h = await createHeaven(scene, data);
        const footing = createFooting(h.solids, h.radius);
        const wayfinding = createWayfinding(scene, camera, canvas, h.heightAt, h.radius, footing);
        heaven = h;
        heavenKit = {
          name: 'heaven', scene, heightAt: h.heightAt, radius: h.radius, footing, wayfinding,
          namedThing: () => guarded('naming', () => h.namedThing(), null),
        };
        built = true;
      } catch (err) {
        fault('build', err);
      }
    })().catch(err => fault('build', err));
  }

  function guarded(where, fn, fallback) {
    if (failed) return fallback;
    try { return fn(); } catch (err) { fault(where, err); return fallback; }
  }

  // Something in heaven went wrong: say so quietly, rest the ladder for the
  // rest of the visit, and if he is in heaven, bring him home.
  function fault(where, err) {
    if (!failed) {
      console.warn(`heaven: the ${where} failed, so he stays in Eden —`, err && err.message ? err.message : err);
      failure = where;
    }
    failed = true;
    if (now === 'heaven' && passage !== 'leaving') beginLeaving();
  }

  function beginClimb() {
    startBuilding();   // at the latest
    passage = 'up';
    t = 0;
    climbH = 0;
    start.x = pos.x; start.y = pos.y; start.z = pos.z;
    start.yaw = character.group.rotation.y;
    edenKit.wayfinding.cancel();
    character.setSitting(false);
    character.setClimbing(true, 0);
  }

  function enterHeaven() {
    edenKit.scene.remove(character.group);
    heavenKit.scene.add(character.group);
    now = 'heaven';
    document.body.classList.add('realm-heaven');
    const a = heaven.arrival;
    character.setClimbing(false);
    pos.set(a.x, heaven.heightAt(a.x, a.z), a.z);
    character.group.rotation.y = a.facing;
    rig.heightAt = heaven.heightAt;
    rig.yaw = a.facing;
    // He comes up facing the glory: the camera first looks to it, then
    // settles in behind him (straight in behind him for reduced motion).
    if (reducedMotion) rig.snap(); else rig.beginIntro(heaven.focus, 4.2);
    heavenKit.wayfinding.cancel();
    passage = 'arriving';
    t = 0;
    armedHead = false;
    heavenTime = 0;
  }

  function beginLeaving() {
    passage = 'leaving';
    t = 0;
    veilFrom = veil;
    if (heavenKit) heavenKit.wayfinding.cancel();
  }

  function enterEden(from) {
    if (heavenKit) heavenKit.scene.remove(character.group);
    if (character.group.parent !== edenKit.scene) edenKit.scene.add(character.group);
    now = 'eden';
    document.body.classList.remove('realm-heaven');
    rig.heightAt = edenKit.heightAt;
    climbH = from;
    ladderPoint(climbH, _pt);
    character.setSitting(false);
    character.setClimbing(true, 1);
    pos.set(_pt.x, _pt.y, _pt.z - IN_FRONT);
    character.group.rotation.y = 0;
    rig.yaw = 0;
    rig.snap();
    edenKit.wayfinding.cancel();
    passage = 'down';
    t = 0;
    downFrom = from;
    downTime = clamp(from * (DOWN_TIME / DOWN_FROM), 1.2, DOWN_TIME);
    veilFrom = veil;
    armed = false;
  }

  function updateHeaven(dt) {
    if (!heaven || failed) return;
    heavenTime += dt;
    guarded('update', () => {
      if (debug === 'heavenFault' && heavenTime > 1.5) throw new Error('forced heaven fault (debug=heavenFault)');
      heaven.update(dt, pos);
    });
  }

  // Once a frame, after the walker has moved.
  function update(dt) {
    t += dt;
    switch (passage) {
      case null:
        if (now === 'eden') {
          const d = distTo(LADDER_FOOT);
          if (d < PRELOAD) startBuilding();
          if (!armed && d > REARM) armed = true;
          if (armed && !failed && d < TRIGGER && character.speed > MIN_SPEED) beginClimb();
        } else {
          updateHeaven(dt);
          if (now !== 'heaven' || passage) break;   // a fault has begun the way home
          const d = distTo(heaven.ladderHead);
          if (!armedHead && d > REARM) armedHead = true;
          if (armedHead && d < HEAD_TRIGGER && character.speed > MIN_SPEED) beginLeaving();
        }
        break;

      case 'up': {
        // Onto the ladder and round to face it; then up, the veil gathering.
        const k = smoothstep(0, ONTO, t);
        climbH = CLIMB_RATE * Math.max(0, t - ONTO * 0.5);
        ladderPoint(climbH, _pt);
        pos.x = lerp(start.x, _pt.x, k);
        pos.z = lerp(start.z, _pt.z - IN_FRONT, k);
        pos.y = lerp(start.y, _pt.y, k);
        character.group.rotation.y = start.yaw + shortestAngle(start.yaw, 0) * k;
        character.setClimbing(true, t > ONTO * 0.5 ? 1 : 0);
        rig.yaw += shortestAngle(rig.yaw, 0) * (1 - Math.exp(-2.5 * dt));
        setVeil(smoothstep(CLIMB_TIME - VEIL_UP_IN, CLIMB_TIME, t));
        if (t >= CLIMB_TIME) { passage = 'veiled'; t = 0; }
        break;
      }

      case 'veiled':
        setVeil(1);
        character.setClimbing(true, 0);
        if (built && !failed) {
          enterHeaven();
        } else if (failed || t > WAIT_MAX) {
          if (!failed) fault('wait', new Error('heaven was not ready in time'));
          // Back down the way he came, the veil lifting over the garden.
          enterEden(climbH);
        }
        break;

      case 'arriving':
        setVeil(1 - smoothstep(0, VEIL_UP_OUT, t));
        updateHeaven(dt);
        if (passage === 'arriving' && t >= VEIL_UP_OUT) passage = null;
        break;

      case 'leaving':
        setVeil(lerp(veilFrom, 1, smoothstep(0, VEIL_DOWN_IN, t)));
        updateHeaven(dt);
        if (t >= VEIL_DOWN_IN) enterEden(DOWN_FROM);
        break;

      case 'down': {
        const k = smoothstep(0, downTime, t);
        climbH = downFrom * (1 - k);
        ladderPoint(climbH, _pt);
        pos.set(_pt.x, _pt.y, _pt.z - IN_FRONT);
        character.setClimbing(true, k < 1 ? 1 : 0);
        rig.yaw += shortestAngle(rig.yaw, 0) * (1 - Math.exp(-2.5 * dt));
        setVeil(veilFrom * (1 - smoothstep(0, VEIL_DOWN_OUT, t)));
        if (t >= downTime) {
          character.setClimbing(false);
          passage = 'stepping';
          t = 0;
        }
        break;
      }

      case 'stepping':
        // He steps back off the foot toward home (main.js walks him, from
        // drive()), coming toward the camera with the ladder rising behind
        // him; the camera holds where it is, on the garden's side.
        setVeil(0);
        if (distTo(LADDER_FOOT) >= STEP_OFF || t > STEP_MAX) passage = null;
        break;
    }
  }

  // What the walker is made to do this frame, overriding the player's input,
  // or null when he is free: held still on the ladder or under the veil, or
  // walked off the foot after coming down.
  function drive() {
    if (passage === null) return null;
    return passage === 'stepping' ? STEP_AWAY : HOLD;
  }

  // The line under the screen: in heaven, the saint drawn near to; by the
  // ladder, its name.
  function caption() {
    if (now === 'heaven') {
      const c = heaven ? guarded('caption', () => heaven.caption(), null) : null;
      if (c) return c;
      if (heaven && distTo(heaven.ladderHead) < 3.6) return { name: 'Sullam', label: 'the ladder, down to the garden' };
      return null;
    }
    // "This is none other but the house of God, and this is the gate of
    // heaven" (Genesis 28:17).
    if (passage === 'up' || passage === 'veiled') return { name: 'Beth-el', label: 'the gate of heaven' };
    if (distTo(LADDER_FOOT) < 6) return { name: 'Sullam', label: 'the ladder' };
    return null;
  }

  return {
    update,
    drive,
    caption,
    fault,
    kit: () => (now === 'heaven' && heavenKit ? heavenKit : edenKit),
    get now() { return now; },
    get idle() { return passage === null; },
    state() {
      return { now, passage, climbing: character.climbing, built, failed, failure, veil };
    },
    heavenState() {
      return heaven ? guarded('state', () => heaven.state(), null) : null;
    },
  };
}
