// "Let us get up early to the vineyards; let us see if the vine flourish...
// The mandrakes give a smell, and at our gates are all manner of pleasant
// fruits" (Song of Solomon 7:12-13). Where the one vine has climbed its tree
// (scenes/vine.js), a little company of mandrakes keeps the ground under it:
// broad dark rosettes lying flat to the earth, a pale bell on a short stalk,
// and the small gold fruit the Song calls pleasant.
//
// What a mandrake is chiefly said to do is *give a smell*, which is the one
// thing a garden made of triangles cannot show. So the smell is drawn: a
// slow drift of pale motes rising off the rosettes, thickening through the
// warm of the afternoon into the evening — the hour the Song is walking in
// — and gone again by the deep of the night.
//
// The plants themselves never move, so they bake into a single merged,
// vertex-coloured geometry (the cedars'/willows' idiom); the smell is one
// Points field. Two draw calls for the whole company.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32, clamp, smoothstep } from '../util.js';

const COUNT = 5;          // plants in the company
const RING_MIN = 1.9;     // how close under the vine's own trunk they keep
const RING_MAX = 3.4;
const LEAVES = 7;         // in a rosette
const MOTES = 44;         // of the smell
const RISE = 0.34;        // how fast a mote climbs, units a second
const MOTE_TOP = 1.9;     // how high it gets before it is lost

const LEAF_LO = new THREE.Color(0x2E4A2A);
const LEAF_HI = new THREE.Color(0x486B37);
const STALK = new THREE.Color(0x6B7A46);
const BELL = new THREE.Color(0xC9B7D6);
const APPLE = new THREE.Color(0xD9B33F);

// How strongly the mandrakes are giving their smell, 0 to 1, from the sky's
// own clock. Chiefly the warm of the afternoon running into the evening —
// the hour the Song walks out in — with a lesser breath of it early, for
// those who get up early to the vineyards. Pure, so a test can ask the same
// question the motes are answering.
export function scentOf(cycleT) {
  const t = ((cycleT % 1) + 1) % 1;
  const evening = smoothstep(0.34, 0.5, t) * (1 - smoothstep(0.66, 0.78, t));
  const early = smoothstep(0.03, 0.1, t) * (1 - smoothstep(0.14, 0.22, t)) * 0.55;
  return Math.max(evening, early);
}

// One plant, baked in place.
function plantParts(x, z, groundY, rng, parts, tint) {
  // The rosette: broad leaves lying almost flat, splayed all round.
  for (let i = 0; i < LEAVES; i++) {
    const a = (i / LEAVES) * Math.PI * 2 + rng() * 0.5;
    const len = 0.42 + rng() * 0.26;
    tint.copy(LEAF_LO).lerp(LEAF_HI, rng());
    parts.push({
      geo: new THREE.ConeGeometry(0.11, len, 4)
        .toNonIndexed()
        .scale(1, 1, 0.45)              // flattened: a leaf, not a spike
        .rotateX(-Math.PI / 2)          // laid down along the ground
        .translate(0, 0, len / 2)       // hinged at the plant's heart
        .rotateX(-0.28)                 // the tip lifted a little off the earth
        .rotateY(a)
        .translate(x, groundY + 0.06, z),
      color: tint.clone(),
    });
  }
  // The stalk, and the pale bell on it.
  const h = 0.34 + rng() * 0.18;
  parts.push({
    geo: new THREE.CylinderGeometry(0.02, 0.028, h, 4)
      .toNonIndexed()
      .translate(x, groundY + h / 2, z),
    color: STALK,
  });
  parts.push({
    geo: new THREE.ConeGeometry(0.075, 0.13, 6)
      .toNonIndexed()
      .rotateX(Math.PI)               // a bell hangs mouth-down
      .translate(x, groundY + h + 0.04, z),
    color: BELL,
  });
  // And the fruit the Song calls pleasant, lying in among the leaves.
  parts.push({
    geo: new THREE.SphereGeometry(0.075, 6, 5)
      .toNonIndexed()
      .translate(x + (rng() - 0.5) * 0.3, groundY + 0.1, z + (rng() - 0.5) * 0.3),
    color: APPLE,
  });
  return groundY + h + 0.1;
}

// `vinePos` is the foot of the vine's own trunk — {x, y, z}, exactly what
// scenes/foxes.js is handed.
export function createMandrakes(scene, vinePos) {
  // Own seeded stream: a company under a tree already chosen shifts nothing
  // already planted.
  const rng = mulberry32(20260825);

  const parts = [];
  const namable = [];
  const tint = new THREE.Color();
  const hearts = [];

  for (let i = 0; i < COUNT; i++) {
    // Round the trunk, but gathered toward one side of it rather than ringed
    // evenly — they came up where they came up.
    const a = 1.1 + (i / COUNT) * 3.4 + rng() * 0.5;
    const r = RING_MIN + rng() * (RING_MAX - RING_MIN);
    const x = vinePos.x + Math.cos(a) * r;
    const z = vinePos.z + Math.sin(a) * r;
    const groundY = heightAt(x, z);
    const top = plantParts(x, z, groundY, rng, parts, tint);
    hearts.push({ x, y: groundY, z });
    if (i === 0) {
      namable.push({
        pos: { x, y: top, z },
        name: "Duda'im", label: 'the mandrakes', kind: 'mandrake',
      });
    }
  }

  const company = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(company);
  for (const part of parts) part.geo.dispose();

  // ── The smell ─────────────────────────────────────────────
  const pos = new Float32Array(MOTES * 3);
  const motes = [];
  for (let i = 0; i < MOTES; i++) {
    const heart = hearts[i % hearts.length];
    motes.push({
      heart,
      h: rng() * MOTE_TOP,
      rate: 0.6 + rng() * 0.8,
      sway: rng() * Math.PI * 2,
      spread: 0.2 + rng() * 0.45,
    });
  }
  const scentGeo = new THREE.BufferGeometry();
  scentGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const scentMat = new THREE.PointsMaterial({
    color: 0xE8DCC0,
    size: 0.1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const smell = new THREE.Points(scentGeo, scentMat);
  smell.frustumCulled = false;   // the field is rewritten every frame
  scene.add(smell);

  let given = 0;
  let t = 0;

  function update(dt, cycleT = 0.075) {
    given = scentOf(cycleT);
    scentMat.opacity = 0.5 * given;
    smell.visible = given > 0.01;
    if (!smell.visible) return;
    t += dt;
    for (let i = 0; i < MOTES; i++) {
      const m = motes[i];
      m.h += RISE * m.rate * dt;
      if (m.h > MOTE_TOP) m.h -= MOTE_TOP;
      // Wider as it climbs, and thinning to nothing at the top — a smell
      // spreading rather than a column of smoke going up.
      const f = m.h / MOTE_TOP;
      const wander = m.spread * f;
      pos[i * 3] = m.heart.x + Math.cos(t * 0.5 * m.rate + m.sway) * wander;
      pos[i * 3 + 1] = m.heart.y + 0.12 + m.h;
      pos[i * 3 + 2] = m.heart.z + Math.sin(t * 0.42 * m.rate + m.sway) * wander;
    }
    scentGeo.attributes.position.needsUpdate = true;
  }
  update(0, 0.075);

  return {
    update,
    spots: namable,
    count: COUNT,
    state: () => ({ count: COUNT, motes: MOTES, scent: clamp(given, 0, 1) }),
  };
}
