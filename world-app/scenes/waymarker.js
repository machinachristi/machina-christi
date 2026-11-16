// A waymarker (AB#165): the landmark of a station — a place in the garden he
// walks to that opens something to play (see ../stations.js). A milestone
// with the pilgrim's scallop shell in gold on its face, a staff and gourd
// leaning against it, and the first few stones of a road leading on past it.
// "And an highway shall be there, and a way" (Isaiah 35:8).
//
// Nothing here moves, so every part is baked into one merged geometry with
// its colours painted into the vertices: the whole landmark is one draw call.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored } from '../util.js';

const SCALE = 1.35;         // a little over life size, so it reads on a phone
const ROAD_STONES = 9;
const WALK_EDGE = 49.6;     // no paving past the garden's walkable rim

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function placed(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

// at: { x, z } where it stands; faces: { x, z } the place its shell looks
// toward; road: { x, z } the place its paving runs toward (or null for none).
export function createWaymarker(scene, { at, faces, road = null }) {
  const parts = [];
  const add = (geo, color, m) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    if (g !== geo) geo.dispose();
    parts.push({ geo: g, color: new THREE.Color(color) });
  };

  const stand = placed(at.x, heightAt(at.x, at.z), at.z,
    0, Math.atan2(faces.x - at.x, faces.z - at.z), 0, SCALE, SCALE, SCALE);
  const onStone = (geo, color, m) => add(geo, color, stand.clone().multiply(m));

  // The milestone: a plinth, a tapered four-sided stone, a pitched cap.
  onStone(new THREE.BoxGeometry(0.9, 0.18, 0.7), 0xB9B19A, placed(0, 0.09, 0));
  onStone(new THREE.CylinderGeometry(0.27, 0.36, 1.15, 4, 1), 0xD3CBB4, placed(0, 0.755, 0, 0, Math.PI / 4));
  onStone(new THREE.ConeGeometry(0.30, 0.22, 4), 0xC2BAA2, placed(0, 1.44, 0, 0, Math.PI / 4));

  // The scallop shell: a fan of gold ribs on the face, hinge downward.
  const RIBS = 7;
  for (let i = 0; i < RIBS; i++) {
    const a = (i - (RIBS - 1) / 2) * 0.27;
    onStone(new THREE.ConeGeometry(0.045, 0.34, 3), i % 2 ? 0xE9B93F : 0xF6D06A,
      placed(Math.sin(a) * 0.17, 0.80 + Math.cos(a) * 0.17, 0.262, Math.PI, 0, -a, 1.5, 1, 0.5));
  }

  // The pilgrim's staff leaning on the stone, and the gourd tied to it.
  onStone(new THREE.CylinderGeometry(0.03, 0.035, 1.95, 5), 0x7A5632, placed(0.50, 0.97, 0.05, 0, 0, 0.16));
  onStone(new THREE.SphereGeometry(0.10, 6, 5), 0xC98E3A, placed(0.40, 1.62, 0.05));
  onStone(new THREE.SphereGeometry(0.065, 6, 4), 0xC98E3A, placed(0.39, 1.75, 0.05));

  // The first stones of the road, laid along the ground past the marker.
  if (road) {
    const dx = road.x - at.x, dz = road.z - at.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    for (let i = 0; i < ROAD_STONES; i++) {
      const along = -5.5 + i * 1.05;
      const aside = 1.5 + (i % 2 ? 0.28 : -0.28);
      const px = at.x + ux * along - uz * aside;
      const pz = at.z + uz * along + ux * aside;
      if (Math.hypot(px, pz) > WALK_EDGE) continue;
      add(new THREE.CylinderGeometry(0.46, 0.5, 0.1, 6), i % 2 ? 0xCFC7B0 : 0xBDB59E,
        placed(px, heightAt(px, pz) + 0.03, pz, 0, i * 1.3, 0, 1, 1, 0.8));
    }
  }

  const mesh = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.name = 'waymarker';
  scene.add(mesh);
  for (const part of parts) part.geo.dispose();
  return mesh;
}
