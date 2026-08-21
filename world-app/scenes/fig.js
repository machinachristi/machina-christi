// "Now learn a parable of the fig tree; When his branch is yet tender, and
// putteth forth leaves, ye know that summer is nigh" (Matthew 24:32) — one
// fig tree stands apart on the open ground east of the sacred trees, and it
// is the only thing in the garden that keeps the *long* year rather than the
// day. Its branches are bare through the cold of the year, tender and
// half-leafed as summer draws near, in full leaf through the summer, and
// bare again after.
//
// The year is sky.js's own 28-day turn (`hour.year`, the same count the moon
// wanes over) — so walking the garden forward with `__world.setDay(n)` walks
// the fig through its seasons as surely as it walks the moon through her
// phases.
//
// Its wood never moves, so trunk and boughs bake into one merged,
// vertex-coloured geometry (watertree.js's "a tree apart" precedent, cedars'
// bake idiom); only the leaves need to come and go, and they ride one
// instanced mesh whose whole crop scales up out of nothing and back.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mulberry32, smoothstep } from '../util.js';

const FIG_POS = { x: 18, z: 6 };
const TRUNK_H = 2.0;
const BOUGHS = 6;
const LEAVES = 44;

// Day one finds the branch already tender — the very state the parable is
// about — rather than bare, so a first visit meets the tree with something
// to read in it.
const LEAF_OFFSET = 0.26;

const BARK = new THREE.Color(0x7E6A4E);
const BARK_DARK = new THREE.Color(0x5E4E39);
const LEAF_LO = new THREE.Color(0x4E7233);
const LEAF_HI = new THREE.Color(0x76984A);

// How full the fig's leaf presently is, 0 (bare) to 1 (high summer), from
// the garden's position in its own long year. Pure — the tree, and any test
// that wants to know what it should be seeing, read the same one function.
export function figLeafOf(year) {
  const s = ((year + LEAF_OFFSET) % 1 + 1) % 1;
  const putForth = smoothstep(0.12, 0.42, s);   // the branch grows tender
  const fall = 1 - smoothstep(0.66, 0.88, s);   // and lets go again after
  return Math.min(putForth, fall);
}

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

export function createFig(scene) {
  // Own seeded stream: one tree apart shifts nothing already planted.
  const rng = mulberry32(20260816);

  const groundY = heightAt(FIG_POS.x, FIG_POS.z);
  const parts = [];
  const bark = new THREE.Color();

  bark.copy(BARK).lerp(BARK_DARK, rng());
  parts.push({
    geo: new THREE.CylinderGeometry(0.16, 0.28, TRUNK_H, 7)
      .toNonIndexed()
      .translate(FIG_POS.x, groundY + TRUNK_H / 2, FIG_POS.z),
    color: bark.clone(),
  });

  // A fig forks low and wide — short boughs reaching out, not a tall crown.
  const tips = [];
  for (let i = 0; i < BOUGHS; i++) {
    const a = (i / BOUGHS) * Math.PI * 2 + rng() * 0.5;
    const reach = 0.85 + rng() * 0.5;
    const rise = 0.45 + rng() * 0.4;
    const len = Math.hypot(reach, rise);
    bark.copy(BARK).lerp(BARK_DARK, rng());
    parts.push({
      geo: new THREE.CylinderGeometry(0.05, 0.11, len, 5)
        .toNonIndexed()
        .translate(0, len / 2, 0)
        .rotateZ(-Math.atan2(reach, rise))
        .rotateY(-a)
        .translate(FIG_POS.x, groundY + TRUNK_H * 0.72, FIG_POS.z),
      color: bark.clone(),
    });
    tips.push({
      x: FIG_POS.x + Math.cos(a) * reach,
      y: groundY + TRUNK_H * 0.72 + rise,
      z: FIG_POS.z + Math.sin(a) * reach,
    });
  }

  const wood = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(wood);
  for (const part of parts) part.geo.dispose();

  // The leaves: broad five-lobed plates, hung about the bough tips. Flat, so
  // they want both faces lit.
  const leaves = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.19, 5),
    new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide }),
    LEAVES,
  );
  leaves.frustumCulled = false;   // instance transforms outrun the base bounds
  scene.add(leaves);

  const bases = [];
  {
    const c = new THREE.Color();
    for (let i = 0; i < LEAVES; i++) {
      const tip = tips[i % tips.length];
      const a = rng() * Math.PI * 2;
      const rr = rng() * 0.42;
      bases.push({
        x: tip.x + Math.cos(a) * rr,
        y: tip.y + (rng() - 0.5) * 0.4,
        z: tip.z + Math.sin(a) * rr,
        pitch: 0.7 + rng() * 0.9,      // hung over, the way a fig leaf sits
        yaw: rng() * Math.PI * 2,
        scale: 0.75 + rng() * 0.5,
      });
      c.copy(LEAF_LO).lerp(LEAF_HI, rng());
      leaves.setColorAt(i, c);
    }
    leaves.instanceColor.needsUpdate = true;
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  // The year turns slowly enough that rewriting 44 matrices every frame
  // would be pure waste — the crop is only recomposed when the leaf has
  // actually changed (and `setDay` changes it in one jump, which this
  // catches just as well).
  let leafNow = -1;
  let yearNow = 0;

  function update(year = 0) {
    yearNow = year;
    const L = figLeafOf(year);
    leaves.visible = L > 0.02;
    const changed = Math.abs(L - leafNow) >= 0.002;
    leafNow = L;
    if (!leaves.visible || !changed) return;

    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      e.set(b.pitch, b.yaw, 0);
      q.setFromEuler(e);
      p.set(b.x, b.y, b.z);
      s.setScalar(b.scale * L);
      m.compose(p, q, s);
      leaves.setMatrixAt(i, m);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }

  update(0);   // seat the first crop before the world is ever shown

  const spot = {
    pos: { x: FIG_POS.x, y: groundY + TRUNK_H + 0.4, z: FIG_POS.z },
    name: "Te'enah", label: 'the fig tree', kind: 'fig',
  };

  return {
    update, spot,
    state: () => ({ x: FIG_POS.x, z: FIG_POS.z, leaf: leafNow, year: yearNow }),
  };
}
