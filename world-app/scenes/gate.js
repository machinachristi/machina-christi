// Eastward glimpses (Genesis 3:24, foreshadowed). Far to the east, where the
// risen rim melts into the fog and the river's heads pass out of the garden,
// a gate stands: two pale pillars and a lintel, and between them a standing
// light — a hush of what will one day be set there to keep the way. It is not
// named and not explained; it only glows on the horizon, brightest at night,
// drawing the eye east. It sits just within the walk's edge, so it may be
// approached but is always a little farther off than it seems.

import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Due east on the risen rim, on the dry island the two inner heads pass on
// either side of. r ≈ 49 — inside the 50-unit walk bound, but only just.
export const GATE_POS = new THREE.Vector3(49, 0, 3);

export function createGate(scene) {
  const group = new THREE.Group();
  const groundY = heightAt(GATE_POS.x, GATE_POS.z);
  group.position.set(GATE_POS.x, groundY, GATE_POS.z);
  // Turn the gate so its two pillars stand side by side as seen from the
  // heart of the garden — you look east through the opening toward the light.
  group.rotation.y = Math.atan2(GATE_POS.x, GATE_POS.z);
  scene.add(group);

  const stone = new THREE.MeshLambertMaterial({ color: 0xC7BFA8, flatShading: true });

  // Two pillars and a lintel across their tops.
  const PILLAR_H = 5.4;
  const SPAN = 3.0;
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.55, PILLAR_H, 6),
      stone,
    );
    pillar.position.set(sx * SPAN / 2, PILLAR_H / 2, 0);
    group.add(pillar);
  }
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(SPAN + 1.0, 0.7, 0.9),
    stone,
  );
  lintel.position.y = PILLAR_H + 0.15;
  group.add(lintel);

  // The standing light between the pillars: an upright, self-lit blade of
  // warm gold, kept deliberately abstract — a glow, never a figure. Its own
  // emissive material carries it through the fog; a small point light lets it
  // spill a little onto the stone.
  const flameMat = new THREE.MeshLambertMaterial({
    color: 0xF6D48A,
    emissive: 0xE8B24A,
    emissiveIntensity: 1.0,
    transparent: true,
    opacity: 0.92,
    flatShading: true,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.6, 5), flameMat);
  flame.position.y = 2.5;
  group.add(flame);

  // A soft glow sprite so the gate reads as light even where the fog is thick.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 48;
  const gg = glowCanvas.getContext('2d');
  const grad = gg.createRadialGradient(24, 24, 1, 24, 24, 24);
  grad.addColorStop(0, 'rgba(255, 224, 158, 0.95)');
  grad.addColorStop(1, 'rgba(255, 224, 158, 0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 48, 48);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas),
    transparent: true,
    depthWrite: false,
    opacity: 0.8,
  }));
  glow.scale.set(4.2, 5.4, 1);
  glow.position.y = 2.7;
  group.add(glow);

  const lamp = new THREE.PointLight(0xFFD98A, 14, 16, 2);
  lamp.position.y = 2.7;
  group.add(lamp);

  // The light stands quietly, but never quite still — a slow breath, and at
  // night it burns a little higher so the east is always faintly lit.
  let t = 0;
  function update(dt, night = 0) {
    t += dt;
    const flicker = 0.85 + Math.sin(t * 1.7) * 0.08 + Math.sin(t * 4.3) * 0.05;
    const rise = 1 + night * 0.9;
    flameMat.emissiveIntensity = flicker * rise;
    glow.material.opacity = (0.6 + 0.15 * Math.sin(t * 2.1)) * (0.7 + night * 0.5);
    lamp.intensity = 14 * flicker * rise;
    flame.scale.y = 0.96 + 0.06 * Math.sin(t * 3.1);
  }

  return { update, position: { x: GATE_POS.x, z: GATE_POS.z } };
}
