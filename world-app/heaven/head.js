// The head of the ladder (AB#106), where it comes up through the sea of glass
// "and the top of it reached to heaven" (Genesis 28:12). The walker arrives a
// few steps north of it, and comes back to it to go down again to Eden.
//
// The top rungs stand up out of an opening in the glass ringed with cloud
// (the floor's own shader leaves it open and draws the rim — sea.js). Through
// it the ladder is seen going down into soft light, paling to the green of
// the garden far below. A soft column of light stands up out of it, as over
// the ladder's foot in Eden, so the way down is easy to find from anywhere.
// Three draws: the ladder, the well of light under the opening, the column.

import * as THREE from 'three';
import { mergeColored, smoothstep } from '../util.js';
import { lightColumn } from '../scenes/ladder.js';
import { LADDER_HEAD } from './layout.js';

const TOP = 0.8;         // the rails stand this far up out of the glass
const DEPTH = 11;        // how far down the well is seen to go
const HALF_W = 0.55;     // as in Eden (scenes/ladder.js)
const RUNG = 0.42;

export function createHead(scene) {
  const GOLD = new THREE.Color(0xD9AE4C);
  const PALE = new THREE.Color(0xF7E7B4);
  const parts = [];
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.075, TOP + DEPTH, 0.075).toNonIndexed();
    g.translate(side * HALF_W, (TOP - DEPTH) / 2, 0);
    parts.push({ geo: g, color: GOLD });
    // A rounded cap on each rail where it stands up out of the glass.
    const cap = new THREE.IcosahedronGeometry(0.07, 1);
    cap.translate(side * HALF_W, TOP, 0);
    parts.push({ geo: cap, color: PALE });
  }
  for (let y = TOP - 0.25; y > -DEPTH; y -= RUNG) {
    const g = new THREE.BoxGeometry(HALF_W * 2, 0.05, 0.055).toNonIndexed();
    g.translate(0, y, 0);
    parts.push({ geo: g, color: GOLD.clone().lerp(PALE, smoothstep(0, -DEPTH, y)) });
  }
  const ladderGeo = mergeColored(parts);
  ladderGeo.translate(LADDER_HEAD.x, 0, LADDER_HEAD.z);
  const ladder = new THREE.Mesh(ladderGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.add(ladder);

  // The well of light under the opening: white at the rim, paling down
  // through soft blue to the garden's green, seen from inside.
  const wellGeo = new THREE.CylinderGeometry(LADDER_HEAD.r + 0.02, LADDER_HEAD.r * 0.55, DEPTH, 24, 6, true);
  const pos = wellGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const WHITE = new THREE.Color(0xFFFFFF), SKY = new THREE.Color(0xCFE3F2), GREEN = new THREE.Color(0x9CCB86);
  for (let i = 0; i < pos.count; i++) {
    const t = 0.5 - pos.getY(i) / DEPTH;          // 0 at the rim → 1 at the bottom
    c.copy(WHITE).lerp(SKY, smoothstep(0, 0.5, t)).lerp(GREEN, smoothstep(0.5, 1, t));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  wellGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  wellGeo.translate(LADDER_HEAD.x, -DEPTH / 2, LADDER_HEAD.z);
  const well = new THREE.Mesh(wellGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false,
  }));
  scene.add(well);

  const column = lightColumn({
    x: LADDER_HEAD.x, z: LADDER_HEAD.z, ground: 0.2, height: 70, radius: 1.5, strength: 0.32,
  });
  scene.add(column.mesh);

  return {
    update(time) { column.update(time); },
  };
}
