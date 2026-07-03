// The heavens: a vertex-gradient dome, a low-poly sun and faint moon, a few
// drifting clouds, and the garden's lighting. The dome's horizon tone matches
// the scene fog so land and sky melt together seamlessly at the edges.

import * as THREE from 'three';
import { smoothstep } from '../util.js';

export const HORIZON = new THREE.Color(0xEAE4CB);   // shared with scene fog
const ZENITH = new THREE.Color(0x79B4E4);

export function createSky(scene) {
  // Dome — vertex colours from warm horizon to blue zenith.
  const domeGeo = new THREE.SphereGeometry(430, 24, 12);
  const pos = domeGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = smoothstep(-0.06, 0.55, pos.getY(i) / 430);
    c.copy(HORIZON).lerp(ZENITH, t);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  }));
  dome.renderOrder = -10;
  scene.add(dome);

  // The sun — and the light that comes from its direction.
  const sunDir = new THREE.Vector3(0.55, 0.72, -0.42).normalize();
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(15, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xFFF3C4, fog: false }),
  );
  sun.position.copy(sunDir).multiplyScalar(370);
  scene.add(sun);

  // A soft procedural glow sprite around the sun (no texture files).
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const g = glowCanvas.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 244, 200, 0.85)');
  grad.addColorStop(0.4, 'rgba(255, 238, 180, 0.28)');
  grad.addColorStop(1, 'rgba(255, 238, 180, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas),
    transparent: true,
    fog: false,
    depthWrite: false,
  }));
  glow.scale.setScalar(120);
  glow.position.copy(sun.position);
  scene.add(glow);

  // A faint daytime moon, low in the opposite sky.
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9, 10, 7),
    new THREE.MeshBasicMaterial({ color: 0xEDF2F8, transparent: true, opacity: 0.5, fog: false }),
  );
  moon.position.set(-sunDir.x, 0.35, -sunDir.z).normalize().multiplyScalar(380);
  scene.add(moon);

  // Clouds: one instanced icosahedron forming a few puffy clusters.
  const CLOUD_PUFFS = [];
  const clusters = [
    { x: -60, y: 64, z: -90, n: 4, s: 9 },
    { x: 85, y: 74, z: -30, n: 3, s: 7 },
    { x: -30, y: 82, z: 95, n: 4, s: 8 },
    { x: 100, y: 60, z: 80, n: 3, s: 6 },
    { x: 10, y: 90, z: -140, n: 3, s: 10 },
  ];
  let total = 0;
  for (const cl of clusters) total += cl.n;
  const clouds = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: 0xFFFFFF, emissive: 0x8E99A8, fog: false, flatShading: true }),
    total,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let idx = 0;
  for (const cl of clusters) {
    for (let i = 0; i < cl.n; i++) {
      const dx = (i - (cl.n - 1) / 2) * cl.s * 0.9;
      p.set(cl.x + dx, cl.y + (i % 2) * cl.s * 0.22, cl.z + ((i * 37) % 5 - 2) * 1.5);
      sc.set(cl.s * (1 + (i % 3) * 0.25), cl.s * 0.45, cl.s * 0.7);
      q.setFromEuler(new THREE.Euler(0, i * 0.9 + cl.x, 0));
      m.compose(p, q, sc);
      clouds.setMatrixAt(idx, m);
      CLOUD_PUFFS.push({ base: p.clone(), scale: sc.clone(), quat: q.clone(), speed: 0.55 + (idx % 4) * 0.18 });
      idx++;
    }
  }
  scene.add(clouds);

  // Light itself — present from the garden's first moment.
  const sunlight = new THREE.DirectionalLight(0xFFF2D0, 2.35);
  sunlight.position.copy(sunDir).multiplyScalar(100);
  scene.add(sunlight);
  scene.add(new THREE.HemisphereLight(0xBFDCF2, 0x7FA05F, 1.0));

  let t = 0;
  function update(dt) {
    t += dt;
    for (let i = 0; i < CLOUD_PUFFS.length; i++) {
      const puff = CLOUD_PUFFS[i];
      p.copy(puff.base);
      p.x += Math.sin(t * 0.02 * puff.speed + i) * 6 + t * 0.35 * puff.speed;
      // Drift around: wrap far-east clouds back to the west.
      p.x = ((p.x + 160) % 320) - 160;
      m.compose(p, puff.quat, puff.scale);
      clouds.setMatrixAt(i, m);
    }
    clouds.instanceMatrix.needsUpdate = true;
  }

  return { update, sunDir };
}
