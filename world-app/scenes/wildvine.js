// "Thou hast brought a vine out of Egypt... thou preparedst room before it,
// and didst cause it to take deep root, and it filled the land" (Psalm
// 80:8-9). The garden already keeps one vine that climbed a planted tree
// (scenes/vine.js). This is the other kind: no one set it, and it has not
// gone up at all. It came out of open meadow and simply ran — three runners
// going out along the ground from one old root, thickening at every node
// where they took hold again, broad leaves turned up along their whole
// length, and a tendril here and there feeling for something to climb that
// was never put there.
//
// It fills the land the only way a thing on the ground can: sideways. Nothing
// about it moves, so the whole spread bakes into a single merged,
// vertex-coloured geometry — one draw call for the entire vine.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mergeColored, mulberry32 } from '../util.js';

const RUNNERS = 3;
const STEPS = 18;         // nodes along a runner
const STRIDE = 0.82;      // how far it makes between one node and the next
const DRIFT = 0.34;       // how far its heading may wander per node, radians
// The runner rides a little proud of the ground on purpose: the terrain mesh
// bridges above the true height curve inside a hollow, and anything laid at
// heightAt alone is swallowed there (learned the hard way by scenes/springs.js).
const LIFT = 0.14;

const STEM = new THREE.Color(0x6E7A43);
const STEM_OLD = new THREE.Color(0x585F38);
const KNUCKLE = new THREE.Color(0x7C6A44);
const LEAF_LO = new THREE.Color(0x3A5A2C);
const LEAF_HI = new THREE.Color(0x638340);
const LEAF_TURNED = new THREE.Color(0x9A9C46);   // the odd older leaf, going over
const TENDRIL = new THREE.Color(0x8B9455);

// Where a vine no one planted came up: open meadow, well back from the water
// and inside the walk, with nothing else of the garden's own planting on it.
function rootSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 15 + rng() * 14;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > 5 && heightAt(x, z) > -0.2) return { x, z };
  }
  return { x: -20, z: 9 };
}

// One length of runner, laid from a to b. Built along +Z, then pitched and
// turned onto the line between them — a cylinder's own axis is +Y, so the
// first rotateX is what makes the rest of this read straight.
function stemPart(a, b, radius, color) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  const pitch = -Math.asin(dy / len);
  const yaw = Math.atan2(dx, dz);
  return {
    geo: new THREE.CylinderGeometry(radius * 0.86, radius, len, 4, 1, true)
      .toNonIndexed()
      .rotateX(Math.PI / 2)
      .rotateX(pitch)
      .rotateY(yaw)
      .translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2),
    color,
  };
}

export function createWildVine(scene) {
  // Own seeded stream: a vine that came up on empty meadow shifts nothing
  // already planted.
  const rng = mulberry32(20260833);

  const parts = [];
  const tint = new THREE.Color();
  const root = rootSpot(rng);
  const rootY = heightAt(root.x, root.z);

  // The old root itself — the one thing about this vine that is thick.
  parts.push({
    geo: new THREE.SphereGeometry(0.2, 6, 5)
      .toNonIndexed()
      .scale(1, 0.6, 1)
      .translate(root.x, rootY + 0.08, root.z),
    color: KNUCKLE,
  });

  let leafCount = 0;
  let far = 0;

  for (let k = 0; k < RUNNERS; k++) {
    // The three go out on their own headings, but none of them doubles back
    // over the others: a third of the compass each, give or take.
    let heading = (k / RUNNERS) * Math.PI * 2 + rng() * 0.8;
    let cur = { x: root.x, y: rootY + LIFT, z: root.z };

    for (let s = 0; s < STEPS; s++) {
      heading += (rng() - 0.5) * DRIFT;
      const stride = STRIDE * (0.8 + rng() * 0.45);
      const nx = cur.x + Math.sin(heading) * stride;
      const nz = cur.z + Math.cos(heading) * stride;
      const next = { x: nx, y: heightAt(nx, nz) + LIFT, z: nz };

      // A runner thins as it gets further from the root, the way a thing
      // spending itself outward does.
      const thin = 1 - (s / STEPS) * 0.55;
      tint.copy(STEM).lerp(STEM_OLD, rng() * 0.6);
      parts.push(stemPart(cur, next, 0.052 * thin, tint.clone()));

      // Where a node touches down it takes hold again — "deep root", every
      // few feet of the way out.
      if (s % 4 === 2) {
        parts.push({
          geo: new THREE.SphereGeometry(0.075 * thin + 0.03, 5, 4)
            .toNonIndexed()
            .scale(1, 0.55, 1)
            .translate(next.x, next.y - 0.04, next.z),
          color: KNUCKLE,
        });
      }

      // Leaves: broad, held a little off the ground on a short stalk, turned
      // up to the light and splayed to either side of the runner's line.
      const leaves = s % 2 === 0 ? 2 : 1;
      for (let i = 0; i < leaves; i++) {
        const side = i === 0 ? 1 : -1;
        const a = heading + side * (1.0 + rng() * 0.7);
        const len = 0.34 + rng() * 0.2;
        const turned = rng() < 0.12;
        if (turned) tint.copy(LEAF_TURNED);
        else tint.copy(LEAF_LO).lerp(LEAF_HI, rng());
        parts.push({
          geo: new THREE.ConeGeometry(0.13, len, 4)
            .toNonIndexed()
            .scale(1, 1, 0.5)              // flattened: a leaf, not a spike
            .rotateX(-Math.PI / 2)         // laid out along the ground
            .translate(0, 0, len / 2)      // hinged where it leaves the stem
            .rotateX(-0.42)                // and lifted, to catch the light
            .rotateY(a)
            .translate(next.x, next.y + 0.05, next.z),
          color: tint.clone(),
        });
        leafCount++;
      }

      // Now and then a tendril, reaching up off the runner for a hold that
      // is not there — the whole reason this one stayed on the ground.
      if (s % 5 === 3) {
        const a = heading + (rng() - 0.5) * 1.4;
        parts.push({
          geo: new THREE.ConeGeometry(0.018, 0.3, 3)
            .toNonIndexed()
            .translate(0, 0.15, 0)
            .rotateZ(0.5 + rng() * 0.4)
            .rotateY(a)
            .translate(next.x, next.y, next.z),
          color: TENDRIL,
        });
      }

      cur = next;
      far = Math.max(far, Math.hypot(cur.x - root.x, cur.z - root.z));
    }
  }

  const vine = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(vine);
  for (const part of parts) part.geo.dispose();

  // "Gephen sadeh", the vine of the field — 2 Kings 4:39's own words for one
  // of these, found by a man out gathering herbs who did not know what it was.
  const spots = [{
    pos: { x: root.x, y: rootY + 0.5, z: root.z },
    name: 'Gephen Sadeh', label: 'the wild vine', kind: 'wildvine',
  }];

  return {
    spots,
    state: () => ({
      x: root.x, z: root.z,
      runners: RUNNERS, leaves: leafCount, reach: far,
    }),
  };
}
