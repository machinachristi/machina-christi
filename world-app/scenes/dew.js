// Dew at first light (v9): through the last watch of the night the meadow
// grass gathers its beads, and as the mist burns away the whole face of the
// ground glints with them — gone again by mid-morning, a little after the
// mist itself (Genesis 2:6 lingering on the grass). One seeded Points cloud,
// one draw call; the beads themselves never move, only the light on them.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { smoothstep, mulberry32 } from '../util.js';

const COUNT = 160;

// How dewy the hour is, from the sky's clock t in [0,1): gathering just
// before dawn, full through first light, dried a little after the mist.
export function dewOf(t) {
  return t > 0.5 ? smoothstep(0.94, 0.99, t) : 1 - smoothstep(0.13, 0.24, t);
}

export function createDew(scene) {
  const rng = mulberry32(20260712);

  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < COUNT * 30) {
    const a = rng() * Math.PI * 2;
    const r = 4 + Math.sqrt(rng()) * 38;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) < 1.2) continue;   // beads sit on grass, not water
    pos[placed * 3] = x;
    pos[placed * 3 + 1] = heightAt(x, z) + 0.05;
    pos[placed * 3 + 2] = z;
    const w = 0.55 + rng() * 0.45;             // some beads catch more light
    col[placed * 3] = w;
    col[placed * 3 + 1] = w;
    col[placed * 3 + 2] = w * (0.92 + rng() * 0.08);
    placed++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, placed * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, placed * 3), 3));

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, 'rgba(244, 250, 252, 1)');
  grad.addColorStop(1, 'rgba(244, 250, 252, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);

  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.1,
    map: new THREE.CanvasTexture(canvas),
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  points.visible = false;
  scene.add(points);

  let t = 0;
  let glint = 0;
  function update(dt, cycleT = 0.1) {
    t += dt;
    glint = dewOf(cycleT);
    // The whole field shimmers faintly together — cheap, and at this size the
    // eye reads it as beads catching the light one after another.
    points.material.opacity = glint * (0.55 + 0.18 * Math.sin(t * 2.7));
    points.visible = glint > 0.02;
  }

  function state() {
    return { glint, beads: placed };
  }

  return { update, state };
}
