// "Let every thing that hath breath praise the LORD. Praise ye the LORD"
// (Psalm 150:6) — "Praise him, ye heavens of heavens... fruitful trees, and
// all cedars: beasts, and all cattle; creeping things, and flying fowl"
// (Psalm 148:4, 9-10).
//
// Come and stand under the boughs of the Tree of Life, and the garden
// praises. First the tree itself: its twelve fruits kindle one by one round
// the crown, a harp note for each, climbing, and its lamp gathers light at
// the root. Then the lamp flares, and a ring of gold light goes out from the
// root across the whole garden, to its rim: motes of light rise off the
// ground wherever it passes, the trees bow and shiver as it reaches them
// ("all the trees of the field shall clap their hands", Isaiah 55:12), the
// river flashes gold as it crosses, the lambs leap, and the creatures give
// their voices one after another, farther and farther off, over a swell of
// breath held on the garden's own chord. He lifts up his hands while it goes
// out (Psalm 134:2). Its word is given: Kol hanneshamah, every thing that
// hath breath.
//
// Once for each time he comes under the tree: he must walk out from under
// it again before it will answer him again.
//
// One draw while the wave is out, none the rest of the time: the motes are
// one Points mesh worked out on the graphics chip from the ring's radius
// alone; the ring on the ground is a few lines in the ground's own shader;
// the fruit, the lamp, the trees, the river and the lambs are each told
// where the ring is and answer it themselves.
//
// Its own seeded stream (20260867), drawn only at build time.

import * as THREE from 'three';
import { heightAt, GARDEN_RADIUS } from './terrain.js';
import { TREE_OF_LIFE_POS } from './vegetation.js';
import { clamp, mulberry32, smoothstep } from '../util.js';

const KINDLE_R = 4.6;       // m from the trunk: under its boughs (a tap on the tree sets him 3.5 m off)
const REARM_R = 7.5;        // m: walked out from under it again
const STILL_FOR = 0.8;      // s stood still under it before it answers
const STILL_SPEED = 0.25;   // m/s: still enough
const FRUITS = 12;
const FRUIT_FIRST = 0.25;   // s: the first fruit kindles
const FRUIT_EVERY = 0.2;    // s between the fruits
// The last fruit, a breath, and the lamp flares: the wave sets out.
export const KINDLE = FRUIT_FIRST + (FRUITS - 1) * FRUIT_EVERY + 0.35;
export const SPEED = 8;     // m/s the ring goes out
const RIM = GARDEN_RADIUS + 10;   // m: out past the rim, and it is gone into the haze
const MOTE_LIFE = 3.4;      // s a mote takes to rise and fade
const GOING = RIM / SPEED;  // s the ring takes to reach the rim
export const PRAISE_LEN = KINDLE + GOING + MOTE_LIFE;   // the last motes gone
const SETTLE = 3;           // s over which the fruit and the lamp settle back at the end
const CAPTION_FOR = 8;
const MOTES = 3000;

const CAPTION = { name: 'Kol hanneshamah', label: 'every thing that hath breath' };

// The creatures' voices as the ring passes on out (m from the tree): the
// lambs and ewes of the flock near it first, then the birds, the dove, the
// cattle, and between them the trees clapping, farther and farther off.
export const VOICES = [
  { r: 5, kind: 'lamb' }, { r: 8, kind: 'ewe' }, { r: 11, kind: 'bird' },
  { r: 14, kind: 'clap' }, { r: 17.5, kind: 'dove' }, { r: 21, kind: 'bird' },
  { r: 24.5, kind: 'clap' }, { r: 28, kind: 'ox' }, { r: 31.5, kind: 'bird' },
  { r: 35, kind: 'clap' }, { r: 39, kind: 'lamb' }, { r: 43, kind: 'bird' },
  { r: 47, kind: 'clap' },
];
// Steps up the harp's scale (audio.js harp: E major pentatonic, two octaves)
// for the twelve fruits — climbing to the top, where the last fruit strikes
// the top note again (the scale has eleven steps), just before the lamp's chime.
const FRUIT_NOTES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10];
// How loud a voice is given, by how far out the ring has gone when it is
// given: full near the tree, softer and softer toward the rim.
export function voiceLevel(r) {
  return 1 - 0.65 * smoothstep(0, RIM - 10, r);
}

