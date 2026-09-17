// "Awake, O north wind; and come, thou south; blow upon my garden, that the
// spices thereof may flow out" (Song of Solomon 4:16). A bed of low grey-
// green bushes keeps a slope on the south of the garden — ground that falls
// away toward the sun and holds the heat of the middle of the day. Through
// the noon the bed gives its smell, and the smell does what the verse asks
// of it: it flows out, northward, off the warm ground and away over the
// meadow, and is gone again by the time the light goes long.
//
// The bushes never move, so they bake into one merged, vertex-coloured
// geometry; the smell is one Points field, hidden outright except at noon
// (scenes/mandrakes.js's build, keeping a different hour).

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32, clamp } from '../util.js';

const COUNT = 9;          // bushes in the bed
const SPREAD = 3.6;       // how far the bed runs from its own heart
const MOTES = 52;
const RISE = 0.3;         // how fast a mote climbs, units a second
const FLOW = 0.62;        // and how fast it is carried north off the slope
const MOTE_TOP = 2.3;

// The bed is at its strongest through the heat of the middle day and gives
// nothing at all outside it — the same shape of window scenes/vapours.js
// keeps, and inside sky.js's own noon (0.24–0.46).
const CENTER = 0.33;
const HALF = 0.13;

// Grey-green is what a spice bush actually is, but taken too far it reads as
// stone in this palette — the first build put nine boulders on the slope.
// These keep enough green in them to be plainly foliage next to the garden's
// real rocks, and the bloom heads do the rest of the work.
const LEAF = new THREE.Color(0x74914F);
const LEAF_GREY = new THREE.Color(0x92AD6B);
const WOOD = new THREE.Color(0x6B5B42);
const BLOOM = new THREE.Color(0xCDB0E0);
const BLOOM_WARM = new THREE.Color(0xEFD089);

// How freely the spices are flowing out, 0 to 1, from the sky's own clock.
// Pure, so a test can ask the same question the motes are answering.
export function spiceOf(cycleT) {
  const t = ((cycleT % 1) + 1) % 1;
  return Math.max(0, 1 - Math.abs(t - CENTER) / HALF);
}

// A slope on the south of the garden that genuinely falls away southward —
// checked against the height function rather than assumed, so the bed really
// does lie open to the sun rather than in the lee of its own hill. North is
// +z in this garden, so south is -z.
function bedSpot(rng) {
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI * 0.85 + rng() * Math.PI * 0.7;   // the southern arc
    const r = 21 + rng() * 16;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > -12) continue;
    if (riverEdgeDist(x, z) < 6) continue;
    const h = heightAt(x, z);
    if (h < 0.15) continue;
    if (heightAt(x, z - 3) >= h - 0.25) continue;        // must fall to the south
    return { x, z };
  }
  return { x: -9, z: -27 };
}

function bushParts(x, z, groundY, rng, parts, tint) {
  const h = 0.55 + rng() * 0.35;
  const spread = 0.32 + rng() * 0.2;
  // A short woody stock, barely clear of the ground.
  parts.push({
    geo: new THREE.CylinderGeometry(0.035, 0.055, h * 0.45, 4)
      .toNonIndexed()
      .translate(x, groundY + h * 0.22, z),
    color: WOOD,
  });
  // The mound of grey-green leaf over it, built of a few overlapping clumps
  // so the bush reads as foliage rather than as one ball.
  const clumps = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + rng() * 0.9;
    const out = rng() * spread * 0.55;
    tint.copy(LEAF).lerp(LEAF_GREY, rng());
    parts.push({
      // Taller than they are wide, so the bed keeps a standing, bushy
      // silhouette rather than the low domes a stone makes.
      geo: new THREE.IcosahedronGeometry(spread * (0.6 + rng() * 0.32), 0)
        .toNonIndexed()
        .scale(1, 1.25, 1)
        .rotateY(rng() * Math.PI * 2)
        .translate(x + Math.cos(a) * out, groundY + h * (0.6 + rng() * 0.3), z + Math.sin(a) * out),
      color: tint.clone(),
    });
  }
  // And the heads the smell actually comes off — held up clear of the leaf,
  // on their own short spikes, which is the other half of reading as a herb
  // in flower rather than as a rock.
  const heads = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < heads; i++) {
    const a = rng() * Math.PI * 2;
    const out = rng() * spread * 0.85;
    const lift = h * (0.95 + rng() * 0.35);
    tint.copy(BLOOM).lerp(BLOOM_WARM, rng());
    parts.push({
      geo: new THREE.ConeGeometry(0.06, 0.22, 5)
        .toNonIndexed()
        .rotateZ((rng() - 0.5) * 0.5)
        .translate(x + Math.cos(a) * out, groundY + lift, z + Math.sin(a) * out),
      color: tint.clone(),
    });
  }
  return groundY + h + 0.1;
}

