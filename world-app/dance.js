// "Praise him with the timbrel and dance" (Psalm 150:4)
//
// Tap him, and he dances for joy (v38): arms flung up and wide, light
// skipping steps, two whole turns and a leap, and a bow at the end — about
// five and a half seconds, to a timbrel and a harp (Psalm 149:3). Petals are
// flung up out of the meadow round him in a turning spiral as he whirls and
// drift down again after, and while he dances the lambs leap about him and
// his companion, if she is near, turns to him and dances too. Tap him again
// when he has bowed and he dances again, the other way round. Any drag, or
// a tap anywhere else, and he simply stops.
//
// A tap on him used to send him to walk to the ground under his own feet,
// so this takes nothing away from tapping to walk.
//
// The petals are one `Points` draw, each petal worked out wholly in the
// vertex shader from when and where it was flung up, and drawn only while
// any is in the air — so the garden's opening shot never pays for them.

import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';
import { DANCE_LEN, DANCE_STEP, LEAP } from './character.js';

const PETALS = 360;
const PETAL_LIFE = 3.6;          // seconds each petal is in the air
const PETAL_SPREAD = 3.0;        // seconds over which the petals are flung up
const GONE = -1e4;               // a petal's birth time while it is not in the air
// The timbrel: a stroke as each foot comes down from a skipping step (the
// left foot's the stronger), none while he is up in the leap, and one as he
// lands from it.
const STROKES = [];              // [seconds into the dance, accented]
for (let n = 1; n * DANCE_STEP < LEAP[0] - 0.05; n++) STROKES.push([n * DANCE_STEP, n % 2 === 1]);
STROKES.push([LEAP[1], true]);
// The harp's tune, on the strong strokes: steps of the garden's own E
// pentatonic (audio.js's HARP_STEPS, 5 = E5) climbing to the top E as he
// leaps, and coming home as he bows.
const CLIMB = [5, 7, 8, 7, 8, 9, 8, 9];
const NOTES = [];                // [seconds into the dance, harp step]
for (const [at, strong] of STROKES) {
  if (strong && at < LEAP[0]) NOTES.push([at, CLIMB[NOTES.length % CLIMB.length]]);
}
NOTES.push([LEAP[0], 10], [LEAP[1], 8], [5.1, 5]);
const COMPANION_NEAR = 14;       // she dances along if she is within this many metres
const COMPANION_LAG = 0.4;       // …a moment after him, turning the other way
const CAPTION = { name: 'Betof umachol', label: 'with the timbrel and dance' };
const CAPTION_FOR = 4.5;

const _foot = new THREE.Vector3();
const _head = new THREE.Vector3();

