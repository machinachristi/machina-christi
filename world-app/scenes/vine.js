// "They shall sit every man under his vine and under his fig tree" (Micah
// 4:4) — one vine has climbed one of the garden's own planted trees, its
// tendril spiralling up the trunk and its clusters hanging low and ready.
//
// A vine neither walks nor wanders, so — the cedars'/willows' idiom exactly
// — it bakes into a single merged, vertex-coloured geometry at build time:
// one draw call, a real bounding sphere, nothing to update per frame.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mulberry32 } from '../util.js';

const TRUNK_H = 2.4;
const TURNS = 3.25;
const SEGMENTS = 24;
const CLUSTERS = 3;
const BEADS_PER_CLUSTER = 7;

const TENDRIL = new THREE.Color(0x5B6E3A);
const GRAPE_LO = new THREE.Color(0x3E2748);
const GRAPE_HI = new THREE.Color(0x6B3E78);

// Concatenate non-indexed geometries, painting each one its own flat colour
// into a shared vertex-colour attribute (same helper as scenes/cedars.js
// and scenes/willows.js).
function mergeColored(parts) {
  let count = 0;
  for (const part of parts) count += part.geo.attributes.position.count;
  const posArr = new Float32Array(count * 3);
  const colArr = new Float32Array(count * 3);
  let v = 0;
  for (const { geo, color } of parts) {
    const n = geo.attributes.position.count;
    posArr.set(geo.attributes.position.array, v * 3);
    for (let i = 0; i < n; i++) {
      colArr[(v + i) * 3] = color.r;
      colArr[(v + i) * 3 + 1] = color.g;
      colArr[(v + i) * 3 + 2] = color.b;
    }
    v += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  merged.computeVertexNormals();
  return merged;
}

// treeSpots carries only {x, z} for each of the 38 planted trees (see
// scenes/fruit.js for the same precedent) — the vine climbs a nominal
// trunk of its own rather than depending on that tree's own random scale.
export function createVine(scene, treeSpots) {
  // Own seeded stream: choosing which tree it climbs shifts nothing already
  // planted.
  const rng = mulberry32(20260739);

  const order = treeSpots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const spot = treeSpots[order[0]];
  const groundY = heightAt(spot.x, spot.z);

  const parts = [];
  const grape = new THREE.Color();

  // The tendril: a chain of short tilted cylinders spiralling up a nominal
  // trunk radius, each one angled to follow the helix's own tangent.
  for (let i = 0; i < SEGMENTS; i++) {
    const u = i / SEGMENTS;
    const y = u * TRUNK_H;
    const a = u * TURNS * Math.PI * 2;
    const r = 0.23 + Math.sin(u * Math.PI) * 0.03;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    parts.push({
      geo: new THREE.CylinderGeometry(0.018, 0.024, 0.36, 4)
        .toNonIndexed()
        .rotateZ(Math.PI / 2)
        .rotateY(-a)
        .translate(x, y + 0.18, z)
        .translate(spot.x, groundY, spot.z),
      color: TENDRIL,
    });
  }

  // Clusters hanging low along the climb, ready to be found.
  const clusterY = [];
  for (let c = 0; c < CLUSTERS; c++) {
    const u = 0.32 + (c / Math.max(1, CLUSTERS - 1)) * 0.55;
    const y = u * TRUNK_H;
    const a = u * TURNS * Math.PI * 2;
    const r = 0.24;
    const cx = spot.x + Math.cos(a) * r;
    const cz = spot.z + Math.sin(a) * r;
    clusterY.push(groundY + y);
    for (let g = 0; g < BEADS_PER_CLUSTER; g++) {
      const gy = groundY + y - g * 0.05 - 0.04;
      const gx = cx + (rng() - 0.5) * 0.07;
      const gz = cz + (rng() - 0.5) * 0.07;
      grape.copy(GRAPE_LO).lerp(GRAPE_HI, rng());
      parts.push({
        geo: new THREE.IcosahedronGeometry(0.036, 0).toNonIndexed().translate(gx, gy, gz),
        color: grape.clone(),
      });
    }
  }

  const mesh = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(mesh);
  for (const part of parts) part.geo.dispose();

  const lowestCluster = Math.min(...clusterY);
  return {
    spot: {
      pos: { x: spot.x, y: lowestCluster, z: spot.z },
      name: 'Gephen', label: 'the vine', kind: 'vine',
    },
  };
}
