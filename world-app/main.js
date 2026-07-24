// The Garden of Eden — entry point. Builds the renderer and the garden,
// wires input → character → camera, reports readiness (or failure) to the
// parent shell (world.html), and exposes a tiny always-on debug accessor
// (window.__world) that the Playwright smoke suite drives.

import * as THREE from 'three';
import { createGarden } from './scenes/garden.js';
import { createCharacter } from './character.js';
import { CameraRig } from './camera-rig.js';
import { createControls } from './controls.js';
import { createAmbience } from './audio.js';
import { riverEdgeDist } from './scenes/terrain.js';
import { mulberry32, breathe } from './util.js';

const params = new URLSearchParams(location.search);

// Test hook: the smoke suite loads world.html?debug=forceError to prove that
// a crashed world cannot take the parent page down with it.
if (params.get('debug') === 'forceError') {
  throw new Error('forced test error (debug=forceError)');
}

function post(msg) {
  try {
    if (window.parent !== window) window.parent.postMessage(msg, '*');
  } catch (_) { /* standalone visit — no parent to tell */ }
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  post({ type: 'world:error', message: 'WebGL unavailable: ' + err.message });
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);

// Deterministic planting: the same Eden for every visitor, every reload.
// (Top-level await: the build yields between steps so the parent page's
// loading animation stays alive; a failure here surfaces as an unhandled
// rejection, which index.html relays to the shell as world:error.)
const garden = await createGarden(scene, mulberry32(20260703));

const eve = params.get('character') === 'eve';
const character = createCharacter({ eve });
character.group.position.set(0, garden.heightAt(0, -9.5), -9.5);
// Face the heart of the garden — the sacred trees — on arrival.
character.group.rotation.y = 0;
scene.add(character.group);

const rig = new CameraRig(camera, character.group, garden.heightAt);
rig.beginIntro(garden.sacredMidpoint);

const controls = createControls(renderer.domElement, () => rig.skipIntro());

// The garden's procedural soundscape — wind, near-water, birds by day,
// crickets by night. It follows the sky's clock and the walker's position.
const ambience = createAmbience();

// The naming caption (Genesis 2:19-20): a quiet line at the foot of the
// screen, filled from the garden's sense of which creature the walker has
// drawn near. CSS carries the fade; the last name lingers through it.
const naming = document.createElement('div');
naming.className = 'naming';
naming.innerHTML = '<span class="naming__name"></span><span class="naming__label"></span>';
document.body.appendChild(naming);
const namingName = naming.querySelector('.naming__name');
const namingLabel = naming.querySelector('.naming__label');
let namingShown = '';
function updateNamingCaption() {
  const given = garden.named();
  const key = given ? given.name + '·' + given.label : '';
  if (key === namingShown) return;
  namingShown = key;
  if (given) {
    namingName.textContent = given.name;
    namingLabel.textContent = given.label;
  }
  naming.classList.toggle('naming--shown', !!given);
}

// The companion — always the other one of the pair, walking on its own.
// Never wired into CameraRig, so the camera keeps following only `character`.
const companion = createCharacter({ eve: !eve });
companion.group.position.set(4.5, garden.heightAt(4.5, -8), -8);
scene.add(companion.group);

// A second seeded RNG, independent of the garden's own, so the companion's
// path stays deterministic across reloads and screenshots without disturbing
// the draw order the garden's planting already depends on.
const wanderRng = mulberry32(20260703 + 1);
const companionWander = { mode: 'pause', until: 1.5 + wanderRng() * 2, target: null };

// Graze/walk idiom borrowed from the lamb (scenes/creatures.js): pause a
// while, walk to a new spot, pause again — but driven through the same
// character.update() interface the player uses, so it gets the same turning,
// terrain-following and walk-cycle animation for free.
function updateCompanion(dt) {
  const w = companionWander;
  w.until -= dt;
  let move = { x: 0, z: 0 };

  if (w.mode === 'pause') {
    if (w.until <= 0) {
      w.mode = 'walk';
      const angle = wanderRng() * Math.PI * 2;
      const r = garden.radius * (0.25 + wanderRng() * 0.65);
      w.target = { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
      w.until = 30; // generous cap; arrival ends the walk sooner
    }
  } else {
    const dx = w.target.x - companion.group.position.x;
    const dz = w.target.z - companion.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5 || w.until <= 0) {
      w.mode = 'pause';
      w.until = 2 + wanderRng() * 4;
    } else {
      move = { x: dx / dist, z: dz / dist };
    }
  }

  // camYaw = 0: `move` is already a world-space direction, not camera-space.
  companion.update(dt, move, 0, garden.heightAt, garden.radius);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// After a backgrounded tab resumes, don't let the accumulated clock delta
// teleport the world; discard it.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clock.getDelta();
});