// The ring on the ground, as the ground's own shader draws it: a soft band
// of gold at the ring's edge, a fainter wash of it on the ground behind, and
// a pool of light gathering round the root while the fruit kindles.
const GROUND_VERTEX_HEAD = 'varying vec2 vPraiseXZ;';
const GROUND_VERTEX_BODY = 'vPraiseXZ = (modelMatrix * vec4(transformed, 1.0)).xz;';
const GROUND_FRAGMENT_HEAD = 'uniform vec4 uPraise;\nuniform float uPraisePool;\nuniform vec3 uPraiseCol;\nvarying vec2 vPraiseXZ;';
const GROUND_FRAGMENT_BODY = /* glsl */`
  if (uPraise.w + uPraisePool > 0.0) {
    float pd = length(vPraiseXZ - uPraise.xy);
    float px = (pd - uPraise.z) / 2.4;
    float band = exp(-px * px);
    float wash = pd < uPraise.z ? 0.24 * exp(-(uPraise.z - pd) / 6.0) : 0.0;
    float pool = uPraisePool * exp(-pd * pd / 14.0);
    totalEmissiveRadiance += uPraiseCol * ((band + wash) * uPraise.w + pool);
  }`;

// The motes: each lies on the ground until the ring passes it, then rises,
// carried a little outward, and fades.
const MOTE_VERTEX = /* glsl */`
  attribute vec4 aMote;           // x, z, ground height, its own number 0..1
  uniform vec4 uRing;             // the tree's x, z; the ring's radius; strength
  uniform float uHalfH;           // half the drawing buffer's height, in pixels
  uniform float uBright;
  varying vec3 vCol;

  void main() {
    vec2 xz = aMote.xy;
    vec2 off = xz - uRing.xy;
    float d = length(off);
    float age = (uRing.z - d) / ${SPEED.toFixed(1)};   // seconds since the ring passed it
    if (age < 0.0 || age > ${MOTE_LIFE.toFixed(2)}) {
      vCol = vec3(0.0);
      gl_PointSize = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float s = aMote.w;
    float s2 = fract(s * 7.31);
    vec2 out2 = off / max(d, 0.001);
    // Up quickly at first, so the ring's edge stands up off the ground as
    // it goes, then slowly.
    float rise = (0.8 + 3.6 * s2 * s2) * (1.0 - exp(-age * 2.0));
    vec3 P = vec3(
      xz.x + out2.x * 0.7 * age + 0.22 * sin(age * 1.7 + s * 40.0),
      aMote.z + 0.12 + rise,
      xz.y + out2.y * 0.7 * age + 0.22 * cos(age * 1.3 + s * 31.0));
    vec4 mv = viewMatrix * vec4(P, 1.0);
    vec4 clip = projectionMatrix * mv;
    float dist = -mv.z;
    if (clip.w < 0.1 || abs(clip.x) > clip.w * 1.1 || abs(clip.y) > clip.w * 1.1 || dist > 110.0) {
      vCol = vec3(0.0);
      gl_PointSize = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    // Brightest the moment the ring reaches it, so the ring's edge reads as
    // a line of light going out; dimmer after, as it rises and fades. Kept
    // out of the watcher's own face: none drawn right by the camera.
    float birth = exp(-age * 2.4);
    float a = smoothstep(0.0, 0.08, age) * (0.28 + 0.72 * birth)
      * (1.0 - smoothstep(${(MOTE_LIFE * 0.4).toFixed(2)}, ${MOTE_LIFE.toFixed(2)}, age))
      * smoothstep(3.0, 9.0, dist) * (1.0 - smoothstep(60.0, 110.0, dist)) * uRing.w * uBright;
    vCol = mix(vec3(1.0, 0.66, 0.24), vec3(1.0, 0.95, 0.78), birth) * a;
    float size = (0.05 + 0.06 * s) * (1.0 + 0.9 * birth) * (1.0 + dist * 0.02);
    gl_Position = clip;
    gl_PointSize = min(2.0 * size * projectionMatrix[1][1] * uHalfH / max(dist, 0.1), uHalfH * 0.06);
  }
`;

