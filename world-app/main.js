// The Garden of Eden — entry point. Builds the renderer and the garden,
// wires input → character → camera, reports readiness (or failure) to the
// parent shell (world.html), and exposes a tiny always-on debug accessor
// (window.__world) that the Playwright smoke suite drives.

import * as THREE from 'three';
import { createGarden } from './scenes/garden.js';
import { createCharacter } from './character.js';
import { CameraRig } from './camera-rig.js';
import { createControls } from './controls.js';
import { mulberry32 } from './util.js';

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
const garden = createGarden(scene, mulberry32(20260703));

const eve = params.get('character') === 'eve';
const character = createCharacter({ eve });
character.group.position.set(0, garden.heightAt(0, -9.5), -9.5);
// Face the heart of the garden — the sacred trees — on arrival.
character.group.rotation.y = 0;
scene.add(character.group);

const rig = new CameraRig(camera, character.group, garden.heightAt);
rig.beginIntro(garden.sacredMidpoint);

const controls = createControls(renderer.domElement, () => rig.skipIntro());

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

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  character.update(dt, controls.vector(), rig.getYaw(), garden.heightAt, garden.radius);
  updateCompanion(dt);
  rig.update(dt);
  garden.update(dt);
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
      // Live render cost, so the smoke suite can hold every future
      // refinement to the performance budget.
      render: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      },
    };
  },
  // Drop the character anywhere, for tests and debugging — lets the smoke
  // suite probe far terrain (the river's four heads, the rim) without
  // scripted walks. The walk-radius clamp still governs actual walking.
  teleport(x, z) {
    character.group.position.set(x, garden.heightAt(x, z), z);
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
