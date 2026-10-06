// "Who hath divided a watercourse for the overflowing of waters, or a way
// for the lightning of thunder" (Job 38:25). When a shower is at its
// heaviest, lightning is now and then kindled in it — far off, out past the
// rim where the fog takes the land, never over the garden itself — and the
// thunder comes a while after it, the way it does: a flash, a count, and
// then the roll.
//
// The flash is its own hemisphere light, always present in the scene at
// zero so the number of lights never changes and nothing has to recompile
// when one strikes; the bolt is one jagged LineSegments rewritten in place
// for each strike and hidden the rest of the time. The thunder itself is
// the ambience's business (audio.js) — this module only says when it is
// due and how far off the strike was, through `state().strikes` and
// `state().dist`, and main.js hands the count on.

import * as THREE from 'three';
import { mulberry32, clamp } from '../util.js';

const HEAVY = 0.6;          // the shower must be this far in before it kindles
const SEGMENTS = 16;        // the main stroke's joints
const FORKS = 2;            // and a branch or two off it
const FORK_SEGMENTS = 5;
const MAX_SEGS = SEGMENTS + FORKS * FORK_SEGMENTS;
const TOP = 62;             // where the stroke leaves the cloud
const FLASH_LEN = 0.7;      // seconds from first light to the last of it
const FLASH_I = 1.5;        // how bright the garden is lit at the peak

// The light of one strike over its own short life: a first stroke, a dip,
// a return stroke a little weaker, and then out.
function flashOf(age) {
  if (age < 0 || age > FLASH_LEN) return 0;
  if (age < 0.05) return age / 0.05;
  if (age < 0.11) return 1 - (age - 0.05) / 0.06 * 0.75;
  if (age < 0.15) return 0.25 + (age - 0.11) / 0.04 * 0.55;
  return 0.8 * Math.exp(-(age - 0.15) * 7);
}

export function createLightning(scene) {
  // Own seeded stream: the strikes' clock and shapes shift nothing planted.
  const rng = mulberry32(20260838);

  const flashLight = new THREE.HemisphereLight(0xDCE4FF, 0x6E7890, 0);
  scene.add(flashLight);

  const pos = new Float32Array(MAX_SEGS * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bolt = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xF4F6FF,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,      // it stands out past the fog's own reach, and must still be seen
  }));
  bolt.visible = false;
  bolt.frustumCulled = false;   // rewritten per strike; its bounds never are
  scene.add(bolt);

  let nextIn = 2 + rng() * 4;   // the first one comes soon once the rain is heavy
  let age = Infinity;
  let strikes = 0;
  let dist = 0;
  const at = { x: 0, z: 0 };

  // Lay a fresh stroke from the cloud to the ground at (x, z): a walk down
  // that wanders sideways at every joint, and a fork or two going off it.
  function shape(x, z) {
    let n = 0;
    const put = (ax, ay, az, bx, by, bz) => {
      const o = n * 6;
      pos[o] = ax; pos[o + 1] = ay; pos[o + 2] = az;
      pos[o + 3] = bx; pos[o + 4] = by; pos[o + 5] = bz;
      n++;
    };
    let px = x + (rng() - 0.5) * 10, py = TOP, pz = z + (rng() - 0.5) * 10;
    const joints = [];
    for (let i = 1; i <= SEGMENTS; i++) {
      const k = i / SEGMENTS;
      const nx = i === SEGMENTS ? x : px + (x - px) / (SEGMENTS - i + 1) + (rng() - 0.5) * 6;
      const nz = i === SEGMENTS ? z : pz + (z - pz) / (SEGMENTS - i + 1) + (rng() - 0.5) * 6;
      const ny = TOP * (1 - k);
      put(px, py, pz, nx, ny, nz);
      joints.push([nx, ny, nz]);
      px = nx; py = ny; pz = nz;
    }
    for (let f = 0; f < FORKS; f++) {
      let [fx, fy, fz] = joints[2 + Math.floor(rng() * (SEGMENTS / 2))];
      const dx = (rng() - 0.5) * 2, dz = (rng() - 0.5) * 2;
      for (let i = 0; i < FORK_SEGMENTS; i++) {
        const nx = fx + dx * 3 + (rng() - 0.5) * 3;
        const ny = fy - 2.5 - rng() * 2.5;
        const nz = fz + dz * 3 + (rng() - 0.5) * 3;
        put(fx, fy, fz, nx, ny, nz);
        fx = nx; fy = ny; fz = nz;
      }
    }
    geo.attributes.position.needsUpdate = true;
  }

  function strike() {
    // Far off, out past the rim, in any quarter of the sky.
    const a = rng() * Math.PI * 2;
    const r = 72 + rng() * 34;
    at.x = Math.sin(a) * r;
    at.z = Math.cos(a) * r;
    dist = r;
    shape(at.x, at.z);
    age = 0;
    strikes++;
  }

  function update(dt, rain) {
    if (rain > HEAVY) {
      if ((nextIn -= dt) <= 0) {
        strike();
        nextIn = 7 + rng() * 12;
      }
    } else if (nextIn < 2) {
      // Between showers the clock waits; the next heavy rain begins afresh.
      nextIn = 2 + rng() * 4;
    }

    if (age <= FLASH_LEN) {
      age += dt;
      const f = flashOf(age);
      flashLight.intensity = f * FLASH_I;
      bolt.visible = f > 0.12;
      bolt.material.opacity = clamp(f * 1.3, 0, 1);
    } else if (flashLight.intensity !== 0) {
      flashLight.intensity = 0;
      bolt.visible = false;
    }
  }
  update(0, 0);

  return {
    update,
    state: () => ({
      strikes,
      flash: flashLight.intensity / FLASH_I,
      dist,
      x: at.x,
      z: at.z,
    }),
  };
}
