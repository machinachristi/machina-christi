// Four standing stones name the river's heads where the parting begins:
// "The name of the first is Pison… the name of the second river is Gihon…
// the name of the third river is Hiddekel [Tigris]… and the fourth river
// is Euphrates" (Genesis 2:11–14). One hewn slab stands on the dry ground
// beside each channel, its inscription facing the garden, so a walker
// following the water downstream reads each name as its river departs.
// All four stones cost two draw calls: one merged geometry for the slabs,
// one atlas-textured overlay for the engravings.

import * as THREE from 'three';
import { heightAt, riverCourse } from './terrain.js';
import { mulberry32 } from '../util.js';

export const HEAD_NAMES = ['Pishon', 'Gihon', 'Tigris', 'Euphrates'];

// Early in the fan: the four courses are clearly distinct here, and the
// whole row still stands inside the walkable radius.
const STONE_X = 40;
// How far each stone stands from its own water's edge — close enough to
// belong to it, and (checked against the fan's geometry) always nearer its
// own head than the neighbouring one.
const BANK_SETBACK = 2.2;

// Concatenate non-indexed geometries that share an attribute layout.
function mergeGeos(geos, withUv) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const posArr = new Float32Array(count * 3);
  const uvArr = withUv ? new Float32Array(count * 2) : null;
  let v = 0;
  for (const g of geos) {
    posArr.set(g.attributes.position.array, v * 3);
    if (uvArr) uvArr.set(g.attributes.uv.array, v * 2);
    v += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  if (uvArr) merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  merged.computeVertexNormals();   // non-indexed → true per-face normals
  return merged;
}

// The engravings: all four names drawn into one canvas atlas (one texture,
// one material, one draw call), each plate's UVs pointing at its own row.
function makeNameAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '6px';   // ignored where unsupported — the names still read
  g.font = '700 62px Georgia, "Times New Roman", serif';
  for (let i = 0; i < HEAD_NAMES.length; i++) {
    const name = HEAD_NAMES[i].toUpperCase();
    const cy = i * 128 + 58;
    // Chisel relief: a pale catch-light just below the dark cut.
    g.fillStyle = 'rgba(255, 246, 228, 0.5)';
    g.fillText(name, 256, cy + 3);
    g.fillStyle = 'rgba(28, 22, 16, 1)';
    g.fillText(name, 256, cy);
    g.fillStyle = 'rgba(28, 22, 16, 0.55)';
    g.fillRect(256 - 60, cy + 46, 120, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createStones(scene) {
  const rng = mulberry32(2110);   // its own stream — the garden's planting draws are untouched

  const slabGeos = [];
  const plateGeos = [];
  const list = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < HEAD_NAMES.length; i++) {
    const x = STONE_X + (rng() - 0.5) * 1.6;
    // The course fans fast here — sample it at this stone's own x, so the
    // setback from the water's edge holds no matter the jitter.
    const { centers, halfWidth } = riverCourse(x);
    const z = centers[i] - (halfWidth + BANK_SETBACK);   // the sandy south bank of its head
    const groundY = heightAt(x, z);

    // A hewn slab: box corners nudged and the top tapered, so each stone
    // leans and weathers a little differently. Jitter stays in x/y — the
    // faces the inscription sits against remain flat.
    const slab = new THREE.BoxGeometry(1.35, 2.0, 0.42).toNonIndexed();
    const sp = slab.attributes.position;
    const jitter = {};
    for (let vi = 0; vi < sp.count; vi++) {
      const key = `${Math.sign(sp.getX(vi))},${Math.sign(sp.getY(vi))},${Math.sign(sp.getZ(vi))}`;
      if (!(key in jitter)) jitter[key] = { dx: (rng() - 0.5) * 0.14, dy: (rng() - 0.5) * 0.1 };
      const top = sp.getY(vi) > 0;
      sp.setX(vi, sp.getX(vi) * (top ? 0.84 : 1) + jitter[key].dx);
      sp.setY(vi, sp.getY(vi) + (top ? jitter[key].dy : 0));
    }

    // The inscription plate, a hair proud of the slab's front face.
    // (toNonIndexed: mergeGeos concatenates raw vertex streams, and
    // PlaneGeometry — unlike a jittered Box — arrives indexed.)
    const plate = new THREE.PlaneGeometry(1.14, 0.46).toNonIndexed();
    plate.translate(0, 0.42, 0.222);
    const uv = plate.attributes.uv;
    for (let vi = 0; vi < uv.count; vi++) {
      uv.setY(vi, 1 - (i + 1) / 4 + uv.getY(vi) / 4);   // this stone's atlas row
    }

    // Face the garden (−x, upstream), with a small individual turn and lean;
    // the base sits sunk into the bank.
    e.set(0, -Math.PI / 2 + (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.09);
    m.compose(new THREE.Vector3(x, groundY + 0.65, z), q.setFromEuler(e), one);
    slab.applyMatrix4(m);
    plate.applyMatrix4(m);
    slabGeos.push(slab);
    plateGeos.push(plate);
    list.push({ name: HEAD_NAMES[i], x, z });
  }

  const slabs = new THREE.Mesh(
    mergeGeos(slabGeos, false),
    new THREE.MeshLambertMaterial({ color: 0xA39B8B, flatShading: true }),
  );
  scene.add(slabs);

  const plates = new THREE.Mesh(
    mergeGeos(plateGeos, true),
    new THREE.MeshLambertMaterial({
      map: makeNameAtlas(),
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  scene.add(plates);

  return { list };
}
