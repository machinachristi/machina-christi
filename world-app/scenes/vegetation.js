// Every tree "pleasant to the sight" (Genesis 2:9) — instanced low-poly
// trees, shrubs, and meadow flowers, and at the heart of the garden the two
// named trees: the Tree of Life, golden and luminous, and the Tree of the
// Knowledge of Good and Evil, dark-canopied and bearing fruit. Drifting
// golden motes carry the same light motif as the runner game and home page.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { smoothstep, mulberry32 } from '../util.js';

export const TREE_OF_LIFE_POS = new THREE.Vector3(-3.2, 0, -0.5);
export const TREE_OF_KNOWLEDGE_POS = new THREE.Vector3(3.4, 0, 0.8);

// A placement is fine if it's on open meadow: inside the planted band,
// clear of the water (all four heads of it), and not crowding the clearing.
function goodSpot(x, z, rMin, rMax) {
  const r = Math.hypot(x, z);
  if (r < rMin || r > rMax) return false;
  if (riverEdgeDist(x, z) < 1.9) return false;
  return true;
}

function scatter(rng, count, rMin, rMax, minGap, taken = []) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const x = (rng() * 2 - 1) * rMax;
    const z = (rng() * 2 - 1) * rMax;
    if (!goodSpot(x, z, rMin, rMax)) continue;
    let ok = true;
    for (const p of [...taken, ...out]) {
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < minGap * minGap) { ok = false; break; }
    }
    if (ok) out.push({ x, z });
  }
  return out;
}

