// The healing of the nations (v37): "In the midst of the street of it, and on
// either side of the river, was there the tree of life … and the leaves of the
// tree were for the healing of the nations" (Revelation 22:2); "and the fruit
// thereof shall be for meat, and the leaf thereof for medicine" (Ezekiel
// 47:12).
//
// The nations walk in at the twelve gates as golden lights (city.js). Here
// the leaves go out: from under the crown of the Tree of Life a slow stream
// of green lights, each a leaf carried, walks back out of the city through
// every one of its twelve gates and on beyond the wall to the nations — gold
// coming in, green going out, side by side. None walks through the saints:
// those bound for the gates south of the tree come out from under the crown
// north of every saint, past the end of the ranks, before they turn, so the
// stream to the gate within his reach walks down beside the golden one
// coming up.
//
// And one is his to carry. Stand still under the crown and a leaf comes down
// to him, turning as it falls, into his raised hand. Carry it to a gate and
// it goes out of his hand through the gate with the rest, and the stream
// there brightens; or stand still anywhere else with it, and he lets it go,
// and it rises and goes out over the heads of all toward the nearest gate.
// While a leaf is coming down to him or in his hand, he does not lift his
// hands to pray (song.js); once it is given, he may — and no leaf comes down
// into hands already lifted in prayer.
//
// One draw: the bearers, the leaf coming down (and its light in his hand)
// and the leaf given are one cloud of points. The bearers are moved wholly
// in the shader (where each one is, is a pure function of heaven's clock);
// the two leaves of his are placed each frame.

import * as THREE from 'three';
import { mulberry32, damp } from '../util.js';
import { TREE, RANKS } from './layout.js';

const PER_GATE = 12;
const PACE = 0.95;            // m/s, a little slower than the nations coming in
const UNDER = 5.2;            // this near the tree's middle, he stands under its crown
const RECEIVE_AFTER = 1.0;    // seconds still under it before a leaf comes down
const FALL = 2.8;             // seconds the leaf takes to come down to him
const FROM_Y = 6.6;           // where it lets go, just under the crown
const LET_GO_AFTER = 1.6;     // seconds still, away from the tree, before he lets it go
const AWAY = UNDER + 3;       // …which he does only this far from the tree
const WORD_HELD = 5;          // seconds a word stays on the line
const JUMP = 3;               // a move longer than this in one frame is a teleport
const STILL_SPEED = 0.2;

const RECEIVED = { name: 'Aleh litrufah', label: 'and the leaf thereof for medicine' };
const GIVEN = { name: 'Marpe', label: 'the leaves of the tree were for the healing of the nations' };

const GREENS = [0x2FCB6E, 0x1FB98E, 0x6CCF3A, 0x35C9A4].map(c => new THREE.Color(c));

