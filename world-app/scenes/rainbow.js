// A rainbow arcs faintly across the sky after the rain clears (Genesis
// 9:13: "I do set my bow in the cloud"). Rides the same clearing glow the
// sky itself eases in right after a shower passes (v13, Job 26:8), and
// fades again well before the next one gathers. Seven bands merged into one
// non-indexed geometry with a per-vertex color — one draw call.

import * as THREE from 'three';
import { clamp, smoothstep } from '../util.js';

const BAND_COLORS = [0xB33A3A, 0xC97B3D, 0xD9C24A, 0x5F9E52, 0x3E7EA6, 0x3D4E9E, 0x6B4E9E];
const INNER = 44;
const BAND_W = 1.7;
const SEG = 40;

// Concatenate the bands' non-indexed ring geometries into one buffer,
// carrying each band's own color as a per-vertex attribute.
function mergeBands(bands) {
  let count = 0;
  for (const b of bands) count += b.geo.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let v = 0;
  for (const b of bands) {
    const n = b.geo.attributes.position.count;
    pos.set(b.geo.attributes.position.array, v * 3);
    for (let i = 0; i < n; i++) {
      col[(v + i) * 3] = b.color.r;
      col[(v + i) * 3 + 1] = b.color.g;
      col[(v + i) * 3 + 2] = b.color.b;
    }
    v += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return merged;
}

export function createRainbow(scene) {
  const bands = [];
  const tmp = new THREE.Color();
  for (let i = 0; i < BAND_COLORS.length; i++) {
    const inner = INNER + i * BAND_W;
    // Upper half only (thetaStart=0, thetaLength=PI sweeps through the +Y
    // pole): the arc springs from the ground on both ends, never dips
    // beneath it.
    const geo = new THREE.RingGeometry(inner, inner + BAND_W, SEG, 1, 0, Math.PI).toNonIndexed();
    tmp.set(BAND_COLORS[i]);
    bands.push({ geo, color: tmp.clone() });
  }

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(mergeBands(bands), mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  let glow = 0;

  // `rainLevel`/`clearing` and `sunElev`/`sunAz` all come straight off the
  // sky's own state — never visible while it's still raining, never once
  // the clearing glow (or the sun itself) has faded.
  function update(dt, rainLevel = 0, clearing = 0, sunElev = 0, sunAz = 0) {
    const daylight = smoothstep(0.02, 0.15, sunElev);
    const target = rainLevel < 0.05 ? clearing * daylight : 0;
    glow += (target - glow) * Math.min(1, dt * 0.6);
    if (glow < 0.003) {
      if (mesh.visible) mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.rotation.y = sunAz;
    mat.opacity = clamp(glow, 0, 1) * 0.5;
  }

  function state() {
    return { visible: mesh.visible, glow };
  }

  return { update, state };
}
