// "The conies are but a feeble folk, yet make they their houses in the
// rocks" (Proverbs 30:26). The conies have kept the high rim since v17, but
// the houses the proverb gives them were never actually there. Now each has
// its own: a knot of grey stone standing behind it on the line it already
// faces, with a dark gap at the foot on the side the coney sits, and — the
// whole point of the thing — a pale worn threshold across that gap, rubbed
// smooth and bare by a feeble folk going in and out of it for longer than
// anyone has been watching.
//
// Every rock in the garden bakes into one merged, vertex-coloured geometry:
// one draw call for all six houses.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32 } from '../util.js';

// How far behind the coney the pile stands. It has to clear the coney and the
// worn ground in front of it — set any closer and the doorway and the path to
// it end up underneath the main boulder's own overhang, which is exactly what
// the first build did.
const SET_BACK = 1.05;
const BOULDERS = 4;        // stones in a knot
const MAIN_R = 0.58;       // the big one everything else leans on

const STONE = new THREE.Color(0x8E8C85);
const STONE_DARK = new THREE.Color(0x6A6862);
const STONE_WARM = new THREE.Color(0x9C9184);
// The worn part is the one thing here that is not weathered grey: stone rubbed
// back to its own pale under-colour by use.
const WORN = new THREE.Color(0xC9C1AE);
const MOUTH = new THREE.Color(0x24211D);

// One house, set behind a coney facing `yaw`. Forward for a model turned by
// yaw is (sin yaw, cos yaw), so the rock goes the other way and the doorway
// looks back along that line at the coney sitting in front of it.
function houseParts(home, rng, parts, tint) {
  const fx = Math.sin(home.yaw), fz = Math.cos(home.yaw);
  const cx = home.x - fx * SET_BACK;
  const cz = home.z - fz * SET_BACK;
  const baseY = heightAt(cx, cz);

  for (let i = 0; i < BOULDERS; i++) {
    // Piled rather than ringed: one big stone leaned on by smaller ones.
    const a = home.yaw + Math.PI + (i - 1.2) * 0.9 + rng() * 0.4;
    const out = i === 0 ? 0 : 0.26 + rng() * 0.3;
    const size = (i === 0 ? MAIN_R : 0.26 + rng() * 0.2) * (0.9 + rng() * 0.3);
    const x = cx + Math.cos(a) * out;
    const z = cz + Math.sin(a) * out;
    tint.copy(STONE).lerp(rng() < 0.5 ? STONE_DARK : STONE_WARM, rng() * 0.8);
    parts.push({
      geo: new THREE.DodecahedronGeometry(size, 0)
        .toNonIndexed()
        .scale(1, 0.72 + rng() * 0.3, 1)
        .rotateY(rng() * Math.PI * 2)
        .rotateX((rng() - 0.5) * 0.4)
        .translate(x, baseY + size * 0.42, z),
      color: tint.clone(),
    });
  }

  // The gap itself, facing the coney: a dark disc stood just proud of the
  // front of the pile, turned to look back down the line the coney sits on
  // and tipped back a little so it reads as going in rather than sitting on.
  // Nothing is modelled behind it — a coney that ducks is gone, and that is
  // all a doorway has to do.
  parts.push({
    geo: new THREE.CircleGeometry(0.2, 7)
      .toNonIndexed()
      .rotateX(-0.18)
      .rotateY(home.yaw)
      .translate(cx + fx * (MAIN_R + 0.06), baseY + 0.19, cz + fz * (MAIN_R + 0.06)),
    color: MOUTH,
  });

  // And the threshold: a low flat tongue of ground from the doorway out to
  // where the coney sits, worn pale and bare. This is the part the proverb is
  // really about — not the rock, but that somebody lives there.
  const wx = cx + fx * SET_BACK * 0.62;
  const wz = cz + fz * SET_BACK * 0.62;
  parts.push({
    geo: new THREE.CircleGeometry(0.34, 8)
      .toNonIndexed()
      .rotateX(-Math.PI / 2)
      .scale(0.85, 1, 1.7)
      .rotateY(home.yaw)
      // Laid proud of the grass, for the same reason scenes/springs.js lifts
      // its rills: the terrain mesh bridges above the true height curve in a
      // hollow and swallows anything set flat at heightAt.
      .translate(wx, heightAt(wx, wz) + 0.06, wz),
    color: WORN,
  });

  return { x: cx, z: cz, y: baseY, yaw: home.yaw };
}

// `homes` comes straight from scenes/conies.js: {x, z, groundY, yaw} per
// coney, so a house is never built anywhere a coney is not already sitting.
export function createRocks(scene, homes) {
  // Own seeded stream: stone piled behind creatures already placed shifts
  // nothing else in the garden.
  const rng = mulberry32(20260834);

  const parts = [];
  const tint = new THREE.Color();
  const houses = [];
  for (const home of homes) houses.push(houseParts(home, rng, parts, tint));

  const rocks = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(rocks);
  for (const part of parts) part.geo.dispose();

  // Namable as the rock, not as the coney — the coney beside it already
  // answers to Shaphan, and this is the thing the proverb praises it for.
  const spots = houses.length ? [{
    pos: { x: houses[0].x, y: houses[0].y + 0.55, z: houses[0].z },
    name: 'Sela', label: 'the coney’s rock', kind: 'rock',
  }] : [];

  return {
    spots,
    state: () => ({ count: houses.length, houses }),
  };
}
