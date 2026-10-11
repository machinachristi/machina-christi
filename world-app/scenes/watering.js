// "For the LORD God had not caused it to rain upon the earth, and there was
// not a man to till the ground. But there went up a mist from the earth, and
// watered the whole face of the ground" (Genesis 2:5-6) — and "the LORD God
// took the man, and put him into the garden of Eden to dress it and to keep
// it" (Genesis 2:15).
//
// The first of Adam's own work in the garden. Here and there on the meadow,
// a short walk up from the river, lies a patch of bare, dry ground. Go down
// to the river — wade in, or stand a moment at the water's edge — and he
// takes up water in his cupped hands (Mayim, water) and carries it. Walk to
// a dry patch and stand still on it, and he lets it go: a mist goes up off
// the ground, the patch darkens and greens, and a few flowers come up out of
// it (Adamah, the ground). One gesture each — walking up and standing still
// — with no score, no timer, no way to fail: the work is joy.
//
// The garden remembers him. A watered patch stays green for a day, then
// slowly goes back to dry ground over the next, and that is kept in the
// browser (localStorage `camino_tended`, a timestamp per patch) so a patch
// he watered is still green when he comes back. If storage is unavailable
// the garden simply forgets between visits; nothing else changes.
//
// Three draw calls at most: every patch is one merged mesh whose colours are
// rewritten only while a patch is changing, the flowers are one
// InstancedMesh, and the mist is one small Points cloud drawn only while it
// rises. The water in his hands belongs to the figure (character.js).

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32, damp, smoothstep } from '../util.js';

const PATCHES = 6;
const PATCH_R = 1.5;            // a patch's own radius
const FROM_RIVER = [5, 14];     // a short walk up from the water
const FROM_HEART = [9, 38];     // out of the sacred clearing, short of the rim
const APART = 9;                // patches at least this far from one another
const CLEAR_TREE = 3.4;         // …and from any planted tree
const CLEAR_SPOT = 2.6;         // …and from anything else that has a name
const LIFT = 0.06;              // over the ground, with a polygon offset for the rest

const STILL_SPEED = 0.25;       // m/s; slower than this he is standing
const DIP_AFTER = 0.5;          // seconds standing at the brink to take up water
const BRINK = 0.9;              // this near the water's edge is the brink
const POUR_AFTER = 0.6;         // seconds standing on a dry patch to water it
const CAPTION_FOR = 3.5;        // seconds a caption is shown

const HOLD = 24 * 3600e3;       // a watered patch stays green for a day…
const FADE = 24 * 3600e3;       // …and goes back to dry ground over the next
const KEY = 'camino_tended';

const MIST = 40;
const MIST_LIFE = 2.6;

const DRY = [0xB9A46F, 0xA99564, 0xC4B07C].map(c => new THREE.Color(c));
// Fresher than the meadow round it, so a tended patch still reads as tended.
const WET = [0x72B85A, 0x82C566, 0x66AD4E].map(c => new THREE.Color(c));
const STEM = new THREE.Color(0x5A8A45);
const PETAL = new THREE.Color(0xFFFFFF);    // tinted per flower by instanceColor
const TINTS = [0xF6F0DA, 0xF3D86A, 0xC9B8EE, 0xF2B9C4].map(c => new THREE.Color(c));

function flowerGeometry() {
  return mergeColored([
    { geo: new THREE.CylinderGeometry(0.016, 0.022, 0.4, 4).toNonIndexed().translate(0, 0.2, 0), color: STEM },
    { geo: new THREE.IcosahedronGeometry(0.1, 0).scale(1, 0.45, 1).translate(0, 0.42, 0), color: PETAL },
  ]);
}

function readMemory() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function writeMemory(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* forgets between visits */ }
}

// How green a patch watered at `at` (ms since the epoch, or 0) stands `now`.
function tendedOf(at, now) {
  if (!at || !(at <= now)) return 0;
  const age = now - at;
  return 1 - smoothstep(HOLD, HOLD + FADE, age);
}