export function createDance({ scene, camera, canvas, character, seed = 20260865 }) {
  const rng = mulberry32(seed);

  // ── The petals ──
  // aSeed: x when in the dance it is flung up, y how far out it goes, z how
  // high, w its own flutter. aTint picks its colour. Each petal also keeps
  // its own aBorn (when it was flung up, on the petals' clock) and aFrom
  // (where — the dancer's feet — and in w which way he was turning), so a
  // dance begun while the last one's petals are still coming down only
  // flings up those already down, and none is ever snatched out of the air.
  const geo = new THREE.BufferGeometry();
  const seeds = new Float32Array(PETALS * 4);
  const tints = new Float32Array(PETALS * 3);
  const pos = new Float32Array(PETALS * 3);
  const born = new Float32Array(PETALS).fill(GONE);
  const from = new Float32Array(PETALS * 4);
  const PALETTE = [
    [1.0, 0.97, 0.93],   // almond white
    [0.99, 0.78, 0.82],  // blush
    [1.0, 0.86, 0.45],   // gold
    [0.84, 0.74, 0.96],  // lilac
    [1.0, 0.66, 0.6],    // pomegranate flower
  ];
  for (let i = 0; i < PETALS; i++) {
    seeds[i * 4] = rng();
    seeds[i * 4 + 1] = rng();
    seeds[i * 4 + 2] = rng();
    seeds[i * 4 + 3] = rng() * Math.PI * 2;
    const c = PALETTE[Math.floor(rng() * PALETTE.length) % PALETTE.length];
    tints.set(c, i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
  const bornAttr = new THREE.BufferAttribute(born, 1);
  const fromAttr = new THREE.BufferAttribute(from, 4);
  geo.setAttribute('aBorn', bornAttr);
  geo.setAttribute('aFrom', fromAttr);
  const uniforms = {
    uNow: { value: 0 },
    uNight: { value: 0 },
    uScale: { value: 400 },   // the screen's height in device pixels, near enough
    uRatio: { value: 1 },     // device pixels to a CSS pixel
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      attribute vec3 aTint;
      attribute float aBorn;
      attribute vec4 aFrom;
      uniform float uNow;
      uniform float uScale;
      uniform float uRatio;
      varying vec3 vTint;
      varying float vAlpha;
      varying float vSpin;
      void main() {
        float flung = aSeed.x * ${PETAL_SPREAD.toFixed(2)};
        float a = uNow - aBorn;
        float life = clamp(a / ${PETAL_LIFE.toFixed(2)}, 0.0, 1.0);
        // Flung up and out from round his hips in a turning spiral, the
        // spiral going the way he turns, then drifting down as it slows.
        // (His turn takes the facing (sin, cos) round toward −angle in this
        // x–z plane, so the spiral's angle runs against aFrom.w.)
        float reach = 0.35 + (1.4 + 3.2 * aSeed.y) * (1.0 - (1.0 - life) * (1.0 - life));
        float ang = aSeed.w - aFrom.w * (flung * 2.6 + 3.4 * sqrt(life));
        float rise = (1.6 + 2.6 * aSeed.z) * sin(min(life, 1.0) * 2.4) * 0.9;
        float flutter = sin(a * 6.0 + aSeed.w * 3.0) * 0.12 * life;
        vec3 p = aFrom.xyz + vec3(cos(ang) * reach + flutter, 0.7 + rise, sin(ang) * reach - flutter);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float alive = step(0.0, a) * step(life, 0.999);
        vAlpha = alive * smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.62, 1.0, life));
        vTint = aTint;
        vSpin = a * (2.0 + 3.0 * aSeed.z) + aSeed.w;
        gl_PointSize = alive * min(uScale * (0.095 + 0.06 * aSeed.y) / max(-mv.z, 0.5), 22.0 * uRatio);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uNight;
      varying vec3 vTint;
      varying float vAlpha;
      varying float vSpin;
      void main() {
        // A small turning petal: an ellipse narrowed along its own spin.
        vec2 q = gl_PointCoord - 0.5;
        float c = cos(vSpin), s = sin(vSpin);
        q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
        q.y *= 2.1;
        float d = dot(q, q) * 4.0;
        if (d > 1.0 || vAlpha < 0.01) discard;
        // By night they glow faintly, like the blossom round his feet.
        vec3 col = vTint * mix(1.0, 0.55, uNight) + vec3(0.32, 0.3, 0.22) * uNight;
        gl_FragColor = vec4(col, vAlpha * (1.0 - 0.5 * d));
      }
    `,
  });
  const petals = new THREE.Points(geo, mat);
  petals.frustumCulled = false;   // every petal's place is the shader's
  // Left showing (every petal down, so nothing is drawn) for main.js's
  // warm-up frame, so the shader is compiled then and not at the first
  // dance; the first update hides it.
  petals.visible = true;
  petals.renderOrder = 2;
  scene.add(petals);

  let t = -1;            // seconds into the dance, or −1
  let dir = 1;
  let clock = 0;         // the petals' own clock, seconds
  let airUntil = 0;      // …on which the last petal now in the air comes down
  let times = 0;
  let beats = 0;         // timbrel strokes so far
  let accent = false;    // whether the last was a strong one
  let notes = 0;         // harp notes so far
  let note = NOTES[0][1];
  let strokeAt = 0;      // the next stroke of this dance…
  let noteAt = 0;        // …and the next note
  let leaps = 0;
  let leapt = false;     // whether this dance's leap has been taken
  let captionLeft = 0;
  let companionDances = false;
  let companionT = 0;    // her own time in the dance; starts below 0 (she waits a moment)

  // Whether a tap at this screen point is a tap on him: near the line from
  // his feet to the top of his head as the camera sees him, allowing a
  // fingertip's width round it. A tap on the grass beside him still walks.
  function onHim(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const p = character.group.position;
    _foot.set(p.x, p.y + 0.05, p.z).project(camera);
    _head.set(p.x, p.y + 1.85, p.z).project(camera);
    if (_foot.z > 1 || _head.z > 1 || _foot.z < -1) return false;   // behind the camera
    const fx = rect.left + (_foot.x + 1) / 2 * rect.width;
    const fy = rect.top + (1 - _foot.y) / 2 * rect.height;
    const hx = rect.left + (_head.x + 1) / 2 * rect.width;
    const hy = rect.top + (1 - _head.y) / 2 * rect.height;
    const lx = hx - fx, ly = hy - fy;
    const len2 = lx * lx + ly * ly;
    if (len2 < 1) return false;
    const along = ((clientX - fx) * lx + (clientY - fy) * ly) / len2;
    if (along < -0.06 || along > 1.08) return false;
    const across = Math.abs((clientX - fx) * ly - (clientY - fy) * lx) / Math.sqrt(len2);
    return across < Math.max(24, Math.sqrt(len2) * 0.3);
  }

  // Every petal already down is flung up afresh from where he dances, each
  // at its own moment; those still in the air keep on as they were.
  function fling(p) {
    for (let i = 0; i < PETALS; i++) {
      if (born[i] <= clock && clock < born[i] + PETAL_LIFE) continue;
      born[i] = clock + seeds[i * 4] * PETAL_SPREAD;
      from[i * 4] = p.x;
      from[i * 4 + 1] = p.y;
      from[i * 4 + 2] = p.z;
      from[i * 4 + 3] = dir;
    }
    settle();
  }

  // Cut short: the petals not yet flung up stay down.
  function withhold() {
    for (let i = 0; i < PETALS; i++) if (born[i] > clock) born[i] = GONE;
    settle();
  }

  function settle() {
    airUntil = 0;
    for (let i = 0; i < PETALS; i++) airUntil = Math.max(airUntil, born[i] + PETAL_LIFE);
    bornAttr.needsUpdate = true;
    fromAttr.needsUpdate = true;
  }

  // Begin the dance where he stands (main.js decides whether he may).
  // companionFree: whether she is out of the water, free to dance too.
  function start(companionPos, companionFree = true) {
    if (t >= 0) return false;
    t = 0;
    dir = times % 2 === 0 ? 1 : -1;
    times++;
    strokeAt = 0;
    noteAt = 0;
    leapt = false;
    captionLeft = CAPTION_FOR;
    const p = character.group.position;
    fling(p);
    companionDances = !!companionPos && companionFree
      && Math.hypot(companionPos.x - p.x, companionPos.z - p.z) < COMPANION_NEAR;
    companionT = -COMPANION_LAG;
    character.setDance(0, dir);
    return true;
  }

  // Let the dance go wherever it has got to — he turns back to face forward,
  // and so does she, and the dance's word goes with it.
  function stop() {
    if (t < 0) return;
    t = -1;
    character.setDance(null);
    companionDances = false;
    captionLeft = 0;
    withhold();
  }

  function update(dt, night = 0) {
    if (t >= 0) {
      t += dt;
      while (strokeAt < STROKES.length && t >= STROKES[strokeAt][0]) {
        accent = STROKES[strokeAt++][1];
        beats++;
      }
      while (noteAt < NOTES.length && t >= NOTES[noteAt][0]) {
        note = NOTES[noteAt++][1];
        notes++;
      }
      if (!leapt && t >= LEAP[0]) { leapt = true; leaps++; }
      if (t >= DANCE_LEN) {
        // Bowed: the dance is done. She finishes hers a moment after.
        t = -1;
        character.setDance(null);
      } else {
        character.setDance(t, dir);
      }
    }
    if (companionDances) {
      companionT += dt;
      if (companionT >= DANCE_LEN) companionDances = false;
    }
    captionLeft = Math.max(0, captionLeft - dt);
    clock += dt;
    petals.visible = clock < airUntil;
    // With every petal down, the clock starts again from nothing (and each
    // petal is left long gone on it), so it never grows large enough to blur.
    if (!petals.visible && t < 0 && clock > 600) {
      clock = 0;
      born.fill(GONE);
      settle();
    }
    uniforms.uNow.value = clock;
    uniforms.uNight.value = clamp(night, 0, 1);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);   // as main.js sets the renderer
    uniforms.uRatio.value = ratio;
    uniforms.uScale.value = window.innerHeight * 0.9 * ratio;
  }

  // The companion's own time in the dance (she keeps it a moment behind
  // him, and turns the other way round), or null when she is not dancing.
  // Below 0 she has stopped to turn to him and is about to begin.
  function companion() { return companionDances ? companionT : null; }

  function caption() { return captionLeft > 0 ? CAPTION : null; }

  function state() {
    return {
      dancing: t >= 0, t: Math.max(0, t), dir, times, beats, notes,
      petals: petals.visible ? PETALS : 0,
      companion: companionDances, leaps,
    };
  }

  return {
    onHim, start, stop, update, companion, caption, state,
    get dancing() { return t >= 0; },
    get dir() { return dir; },
    get note() { return note; },
    get beats() { return beats; },
    get accent() { return accent; },
    get notes() { return notes; },
    get leaps() { return leaps; },
  };
}