export function createSpices(scene) {
  // Own seeded stream: a bed on empty southern ground shifts nothing already
  // planted.
  const rng = mulberry32(20260836);

  const heart = bedSpot(rng);
  const parts = [];
  const tint = new THREE.Color();
  const hearts = [];
  let top = 0;

  for (let i = 0; i < COUNT; i++) {
    // Set out in a loose bed rather than a row: it is a garden, but nobody
    // has ruled a line through it.
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * SPREAD;
    const x = heart.x + Math.cos(a) * r;
    const z = heart.z + Math.sin(a) * r * 0.75;
    const groundY = heightAt(x, z);
    top = Math.max(top, bushParts(x, z, groundY, rng, parts, tint));
    hearts.push({ x, y: groundY, z });
  }

  const bed = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(bed);
  for (const part of parts) part.geo.dispose();

  // ── The smell, flowing out ────────────────────────────────
  const pos = new Float32Array(MOTES * 3);
  const motes = [];
  for (let i = 0; i < MOTES; i++) {
    motes.push({
      heart: hearts[i % hearts.length],
      h: rng() * MOTE_TOP,
      rate: 0.6 + rng() * 0.8,
      sway: rng() * Math.PI * 2,
      spread: 0.25 + rng() * 0.5,
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xF0E4CC,
    size: 0.11,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const smell = new THREE.Points(geo, mat);
  smell.frustumCulled = false;   // the field is rewritten every frame
  smell.visible = false;
  scene.add(smell);

  let flowing = 0;
  let t = 0;

  function update(dt, cycleT = 0.075) {
    flowing = spiceOf(cycleT);
    mat.opacity = 0.46 * flowing;
    smell.visible = flowing > 0.01;
    if (!smell.visible) return;
    t += dt;
    for (let i = 0; i < MOTES; i++) {
      const m = motes[i];
      m.h += RISE * m.rate * dt;
      if (m.h > MOTE_TOP) m.h -= MOTE_TOP;
      const f = m.h / MOTE_TOP;
      const wander = m.spread * f;
      pos[i * 3] = m.heart.x + Math.cos(t * 0.45 * m.rate + m.sway) * wander;
      pos[i * 3 + 1] = m.heart.y + 0.3 + m.h;
      // "Come, thou south": a south wind carries northward, so the smell
      // leans off the slope as it climbs rather than standing over the bed.
      pos[i * 3 + 2] = m.heart.z + FLOW * m.h * m.rate
        + Math.sin(t * 0.4 * m.rate + m.sway) * wander;
    }
    geo.attributes.position.needsUpdate = true;
  }
  update(0, 0.075);

  const spots = [{
    pos: { x: heart.x, y: top, z: heart.z },
    name: 'Besamim', label: 'the bed of spices', kind: 'spice',
  }];

  return {
    update,
    spots,
    count: COUNT,
    state: () => ({
      count: COUNT, motes: MOTES,
      x: heart.x, z: heart.z,
      flowing: clamp(flowing, 0, 1),
    }),
  };
}