function fillInstances(mesh, spots, rng, { yOf, scaleMin, scaleMax, colorA, colorB }) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < spots.length; i++) {
    const sc = scaleMin + rng() * (scaleMax - scaleMin);
    p.set(spots[i].x, yOf(spots[i], sc), spots[i].z);
    q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
    s.setScalar(sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.copy(colorA).lerp(colorB, rng());
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function createVegetation(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);

  // Kept in scope for the night: after dark the Tree of Life's lamp and
  // golden canopy brighten, and the motes turn firefly (see update()).
  let lifeLamp, lifeGold;

  // ── The two sacred trees, hand-shaped ─────────────────────
  // Tree of Life: pale trunk, golden triple canopy, its own warm light.
  {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.4, 3.1, 7),
      new THREE.MeshLambertMaterial({ color: 0xC9B896, flatShading: true }),
    );
    trunk.position.y = 1.55;
    t.add(trunk);
    const gold = new THREE.MeshLambertMaterial({
      color: 0xE8C86A, emissive: 0x8A6B1C, emissiveIntensity: 0.55, flatShading: true,
    });
    for (const [dx, dy, dz, s] of [[0, 3.9, 0, 1.7], [-0.9, 3.2, 0.3, 1.05], [0.8, 3.35, -0.4, 1.15]]) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), gold);
      blob.position.set(dx, dy, dz);
      blob.scale.setScalar(s);
      t.add(blob);
    }
    const lamp = new THREE.PointLight(0xFFD98A, 26, 15, 2);
    lamp.position.y = 3.6;
    t.add(lamp);
    t.position.set(TREE_OF_LIFE_POS.x, heightAt(TREE_OF_LIFE_POS.x, TREE_OF_LIFE_POS.z), TREE_OF_LIFE_POS.z);
    group.add(t);
    lifeLamp = lamp;
    lifeGold = gold;
  }

  // Tree of Knowledge: a leaning, twisted trunk, deep shadowed canopy,
  // and low-hanging fruit.
  {
    const t = new THREE.Group();
    const bark = new THREE.MeshLambertMaterial({ color: 0x4A3828, flatShading: true });
    let y = 0;
    let lean = 0;
    for (const [h, r1, r2, tilt] of [[1.3, 0.34, 0.26, 0.22], [1.1, 0.26, 0.2, -0.3], [0.9, 0.2, 0.15, 0.26]]) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, h, 6), bark);
      lean += tilt;
      seg.position.set(Math.sin(lean) * (y * 0.25 + 0.15), y + h / 2, 0);
      seg.rotation.z = lean;
      t.add(seg);
      y += h * 0.92;
    }
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2E5240, flatShading: true });
    for (const [dx, dy, dz, s] of [[0.5, 3.3, 0, 1.5], [-0.5, 2.9, 0.4, 1.0]]) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), canopyMat);
      blob.position.set(dx, dy, dz);
      blob.scale.setScalar(s);
      t.add(blob);
    }
    const fruit = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.095, 7, 5),
      new THREE.MeshLambertMaterial({ color: 0xC4462F, emissive: 0x481008, emissiveIntensity: 0.4 }),
      9,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = 1.1 + rng() * 0.5;
      m.setPosition(0.4 + Math.cos(a) * rr, 2.6 + rng() * 0.9, Math.sin(a) * rr * 0.8);
      fruit.setMatrixAt(i, m);
    }
    t.add(fruit);
    t.position.set(TREE_OF_KNOWLEDGE_POS.x, heightAt(TREE_OF_KNOWLEDGE_POS.x, TREE_OF_KNOWLEDGE_POS.z), TREE_OF_KNOWLEDGE_POS.z);
    group.add(t);
  }

  // ── The planted garden: instanced trees, shrubs, flowers ──
  const treeSpots = scatter(rng, 38, 11, 46, 3.4);
  const third = Math.ceil(treeSpots.length / 3);
  const spotsRound = treeSpots.slice(0, third);
  const spotsCone = treeSpots.slice(third, third * 2);
  const spotsBlob = treeSpots.slice(third * 2);

  // Shared trunks for every tree.
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.17, 1.6, 5),
    new THREE.MeshLambertMaterial({ color: 0x7A5C3E, flatShading: true }),
    treeSpots.length,
  );
  fillInstances(trunks, treeSpots, rng, {
    yOf: (s2, sc) => heightAt(s2.x, s2.z) + 0.8 * sc,
    scaleMin: 0.85, scaleMax: 1.5,
    colorA: new THREE.Color(0x7A5C3E), colorB: new THREE.Color(0x6A4E34),
  });
  group.add(trunks);

  const canopyDefs = [
    { spots: spotsRound, geo: new THREE.IcosahedronGeometry(1.15, 0), lift: 2.15, a: 0x5E9B54, b: 0x79B565 },
    { spots: spotsCone, geo: new THREE.ConeGeometry(1.0, 2.3, 6), lift: 2.4, a: 0x3E7E52, b: 0x54936A },
    { spots: spotsBlob, geo: new THREE.DodecahedronGeometry(1.05, 0), lift: 2.2, a: 0x6FAF5C, b: 0x8CC072 },
  ];
  // Instance scales must mirror the trunk pass so canopies sit on their own
  // trunks — reuse the rng stream carefully by re-scattering scales per mesh.
  for (const def of canopyDefs) {
    const canopy = new THREE.InstancedMesh(
      def.geo,
      new THREE.MeshLambertMaterial({ flatShading: true }),
      def.spots.length,
    );
    fillInstances(canopy, def.spots, rng, {
      yOf: (s2, sc) => heightAt(s2.x, s2.z) + def.lift * sc,
      scaleMin: 0.85, scaleMax: 1.5,
      colorA: new THREE.Color(def.a), colorB: new THREE.Color(def.b),
    });
    group.add(canopy);
  }

  const shrubSpots = scatter(rng, 26, 9, 48, 2.0, treeSpots);
  const shrubs = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    shrubSpots.length,
  );
  fillInstances(shrubs, shrubSpots, rng, {
    yOf: (s2, sc) => heightAt(s2.x, s2.z) + 0.3 * sc,
    scaleMin: 0.6, scaleMax: 1.3,
    colorA: new THREE.Color(0x4E8F4E), colorB: new THREE.Color(0x7FB86A),
  });
  group.add(shrubs);

  const flowerSpots = scatter(rng, 140, 3.5, 44, 0.9);
  const flowers = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.11),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    flowerSpots.length,
  );
  const petalTones = [0xE8D5A3, 0xC9A227, 0xC97BA2, 0xF2F2E9, 0xD98A5B];
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < flowerSpots.length; i++) {
      const sp = flowerSpots[i];
      q.setFromEuler(new THREE.Euler(rng() * 0.8, rng() * Math.PI * 2, rng() * 0.8));
      s.setScalar(0.7 + rng() * 0.8);
      m.compose(new THREE.Vector3(sp.x, heightAt(sp.x, sp.z) + 0.06, sp.z), q, s);
      flowers.setMatrixAt(i, m);
      c.setHex(petalTones[Math.floor(rng() * petalTones.length)]);
      flowers.setColorAt(i, c);
    }
    flowers.instanceMatrix.needsUpdate = true;
    flowers.instanceColor.needsUpdate = true;
  }
  group.add(flowers);

  // ── Drifting golden motes, thickest near the Tree of Life ─
  const MOTES = 130;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = [];
  for (let i = 0; i < MOTES; i++) {
    const nearLife = i < 60;
    const cx = nearLife ? TREE_OF_LIFE_POS.x : 0;
    const cz = nearLife ? TREE_OF_LIFE_POS.z : 0;
    const rad = nearLife ? 1.5 + rng() * 6 : 6 + rng() * 26;
    const ang = rng() * Math.PI * 2;
    const x = cx + Math.cos(ang) * rad;
    const z = cz + Math.sin(ang) * rad;
    const y = heightAt(x, z) + 0.4 + rng() * 4.5;
    motePos.set([x, y, z], i * 3);
    moteSeed.push({ baseY: y, phase: rng() * Math.PI * 2, rate: 0.15 + rng() * 0.3 });
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));

  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = 32;
  const g2 = spriteCanvas.getContext('2d');
  const grad = g2.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 233, 168, 1)');
  grad.addColorStop(1, 'rgba(255, 233, 168, 0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 32, 32);

  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    size: 0.16,
    map: new THREE.CanvasTexture(spriteCanvas),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  group.add(motes);

  // ── Falling gold: leaves the Tree of Life sheds ───────────
  // A handful of tiny golden tetrahedra loosed from the canopy, swaying
  // down to the clearing floor and rising to fall again — its own seeded
  // stream, so the shedding is the same for every visitor.
  const LEAVES = 14;
  const leafRng = mulberry32(20260705);
  const lifeGroundY = heightAt(TREE_OF_LIFE_POS.x, TREE_OF_LIFE_POS.z);
  const leaves = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.07),
    new THREE.MeshLambertMaterial({
      color: 0xE8C86A, emissive: 0x6B5215, emissiveIntensity: 0.5, flatShading: true,
    }),
    LEAVES,
  );
  const leafSeed = [];
  function shedLeaf(s2) {
    const a = leafRng() * Math.PI * 2;
    const r = 0.5 + leafRng() * 1.5;
    s2.x = TREE_OF_LIFE_POS.x + Math.cos(a) * r;
    s2.z = TREE_OF_LIFE_POS.z + Math.sin(a) * r;
    s2.y = lifeGroundY + 3.4 + leafRng() * 1.8;
    s2.vy = 0.28 + leafRng() * 0.24;
    s2.sway = leafRng() * Math.PI * 2;
    s2.spin = leafRng() * Math.PI * 2;
    s2.spinRate = 1 + leafRng() * 2;
  }
  for (let i = 0; i < LEAVES; i++) {
    const s2 = {};
    shedLeaf(s2);
    s2.y = lifeGroundY + 0.2 + leafRng() * 4.6;   // first fall: already mid-air
    leafSeed.push(s2);
  }
  group.add(leaves);
  const leafM = new THREE.Matrix4();
  const leafQ = new THREE.Quaternion();
  const leafE = new THREE.Euler();
  const leafP = new THREE.Vector3();
  const leafS = new THREE.Vector3();

  let t = 0;
  // `night` (0 day → 1 full dark, from the sky's cycle): after sundown the
  // Tree of Life answers the dark — lamp and canopy brighten — and the
  // drifting motes glow larger and fuller, reading as fireflies.
  // `playerPos`: the walker's position; drawing near either sacred tree
  // kindles a quiet reverence — the gold deepens, the motes lean brighter —
  // returned to the caller so the ambience can answer it too.
  function update(dt, night = 0, playerPos = null) {
    t += dt;
    const arr = moteGeo.attributes.position.array;
    for (let i = 0; i < MOTES; i++) {
      const s2 = moteSeed[i];
      arr[i * 3 + 1] = s2.baseY + Math.sin(t * s2.rate + s2.phase) * 0.9;
      arr[i * 3] += Math.sin(t * 0.22 + s2.phase) * 0.0016;
    }
    moteGeo.attributes.position.needsUpdate = true;

    // The falling leaves: sway down, shrink out at the grass, rise anew.
    for (let i = 0; i < LEAVES; i++) {
      const s2 = leafSeed[i];
      s2.y -= s2.vy * dt;
      const ground = heightAt(s2.x, s2.z) + 0.04;
      if (s2.y <= ground) shedLeaf(s2);
      leafP.set(s2.x + Math.sin(t * 0.8 + s2.sway) * 0.3, s2.y, s2.z + Math.cos(t * 0.7 + s2.sway) * 0.2);
      leafE.set(t * s2.spinRate + s2.spin, s2.spin, t * s2.spinRate * 0.7);
      leafS.setScalar(Math.min(1, (s2.y - ground) / 0.5) * 0.75 + 0.25);
      leafM.compose(leafP, leafQ.setFromEuler(leafE), leafS);
      leaves.setMatrixAt(i, leafM);
    }
    leaves.instanceMatrix.needsUpdate = true;

    let reverence = 0;
    if (playerPos) {
      const dL = Math.hypot(playerPos.x - TREE_OF_LIFE_POS.x, playerPos.z - TREE_OF_LIFE_POS.z);
      const dK = Math.hypot(playerPos.x - TREE_OF_KNOWLEDGE_POS.x, playerPos.z - TREE_OF_KNOWLEDGE_POS.z);
      reverence = 1 - smoothstep(3.5, 8.5, Math.min(dL, dK));
    }

    lifeLamp.intensity = 26 + night * 30 + reverence * 16;
    lifeGold.emissiveIntensity = 0.55 + night * 0.5 + reverence * 0.3;
    motes.material.opacity = Math.min(1, 0.8 + night * 0.2 + reverence * 0.15);
    motes.material.size = 0.16 + night * 0.06 + reverence * 0.03;

    return reverence;
  }

  return { update };
}
