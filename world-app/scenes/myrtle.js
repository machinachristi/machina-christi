// "Instead of the thorn shall come up the fir tree, and instead of the brier
// shall come up the myrtle tree" (Isaiah 55:13) — at each of the lilies' own
// thorn stands (scenes/lilies.js), where the brier keeps the rougher ground,
// something better has come up beside it: a low, dense myrtle, or a narrow
// cypress spire standing over the scrub. The thorns are not taken away — they
// are simply no longer the tallest thing there.
//
// Neither tree moves, so the whole planting bakes into one merged,
// vertex-coloured geometry at build time (cedars'/lilies' idiom): a single
// draw call for every myrtle and cypress in the garden.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32 } from '../util.js';

// How far out from a thorn stand's heart the new tree comes up: clear of the
// briar ring (lilies.js splays its thorns to r ≈ 1.05) but plainly of it.
const OFFSET_MIN = 1.5;
const OFFSET_MAX = 2.3;

const MYRTLE_LO = new THREE.Color(0x2F5B3A);
const MYRTLE_HI = new THREE.Color(0x467A48);
const CYPRESS_LO = new THREE.Color(0x2A4A3C);
const CYPRESS_HI = new THREE.Color(0x3C6450);
const WOOD = new THREE.Color(0x5B4A36);

// A myrtle: shorter than a man, broad and rounded, all leaf and little wood.
function myrtleParts(x, z, groundY, rng, parts, leaf) {
  const h = 1.5 + rng() * 0.5;
  parts.push({
    geo: new THREE.CylinderGeometry(0.07, 0.11, h * 0.5, 5)
      .toNonIndexed()
      .translate(x, groundY + h * 0.25, z),
    color: WOOD,
  });
  for (const [dx, dy, dz, s] of [
    [0, h * 0.72, 0, 0.62], [-0.34, h * 0.58, 0.2, 0.42], [0.32, h * 0.6, -0.22, 0.45],
  ]) {
    leaf.copy(MYRTLE_LO).lerp(MYRTLE_HI, rng());
    parts.push({
      geo: new THREE.IcosahedronGeometry(1, 0)
        .scale(s, s * 0.85, s)
        .translate(x + dx, groundY + dy, z + dz),
      color: leaf.clone(),
    });
  }
  return groundY + h * 0.72;
}

// A cypress: the opposite build — a narrow dark spire, twice the myrtle's
// height and a third its width, so the two read apart at any distance.
function cypressParts(x, z, groundY, rng, parts, leaf) {
  const h = 3.4 + rng() * 1.2;
  parts.push({
    geo: new THREE.CylinderGeometry(0.08, 0.14, h * 0.3, 5)
      .toNonIndexed()
      .translate(x, groundY + h * 0.15, z),
    color: WOOD,
  });
  // Two tall cones, the upper narrower, overlapping well down into the
  // lower one — cedars' gotcha: leave a gap and it reads as two hats.
  for (const tier of [{ y: 0.42, r: 0.52, h: 2.0 }, { y: 0.72, r: 0.34, h: 1.9 }]) {
    leaf.copy(CYPRESS_LO).lerp(CYPRESS_HI, rng());
    parts.push({
      geo: new THREE.ConeGeometry(tier.r * (h / 4), tier.h * (h / 4), 6)
        .toNonIndexed()
        .translate(x, groundY + h * tier.y, z),
      color: leaf.clone(),
    });
  }
  return groundY + h * 0.72;
}

// `standSpots` are the lilies' own thorn stands — {pos:{x,y,z}} each, the
// same list they hand the naming.
export function createMyrtle(scene, standSpots) {
  // Own seeded stream: coming up beside a stand already placed shifts
  // nothing already planted.
  const rng = mulberry32(20260819);

  const parts = [];
  const namable = [];
  const leaf = new THREE.Color();

  for (let i = 0; i < standSpots.length; i++) {
    const stand = standSpots[i].pos;
    const a = rng() * Math.PI * 2;
    const r = OFFSET_MIN + rng() * (OFFSET_MAX - OFFSET_MIN);
    const x = stand.x + Math.cos(a) * r;
    const z = stand.z + Math.sin(a) * r;
    const groundY = heightAt(x, z);

    // Alternating, so neither the myrtle nor the fir is the exception:
    // both come up, and the brier is left standing under them.
    const cypress = i % 2 === 1;
    const y = cypress
      ? cypressParts(x, z, groundY, rng, parts, leaf)
      : myrtleParts(x, z, groundY, rng, parts, leaf);
    namable.push({
      pos: { x, y, z },
      name: cypress ? 'Berosh' : 'Hadas',
      label: cypress ? 'the fir tree' : 'the myrtle',
      kind: cypress ? 'cypress' : 'myrtle',
    });
  }

  const mesh = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(mesh);
  for (const part of parts) part.geo.dispose();

  return { count: namable.length, spots: namable };
}
