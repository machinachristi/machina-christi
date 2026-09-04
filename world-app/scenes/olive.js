// "And the dove came in to him in the evening; and, lo, in her mouth was an
// olive leaf pluckt off: so Noah knew that the waters were abated from off
// the earth" (Genesis 8:11). Long after this garden, a dove will carry a
// leaf back over a drowned world, and the whole of what that leaf means is
// that somewhere a tree is standing. Here the tree is already standing, and
// one of the garden's own doves goes to it and comes back with a leaf in
// her mouth for no reason at all except that she may.
//
// This module is only the olive itself — an old, low, silver tree apart on
// the south-western meadow, its trunk already leaning the way olives lean.
// The errand belongs to the dove, and lives with her in scenes/creatures.js;
// what she needs from here is `OLIVE_BOUGH`, the one branch she alights on.
//
// An olive neither walks nor wanders, so the whole tree bakes into a single
// merged, vertex-coloured geometry at build time (the cedars'/willows'
// idiom): one draw call, and nothing at all to do per frame.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32 } from '../util.js';

// Where it stands: out on the open meadow south-west of the two sacred
// trees, well clear of the water (the nearest channel is a dozen units off)
// and clear of the bees' own flower patches, on ground that falls away
// gently — so it is seen against the sky from the heart of the garden, which
// is the whole point of a tree a dove can find.
export const OLIVE_POS = { x: -15, z: -9 };

const TRUNK_H = 2.2;
const GROUND_Y = heightAt(OLIVE_POS.x, OLIVE_POS.z);

// The bough she alights on: high in the crown, a little to the east, so her
// glide down out of the circuit comes in over open grass.
export const OLIVE_BOUGH = new THREE.Vector3(
  OLIVE_POS.x + 0.55,
  GROUND_Y + TRUNK_H + 1.15,
  OLIVE_POS.z + 0.35,
);

const BARK = new THREE.Color(0x6E6353);
const BARK_PALE = new THREE.Color(0x8A8071);
// An olive's leaf is grey-green above and near-white beneath, and the whole
// crown flickers between the two whenever the wind turns it over.
const LEAF_LO = new THREE.Color(0x6F8464);
const LEAF_HI = new THREE.Color(0xA8B79A);

export function createOlive(scene) {
  // Own seeded stream: one tree on the meadow shifts nothing already planted.
  const rng = mulberry32(20260823);

  const parts = [];
  const leaf = new THREE.Color();
  const { x, z } = OLIVE_POS;

  // The trunk: short, thick and already leaning — an olive is old before it
  // is anything else. Two limbs part from it low down, the way an old olive
  // hollows and splits rather than growing straight.
  parts.push({
    geo: new THREE.CylinderGeometry(0.24, 0.42, TRUNK_H, 7)
      .toNonIndexed()
      .translate(0, TRUNK_H / 2, 0)
      .rotateZ(0.12)
      .translate(x, GROUND_Y, z),
    color: BARK,
  });
  for (const [tilt, turn] of [[0.42, 0.7], [-0.36, 3.3]]) {
    parts.push({
      geo: new THREE.CylinderGeometry(0.12, 0.22, 1.5, 6)
        .toNonIndexed()
        .translate(0, 0.75, 0)
        .rotateZ(tilt)
        .rotateY(turn)
        .translate(x, GROUND_Y + TRUNK_H * 0.78, z),
      color: BARK_PALE,
    });
  }

  // The crown: five overlapping lobes, low and wide and silvered. They
  // overlap well into one another (the cedars' gotcha) so the tree reads as
  // one head of leaf rather than a handful of separate bushes.
  for (const [dx, dy, dz, s] of [
    [0, 1.25, 0, 1.15],
    [-0.85, 0.95, 0.35, 0.82],
    [0.8, 1.0, -0.4, 0.86],
    [0.25, 0.75, 0.85, 0.7],
    [-0.3, 1.55, -0.35, 0.72],
  ]) {
    leaf.copy(LEAF_LO).lerp(LEAF_HI, 0.25 + rng() * 0.6);
    parts.push({
      geo: new THREE.IcosahedronGeometry(1, 0)
        .toNonIndexed()
        .scale(s, s * 0.72, s)
        .translate(x + dx, GROUND_Y + TRUNK_H + dy, z + dz),
      color: leaf.clone(),
    });
  }

  const tree = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(tree);
  for (const part of parts) part.geo.dispose();

  // Namable like everything else that grows here (Genesis 2:19-20) — `zayit`
  // is the word Genesis 8:11 itself uses for the leaf she carried.
  const spot = {
    pos: { x, y: GROUND_Y + TRUNK_H * 0.8, z },
    name: 'Zayit', label: 'the olive', kind: 'olive',
  };

  return { spot, pos: OLIVE_POS, bough: OLIVE_BOUGH };
}