const MOTE_FRAGMENT = /* glsl */`
  varying vec3 vCol;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    float a = exp(-r2 * 4.0) * (1.0 - smoothstep(0.7, 1.0, r2));
    gl_FragColor = vec4(vCol * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// groundMaterial: the terrain's own material (tender.js has already given it
// its own few lines; these are added after them). treeSpots: the planted
// trees, so the trees the ring has reached can be counted.
export function createPraise(scene, groundMaterial, treeSpots = []) {
  const rng = mulberry32(20260867);
  const O = TREE_OF_LIFE_POS;

  // ── The ring on the ground ───────────────────────────────
  const uPraise = { value: new THREE.Vector4(O.x, O.z, 0, 0) };
  const uPraisePool = { value: 0 };
  const uPraiseCol = { value: new THREE.Color(1.0, 0.74, 0.32) };
  const before = groundMaterial.onBeforeCompile;
  groundMaterial.onBeforeCompile = (shader, renderer) => {
    if (before) before.call(groundMaterial, shader, renderer);
    shader.uniforms.uPraise = uPraise;
    shader.uniforms.uPraisePool = uPraisePool;
    shader.uniforms.uPraiseCol = uPraiseCol;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GROUND_VERTEX_HEAD)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + GROUND_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FRAGMENT_HEAD)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GROUND_FRAGMENT_BODY);
  };
  groundMaterial.needsUpdate = true;

  // ── The motes ────────────────────────────────────────────
  // Thickest near the tree, where he stands to watch; one in every place
  // the ring passes on its way out to the rim.
  const motes = new Float32Array(MOTES * 4);
  for (let i = 0; i < MOTES; i++) {
    const r = 1.5 + rng() * (RIM - 4);
    const a = rng() * Math.PI * 2;
    const x = O.x + Math.cos(a) * r;
    const z = O.z + Math.sin(a) * r;
    // Over the river they rise off its surface, not the bed under it.
    motes.set([x, z, Math.max(heightAt(x, z), -0.5), rng()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MOTES * 3), 3));
  geo.setAttribute('aMote', new THREE.Float32BufferAttribute(motes, 4));
  const u = {
    uRing: { value: new THREE.Vector4(O.x, O.z, 0, 0) },
    uHalfH: { value: 400 },
    uBright: { value: 1 },
  };
  const mesh = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  mesh.frustumCulled = false;     // placed in the shader, far from any bounds
  mesh.visible = false;           // nothing drawn until the wave is out
  mesh.renderOrder = 3;
  const _buf = new THREE.Vector2();
  mesh.onBeforeRender = renderer => { u.uHalfH.value = renderer.getDrawingBufferSize(_buf).y / 2; };
  scene.add(mesh);

  // How far each planted tree stands from the Tree of Life, nearest first,
  // so the ones the ring has reached are counted by walking the list.
  const treeDist = treeSpots.map(s => Math.hypot(s.x - O.x, s.z - O.z)).sort((a, b) => a - b);

  let stage = 'idle';
  let t = 0;
  let armed = true;
  let stillFor = 0;
  let times = 0;
  let lit = 0;
  let voicesGiven = 0;
  let captionLeft = 0;
  let praying = false;
  let trees = 0;
  let lamp = 0;
  let pool = 0;
  let settle = 1;
  const glow = new Float32Array(FRUITS);
  // Read by the tree, the trees, the river and the flock each frame: one
  // reused object. `k` is how strongly the ring shows (0 when there is none).
  const ring = { x: O.x, z: O.z, r: 0, k: 0, on: false };
  const sung = { notes: 0, note: 0, flares: 0, voices: 0, voice: 'bird', level: 1 };

  function begin() {
    if (stage !== 'idle') return false;
    stage = 'kindling';
    t = 0;
    armed = false;
    stillFor = 0;
    lit = 0;
    voicesGiven = 0;
    trees = 0;
    times++;
    return true;
  }

  // walker: where he stands; speed: how fast he goes, m/s; free: whether he
  // may be answered just now (on his feet, not dancing); night 0..1.
  function update(dt, walker, speed = 0, free = true, night = 0) {
    const d = walker ? Math.hypot(walker.x - O.x, walker.z - O.z) : Infinity;
    // Out from under its boughs — even while the ring is still going out —
    // and it will answer him again the next time he stands there.
    if (d > REARM_R) armed = true;
    if (stage === 'idle') {
      stillFor = d < KINDLE_R && speed < STILL_SPEED && free ? stillFor + dt : 0;
      if (armed && stillFor >= STILL_FOR) begin();
    }
    if (stage === 'idle') {
      praying = false;
      ring.on = false;
      ring.k = 0;
      uPraise.value.w = 0;
      uPraisePool.value = 0;
      mesh.visible = false;
      lamp = 0;
      return;
    }

    t += dt;
    // The fruit, one after another round the crown, each with its note.
    while (lit < FRUITS && t >= FRUIT_FIRST + lit * FRUIT_EVERY) {
      sung.note = FRUIT_NOTES[lit];
      sung.notes++;
      lit++;
    }
    // Everything settles back over the last few seconds.
    settle = 1 - smoothstep(PRAISE_LEN - SETTLE, PRAISE_LEN, t);
    const wave = t - KINDLE;
    for (let i = 0; i < FRUITS; i++) {
      const at = FRUIT_FIRST + i * FRUIT_EVERY;
      if (t < at) { glow[i] = 0; continue; }
      const flash = Math.exp(-(t - at) / 0.25) + (wave >= 0 ? 0.6 * Math.exp(-wave / 0.4) : 0);
      glow[i] = Math.max(0.45 * settle, flash) * smoothstep(at, at + 0.06, t);
    }
    // The lamp gathers light while the fruit kindles, flares as the wave
    // sets out, and burns brighter than its wont until the end.
    if (wave < 0) {
      lamp = 0.25 * (t / KINDLE);
      pool = 0.55 * smoothstep(0, KINDLE, t);
    } else {
      lamp = Math.max(0.35 * settle, Math.exp(-wave / 0.6));
      pool = 0.55 * Math.exp(-wave / 0.7);
      if (sung.flares < times) sung.flares = times;   // once each time: the flare
    }

    // The ring itself, out from the root to the rim and on into the haze.
    const r = Math.max(0, wave) * SPEED;
    ring.r = r;
    ring.on = wave >= 0;
    ring.k = ring.on ? smoothstep(0, 0.35, wave) * (1 - smoothstep(RIM - 14, RIM, r)) * (1 - 0.35 * smoothstep(0, RIM, r)) : 0;
    uPraise.value.z = r;
    uPraise.value.w = ring.k;
    uPraisePool.value = pool;
    u.uRing.value.z = r;
    u.uRing.value.w = ring.on ? 1 : 0;
    u.uBright.value = 0.9 + 0.5 * night;
    mesh.visible = ring.on;
    while (trees < treeDist.length && treeDist[trees] < r) trees++;
    while (voicesGiven < VOICES.length && ring.on && VOICES[voicesGiven].r < r) {
      sung.voice = VOICES[voicesGiven].kind;
      sung.level = voiceLevel(VOICES[voicesGiven].r);
      sung.voices++;
      voicesGiven++;
    }
    if (ring.on && captionLeft === 0 && wave < dt * 1.5) captionLeft = CAPTION_FOR;
    if (captionLeft > 0) captionLeft = Math.max(0, captionLeft - dt);

    // He lifts up his hands while it goes out, if he is still under the
    // tree, standing; walk off and they come down.
    praying = t < PRAISE_LEN - 1.5 && d < KINDLE_R + 1 && speed < 0.6 && free;

    stage = t < KINDLE ? 'kindling' : wave < GOING ? 'going' : t < PRAISE_LEN ? 'settling' : 'idle';
    if (stage === 'idle') {
      captionLeft = 0;
      praying = false;
      lamp = 0;
      pool = 0;
      glow.fill(0);
      ring.on = false;
      ring.k = 0;
      uPraise.value.w = 0;
      uPraisePool.value = 0;
      mesh.visible = false;
    }
  }

  function state() {
    return {
      stage,
      t: +t.toFixed(2),
      radius: +ring.r.toFixed(2),
      armed,
      times,
      lit,
      trees,
      voices: voicesGiven,
      praying,
      motes: MOTES,
      drawn: mesh.visible,
    };
  }

  return {
    update, state,
    // How brightly fruit i of the twelve is kindled, 0..1 (and more, flaring).
    fruitGlow: i => glow[i] || 0,
    get lamp() { return lamp; },
    get active() { return stage !== 'idle'; },
    // While the fruit kindles and the ring goes out (not as it settles).
    get rising() { return stage === 'kindling' || stage === 'going'; },
    get praying() { return praying; },
    ring,
    // How far a tree at (x, z) bows outward just now, radians (bowOf below).
    bow: (x, z) => bowOf(ring, x, z),
    // For tests and the curious: the garden praises now, wherever he is.
    start: begin,
    caption: () => (captionLeft > 0 ? CAPTION : null),
    // Read every frame by main.js: one reused object, no allocation.
    song: () => sung,
  };
}

// How a tree at (x, z) bows as the ring passes it: a quick push outward,
// away from the Tree of Life, shivering back to stillness over a second and
// a half. Radians, signed along the outward direction; 0 when the ring is
// not on it.
export function bowOf(ring, x, z) {
  if (!ring.on) return 0;
  const d = Math.hypot(x - ring.x, z - ring.z);
  const age = (ring.r - d) / SPEED;
  if (age <= 0 || age > 1.6) return 0;
  return 0.2 * clamp(ring.k * 1.4, 0, 1) * Math.exp(-age * 2.6) * Math.sin(age * 10.5);
}
