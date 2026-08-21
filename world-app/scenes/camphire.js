// "Thy plants are an orchard of pomegranates, with pleasant fruits;
// camphire, with spikenard" (Song of Solomon 4:13) — low henna shrubs stand
// in a loose orchard on the garden's sheltered ground, each carrying
// clusters of pale cream bloom.
//
// The scent is the point of camphire, and scent needs a wind to carry it:
// the bloom clusters stir on exactly the evening gust of scenes/wind.js —
// the same gust that bows the canopies, bends the grain, scuds the leaves,
// and is the only thing the turtledove has cause to answer (audio.js gates
// her coo on it). Nothing is shared between them but the hour.
//
// The shrubs themselves never move, so they bake into one merged,
// vertex-coloured geometry; only the blooms need a per-frame matrix, and
// they ride one instanced mesh that is skipped outright whenever the gust
// is not moving (grain.js's `settled` idiom).

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { windOf, gustAt } from './wind.js';
import { mulberry32 } from '../util.js';

const SHRUBS = 6;
const BOUGHS = 5;
const BLOOMS_PER = 5;
const SWAY = 0.16;   // how far a cluster leans east at the gust's full breath

const WOOD = new THREE.Color(0x7A6647);
const WOOD_PALE = new THREE.Color(0x94805C);
const LEAF_LO = new THREE.Color(0x5F7B49);
const LEAF_HI = new THREE.Color(0x7D9760);
const BLOOM_LO = new THREE.Color(0xF6EFD6);
const BLOOM_HI = new THREE.Color(0xFCF8E9);

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
  merged.computeVertexNormals();   // non-indexed → true per-face normals
  return merged;
}

// Clear of the flock's own grazing ground (the lamb's lambSpot() in
// scenes/creatures.js ranges x∈[-24,24], z∈[-22,-2]) — a static planting
// standing inside a wandering grazer's ground risks being named in its
// place.
function inFlockGround(x, z) {
  return x > -28 && x < 28 && z > -26 && z < 2;
}

function camphireSpot(rng) {
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2;
    const r = 14 + rng() * 12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > 5 && !inFlockGround(x, z)) return { x, z };
  }
  return { x: -20, z: 8 };
}

export function createCamphire(scene) {
  // Own seeded stream: an orchard of shrubs shifts nothing already planted.
  const rng = mulberry32(20260817);

  const spots = [];
  let guard = 0;
  while (spots.length < SHRUBS && guard++ < SHRUBS * 40) {
    const sp = camphireSpot(rng);
    let ok = true;
    for (const p of spots) {
      if (Math.hypot(p.x - sp.x, p.z - sp.z) < 5) { ok = false; break; }
    }
    if (ok) spots.push(sp);
  }

  const parts = [];
  const namable = [];
  const bases = [];   // one per bloom cluster, in world space
  const wood = new THREE.Color();
  const leaf = new THREE.Color();

  for (const sp of spots) {
    const groundY = heightAt(sp.x, sp.z);
    const yaw = rng() * Math.PI * 2;
    const height = 0.9 + rng() * 0.5;

    wood.copy(WOOD).lerp(WOOD_PALE, rng());
    parts.push({
      geo: new THREE.CylinderGeometry(0.07, 0.13, height, 5)
        .toNonIndexed()
        .translate(sp.x, groundY + height / 2, sp.z),
      color: wood.clone(),
    });

    for (let i = 0; i < BOUGHS; i++) {
      const a = (i / BOUGHS) * Math.PI * 2 + yaw;
      const rr = 0.34 + rng() * 0.26;
      leaf.copy(LEAF_LO).lerp(LEAF_HI, rng());
      parts.push({
        geo: new THREE.IcosahedronGeometry(0.3 + rng() * 0.13, 0)
          .toNonIndexed()
          .scale(1, 0.72, 1)
          .translate(sp.x + Math.cos(a) * rr, groundY + height * 0.9, sp.z + Math.sin(a) * rr),
        color: leaf.clone(),
      });
    }

    // The bloom clusters sit at the outer tips of the boughs, where the
    // wind actually reaches them.
    for (let i = 0; i < BLOOMS_PER; i++) {
      const a = (i / BLOOMS_PER) * Math.PI * 2 + yaw + 0.4;
      const rr = 0.42 + rng() * 0.2;
      bases.push({
        x: sp.x + Math.cos(a) * rr,
        y: groundY + height * 0.9 + 0.18 + rng() * 0.12,
        z: sp.z + Math.sin(a) * rr,
        scale: 0.8 + rng() * 0.45,
      });
    }

    namable.push({
      pos: { x: sp.x, y: groundY + height + 0.25, z: sp.z },
      name: 'Kofer', label: 'the camphire', kind: 'camphire',
    });
  }

  const shrubs = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(shrubs);
  for (const part of parts) part.geo.dispose();

  const blooms = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.085, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    bases.length,
  );
  blooms.frustumCulled = false;   // instance transforms outrun the base bounds
  scene.add(blooms);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i];
    p.set(b.x, b.y, b.z);
    s.setScalar(b.scale);
    m.compose(p, q, s);
    blooms.setMatrixAt(i, m);
    c.copy(BLOOM_LO).lerp(BLOOM_HI, rng());
    blooms.setColorAt(i, c);
  }
  blooms.instanceMatrix.needsUpdate = true;
  blooms.instanceColor.needsUpdate = true;

  // Skipped entirely outside the gust's window — `settled` remembers that
  // every cluster is already written back to its own rest, so the long
  // still stretches of the day cost nothing at all.
  let settled = true;

  function update(cycleT, sabbath) {
    const w = windOf(cycleT, sabbath);
    if (w <= 0 && settled) return;
    settled = w <= 0;

    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      const g = gustAt(cycleT, b.x, sabbath);
      // The gust runs west to east, so a cluster is carried that way and
      // dips a little as it goes.
      p.set(b.x + g * SWAY, b.y - g * SWAY * 0.35, b.z);
      s.setScalar(b.scale);
      m.compose(p, q, s);
      blooms.setMatrixAt(i, m);
    }
    blooms.instanceMatrix.needsUpdate = true;
  }

  return { update, count: spots.length, blooms: bases.length, spots: namable };
}
