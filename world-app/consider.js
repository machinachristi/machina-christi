// "When I consider thy heavens, the work of thy fingers, the moon and the
// stars, which thou hast ordained; what is man, that thou art mindful of
// him?" (Psalm 8:3-4)
//
// Tap the sky, and he lies down on his back in the grass to look up into
// it (v34). The camera comes down beside his head and lifts with his eyes:
// by day the clouds go over and the great flock comes to wheel right above
// him (murmuration.js); by night the stars come out as his eyes grow used
// to the dark, and his eyes go to each named sign in turn (host.js). Any
// tap or drag and he gets up again. Nothing to find and nothing to finish:
// only somewhere to lie and look.
//
// A tap on the sky used to do nothing at all (wayfinding.js finds no ground
// under it), so this takes nothing away from tapping to walk.

import * as THREE from 'three';
import { clamp, shortestAngle, smoothstep } from './util.js';
import { riverEdgeDist } from './scenes/terrain.js';

const SKY_UP = 0.05;            // a tap's ray climbing at least this steeply is a tap on the sky
const ELEV = 1.02;              // where his eyes rest (radians up from the horizon), past his feet
const LOWEST = 0.5;             // …and never lower than this (host.js's LOW), nor higher than
const HIGHEST = 1.45;           // this, wherever a sign or the flock may be
const DRIFT = 0.32;             // radians the eyes idly wander either way
// The eyes turn round the sky and lift up or down it each on its own,
// gently, so going from one sign to another never swings the view through
// the very top of the sky (where a camera spins about itself).
const EASE = 0.7;               // how quickly the eyes follow where they are drawn (1/s)…
const TURN_MAX = 0.42;          // …never turning faster than this round the sky (rad/s)…
const LIFT_MAX = 0.3;           // …nor up or down it
const EYE = new THREE.Vector3(0, 0.72, -1.2);   // the camera, beside his head as he lies
const DRY = 0.3;                // he lies only this far up out of the water…
const HEAD = 0.9;               // …and never with his head (this far back) in it
const OVER_GROUND = 0.5;        // the camera keeps at least this far above the ground at his head
const WORD_AFTER = 0.8;         // seconds lying back before the word is given…
const WORD_FOR = 5;             // …and for how long

const DAY_WORD = { name: 'Shamayim', label: 'the heavens' };
const NIGHT_WORD = { name: 'Kokhavim', label: 'the stars' };

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _seen = new THREE.Vector3();

export function createConsider({ camera, canvas, character, rig, heightAt }) {
  let lying = false;
  let baseYaw = 0;          // the way he lay down facing; his eyes rest along it
  let clock = 0;
  let back = 0;             // seconds fully lain back
  let word = null;
  let wordLeft = 0;
  let times = 0;
  let yaw = 0;              // where his eyes are: round the sky…
  let elev = ELEV;          // …and up from the horizon
  const dir = new THREE.Vector3(0, 1, 0);   // the same, as a unit direction (world)
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const gaze = { lying: false, k: 0, dir };

  // Whether a tap at this screen point is a tap on the open sky: its ray
  // climbs (one that found no ground but runs out level, over the rim and
  // into the haze, is not).
  function aimsAtSky(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    return _ray.ray.direction.y > SKY_UP;
  }

  // Down onto the grass — not in the river, nor on the stones across it,
  // nor with his head in the water behind him.
  function lieDown() {
    const p = character.group.position;
    const f = character.group.rotation.y;
    if (character.wading || character.climbing || riverEdgeDist(p.x, p.z) < DRY) return false;
    if (riverEdgeDist(p.x - Math.sin(f) * HEAD, p.z - Math.cos(f) * HEAD) < 0.05) return false;
    if (!lying) {
      lying = true;
      baseYaw = f;
      // Laid down again while still getting up, his eyes carry on from
      // where they were; only a fresh lie starts afresh.
      if (character.lie < 0.05) {
        times++;
        clock = 0;
        back = 0;
        word = null;
        wordLeft = 0;
        yaw = baseYaw;
        elev = ELEV;
        aim(yaw, elev, dir);
      }
    }
    character.setLying(true);
    return true;
  }

  function rise() {
    lying = false;
    character.setLying(false);
  }

  // A unit direction from a bearing round the sky and a height up it.
  function aim(bearing, height, out) {
    const c = Math.cos(height);
    return out.set(Math.sin(bearing) * c, Math.sin(height), Math.cos(bearing) * c);
  }

  // Once a frame, before the camera. `night` 0..1 from the sky; `guide(eye,
  // out)` fills in which way something worth looking at stands from where he
  // looks (a sign, the moon, the flock come to him) and says whether there
  // is any.
  function update(dt, night, guide) {
    const lie = character.lie;
    gaze.lying = lying;
    gaze.k = smoothstep(0.45, 1, lie);
    if (lie <= 0.001) { rig.setGaze(0); return; }
    clock += dt;

    // The camera beside his head — above the ground there too, where the
    // bank rises behind him.
    const p = character.group.position;
    const s = Math.sin(baseYaw), c = Math.cos(baseYaw);
    eye.set(p.x + s * EYE.z, 0, p.z + c * EYE.z);
    const under = Math.max(heightAt(eye.x, eye.z), -0.5);
    eye.y = Math.max(p.y + EYE.y, under + OVER_GROUND);

    // Where the eyes are drawn: whatever is worth looking at, else idly
    // along the way he lay, wandering a little this way and that.
    if (!(lying && guide(eye, _seen))) {
      aim(baseYaw + DRIFT * Math.sin(clock * 0.045), ELEV + 0.1 * Math.sin(clock * 0.031), _seen);
    }
    const flat = Math.hypot(_seen.x, _seen.z);
    const toYaw = flat > 1e-4 ? Math.atan2(_seen.x, _seen.z) : yaw;
    const toElev = clamp(Math.atan2(_seen.y, flat), LOWEST, HIGHEST);
    const k = 1 - Math.exp(-EASE * dt);
    yaw += clamp(shortestAngle(yaw, toYaw) * k, -TURN_MAX * dt, TURN_MAX * dt);
    elev += clamp((toElev - elev) * k, -LIFT_MAX * dt, LIFT_MAX * dt);
    aim(yaw, elev, dir);
    look.copy(eye).addScaledVector(dir, 30);
    rig.setGaze(gaze.k, eye, look);

    // A word for what he is looking at, once he has lain back.
    if (lying && lie > 0.95) back += dt;
    if (!word && back >= WORD_AFTER) {
      word = night > 0.5 ? NIGHT_WORD : DAY_WORD;
      wordLeft = WORD_FOR;
    }
    if (wordLeft > 0) wordLeft -= dt;
  }

  // The line under the screen while he lies looking up: the word for the
  // heavens for its moment, and after it each sign's own name as his eyes
  // come to it.
  function caption(signNamed) {
    if (!lying) return null;
    return (wordLeft > 0 ? word : null) || signNamed;
  }

  function state() {
    return {
      lying,
      lie: +character.lie.toFixed(3),
      gaze: +gaze.k.toFixed(3),
      // How high his eyes are (radians up from the horizon) and which way.
      up: +elev.toFixed(3),
      yaw: +Math.atan2(dir.x, dir.z).toFixed(3),
      word: lying && wordLeft > 0 && word ? word.name : null,
      times,
    };
  }

  return {
    aimsAtSky, lieDown, rise, update, caption, state, gaze,
    get lying() { return lying; },
  };
}