// ways: the city's twelve gates, each { at, out, across, reach } — `at` its
// threshold inside, `out` the way on outside the wall, `across` a unit step
// along the wall, `reach` how near counts as standing at it. places: where
// the saints stand (figures.js), for the leaves to keep clear of them.
export function createHealing(scene, ways, places = []) {
  // Its own seeded stream, above every seed used in either realm.
  const rng = mulberry32(20260864);
  const pos = [], aBC = [], aD = [], aSeg = [], phases = [], rates = [], sizes = [], sways = [], colors = [];
  const lanes = [];
  // Outside the saints' last row, on the side of the street a gate lies…
  const BESIDE = RANKS.rowsX[RANKS.rowsX.length - 1] + 4;
  // …and north of the last saint standing before the tree (the ranks' odd
  // rows stand half a step on, and a saint left over stands in a rank of
  // their own), with room for a group of two or three round the place.
  let lastRank = RANKS.from + RANKS.step * (RANKS.count - 0.5);
  for (const p of places) if (Math.abs(p.x) < BESIDE && p.z < TREE.z && p.z > lastRank) lastRank = p.z;
  const CLEAR = Math.min(lastRank + 1.6, TREE.z);

  ways.forEach(way => {
    // Every gate south of the tree lies past the saints' ranks.
    const south = way.at.z < TREE.z;
    const side = way.at.x >= 0 ? 1 : -1;
    for (let i = 0; i < PER_GATE; i++) {
      let a, b;
      if (south) {
        // Under the crown on the gate's side of the river, clear of the
        // trunks, out past the end of the ranks, and only then down.
        a = new THREE.Vector2(side * (3.6 + rng() * 2), CLEAR + rng() * 1.4);
        b = new THREE.Vector2(side * (BESIDE + rng() * 1.2), CLEAR + rng() * 0.8);
      } else {
        // Under the crown on the side toward the gate, as if from its leaves.
        const toward = Math.atan2(way.at.x, way.at.z - TREE.z) + (rng() - 0.5) * 1.1;
        const r = 3.4 + rng() * 2.2;
        a = new THREE.Vector2(Math.sin(toward) * r, TREE.z + Math.cos(toward) * r);
        b = a.clone();
      }
      const across = (rng() - 0.5) * 2.2;
      const c = new THREE.Vector2(way.at.x + way.across.x * across, way.at.z + way.across.z * across);
      const d = new THREE.Vector2(way.out.x + way.across.x * across * 2, way.out.z + way.across.z * across * 2);
      const l1 = a.distanceTo(b), l2 = b.distanceTo(c), l3 = c.distanceTo(d);
      const len = l1 + l2 + l3;
      pos.push(a.x, 1.0 + rng() * 0.3, a.y);
      aBC.push(b.x, b.y, c.x, c.y);
      aD.push(d.x, d.y);
      aSeg.push(l1 / len, (l1 + l2) / len);
      phases.push((i + rng() * 0.8) / PER_GATE);
      rates.push(PACE * (0.85 + rng() * 0.3) / len);
      sizes.push(0.62 + rng() * 0.28);
      sways.push(rng() * 6.2832);
      const g = GREENS[Math.floor(rng() * GREENS.length)];
      colors.push(g.r, g.g, g.b);
      if (i === 0) lanes.push({ a, b, c, d, seg: [l1 / len, (l1 + l2) / len], phase: phases[phases.length - 1], rate: rates[rates.length - 1] });
    }
  });
  const bearers = phases.length;
  // His two: the leaf coming down to him (kind -1), and the leaf given (-2).
  for (const kind of [-1, -2]) {
    pos.push(0, 0, 0); aBC.push(0, 0, 0, 0); aD.push(0, 0); aSeg.push(0, 0);
    phases.push(0); rates.push(kind); sizes.push(0.95); sways.push(0); colors.push(0.2, 0.85, 0.35);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aBC', new THREE.Float32BufferAttribute(aBC, 4));
  geo.setAttribute('aD', new THREE.Float32BufferAttribute(aD, 2));
  geo.setAttribute('aSeg', new THREE.Float32BufferAttribute(aSeg, 2));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geo.setAttribute('aRate', new THREE.Float32BufferAttribute(rates, 1));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geo.setAttribute('aSway', new THREE.Float32BufferAttribute(sways, 1));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  const u = {
    uTime: { value: 0 },
    uHalfH: { value: 400 },
    uWalker: { value: new THREE.Vector2(0, -1e4) },
    uFall: { value: new THREE.Vector4(0, -100, 0, 0) },   // the leaf coming down: x, y, z, how seen
    uGift: { value: new THREE.Vector4(0, -100, 0, 0) },   // the leaf given
    uGlow: { value: new THREE.Vector4(0, 0, 0, 0) },      // the gate it went out at, and how bright
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      attribute vec4 aBC;
      attribute vec2 aD;
      attribute vec2 aSeg;
      attribute float aPhase;
      attribute float aRate;
      attribute float aSize;
      attribute float aSway;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uHalfH;
      uniform vec2 uWalker;
      uniform vec4 uFall;
      uniform vec4 uGift;
      uniform vec4 uGlow;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vCore;
      // Step aside from something standing at c, keeping r away from it.
      vec2 part(vec2 xz, vec2 c, float r, vec2 side) {
        vec2 off = xz - c;
        float d = length(off);
        if (d >= r) return xz;
        vec2 away = d > 0.001 ? off / d : side;
        return xz + away * (r - d) * (1.0 - 0.35 * d / r);
      }
      void main() {
        vec3 p;
        float alpha, size = aSize;
        vCore = 1.0;
        if (aRate > 0.0) {
          // Going out: under the crown, round the ranks, to the gate and
          // through it, and on beyond the wall.
          float t = fract(aPhase + uTime * aRate);
          vec2 a = position.xz, b = aBC.xy, c = aBC.zw;
          vec2 xz, dir;
          if (t < aSeg.x) {
            float s = t / max(aSeg.x, 1e-4);
            xz = mix(a, b, s); dir = b - a;
          } else if (t < aSeg.y) {
            float s = (t - aSeg.x) / max(aSeg.y - aSeg.x, 1e-4);
            xz = mix(b, c, s); dir = c - b;
          } else {
            float s = (t - aSeg.y) / max(1.0 - aSeg.y, 1e-4);
            xz = mix(c, aD, s); dir = aD - c;
          }
          dir = length(dir) > 1e-4 ? normalize(dir) : vec2(0.0, 1.0);
          vec2 side = vec2(-dir.y, dir.x);
          xz += side * sin(uTime * 0.45 + aSway) * 0.2;
          xz = part(xz, uWalker, 1.9, side);
          // Past the gate they lift a little as they go, toward the nations.
          float beyond = smoothstep(aSeg.y, 1.0, t);
          p = vec3(xz.x, position.y + beyond * 2.4 + sin(uTime * 1.4 + aSway * 3.0) * 0.05, xz.y);
          alpha = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.86, 1.0, t)) * 0.95;
          // The gate his leaf went out at: its stream brightens a while.
          float g = uGlow.w * (1.0 - smoothstep(4.0, 22.0, distance(xz, uGlow.xy)));
          alpha *= 1.0 + 1.1 * g;
          size *= 1.0 + 0.45 * g;
          vCore = 0.7;
        } else {
          // One of his: placed by the frame, its light given there too.
          vec4 at = aRate > -1.5 ? uFall : uGift;
          p = at.xyz;
          alpha = at.w;
          size *= 1.0 + 0.12 * sin(uTime * 3.1);
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vColor = aColor;
        vAlpha = alpha;
        gl_PointSize = clamp(size * projectionMatrix[1][1] * uHalfH / -mv.z, 1.5, 34.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vCore;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d) * 4.0;
        if (r2 > 1.0) discard;
        // A green leaf of light: a bright heart, and a soft gold-green glow
        // round it.
        float heart = exp(-r2 * 9.0);
        float glow = exp(-r2 * 3.0) * 0.55 + 0.08 * (1.0 - r2);
        vec3 col = mix(vColor, vec3(0.9, 1.0, 0.8), heart * 0.3 * vCore);
        float a = min(1.0, (heart * 0.8 + glow) * vAlpha);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  }));
  points.frustumCulled = false;   // moved in the shader, not where the geometry says
  points.renderOrder = 2;
  const _buf = new THREE.Vector2();
  points.onBeforeRender = renderer => { u.uHalfH.value = renderer.getDrawingBufferSize(_buf).y / 2; };
  scene.add(points);

  // ── His leaf.
  let stage = 'none';          // none | falling | holding
  let still = 0;
  let last = null;
  let speed = 0;
  let fallT = 0;
  const fallFrom = new THREE.Vector3();
  let gift = null;             // the leaf given: { path: [Vector3…], lens, len, t, dur, gate }
  let received = 0;
  let given = 0;
  let wordAt = -1e6;
  let word = null;
  let glow = 0;
  let clock = 0;
  const hand = new THREE.Vector3();

  // Where the leaf sits in his raised hand (character.js holds it there).
  function handAt(walker, facing) {
    const s = Math.sin(facing), c = Math.cos(facing);
    return hand.set(walker.x + s * 0.6 + c * 0.19, 1.5, walker.z + c * 0.6 - s * 0.19);
  }

  const nearest = { way: ways[0], dist: Infinity };
  function nearestWay(x, z) {
    nearest.dist = Infinity;
    for (const w of ways) {
      const d = Math.hypot(x - w.at.x, z - w.at.z);
      if (d < nearest.dist) { nearest.dist = d; nearest.way = w; }
    }
    return nearest;
  }

  // Let the leaf go from his hand toward a gate and out through it: at the
  // gate, low through its way with the rest; from anywhere else, rising
  // first and going out over the heads of all.
  function give(from, way, atGate) {
    const lift = atGate ? 1.6 : 6;
    const path = [from.clone()];
    if (!atGate) path.push(new THREE.Vector3(from.x, lift, from.z));
    path.push(new THREE.Vector3(way.at.x, lift, way.at.z));
    path.push(new THREE.Vector3(way.out.x, lift + 2.6, way.out.z));
    const lens = [];
    let len = 0;
    for (let i = 1; i < path.length; i++) { const l = path[i].distanceTo(path[i - 1]); lens.push(l); len += l; }
    gift = { path, lens, len, t: 0, dur: Math.max(9, len / 3.2), gate: way };
    stage = 'none';
    given++;
    word = GIVEN;
    wordAt = clock;
  }

  // dt, time: seconds, heaven's clock; walker: his position; pace: how fast
  // he walks or tries to; facing: his yaw; praying: whether his hands are
  // lifted in prayer (song.js), when no leaf comes down into them.
  function update(dt, time, walker, pace = 0, facing = 0, praying = false) {
    clock = time;
    u.uTime.value = time;
    if (walker) {
      u.uWalker.value.set(walker.x, walker.z);
      if (!last) last = { x: walker.x, z: walker.z };
      const moved = Math.hypot(walker.x - last.x, walker.z - last.z);
      last.x = walker.x; last.z = walker.z;
      if (moved > JUMP) { still = 0; speed = 0; }
      else {
        speed += (moved / Math.max(dt, 1e-4) - speed) * Math.min(1, dt * 10);
        still = speed < STILL_SPEED && pace < STILL_SPEED ? still + dt : 0;
      }
      const fromTree = Math.hypot(walker.x, walker.z - TREE.z);
      if (stage === 'none' && !gift && !praying && fromTree < UNDER && still >= RECEIVE_AFTER) {
        // A leaf lets go of the crown above him and comes down to him.
        stage = 'falling';
        fallT = 0;
        fallFrom.set(walker.x + (rng() - 0.5) * 1.2, FROM_Y, walker.z + (rng() - 0.5) * 1.2);
        received++;
        word = RECEIVED;
        wordAt = time;
      } else if (stage === 'falling') {
        fallT += dt;
        const k = Math.min(1, fallT / FALL);
        const e = k * k * (3 - 2 * k);
        handAt(walker, facing);
        // Turning as it falls, wide at first and closing in on his hand.
        const swing = (1 - k) * 0.55;
        u.uFall.value.set(
          fallFrom.x + (hand.x - fallFrom.x) * e + Math.sin(fallT * 4.2) * swing,
          fallFrom.y + (hand.y - fallFrom.y) * e,
          fallFrom.z + (hand.z - fallFrom.z) * e + Math.cos(fallT * 3.1) * swing * 0.6,
          // …settling at the light it keeps in his hand.
          Math.min(1, fallT * 3) * (1 - 0.5 * smoothstep(0.88, 1, k)),
        );
        if (k >= 1) { stage = 'holding'; still = 0; }
      } else if (stage === 'holding') {
        // In his hand it keeps a soft light round it, seen past him from
        // behind as well.
        handAt(walker, facing);
        u.uFall.value.set(hand.x, hand.y + 0.05, hand.z, 0.5 + 0.08 * Math.sin(time * 2.3));
        const { way, dist } = nearestWay(walker.x, walker.z);
        if (dist < way.reach) give(handAt(walker, facing), way, true);
        else if (still >= LET_GO_AFTER && fromTree > AWAY) give(handAt(walker, facing), way, false);
      }
    }
    if (stage === 'none') u.uFall.value.w = 0;

    // The leaf given, on its way out.
    if (gift) {
      gift.t += dt;
      let d = Math.min(1, gift.t / gift.dur) * gift.len;
      let i = 0;
      while (i < gift.lens.length - 1 && d > gift.lens[i]) { d -= gift.lens[i]; i++; }
      const a = gift.path[i], b = gift.path[i + 1];
      const k = gift.lens[i] > 0 ? Math.min(1, d / gift.lens[i]) : 1;
      const done = gift.t / gift.dur;
      u.uGift.value.set(
        a.x + (b.x - a.x) * k + Math.sin(gift.t * 1.3) * 0.15,
        a.y + (b.y - a.y) * k + Math.sin(gift.t * 2.1) * 0.08,
        a.z + (b.z - a.z) * k,
        Math.min(1, 0.5 + gift.t * 2) * (1 - smoothstep(0.8, 1, done)),
      );
      // Its gate's stream brightens as it comes to it, and stays bright a
      // while after it has gone through.
      const atIt = Math.hypot(u.uGift.value.x - gift.gate.at.x, u.uGift.value.z - gift.gate.at.z) < 14;
      if (atIt || done > 0.5) u.uGlow.value.set(gift.gate.at.x, gift.gate.at.z, 0, u.uGlow.value.w);
      glow = damp(glow, atIt ? 1 : 0, atIt ? 1.5 : 0.4, dt);
      if (done >= 1) gift = null;
    } else {
      u.uGift.value.w = 0;
      glow = damp(glow, 0, 0.4, dt);
    }
    u.uGlow.value.w = glow;
  }

  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // Where a gate's first bearer is now — the same path its shader walks.
  function lead(i) {
    const l = lanes[i];
    const t = (((l.phase + clock * l.rate) % 1) + 1) % 1;
    let p, q, s;
    if (t < l.seg[0]) { p = l.a; q = l.b; s = t / Math.max(l.seg[0], 1e-4); }
    else if (t < l.seg[1]) { p = l.b; q = l.c; s = (t - l.seg[0]) / Math.max(l.seg[1] - l.seg[0], 1e-4); }
    else { p = l.c; q = l.d; s = (t - l.seg[1]) / Math.max(1 - l.seg[1], 1e-4); }
    return { x: p.x + (q.x - p.x) * s, z: p.y + (q.y - p.y) * s };
  }

  const counted = { received: 0, given: 0 };
  const round = v => Math.round(v * 100) / 100;
  return {
    update,
    // While a leaf comes down to him or is in his hand, his hands are full.
    busy: () => stage !== 'none',
    holding: () => stage === 'holding',
    // The line under the screen, for a few seconds after a leaf is given him
    // or given by him.
    caption: () => (word && clock - wordAt < WORD_HELD ? word : null),
    // For main.js, every frame: how many leaves he has received and given.
    counts: () => { counted.received = received; counted.given = given; return counted; },
    state() {
      const l = lead(1);   // the south side's middle gate, the one within his reach
      return {
        bearers,
        gates: ways.length,
        stage,
        received,
        given,
        out: !!gift,
        glow: round(glow),
        lead: { x: round(l.x), z: round(l.z) },
      };
    },
  };
}