const clock = new THREE.Clock();
let ready = false;
const meta = { version: null };
fetch('./manifest.json')
  .then(r => (r.ok ? r.json() : null))
  .then(m => { if (m) meta.version = m.version; })
  .catch(() => { /* cosmetic only — never fatal */ });

// Warm-up frame: the first render compiles every shader and uploads every
// buffer — a one-time stall. Take it here, while the parent's veil still
// fully covers the stage, so the reveal that follows never stutters.
renderer.render(scene, camera);
await breathe();

// The reverence chime is struck once per approach to the sacred trees,
// re-armed only after the walker has properly drawn away again.
let reverent = false;

// Stillness (Genesis 2:19, the creatures drawn to the man): stand quiet by
// the water a moment and the walker settles down to sit, and the shyer
// creatures draw near; the first stir of input rises again. `forceSit` lets a
// visit be seated on command (window.__world.sit) for a deliberate rest.
const SIT_AFTER = 2.5;   // seconds of stillness by the water before sitting
let stillFor = 0;
let seated = false;
let forceSit = false;

function updateStillness(dt) {
  const v = controls.vector();
  const moving = Math.hypot(v.x, v.z) > 0.001;
  if (moving) forceSit = false;   // the first touch of input always rises
  const pos = character.group.position;
  const edge = riverEdgeDist(pos.x, pos.z);
  const byWater = edge > 0.2 && edge < 3.2;   // on the bank, not out in the water
  if (moving || (!byWater && !forceSit)) stillFor = 0;
  else stillFor += dt;
  seated = forceSit || (byWater && stillFor >= SIT_AFTER);
  character.setSitting(seated);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  updateStillness(dt);
  character.update(dt, controls.vector(), rig.getYaw(), garden.heightAt, garden.radius);
  updateCompanion(dt);
  rig.update(dt);
  const lure = seated
    ? { x: character.group.position.x, z: character.group.position.z }
    : null;
  const hour = garden.update(dt, character.group.position, lure, character.group.rotation.y);
  updateNamingCaption();
  ambience.update(dt, hour.night, character.group.position, hour.rain, garden.wind);
  if (garden.reverence > 0.6 && !reverent) {
    reverent = true;
    ambience.chime();
  } else if (garden.reverence < 0.12) {
    reverent = false;
  }
  renderer.render(scene, camera);

  if (!ready) {
    ready = true;
    document.body.dataset.worldReady = '1';
    post({ type: 'world:ready' });
  }
});

