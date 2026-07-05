// The mist of Eden: "there went up a mist from the earth, and watered the
// whole face of the ground" (Genesis 2:6). Soft ground-hugging veils that
// gather in the last watch of the night, lie thick through first light,
// and burn away as the morning warms. All the veils share one sprite
// material, so the whole mist breathes as one with the hour.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { smoothstep, mulberry32 } from '../util.js';

const COUNT = 10;

export function createMist(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(236, 240, 238, 0.55)');
  grad.addColorStop(0.55, 'rgba(236, 240, 238, 0.22)');
  grad.addColorStop(1, 'rgba(236, 240, 238, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);

  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const rng = mulberry32(20260706);
  const group = new THREE.Group();
  const veils = [];
  for (let i = 0; i < COUNT; i++) {
    const s = new THREE.Sprite(mat);
    const a = rng() * Math.PI * 2;
    const r = 7 + rng() * 38;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    s.position.set(x, heightAt(x, z) + 1.0, z);
    s.scale.set(11 + rng() * 8, 2.4 + rng() * 1.4, 1);
    group.add(s);
    veils.push({ s, baseX: x, baseY: s.position.y, sway: rng() * Math.PI * 2, rate: 0.05 + rng() * 0.05 });
  }
  group.visible = false;
  scene.add(group);

  let t = 0;
  // `cycleT` is the sky's clock in [0,1): mist gathers from 0.9 (deep
  // night's end), holds through dawn and first light, and is gone by 0.2.
  function update(dt, cycleT) {
    t += dt;
    const m = cycleT > 0.5 ? smoothstep(0.9, 0.965, cycleT) : 1 - smoothstep(0.1, 0.2, cycleT);
    mat.opacity = 0.42 * m;
    group.visible = m > 0.015;
    if (!group.visible) return;
    for (const v of veils) {
      v.s.position.x = v.baseX + Math.sin(t * v.rate + v.sway) * 2.2;
      v.s.position.y = v.baseY + Math.sin(t * 0.1 + v.sway) * 0.18;
    }
  }

  return { update };
}