// treeSpots: vegetation's planted trees; avoid: every other named thing.
export function createWatering(scene, treeSpots, avoid) {
  // Own seeded stream: nothing already planted shifts.
  const rng = mulberry32(20260847);

  const patches = [];
  for (let tries = 0; patches.length < PATCHES && tries < 600; tries++) {
    const a = rng() * Math.PI * 2;
    const r = FROM_HEART[0] + rng() * (FROM_HEART[1] - FROM_HEART[0]);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const d = riverEdgeDist(x, z);
    if (d < FROM_RIVER[0] || d > FROM_RIVER[1]) continue;
    if (patches.some(p => Math.hypot(p.x - x, p.z - z) < APART)) continue;
    if (treeSpots.some(t => Math.hypot(t.x - x, t.z - z) < CLEAR_TREE)) continue;
    if (avoid.some(s => {
      const p = s.group ? s.group.position : s.pos;
      return p && Math.hypot(p.x - x, p.z - z) < CLEAR_SPOT;
    })) continue;
    patches.push({ x, z, wet: 0, want: 0, at: 0, first: 0, count: 0 });
  }

  // Each patch an irregular disc laid over the ground: a centre, an inner
  // ring and a ragged outer one, every triangle its own shade of dry earth
  // and of fresh grass, so the faceted look holds through the change.
  const parts = [];
  for (const P of patches) {
    const SEG = 16;
    const rim = [];
    for (let k = 0; k < SEG; k++) rim.push(PATCH_R * (0.8 + rng() * 0.35));
    const pt = (k, ring) => {
      const a = (k % SEG) / SEG * Math.PI * 2;
      const rr = ring === 0 ? 0 : ring === 1 ? rim[k % SEG] * 0.5 : rim[k % SEG];
      const x = P.x + Math.cos(a) * rr, z = P.z + Math.sin(a) * rr;
      return [x, heightAt(x, z) + LIFT, z];
    };
    const tris = [];
    for (let k = 0; k < SEG; k++) {
      tris.push([pt(0, 0), pt(k + 1, 1), pt(k, 1)]);
      tris.push([pt(k, 1), pt(k + 1, 1), pt(k + 1, 2)]);
      tris.push([pt(k, 1), pt(k + 1, 2), pt(k, 2)]);
    }
    P.first = parts.length;
    for (const t of tris) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(t.flat(), 3));
      const pick = Math.floor(rng() * 3);
      parts.push({ geo: g, color: DRY[pick], wet: WET[(pick + Math.floor(rng() * 2)) % 3] });
    }
    P.count = parts.length - P.first;
  }
  const geo = mergeColored(parts);
  for (const p of parts) p.geo.dispose();
  const colors = geo.attributes.color;
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  const ground = new THREE.Mesh(geo, material);
  scene.add(ground);

  // The flowers that come up out of a watered patch.
  const blooms = [];
  patches.forEach((P, i) => {
    for (let k = 0; k < 9; k++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * PATCH_R * 0.7;
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      blooms.push({ patch: i, x, y: heightAt(x, z) + LIFT, z, yaw: rng() * Math.PI * 2, size: 0.8 + rng() * 0.5, tint: TINTS[Math.floor(rng() * TINTS.length)] });
    }
  });
  const flowerMesh = new THREE.InstancedMesh(
    flowerGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    blooms.length,
  );
  flowerMesh.frustumCulled = false;
  blooms.forEach((b, i) => flowerMesh.setColorAt(i, b.tint));
  scene.add(flowerMesh);

  // The mist that goes up off the ground as it is watered: offsets drawn
  // once, here, so the update never draws from the stream.
  const mistSeeds = [];
  for (let i = 0; i < MIST; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * PATCH_R * 0.9;
    mistSeeds.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r, up: 0.7 + rng() * 0.9, drift: (rng() - 0.5) * 0.4, delay: rng() * 0.5 });
  }
  const mistPos = new Float32Array(MIST * 3);
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  // A soft round dot (dew.js's), not the hard square a bare point draws.
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const g2 = dot.getContext('2d');
  const grad = g2.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, 'rgba(240, 246, 248, 1)');
  grad.addColorStop(1, 'rgba(240, 246, 248, 0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 32, 32);
  const mistMat = new THREE.PointsMaterial({
    color: 0xEEF4F6, size: 0.75, map: new THREE.CanvasTexture(dot),
    transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true,
  });
  const mist = new THREE.Points(mistGeo, mistMat);
  mist.frustumCulled = false;
  mist.visible = false;
  scene.add(mist);
  let mistAt = null;
  let mistT = 0;

  // What the garden remembers of him.
  const memory = readMemory();
  const now0 = Date.now();
  patches.forEach((P, i) => {
    const at = Number(memory[i]) || 0;
    P.at = at;
    P.want = tendedOf(at, now0);
    P.wet = P.want;            // remembered green is green from the first frame
  });

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const shown = patches.map(() => -1);
  const _c = new THREE.Color();

  function paint(i) {
    const P = patches[i];
    const w = P.wet;
    for (let k = P.first; k < P.first + P.count; k++) {
      _c.copy(parts[k].color).lerp(parts[k].wet, w);
      for (let v = 0; v < 3; v++) colors.setXYZ(k * 3 + v, _c.r, _c.g, _c.b);
    }
    colors.needsUpdate = true;
    const bloom = smoothstep(0.45, 1, w);
    blooms.forEach((b, j) => {
      if (b.patch !== i) return;
      _p.set(b.x, b.y, b.z);
      _q.setFromEuler(_e.set(0, b.yaw, 0));
      _s.setScalar(Math.max(bloom * b.size, 1e-4));
      flowerMesh.setMatrixAt(j, _m.compose(_p, _q, _s));
    });
    flowerMesh.instanceMatrix.needsUpdate = true;
    shown[i] = w;
  }

  let carrying = false;
  let still = 0;
  let speed = 0;
  let last = null;
  let dips = 0;
  let watered = 0;
  let caption = null;
  let captionLeft = 0;
  let clock = 0;
  let recheck = 0;

  const WATER = { name: 'Mayim', label: 'water' };
  const GROUND = { name: 'Adamah', label: 'the ground, watered' };

  function say(c) { caption = c; captionLeft = CAPTION_FOR; }

  function pour(i, P) {
    carrying = false;
    P.at = Date.now();
    P.want = 1;
    watered++;
    writeMemory(patches.map(p => p.at));
    mistAt = P;
    mistT = 0;
    say(GROUND);
  }

  function update(dt, walker) {
    clock += dt;
    if (walker) {
      if (last) speed = damp(speed, Math.hypot(walker.x - last.x, walker.z - last.z) / Math.max(dt, 1e-4), 10, dt);
      last = last || new THREE.Vector3();
      last.copy(walker);
      still = speed < STILL_SPEED ? still + dt : 0;

      const edge = riverEdgeDist(walker.x, walker.z);
      const wading = heightAt(walker.x, walker.z) < -0.6 && edge < 0.01;
      if (wading || (edge < BRINK && still >= DIP_AFTER)) {
        // Only while some ground is still dry: with every patch green there
        // is nothing to carry water to, and his hands stay free.
        if (!carrying && patches.some(P => P.want < 0.5)) { carrying = true; dips++; say(WATER); }
      } else if (carrying && still >= POUR_AFTER) {
        for (let i = 0; i < patches.length; i++) {
          const P = patches[i];
          if (P.want < 0.5 && Math.hypot(walker.x - P.x, walker.z - P.z) < PATCH_R + 0.4) { pour(i, P); break; }
        }
      }
    }

    // Once a second, ask the clock how green each remembered patch should
    // now stand (only a day's turn ever moves it).
    recheck -= dt;
    if (recheck <= 0) {
      recheck = 1;
      const now = Date.now();
      for (const P of patches) if (P.want !== 1 || now - P.at > HOLD) P.want = tendedOf(P.at, now);
    }

    patches.forEach((P, i) => {
      P.wet = damp(P.wet, P.want, P.want > P.wet ? 0.7 : 0.2, dt);
      if (Math.abs(P.wet - P.want) < 0.002) P.wet = P.want;
      if (Math.abs(P.wet - shown[i]) > 0.003 || (P.wet === P.want && shown[i] !== P.wet)) paint(i);
    });

    if (mistAt) {
      mistT += dt;
      const fade = 1 - smoothstep(MIST_LIFE * 0.45, MIST_LIFE, mistT);
      mist.visible = true;
      mistMat.opacity = 0.6 * smoothstep(0, 0.25, mistT) * fade;
      mistSeeds.forEach((m, i) => {
        const u = Math.max(0, mistT - m.delay) / MIST_LIFE;
        const x = mistAt.x + m.dx * (1 + u * 0.5) + m.drift * u;
        const z = mistAt.z + m.dz * (1 + u * 0.5);
        mistPos[i * 3] = x;
        mistPos[i * 3 + 1] = heightAt(x, z) + 0.1 + m.up * u;
        mistPos[i * 3 + 2] = z;
      });
      mistGeo.attributes.position.needsUpdate = true;
      if (mistT >= MIST_LIFE) { mistAt = null; mist.visible = false; }
    }

    if (captionLeft > 0) {
      captionLeft -= dt;
      if (captionLeft <= 0) caption = null;
    }
  }
  patches.forEach((_, i) => paint(i));

  return {
    update,
    get carrying() { return carrying; },
    caption: () => caption,
    state: () => ({
      carrying, dips, watered,
      tended: patches.filter(P => P.wet > 0.5).length,
      misting: !!mistAt,
      patches: patches.map(P => ({ x: P.x, z: P.z, wet: P.wet })),
    }),
  };
}