// Deliberately tiny, always-on state accessor for tests and debugging.
window.__world = {
  getState() {
    return {
      ready,
      version: meta.version,
      character: eve ? 'eve' : 'adam',
      pos: { x: character.group.position.x, y: character.group.position.y, z: character.group.position.z },
      cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      camDist: camera.position.distanceTo(character.group.position),
      companion: {
        character: eve ? 'adam' : 'eve',
        pos: { x: companion.group.position.x, y: companion.group.position.y, z: companion.group.position.z },
      },
      // The day's clock (see scenes/sky.js): t in [0,1), a named phase,
      // and how deep into night the world is.
      time: { t: garden.hour.t, phase: garden.hour.phase, night: garden.hour.night },
      // The weather (v7): how deep into a shower the garden is (0 dry → 1),
      // and where each drifting cloud presently lays its shade. `clearing`
      // (v13, Job 26:8) eases 1→0 in the minutes right after a shower passes.
      weather: { rain: garden.hour.rain, shade: garden.hour.shade, clearing: garden.hour.clearing },
      // The signs' slow wheel through the long year (Genesis 1:14), radians.
      heavens: { wheel: garden.hour.wheel },
      // The ambience (audio.js): supported/muted/actually-running.
      sound: ambience.state(),
      // The four heads' standing stones — name and where each stands.
      stones: garden.stones,
      // The stepping stones of the river crossing.
      crossing: garden.crossing,
      // The named signs of the night sky (Genesis 1:14; Job 9:9).
      constellations: garden.constellations,
      // A census of the creatures, with each flyer's present mode.
      fauna: garden.fauna(),
      // The naming (Genesis 2:19-20): the creature whose name is presently
      // given to the walker standing near it, or null apart from them all.
      naming: garden.named(),
      // Stillness (Genesis 2:19): whether the walker sits at rest by the water.
      stillness: { sitting: seated },
      // The eastward gate of light (Genesis 3:24, foreshadowed) — and how
      // strongly the keeper is presently hinted above it (v9, dawn only).
      gate: garden.gate(),
      // How many reed blades stand along the banks.
      reeds: garden.reeds,
      // Reflections on the water (v9): how many bank trees lay an impression
      // on the surface. (The gate's glint and the sky's tint are always on.)
      reflections: garden.reflections,
      // The walker's wake (v9): how many rings presently widen on the water.
      wake: garden.wake(),
      // Blossom on the wind (v9): petals adrift, and how golden the hour is.
      petals: garden.petals(),
      // Dew at first light (v9): how strongly the meadow presently glints.
      dew: garden.dew(),
      // The subtle presence near the Tree of Knowledge (Genesis 3:1): whether
      // it presently stirs the grass, and where.
      presence: garden.presence(),
      // The cool of the day (v10, Genesis 3:8 foreshadowed): how strongly
      // the evening gust presently moves through the garden, 0..1.
      wind: garden.wind,
      // The spring of Eden (v10, Genesis 2:10): where the river is first found.
      spring: garden.spring(),
      // Footprints on the banks (v10, Genesis 2:15): how many presently
      // linger in the sand.
      footprints: garden.footprints(),
      // Fruit in season (v10, Genesis 1:29): the fig and pomegranate trees
      // that bear fruit, each namable like any living thing in the garden.
      fruit: garden.fruit,
      // The tree apart at the river's bank (v12, Psalm 1:3): always fruited,
      // named the same way as any living thing in the garden.
      waterTree: garden.waterTree,
      // The stork's nest, high in her own fir tree (v13, Psalm 104:17):
      // named the same way as any living thing in the garden.
      storks: garden.storks,
      // Locust bands adrift the meadow, no king over any of them (v13,
      // Proverbs 30:27).
      locusts: garden.locusts(),
      // Low puddles glisten a while after a shower (v14, Psalm 65:10):
      // how full the ground presently stands.
      puddles: garden.puddles(),
      // Wildflowers dotting the meadow grass (v14, Genesis 1:11): a fixed
      // count, planted once.
      wildflowers: garden.wildflowers,
      // A rainbow easing in with the sky's own clearing glow after a shower
      // passes (v14, Genesis 9:13).
      rainbow: garden.rainbow(),
      // On the seventh day (v11, Genesis 2:2-3): which day of the visit this
      // is, and whether it presently keeps the deeper rest.
      sabbath: { day: garden.hour.day, active: garden.hour.sabbath },
      // "When the morning stars sang together" (v11, Job 38:7): how strongly
      // that swell presently sounds, 0 apart from it.
      morningStars: garden.hour.morningStars,
      // Gold, bdellium, and onyx where the Pishon runs (v11, Genesis 2:11-12):
      // kept for the curious — a fixed count, planted once.
      wealth: garden.wealth,
      // The sacred trees' nests (v11, Genesis 1:22): how many chicks have
      // shown themselves so far this visit.
      nests: garden.nests(),
      // Live render cost, so the smoke suite can hold every future
      // refinement to the performance budget.
      render: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      },
    };
  },
  // Jump the day's clock — 'dawn'|'morning'|'noon'|'evening'|'dusk'|'night'
  // or a number in [0,1). For tests, screenshots, and the curious.
  setTime(v) {
    const hour = garden.setTime(v);
    return { t: hour.t, phase: hour.phase, night: hour.night };
  },
  // Quiet or wake the ambience (persisted, same as the corner toggle).
  setMuted(b) {
    ambience.setMuted(b);
    return ambience.state();
  },
  // Call the rain (1), send it away (0), or hand the sky back its own
  // shower clock (null). For tests, screenshots, and the curious.
  setRain(v) {
    const hour = garden.setRain(v);
    return { rain: hour.rain };
  },
  // Jump straight to a given day (1-indexed) — for tests, and the curious
  // who don't want to wait six days for the seventh (v11, Genesis 2:2-3).
  // `null` hands the count back to the real elapsed clock.
  setDay(v) {
    const hour = garden.setDay(v);
    return { day: hour.day, sabbath: hour.sabbath };
  },
  // Sit the walker down where they stand (true) or rise again (false) — the
  // deliberate form of the stillness the water invites. For tests and rest.
  sit(on = true) {
    forceSit = !!on;
    return { sitting: forceSit };
  },
  // Call the subtle presence to stir the grass near the Tree of Knowledge
  // now, rather than waiting on its own rare clock. For a glimpse, and tests.
  stir() {
    return garden.stir();
  },
  // Drop the character anywhere, for tests and debugging — lets the smoke
  // suite probe far terrain (the river's four heads, the rim) without
  // scripted walks. The walk-radius clamp still governs actual walking.
  // Optional `facing` (radians, yaw) also turns the character, and with it
  // where the follow camera settles — screenshots become composable.
  teleport(x, z, facing) {
    character.group.position.set(x, garden.heightAt(x, z), z);
    if (typeof facing === 'number') character.group.rotation.y = facing;
    return this.getState().pos;
  },
  // Reads back a grid of drawing-buffer pixels right after an explicit
  // render, so the smoke test can prove the canvas holds a real scene.
  samplePixels(grid = 5) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    const out = [];
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const x = Math.floor(((i + 0.5) / grid) * w);
        const y = Math.floor(((j + 0.5) / grid) * h);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        out.push([px[0], px[1], px[2], px[3]]);
      }
    }
    return out;
  },
};
