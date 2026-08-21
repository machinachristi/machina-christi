// The garden's creatures: birds and doves on the wing (perching by day,
// roosting in the two sacred trees at dusk), a lamb and two cattle grazing
// the meadow, a small school of fish swimming the river's wadable stretch,
// and small wings among the blossoms — butterflies flitting the flower band
// by day, bees humming at their two beds — "every beast of the field, and
// every fowl of the air" (Genesis 2:19), each with a simple life of its own.
//
// Each creature also bears its name — the plain Hebrew nouns, as the first
// tongue might have spoken them — given to the walker who draws near
// (Genesis 2:19-20): "whatsoever Adam called every living creature, that
// was the name thereof."

import * as THREE from 'three';
import { heightAt, riverZ, riverEdgeDist } from './terrain.js';
import { TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { clamp, damp, shortestAngle, mulberry32 } from '../util.js';

// Two beds of blossom the bees keep to — open meadow south of the river,
// inside the flower band. Exported so the ambience can hum near them too.
export const BEE_PATCHES = [{ x: 16, z: -10 }, { x: -11, z: -15 }];

const X_AXIS = new THREE.Vector3(1, 0, 0);

function makeBird(tone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: tone, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), mat);
  body.rotation.x = Math.PI / 2;   // nose forward along +z
  g.add(body);
  const wingGeo = new THREE.BoxGeometry(0.55, 0.02, 0.18);
  const wingL = new THREE.Mesh(wingGeo, mat);
  wingL.position.x = -0.3;
  const wingR = new THREE.Mesh(wingGeo, mat);
  wingR.position.x = 0.3;
  g.add(wingL, wingR);
  return { group: g, wingL, wingR };
}

// A soft blob shadow grounds a creature without shadow maps.
function addShadow(g, r) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(r, 14),
    new THREE.MeshBasicMaterial({ color: 0x1c2814, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);
}

// Every grazer shares one build: its still parts merged into a single
// vertex-coloured geometry, its head merged into another on its own pivot,
// its four legs sharing one instanced mesh, and a blob shadow — four draw
// calls apiece, where the older hand-assembled builds spent nine or ten.
// The garden's establishing shot draws very nearly the whole world at once,
// so this is what keeps the whole herd inside the render budget.
//
// `legs` still presents one object per leg with its own `rotation.x`, so the
// walk cycle animates exactly as it always did; `syncLegs()` is what writes
// those four angles into the instances, once per frame.
function makeGrazer({ body, head, headAt, legGeo, legAt, legY, legColor, shadow }) {
  const g = new THREE.Group();
  const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  g.add(new THREE.Mesh(mergeColored(body), lambert()));

  const headPivot = new THREE.Group();
  headPivot.position.set(headAt[0], headAt[1], headAt[2]);
  headPivot.add(new THREE.Mesh(mergeColored(head), lambert()));
  g.add(headPivot);

  const legMesh = new THREE.InstancedMesh(
    legGeo,
    new THREE.MeshLambertMaterial({ color: legColor, flatShading: true }),
    legAt.length,
  );
  legMesh.frustumCulled = false;   // instance transforms outrun the base bounds
  g.add(legMesh);

  const legs = legAt.map(() => ({ rotation: { x: 0 } }));
  const legM = new THREE.Matrix4();
  const legQ = new THREE.Quaternion();
  const legP = new THREE.Vector3();
  const legS = new THREE.Vector3(1, 1, 1);
  function syncLegs() {
    for (let i = 0; i < legAt.length; i++) {
      legP.set(legAt[i][0], legY, legAt[i][1]);
      legQ.setFromAxisAngle(X_AXIS, legs[i].rotation.x);
      legM.compose(legP, legQ, legS);
      legMesh.setMatrixAt(i, legM);
    }
    legMesh.instanceMatrix.needsUpdate = true;
  }
  syncLegs();

  addShadow(g, shadow);
  return { group: g, headPivot, legs, syncLegs };
}

const LAMB_WOOL = new THREE.Color(0xEEE6D2);

function makeLamb() {
  return makeGrazer({
    body: [{
      geo: new THREE.CapsuleGeometry(0.24, 0.42, 3, 7).toNonIndexed()
        .rotateZ(Math.PI / 2).translate(0, 0.42, 0),
      color: LAMB_WOOL,
    }],
    head: [
      {
        geo: new THREE.SphereGeometry(0.14, 8, 6).toNonIndexed().translate(0, 0, 0.12),
        color: LAMB_WOOL,
      },
      ...[-1, 1].map(sx => ({
        geo: new THREE.ConeGeometry(0.045, 0.14, 4).toNonIndexed()
          .rotateZ(sx * 1.25).translate(sx * 0.12, 0.06, 0.1),
        color: LAMB_WOOL,
      })),
    ],
    headAt: [0, 0.55, 0.34],
    legGeo: new THREE.CylinderGeometry(0.035, 0.035, 0.34, 5),
    legAt: [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.2], [0.12, -0.2]],
    legY: 0.17,
    legColor: 0xEEE6D2,
    shadow: 0.36,
  });
}

// Cattle after the same idiom as the lamb, at pasture scale: a heavier
// capsule body, a boxy head with a pale muzzle and small out-turned horns.
const COW_PALE = new THREE.Color(0xD8CBB4);

function makeCow(tone) {
  const hide = new THREE.Color(tone);
  return makeGrazer({
    body: [{
      geo: new THREE.CapsuleGeometry(0.42, 0.85, 3, 8).toNonIndexed()
        .rotateZ(Math.PI / 2).translate(0, 0.78, 0),
      color: hide,
    }],
    head: [
      {
        geo: new THREE.BoxGeometry(0.34, 0.3, 0.4).toNonIndexed().translate(0, 0, 0.14),
        color: hide,
      },
      {
        geo: new THREE.BoxGeometry(0.26, 0.18, 0.16).toNonIndexed().translate(0, -0.07, 0.38),
        color: COW_PALE,
      },
      ...[-1, 1].map(sx => ({
        geo: new THREE.ConeGeometry(0.045, 0.22, 5).toNonIndexed()
          .rotateZ(sx * -0.9).translate(sx * 0.2, 0.2, 0.08),
        color: COW_PALE,
      })),
    ],
    headAt: [0, 1.0, 0.62],
    legGeo: new THREE.CylinderGeometry(0.07, 0.062, 0.6, 5),
    legAt: [[-0.22, 0.34], [0.22, 0.34], [-0.22, -0.34], [0.22, -0.34]],
    legY: 0.3,
    legColor: tone,
    shadow: 0.62,
  });
}

// A lamb wander target on open meadow south of the river.
function lambSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const x = (rng() * 2 - 1) * 24;
    const z = -2 - rng() * 20;
    if (riverEdgeDist(x, z) > 3.9 && Math.hypot(x, z) > 7) return { x, z };
  }
  return { x: -10, z: -14 };
}

// Cattle keep to the western meadow, clear of water and clearing alike.
function cowSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const x = -8 - rng() * 22;
    const z = (rng() * 2 - 1) * 15;
    if (riverEdgeDist(x, z) > 4.2 && Math.hypot(x, z) > 9) return { x, z };
  }
  return { x: -18, z: -8 };
}

// Goats keep the rising rim, sure-footed among the high stones (Psalm
// 104:18) — the garden's outer band, where the ground climbs toward the fog.
function goatSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 36 + rng() * 11;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > 4) return { x, z };
  }
  return { x: -44, z: 12 };
}

// The hart keeps the riverside, panting after the water brooks (Psalm
// 42:1) — a narrow band just off the bank, never far from the water.
function hartSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const x = (rng() * 2 - 1) * 34;
    const z = (rng() * 2 - 1) * 20;
    const d = riverEdgeDist(x, z);
    if (d > 1.6 && d < 4.2) return { x, z };
  }
  return { x: -20, z: riverZ(-20) + 3 };
}

// The wild ass ranges free over the whole plain, "scorneth the multitude
// of the city" (Job 39:5-8) — the widest range of any grazer, right out to
// the garden's rim.
function wildAssSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 18 + rng() * 32;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) > 3) return { x, z };
  }
  return { x: 42, z: -28 };
}

// A creeping thing keeps close to the dry ground by the water's edge
// (Genesis 1:24-25) — never far, never fast.
function tortoiseSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const x = (rng() * 2 - 1) * 30;
    const z = (rng() * 2 - 1) * 22;
    const d = riverEdgeDist(x, z);
    if (d > 1.8 && d < 5) return { x, z };
  }
  return { x: 14, z: riverZ(14) + 4 };
}

// A goat: a lighter, more sure-footed build than the lamb, small twisted
// horns rather than wool ears.
const GOAT_COAT = new THREE.Color(0xB8AC97);
const GOAT_DARK = new THREE.Color(0x5A5142);

function makeGoat() {
  return makeGrazer({
    body: [{
      geo: new THREE.CapsuleGeometry(0.2, 0.4, 3, 7).toNonIndexed()
        .rotateZ(Math.PI / 2).translate(0, 0.4, 0),
      color: GOAT_COAT,
    }],
    head: [
      {
        geo: new THREE.SphereGeometry(0.13, 8, 6).toNonIndexed().translate(0, 0, 0.1),
        color: GOAT_COAT,
      },
      ...[-1, 1].map(sx => ({
        geo: new THREE.ConeGeometry(0.03, 0.32, 4).toNonIndexed()
          .rotateZ(sx * 0.35).rotateX(-0.5).translate(sx * 0.07, 0.18, 0.02),
        color: GOAT_DARK,
      })),
    ],
    headAt: [0, 0.52, 0.32],
    legGeo: new THREE.CylinderGeometry(0.032, 0.032, 0.36, 5),
    legAt: [[-0.11, 0.18], [0.11, 0.18], [-0.11, -0.18], [0.11, -0.18]],
    legY: 0.18,
    legColor: 0x5A5142,
    shadow: 0.32,
  });
}

// A hart: a slighter, longer-legged build than the ox, a pair of small
// antlers over a tapered muzzle.
const HART_HIDE = new THREE.Color(0x9C7A4E);
const HART_ANTLER = new THREE.Color(0x6B5B45);

function makeHart() {
  return makeGrazer({
    body: [{
      geo: new THREE.CapsuleGeometry(0.22, 0.5, 3, 7).toNonIndexed()
        .rotateZ(Math.PI / 2).translate(0, 0.52, 0),
      color: HART_HIDE,
    }],
    head: [
      {
        geo: new THREE.ConeGeometry(0.11, 0.32, 6).toNonIndexed()
          .rotateX(Math.PI / 2).translate(0, 0, 0.12),
        color: HART_HIDE,
      },
      ...[-1, 1].map(sx => ({
        geo: new THREE.ConeGeometry(0.025, 0.34, 4).toNonIndexed()
          .rotateZ(sx * 0.5).rotateX(-0.3).translate(sx * 0.06, 0.22, -0.02),
        color: HART_ANTLER,
      })),
    ],
    headAt: [0, 0.68, 0.4],
    legGeo: new THREE.CylinderGeometry(0.032, 0.028, 0.5, 5),
    legAt: [[-0.12, 0.24], [0.12, 0.24], [-0.12, -0.24], [0.12, -0.24]],
    legY: 0.25,
    legColor: 0x9C7A4E,
    shadow: 0.4,
  });
}

// The wild ass: a rangier, plainer build than the hart — long pale ears,
// no antlers, a stockier boxed muzzle built for going its own distance.
const ASS_HIDE = new THREE.Color(0xA79176);
const ASS_PALE = new THREE.Color(0xD8CBB0);

function makeWildAss() {
  return makeGrazer({
    body: [{
      geo: new THREE.CapsuleGeometry(0.24, 0.52, 3, 7).toNonIndexed()
        .rotateZ(Math.PI / 2).translate(0, 0.5, 0),
      color: ASS_HIDE,
    }],
    head: [
      {
        geo: new THREE.BoxGeometry(0.18, 0.2, 0.32).toNonIndexed().translate(0, 0, 0.12),
        color: ASS_HIDE,
      },
      ...[-1, 1].map(sx => ({
        geo: new THREE.ConeGeometry(0.045, 0.3, 4).toNonIndexed()
          .rotateZ(sx * 0.3).rotateX(-0.15).translate(sx * 0.08, 0.2, 0.02),
        color: ASS_PALE,
      })),
    ],
    headAt: [0, 0.66, 0.38],
    legGeo: new THREE.CylinderGeometry(0.036, 0.032, 0.48, 5),
    legAt: [[-0.13, 0.24], [0.13, 0.24], [-0.13, -0.24], [0.13, -0.24]],
    legY: 0.24,
    legColor: 0xA79176,
    shadow: 0.4,
  });
}

// A fawn: the hart's build at a fraction of the scale, no antlers yet —
// "unsteady but quick to follow" (Job 39:1).
const FAWN_HIDE = new THREE.Color(0xC9A876);

function makeFawn() {
  return makeGrazer({
    body: [{
      geo: new THREE.CapsuleGeometry(0.13, 0.28, 3, 7).toNonIndexed()
        .rotateZ(Math.PI / 2).translate(0, 0.3, 0),
      color: FAWN_HIDE,
    }],
    head: [{
      geo: new THREE.ConeGeometry(0.065, 0.18, 6).toNonIndexed()
        .rotateX(Math.PI / 2).translate(0, 0, 0.07),
      color: FAWN_HIDE,
    }],
    headAt: [0, 0.4, 0.24],
    legGeo: new THREE.CylinderGeometry(0.02, 0.017, 0.28, 5),
    legAt: [[-0.07, 0.14], [0.07, 0.14], [-0.07, -0.14], [0.07, -0.14]],
    legY: 0.14,
    legColor: 0xC9A876,
    shadow: 0.22,
  });
}

// Concatenate non-indexed geometries, painting each its own flat colour into
// a shared vertex-colour attribute — so a creature built of many small parts
// can still be drawn as one.
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
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  merged.computeVertexNormals();   // non-indexed → true per-face normals
  return merged;
}

// A lion: the heaviest build in the garden, a dark mane ringing a broad
// head, a tufted tail — and nothing at all to be afraid of here (Isaiah
// 11:6-7). Same bones as every other grazer, so it grazes "straw like the
// ox" with the same head dip.
const LION_COAT = new THREE.Color(0xC9975A);
const LION_MANE = new THREE.Color(0x8A5A2E);

function makeLion() {
  return makeGrazer({
    body: [
      {
        geo: new THREE.CapsuleGeometry(0.3, 0.72, 3, 8).toNonIndexed()
          .rotateZ(Math.PI / 2).translate(0, 0.6, 0),
        color: LION_COAT,
      },
      {
        geo: new THREE.CylinderGeometry(0.022, 0.022, 0.5, 5).toNonIndexed()
          .rotateX(0.7).translate(0, 0.68, -0.52),
        color: LION_COAT,
      },
      {
        geo: new THREE.IcosahedronGeometry(0.06, 0).toNonIndexed()
          .translate(0, 0.52, -0.68),
        color: LION_MANE,
      },
    ],
    head: [
      {
        geo: new THREE.IcosahedronGeometry(0.3, 0).toNonIndexed().translate(0, 0, 0.04),
        color: LION_MANE,
      },
      {
        geo: new THREE.BoxGeometry(0.24, 0.22, 0.26).toNonIndexed().translate(0, 0, 0.24),
        color: LION_COAT,
      },
      {
        geo: new THREE.BoxGeometry(0.14, 0.11, 0.12).toNonIndexed().translate(0, -0.06, 0.4),
        color: LION_COAT,
      },
    ],
    headAt: [0, 0.74, 0.5],
    legGeo: new THREE.CylinderGeometry(0.062, 0.055, 0.5, 5),
    legAt: [[-0.17, 0.28], [0.17, 0.28], [-0.17, -0.28], [0.17, -0.28]],
    legY: 0.25,
    legColor: 0xC9975A,
    shadow: 0.5,
  });
}

// A wolf: the same bones as the lion, at leaner scale — a narrow head, no
// mane — and nothing at all to dread here either: "the wolf also shall dwell
// with the lamb" (Isaiah 11:6).
const WOLF_COAT = new THREE.Color(0x8C8A86);
const WOLF_DARK = new THREE.Color(0x5C5A56);

function makeWolf() {
  return makeGrazer({
    body: [
      {
        geo: new THREE.CapsuleGeometry(0.2, 0.62, 3, 7).toNonIndexed()
          .rotateZ(Math.PI / 2).translate(0, 0.42, 0),
        color: WOLF_COAT,
      },
      {
        geo: new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5).toNonIndexed()
          .rotateX(-0.3).translate(0, 0.5, -0.5),
        color: WOLF_DARK,
      },
    ],
    head: [
      {
        geo: new THREE.BoxGeometry(0.18, 0.18, 0.3).toNonIndexed().translate(0, 0, 0.12),
        color: WOLF_COAT,
      },
      {
        geo: new THREE.ConeGeometry(0.07, 0.18, 4).toNonIndexed().translate(0, 0, 0.3),
        color: WOLF_DARK,
      },
      ...[-1, 1].map(sx => ({
        geo: new THREE.ConeGeometry(0.05, 0.14, 4).toNonIndexed()
          .rotateZ(sx * 1.1).translate(sx * 0.09, 0.11, 0.05),
        color: WOLF_DARK,
      })),
    ],
    headAt: [0, 0.5, 0.34],
    legGeo: new THREE.CylinderGeometry(0.04, 0.038, 0.42, 5),
    legAt: [[-0.13, 0.24], [0.13, 0.24], [-0.13, -0.24], [0.13, -0.24]],
    legY: 0.21,
    legColor: 0x8C8A86,
    shadow: 0.4,
  });
}

// A creeping thing: a low domed shell over four stubby legs, a small head
// poking out front — the least of the garden's creatures, and the slowest.
const TORTOISE_SHELL = new THREE.Color(0x5B6B3E);
const TORTOISE_SKIN = new THREE.Color(0x93A374);

function makeTortoise() {
  return makeGrazer({
    body: [{
      geo: new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.7)
        .toNonIndexed().translate(0, 0.14, 0),
      color: TORTOISE_SHELL,
    }],
    head: [{
      geo: new THREE.SphereGeometry(0.07, 6, 5).toNonIndexed().translate(0, 0, 0.06),
      color: TORTOISE_SKIN,
    }],
    headAt: [0, 0.14, 0.22],
    legGeo: new THREE.CylinderGeometry(0.045, 0.04, 0.14, 5),
    legAt: [[-0.15, 0.12], [0.15, 0.12], [-0.15, -0.12], [0.15, -0.12]],
    legY: 0.07,
    legColor: 0x93A374,
    shadow: 0.24,
  });
}

// A fish: a low-poly body nosing forward along +z, with a tail fin that
// sculls. Small enough that two cones read as life through the water.
function makeFish(tone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: tone, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.34, 4), mat);
  body.rotation.x = Math.PI / 2;   // nose forward along +z
  body.position.z = 0.05;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3), mat);
  tail.rotation.x = Math.PI / 2;   // apex tucks into the body's rear
  tail.position.z = -0.18;
  g.add(tail);
  return { group: g, tail };
}

// A butterfly: two petal-toned wings hinged at a slip of a body. The wings
// share two geometries across all butterflies; only the material tints.
const WING_L = new THREE.PlaneGeometry(0.17, 0.12).rotateX(-Math.PI / 2).translate(-0.095, 0, 0);
const WING_R = new THREE.PlaneGeometry(0.17, 0.12).rotateX(-Math.PI / 2).translate(0.095, 0, 0);
const BUTTERFLY_BODY = new THREE.BoxGeometry(0.022, 0.022, 0.13);
const BODY_MAT = new THREE.MeshLambertMaterial({ color: 0x3A3226, flatShading: true });

// The quail's one hour of the day (Exodus 16:13), as a pure function of the
// sky's own clock — no state, so it reads the same however the walker has
// skipped about the cycle with __world.setTime(). The window opens at dusk
// (t = 0.55) and runs 0.55 of a cycle, carrying across midnight into the
// early morning; `landed` is how far the covey has come down out of the air,
// `presence` how much of it is still here at all.
const QUAIL_FROM = 0.55;    // dusk: "at even the quails came up"
const QUAIL_SPAN = 0.55;    // through the night, gone as the dew lifts
const QUAIL_FALL = 0.07;    // how long the coming-down itself takes
const QUAIL_FLY_H = 4.2;    // how high they are when first seen
const QUAIL_APPROACH = 7;   // how far back down their line they begin

export function quailOf(t) {
  const w = (t - QUAIL_FROM + 1) % 1;
  if (w >= QUAIL_SPAN) return { presence: 0, landed: 1 };
  const leaving = (w - (QUAIL_SPAN - 0.06)) / 0.06;
  return {
    presence: clamp(1 - leaving, 0, 1),
    landed: clamp(w / QUAIL_FALL, 0, 1),
  };
}

function makeButterfly(tone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: tone, side: THREE.DoubleSide, flatShading: true });
  const wingL = new THREE.Mesh(WING_L, mat);
  const wingR = new THREE.Mesh(WING_R, mat);
  g.add(wingL, wingR, new THREE.Mesh(BUTTERFLY_BODY, BODY_MAT));
  return { group: g, wingL, wingR };
}

// `staticNamables` (v10): spots that don't move but still answer the naming
// — the fig and pomegranate trees (scenes/fruit.js) — each shaped like a
// creature enough to share the one candidate list: `{ pos: {x,y,z}, name,
// label, kind }`.
export function createCreatures(scene, rng, staticNamables = []) {
  const group = new THREE.Group();
  scene.add(group);

  // ── The flyers: three birds and two doves ─────────────────
  // Each is assigned its own roosting perch in the canopies of the two
  // sacred trees: at dusk every flyer comes home to them, and through the
  // day the doves take short perch-rests there too.
  const hL = heightAt(TREE_OF_LIFE_POS.x, TREE_OF_LIFE_POS.z);
  const hK = heightAt(TREE_OF_KNOWLEDGE_POS.x, TREE_OF_KNOWLEDGE_POS.z);
  const PERCHES = [
    new THREE.Vector3(TREE_OF_LIFE_POS.x, hL + 5.55, TREE_OF_LIFE_POS.z),
    new THREE.Vector3(TREE_OF_LIFE_POS.x - 0.95, hL + 4.2, TREE_OF_LIFE_POS.z + 0.3),
    new THREE.Vector3(TREE_OF_KNOWLEDGE_POS.x + 0.55, hK + 4.75, TREE_OF_KNOWLEDGE_POS.z),
    new THREE.Vector3(TREE_OF_LIFE_POS.x + 0.85, hL + 4.45, TREE_OF_LIFE_POS.z - 0.45),
    new THREE.Vector3(TREE_OF_KNOWLEDGE_POS.x - 0.5, hK + 3.85, TREE_OF_KNOWLEDGE_POS.z + 0.45),
  ];

  const flyers = [];
  const flyerDefs = [
    { kind: 'bird', tone: 0xF5F0E4, name: 'Tsippor', label: 'the bird' },
    { kind: 'bird', tone: 0xD9C9AC, name: 'Tsippor', label: 'the bird' },
    { kind: 'bird', tone: 0xFFFFFF, name: 'Tsippor', label: 'the bird' },
    { kind: 'dove', tone: 0xF7F4EC, name: 'Yonah', label: 'the dove' },
    { kind: 'dove', tone: 0xEFE8DA, name: 'Yonah', label: 'the dove' },
  ];
  for (let i = 0; i < flyerDefs.length; i++) {
    const def = flyerDefs[i];
    const bird = makeBird(def.tone);
    const dove = def.kind === 'dove';
    // Doves circle lower and closer to the heart of the garden.
    const orbit = dove
      ? {
          cx: -2 + (i - 3) * 5, cz: 2 - (i - 3) * 6,
          radius: 8 + (i - 3) * 2, height: 6 + (i - 3) * 1.4,
          speed: 0.16 * ((i % 2) ? -1 : 1),
          theta: rng() * Math.PI * 2, flap: rng() * Math.PI * 2,
        }
      : {
          cx: -8 + i * 9, cz: -4 + (i % 2) * 10,
          radius: 13 + i * 5, height: 9 + i * 2.6,
          speed: (0.14 + i * 0.035) * (i % 2 ? -1 : 1),
          theta: rng() * Math.PI * 2, flap: rng() * Math.PI * 2,
        };
    group.add(bird.group);
    flyers.push({
      ...bird, orbit,
      kind: def.kind, name: def.name, label: def.label,
      mode: 'fly',                              // fly | toRoost | roost | toPerch | perched | toFly
      perch: PERCHES[i],
      restIn: dove ? 14 + rng() * 20 : Infinity, // day perch-rests: doves only
      restFor: 0,
    });
  }

  // A lone eagle keeps the high air over the whole garden — apart from the
  // census above (kept off `flyers` on purpose: its own much simpler cycle,
  // not the five-flyer flock's), its wingbeat far slower and broader than
  // any bird's — "doth the eagle mount up at thy command, and make her nest
  // on high?" (Job 39:27). Its own seeded stream, own model.
  const eagleRng = mulberry32(20260724);
  const eagle = makeBird(0x5C4630);
  eagle.group.scale.setScalar(2.4);
  group.add(eagle.group);
  const EAGLE_NEST = (() => {
    const x = -38, z = -30;
    return new THREE.Vector3(x, heightAt(x, z) + 22, z);
  })();
  const eagleOrbit = {
    cx: 0, cz: 0, radius: 46, height: 30, speed: 0.05,
    theta: eagleRng() * Math.PI * 2, flap: eagleRng() * Math.PI * 2,
  };
  let eagleMode = 'fly';   // fly | toNest | nest | toFly

  // A raven, black-winged, on its own smaller circuit under the eagle's —
  // "Who provideth for the raven his food? when his young ones cry unto God,
  // they wander for lack of meat" (Job 38:41). The point of the raven in
  // Scripture is that it is *fed*: it neither sows nor reaps nor keeps a
  // storehouse, and it wants for nothing. So this one never hunts and never
  // searches. It flies its circuit, drops to whichever provision is next in
  // turn, is fed, and lifts off again — the food is simply always there.
  // Its own seeded stream, its own model, kept off the flock's `flyers`
  // census the same way the eagle is.
  const ravenRng = mulberry32(20260815);
  const raven = makeBird(0x24202A);
  raven.group.scale.setScalar(1.2);
  raven.name = 'Orev';
  raven.label = 'the raven';
  raven.kind = 'raven';
  group.add(raven.group);
  // Where it is fed: the two grain valleys (scenes/grain.js's own PATCHES)
  // and the open ground under the fig (scenes/fig.js) — hardcoded here, the
  // same way ants.js already reads the eastern grain patch, rather than
  // reaching across modules for it.
  const PROVISION = [
    { x: -26, z: -22 },
    { x: 21, z: -27 },
    { x: 18, z: 6 },
  ].map(sp => new THREE.Vector3(sp.x, heightAt(sp.x, sp.z) + 0.18, sp.z));
  const RAVEN_ROOST = (() => {
    const x = 30, z = 26;
    return new THREE.Vector3(x, heightAt(x, z) + 9, z);
  })();
  const ravenOrbit = {
    cx: 2, cz: -4, radius: 27, height: 12, speed: -0.11,
    theta: ravenRng() * Math.PI * 2, flap: ravenRng() * Math.PI * 2,
  };
  let ravenMode = 'fly';   // fly | toFeed | feeding | toFly | toRoost | roost
  let ravenFeedIn = 18 + ravenRng() * 30;
  let ravenFeedFor = 0;
  let ravenAt = Math.floor(ravenRng() * PROVISION.length);

  // ── The grazers: one lamb, two cattle ─────────────────────
  // All share one life: graze a while, wander to a new patch, graze again.
  const grazers = [];
  {
    const lamb = makeLamb();
    const s0 = lambSpot(rng);
    lamb.group.position.set(s0.x, heightAt(s0.x, s0.z), s0.z);
    group.add(lamb.group);
    grazers.push({
      ...lamb, spot: lambSpot, speed: 0.72, stepFreq: 7, dip: 0.95,
      kind: 'lamb', name: 'Taleh', label: 'the lamb',
      mode: 'graze', until: 2 + rng() * 3, target: null, phase: 0, rest: 0,
    });
    for (const tone of [0x9C6B4A, 0x7E5A3C]) {
      const cow = makeCow(tone);
      const s1 = cowSpot(rng);
      cow.group.position.set(s1.x, heightAt(s1.x, s1.z), s1.z);
      cow.group.rotation.y = rng() * Math.PI * 2;
      group.add(cow.group);
      grazers.push({
        ...cow, spot: cowSpot, speed: 0.55, stepFreq: 5, dip: 0.7,
        kind: 'ox', name: 'Shor', label: 'the ox',
        mode: 'graze', until: 3 + rng() * 5, target: null, phase: 0,
      });
    }
  }

  // A flock begun (Genesis 1:24): two more lambs join, so the first is no
  // longer alone. Their own seeded stream, appended after every draw above,
  // so the shared planting rng — and everything after it in this file —
  // stays exactly as it was before they joined.
  const flockRng = mulberry32(20260715);
  for (let i = 0; i < 2; i++) {
    const lamb2 = makeLamb();
    const s2 = lambSpot(flockRng);
    lamb2.group.position.set(s2.x, heightAt(s2.x, s2.z), s2.z);
    group.add(lamb2.group);
    grazers.push({
      ...lamb2, spot: lambSpot, speed: 0.72, stepFreq: 7, dip: 0.95,
      kind: 'lamb', name: 'Taleh', label: 'the lamb',
      mode: 'graze', until: 2 + flockRng() * 3, target: null, phase: 0, rest: 0,
    });
  }

  // Goats keep the rising rim, sure-footed among the high stones (Psalm
  // 104:18); a lone hart keeps the riverside, panting after the water
  // brooks (Psalm 42:1) — v12, its own seeded stream, appended after every
  // draw above so nothing already grazing shifts.
  const v12Rng = mulberry32(20260716);
  for (let i = 0; i < 2; i++) {
    const goat = makeGoat();
    const s3 = goatSpot(v12Rng);
    goat.group.position.set(s3.x, heightAt(s3.x, s3.z), s3.z);
    goat.group.rotation.y = v12Rng() * Math.PI * 2;
    group.add(goat.group);
    grazers.push({
      ...goat, spot: goatSpot, speed: 0.85, stepFreq: 8, dip: 0.6,
      kind: 'goat', name: 'Ez', label: 'the goat',
      mode: 'graze', until: 2 + v12Rng() * 3, target: null, phase: 0,
    });
  }
  let hartEntry;
  {
    const hart = makeHart();
    const s4 = hartSpot(v12Rng);
    hart.group.position.set(s4.x, heightAt(s4.x, s4.z), s4.z);
    hart.group.rotation.y = v12Rng() * Math.PI * 2;
    group.add(hart.group);
    hartEntry = {
      ...hart, spot: hartSpot, speed: 1.0, stepFreq: 8, dip: 0.5,
      kind: 'hart', name: 'Ayal', label: 'the hart',
      mode: 'graze', until: 2 + v12Rng() * 3, target: null, phase: 0,
    };
    grazers.push(hartEntry);
  }

  // A creeping thing keeps close to the ground, never far from the water
  // (Genesis 1:24-25) — v13, its own seeded stream, appended after every
  // draw above so nothing already grazing shifts.
  const creepRng = mulberry32(20260727);
  {
    const tortoise = makeTortoise();
    const s5 = tortoiseSpot(creepRng);
    tortoise.group.position.set(s5.x, heightAt(s5.x, s5.z), s5.z);
    tortoise.group.rotation.y = creepRng() * Math.PI * 2;
    group.add(tortoise.group);
    grazers.push({
      ...tortoise, spot: tortoiseSpot, speed: 0.1, stepFreq: 2.2, dip: 0.25,
      kind: 'tortoise', name: 'Remes', label: 'the creeping thing',
      mode: 'graze', until: 6 + creepRng() * 8, target: null, phase: 0,
    });
  }

  // The wild ass ranges free over the plain, keeping its own distance from
  // every path (Job 39:5-8); the hart's fawn keeps close beside her,
  // unsteady but quick to follow (Job 39:1) — v14, its own seeded stream,
  // appended after every draw above so nothing already grazing shifts.
  const v14Rng = mulberry32(20260730);
  {
    const wildAss = makeWildAss();
    const s6 = wildAssSpot(v14Rng);
    wildAss.group.position.set(s6.x, heightAt(s6.x, s6.z), s6.z);
    wildAss.group.rotation.y = v14Rng() * Math.PI * 2;
    group.add(wildAss.group);
    grazers.push({
      ...wildAss, spot: wildAssSpot, speed: 1.15, stepFreq: 8, dip: 0.5, wary: true,
      kind: 'wildass', name: 'Pere', label: 'the wild ass',
      mode: 'graze', until: 2 + v14Rng() * 3, target: null, phase: 0,
    });
  }
  {
    const fawn = makeFawn();
    const fx = hartEntry.group.position.x + 0.7, fz = hartEntry.group.position.z + 0.7;
    fawn.group.position.set(fx, heightAt(fx, fz), fz);
    group.add(fawn.group);
    grazers.push({
      ...fawn, kind: 'fawn', name: 'Ofer', label: "the fawn",
      speed: 1.3, stepFreq: 10, dip: 0, follow: hartEntry, wobble: v14Rng() * Math.PI * 2,
      mode: 'follow', until: 0, target: null, phase: 0,
    });
  }

  // A lion keeps company with the flock, and the fear between them is not
  // yet: "the calf and the young lion and the fatling together... and the
  // lion shall eat straw like the ox" (Isaiah 11:6-7) — v15, its own seeded
  // stream, appended after every draw above so nothing already grazing
  // shifts. It never hunts and never flees: it simply keeps near the lambs,
  // and lies down among them when it has caught them up.
  const v15Rng = mulberry32(20260734);
  {
    const lion = makeLion();
    const s7 = lambSpot(v15Rng);
    lion.group.position.set(s7.x, heightAt(s7.x, s7.z), s7.z);
    lion.group.rotation.y = v15Rng() * Math.PI * 2;
    group.add(lion.group);
    grazers.push({
      ...lion, speed: 0.6, stepFreq: 5, dip: 0.5,
      kind: 'lion', name: 'Aryeh', label: 'the lion',
      mode: 'rest', until: 4 + v15Rng() * 6, target: null, phase: 0, rest: 0, graze: false,
    });
  }

  // "The wolf also shall dwell with the lamb" (Isaiah 11:6) — v18, its own
  // seeded stream, appended after every draw above so nothing already
  // grazing shifts. Same idiom as the lion exactly: it keeps near the flock
  // and lies down among them once it has caught them up.
  const v18Rng = mulberry32(20260813);
  {
    const wolf = makeWolf();
    const s8 = lambSpot(v18Rng);
    wolf.group.position.set(s8.x, heightAt(s8.x, s8.z), s8.z);
    wolf.group.rotation.y = v18Rng() * Math.PI * 2;
    group.add(wolf.group);
    grazers.push({
      ...wolf, speed: 0.68, stepFreq: 6, dip: 0.5,
      kind: 'wolf', name: 'Zeev', label: 'the wolf',
      mode: 'rest', until: 4 + v18Rng() * 6, target: null, phase: 0, rest: 0, graze: false,
    });
  }

  // ── The covey: quail at evening ───────────────────────────
  // "At even the quails came up, and covered the camp: and in the morning
  // the dew lay round about the host" (Exodus 16:13). They are a creature of
  // one hour only: they come up out of the dusk low over the meadow, drop
  // into the grass, keep there the whole night through, and are gone again
  // by the time the morning dew has lifted — so the garden is never quite
  // the same place after dark as it was before.
  //
  // Body and head merge into one geometry so the whole covey is a single
  // instanced draw; a quail on the ground is mostly a plump body anyway.
  const v16Rng = mulberry32(20260736);
  const QUAIL_COUNT = 9;
  const quailMesh = new THREE.InstancedMesh(
    mergeColored([
      {
        geo: new THREE.ConeGeometry(0.13, 0.36, 6).toNonIndexed()
          .rotateX(-Math.PI / 2).translate(0, 0, -0.04),
        color: new THREE.Color(0x8A7350),
      },
      {
        geo: new THREE.SphereGeometry(0.075, 6, 5).toNonIndexed().translate(0, 0.07, 0.17),
        color: new THREE.Color(0x6B5636),
      },
      {
        geo: new THREE.SphereGeometry(0.045, 5, 4).toNonIndexed().translate(0, 0.02, 0.24),
        color: new THREE.Color(0xE4DAC2),
      },
    ]),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    QUAIL_COUNT,
  );
  quailMesh.frustumCulled = false;
  quailMesh.visible = false;
  group.add(quailMesh);

  // The covey keeps one patch of meadow, close together — they cover ground
  // rather than scatter over it.
  const coveyHeart = lambSpot(v16Rng);
  const covey = [];
  for (let i = 0; i < QUAIL_COUNT; i++) {
    const a = v16Rng() * Math.PI * 2;
    const r = 0.6 + v16Rng() * 2.6;
    const x = coveyHeart.x + Math.cos(a) * r;
    const z = coveyHeart.z + Math.sin(a) * r;
    covey.push({
      kind: 'quail', name: 'Slav', label: 'the quail',
      x, z, groundY: heightAt(x, z),
      yaw: v16Rng() * Math.PI * 2,
      bob: v16Rng() * Math.PI * 2,
      // Each comes in on its own line and settles a beat apart from the rest.
      lag: v16Rng() * 0.35,
      pos: new THREE.Vector3(x, heightAt(x, z), z),
    });
  }
  const quailM = new THREE.Matrix4();
  const quailQ = new THREE.Quaternion();
  const quailS = new THREE.Vector3(1, 1, 1);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  // ── Fish ──────────────────────────────────────────────────
  // Five fish — one gold — in the wadable stretch west of the crossing.
  // Each swims a slow elongated loop that follows the river's meander,
  // staying inside the channel and well clear of the stepping stones
  // (anchors + half-lengths never reach past x ≈ 5), and rises now and
  // then so its back just breaks the rippling surface.
  const fishTones = [0x8FA8B8, 0x7C97A8, 0xA9BDC4, 0xD9B36A, 0x93A9A0];
  const fish = [];
  for (let i = 0; i < 5; i++) {
    const f = makeFish(fishTones[i]);
    const loop = {
      cx: -38 + i * 8.5 + rng() * 2.5,            // anchors spread along the stretch
      lx: 3.5 + rng() * 2.5,                      // half-length of the loop
      lz: 0.8 + rng() * 0.5,                      // half-width, inside the channel
      speed: (0.35 + rng() * 0.25) * (i % 2 ? -1 : 1),
      theta: rng() * Math.PI * 2,
      wig: rng() * Math.PI * 2,
      bob: rng() * Math.PI * 2,
    };
    loop.baseCx = loop.cx;   // its home anchor, to ease back to when the still walker leaves
    loop.rise = 0;           // 0 normally → 1 drawn up near a seated watcher
    const x0 = loop.cx + Math.cos(loop.theta) * loop.lx;
    f.group.position.set(x0, -0.8, riverZ(x0) + Math.sin(loop.theta) * loop.lz);
    group.add(f.group);
    // The golden fish (tone 0xD9B36A) alone bears a name of its own.
    const gold = i === 3;
    fish.push({
      ...f, loop,
      kind: 'fish',
      name: gold ? 'Zahav' : 'Dag',
      label: gold ? 'the golden fish' : 'the fish',
    });
  }

  // ── Small wings: six butterflies, eight bees ──────────────
  // Their own seeded stream, appended after the elder creatures' draws, so
  // nothing shifts in the garden's existing planting or wanderings.
  const wingRng = mulberry32(20260707);

  // A flutter target on dry meadow — anywhere in the flower band.
  function flutterSpot() {
    for (let i = 0; i < 12; i++) {
      const a = wingRng() * Math.PI * 2;
      const r = 5 + wingRng() * 29;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (riverEdgeDist(x, z) > 2) return { x, z };
    }
    return { x: 10, z: -10 };
  }

  const BUTTERFLY_TONES = [0xE8D5A3, 0xC97BA2, 0xF2F2E9, 0xD98A5B, 0xC9A227, 0xEFE8DA];
  const butterflies = [];
  for (let i = 0; i < 6; i++) {
    const B = makeButterfly(BUTTERFLY_TONES[i]);
    const s0 = flutterSpot();
    B.group.position.set(s0.x, Math.max(heightAt(s0.x, s0.z), -0.45) + 0.55, s0.z);
    group.add(B.group);
    butterflies.push({
      ...B, kind: 'butterfly', name: 'Parpar', label: 'the butterfly',
      mode: 'flit',                            // flit by day | rest by night
      target: flutterSpot(), until: 6 + wingRng() * 8,
      flap: wingRng() * Math.PI * 2, bob: wingRng() * Math.PI * 2,
    });
  }

  // The bees: one instanced mesh of golden specks, each circling its patch.
  // Radii are laddered so every patch keeps one bee close enough to its
  // heart that a walker standing there is always within naming reach.
  const beeMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.048, 6, 4),
    new THREE.MeshLambertMaterial({ color: 0xC9A227, flatShading: true }),
    8,
  );
  group.add(beeMesh);
  const beeM = new THREE.Matrix4();
  const swarm = [];
  for (let i = 0; i < 8; i++) {
    const patch = BEE_PATCHES[i % 2];
    swarm.push({
      kind: 'bee', name: 'Devorah', label: 'the bee',
      patch,
      r: 0.5 + ((i >> 1) % 4) * 0.5,
      rate: (1.6 + wingRng() * 1.8) * ((i >> 1) % 2 ? -1 : 1),
      theta: wingRng() * Math.PI * 2,
      bob: wingRng() * Math.PI * 2,
      lift: 0.35 + ((i * 13) % 3) * 0.18,
      pos: new THREE.Vector3(patch.x, 0, patch.z),
    });
  }

  // Glide a flyer toward a point; returns remaining distance.
  function glideToward(b, target, dt) {
    const p = b.group.position;
    const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
    const dist = Math.hypot(dx, dy, dz);
    const step = Math.min(dist, 7 * dt);
    if (dist > 1e-4) {
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.z += (dz / dist) * step;
      const yaw = Math.atan2(dx, dz);
      b.group.rotation.y += shortestAngle(b.group.rotation.y, yaw) * clamp(dt * 4, 0, 1);
    }
    return dist - step;
  }

  // ── The naming (Genesis 2:19-20) ──────────────────────────
  // Whatever the walker draws near is named. A short dwell keeps names from
  // strobing mid-stride; a touch of hysteresis lets a name linger while the
  // walker stands close by. Flyers count even overhead — a wing passing low
  // above the walker is a naming too.
  const NAME_DWELL = 0.35;
  let named = null;       // the creature whose name is presently given
  let candidate = null;   // the creature being dwelt toward
  // How close the walker must come before a wary creature (the wild ass,
  // Job 39:5-8) breaks off and puts ground between them.
  const WARY_RADIUS = 6;
  // How near the flock the lion is content to be before it lies down among
  // them (Isaiah 11:6-7).
  const LION_NEAR = 3.2;
  let dwelt = 0;

  function nearestNamable(walker) {
    let best = null, bestD = Infinity;
    const consider = (c, reach, vLimit) => {
      const p = c.group ? c.group.position : c.pos;
      const d = Math.hypot(p.x - walker.x, p.z - walker.z);
      const keep = c === named ? reach + 0.8 : reach;   // linger once given
      if (d <= keep && Math.abs(p.y - walker.y) <= vLimit && d < bestD) {
        best = c;
        bestD = d;
      }
    };
    for (const b of flyers) consider(b, 2.4, 9);
    // The raven counts where the eagle does not: the eagle never leaves the
    // high air, but the raven comes right down to the ground to be fed, and
    // a bird at your feet is a bird you can name.
    consider(raven, 2.4, 9);
    for (const G of grazers) consider(G, 2.6, 4);
    for (const f of fish) consider(f, 2.4, 4);
    for (const B of butterflies) consider(B, 2.0, 3);
    if (beeMesh.visible) for (const B of swarm) consider(B, 1.7, 2.6);
    // The covey, only while it is actually here — and only once it is down
    // in the grass, since there is no naming a bird still overhead.
    if (quailMesh.visible) for (const Q of covey) consider(Q, 2.0, 1.6);
    // Fruit in season (Genesis 1:29): hangs well above the walker's head, so
    // it wants a generous vertical reach — the same idiom as a flyer's low pass.
    for (const nm of staticNamables) consider(nm, 2.2, 6);
    return best;
  }

  let t = 0;
  const orbitPoint = new THREE.Vector3();
  // `lure`: where a still, seated walker sits by the water. When present the
  // shyer creatures forget their wariness and draw near it — the fish rise
  // and gather to the watcher, and a butterfly or two comes to hover close —
  // and when it clears they ease back to their own lives (Genesis 2:19: the
  // creatures came to the man). Every effect is reversible, so the garden
  // returns to exactly itself once the walker rises.
  // `sabbath` (v11, Genesis 2:2-3): on the seventh day every creature keeps
  // a deeper rest — a flat multiplier on their own wandering rates, so nothing
  // stops outright, everything only stiller.
  function update(dt, night = 0, walker = null, lure = null, sabbath = false, cycleT = 0.075) {
    t += dt;
    const REST = sabbath ? 0.4 : 1;

    // The covey comes up at evening and keeps the grass till the dew lifts.
    const quailHour = quailOf(cycleT);
    quailMesh.visible = quailHour.presence > 0.02;
    if (quailMesh.visible) {
      for (let i = 0; i < covey.length; i++) {
        const Q = covey[i];
        // Each bird lands a beat after the one before it, so the covey comes
        // down as a scatter rather than all together on one frame.
        const down = clamp((quailHour.landed - Q.lag) / (1 - Q.lag), 0, 1);
        const rise = 1 - down;
        // Still in the air: back down its own line, and high.
        Q.pos.set(
          Q.x - Math.sin(Q.yaw) * QUAIL_APPROACH * rise,
          Q.groundY + QUAIL_FLY_H * rise * rise + Math.sin(t * 2.2 + Q.bob) * 0.03 * down,
          Q.z - Math.cos(Q.yaw) * QUAIL_APPROACH * rise,
        );
        quailM.compose(
          Q.pos,
          quailQ.setFromAxisAngle(Y_AXIS, Q.yaw),
          quailS.set(1, 1, 1),
        );
        quailMesh.setMatrixAt(i, quailM);
      }
      quailMesh.instanceMatrix.needsUpdate = true;
    }

    // Choose the one fish nearest a lure to be the one that draws near; the
    // rest keep to their loops. (Found before the fish loop so it can steer.)
    let luredFish = null;
    if (lure) {
      let bestD = Infinity;
      for (const f of fish) {
        const d = Math.hypot(f.group.position.x - lure.x, f.group.position.z - lure.z);
        if (d < bestD) { bestD = d; luredFish = f; }
      }
    }

    if (walker) {
      const near = nearestNamable(walker);
      if (near !== candidate) {
        candidate = near;
        dwelt = 0;
      } else {
        dwelt += dt;
      }
      if (!candidate) named = null;
      else if (candidate !== named && dwelt >= NAME_DWELL) named = candidate;
    }

    for (const b of flyers) {
      const o = b.orbit;

      // Dusk calls every flyer home; morning sends them aloft again.
      if (night > 0.45 && b.mode !== 'roost' && b.mode !== 'toRoost') b.mode = 'toRoost';
      else if (night < 0.18 && b.mode === 'roost') b.mode = 'toFly';

      if (b.mode === 'fly') {
        o.theta += o.speed * dt * REST;
        const x = o.cx + Math.cos(o.theta) * o.radius;
        const z = o.cz + Math.sin(o.theta) * o.radius;
        const y = o.height + Math.sin(o.theta * 2.3) * 0.8;
        b.group.position.set(x, y, z);
        // Face along the direction of travel (the orbit's tangent).
        const dir = Math.sign(o.speed);
        b.group.rotation.y = Math.atan2(-Math.sin(o.theta) * dir, Math.cos(o.theta) * dir);
        o.flap += dt * 9;
        const flap = Math.sin(o.flap) * 0.55 + 0.15;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
        if ((b.restIn -= dt) <= 0) {
          b.mode = 'toPerch';
          b.restFor = 8 + Math.abs(Math.sin(o.theta * 13)) * 9;
        }
      } else if (b.mode === 'toRoost' || b.mode === 'toPerch') {
        const left = glideToward(b, b.perch, dt);
        o.flap += dt * 5;                        // easier wingbeats on the glide
        const flap = Math.sin(o.flap) * 0.3 + 0.1;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
        if (left < 0.25) {
          b.group.position.copy(b.perch);
          b.mode = b.mode === 'toRoost' ? 'roost' : 'perched';
        }
      } else if (b.mode === 'roost' || b.mode === 'perched') {
        // Folded wings, the faintest breathing.
        const settle = 1.1 + Math.sin(t * 2.1 + o.flap) * 0.04;
        b.wingL.rotation.z = settle;
        b.wingR.rotation.z = -settle;
        if (b.mode === 'perched' && (b.restFor -= dt) <= 0) b.mode = 'toFly';
      }
      if (b.mode === 'toFly') {
        // Rejoin the circuit where the orbit now stands, then resume it.
        o.theta += o.speed * dt * REST;
        orbitPoint.set(
          o.cx + Math.cos(o.theta) * o.radius,
          o.height + Math.sin(o.theta * 2.3) * 0.8,
          o.cz + Math.sin(o.theta) * o.radius,
        );
        const left = glideToward(b, orbitPoint, dt);
        o.flap += dt * 9;
        const flap = Math.sin(o.flap) * 0.55 + 0.15;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
        if (left < 0.6) {
          b.mode = 'fly';
          if (b.kind === 'dove') b.restIn = 18 + Math.abs(Math.cos(o.theta * 7)) * 26;
        }
      }
    }

    // The eagle: its own much smaller cycle, apart from the flock above —
    // a wide, slow circuit high over the whole garden by day, a glide home
    // to its lofty nest at dusk (Job 39:27).
    {
      const o = eagleOrbit;
      if (night > 0.45 && eagleMode !== 'nest' && eagleMode !== 'toNest') eagleMode = 'toNest';
      else if (night < 0.18 && eagleMode === 'nest') eagleMode = 'toFly';

      if (eagleMode === 'fly') {
        o.theta += o.speed * dt * REST;
        const x = o.cx + Math.cos(o.theta) * o.radius;
        const z = o.cz + Math.sin(o.theta) * o.radius;
        const y = o.height + Math.sin(o.theta * 1.6) * 1.2;
        eagle.group.position.set(x, y, z);
        const dir = Math.sign(o.speed);
        eagle.group.rotation.y = Math.atan2(-Math.sin(o.theta) * dir, Math.cos(o.theta) * dir);
        o.flap += dt * 2.6;
        const flap = Math.sin(o.flap) * 0.4 + 0.15;
        eagle.wingL.rotation.z = flap;
        eagle.wingR.rotation.z = -flap;
      } else if (eagleMode === 'toNest') {
        const left = glideToward(eagle, EAGLE_NEST, dt);
        o.flap += dt * 1.4;
        const flap = Math.sin(o.flap) * 0.25 + 0.1;
        eagle.wingL.rotation.z = flap;
        eagle.wingR.rotation.z = -flap;
        if (left < 0.3) { eagle.group.position.copy(EAGLE_NEST); eagleMode = 'nest'; }
      } else if (eagleMode === 'nest') {
        const settle = 1.1 + Math.sin(t * 1.6) * 0.03;
        eagle.wingL.rotation.z = settle;
        eagle.wingR.rotation.z = -settle;
      } else if (eagleMode === 'toFly') {
        o.theta += o.speed * dt * REST;
        orbitPoint.set(
          o.cx + Math.cos(o.theta) * o.radius,
          o.height + Math.sin(o.theta * 1.6) * 1.2,
          o.cz + Math.sin(o.theta) * o.radius,
        );
        const left = glideToward(eagle, orbitPoint, dt);
        o.flap += dt * 2.6;
        const flap = Math.sin(o.flap) * 0.4 + 0.15;
        eagle.wingL.rotation.z = flap;
        eagle.wingR.rotation.z = -flap;
        if (left < 1.0) eagleMode = 'fly';
      }
    }

    // The raven: a lower, quicker circuit than the eagle's, broken through
    // the day by meals it never once has to look for (Job 38:41). It goes to
    // the next provision in turn — not the nearest, not a chosen one — is
    // fed there, and lifts off again.
    {
      const o = ravenOrbit;
      if (night > 0.5 && ravenMode !== 'roost' && ravenMode !== 'toRoost') ravenMode = 'toRoost';
      else if (night < 0.16 && ravenMode === 'roost') ravenMode = 'toFly';

      if (ravenMode === 'fly') {
        ravenFeedIn -= dt * REST;
        if (ravenFeedIn <= 0) {
          ravenAt = (ravenAt + 1) % PROVISION.length;
          ravenMode = 'toFeed';
        }
        o.theta += o.speed * dt * REST;
        const x = o.cx + Math.cos(o.theta) * o.radius;
        const z = o.cz + Math.sin(o.theta) * o.radius;
        const y = o.height + Math.sin(o.theta * 2.3) * 1.6;
        raven.group.position.set(x, y, z);
        const dir = Math.sign(o.speed);
        raven.group.rotation.y = Math.atan2(-Math.sin(o.theta) * dir, Math.cos(o.theta) * dir);
        o.flap += dt * 5.4;
        const flap = Math.sin(o.flap) * 0.5 + 0.12;
        raven.wingL.rotation.z = flap;
        raven.wingR.rotation.z = -flap;
      } else if (ravenMode === 'toFeed') {
        const target = PROVISION[ravenAt];
        const left = glideToward(raven, target, dt);
        o.flap += dt * 4.2;
        const flap = Math.sin(o.flap) * 0.42 + 0.1;
        raven.wingL.rotation.z = flap;
        raven.wingR.rotation.z = -flap;
        if (left < 0.25) {
          raven.group.position.copy(target);
          ravenMode = 'feeding';
          // No rng in the loop — the orbit's own angle stands in for one, so
          // the meal's length varies without touching a seeded stream.
          ravenFeedFor = 7 + Math.abs(Math.sin(o.theta * 5.1)) * 9;
        }
      } else if (ravenMode === 'feeding') {
        ravenFeedFor -= dt * REST;
        const target = PROVISION[ravenAt];
        // Wings folded, head dipping to the food, turning slowly where it
        // stands — nothing hurried about a bird that is provided for.
        const fold = 1.05 + Math.sin(t * 2.6) * 0.06;
        raven.wingL.rotation.z = fold;
        raven.wingR.rotation.z = -fold;
        raven.group.position.y = target.y + Math.max(0, Math.sin(t * 2.2)) * 0.07;
        raven.group.rotation.y += dt * 0.3 * REST;
        if (ravenFeedFor <= 0) {
          ravenMode = 'toFly';
          ravenFeedIn = 26 + Math.abs(Math.cos(o.theta * 3.7)) * 34;
        }
      } else if (ravenMode === 'toFly') {
        o.theta += o.speed * dt * REST;
        orbitPoint.set(
          o.cx + Math.cos(o.theta) * o.radius,
          o.height + Math.sin(o.theta * 2.3) * 1.6,
          o.cz + Math.sin(o.theta) * o.radius,
        );
        const left = glideToward(raven, orbitPoint, dt);
        o.flap += dt * 6.2;
        const flap = Math.sin(o.flap) * 0.55 + 0.15;
        raven.wingL.rotation.z = flap;
        raven.wingR.rotation.z = -flap;
        if (left < 1.0) ravenMode = 'fly';
      } else if (ravenMode === 'toRoost') {
        const left = glideToward(raven, RAVEN_ROOST, dt);
        o.flap += dt * 3.4;
        const flap = Math.sin(o.flap) * 0.3 + 0.1;
        raven.wingL.rotation.z = flap;
        raven.wingR.rotation.z = -flap;
        if (left < 0.3) { raven.group.position.copy(RAVEN_ROOST); ravenMode = 'roost'; }
      } else if (ravenMode === 'roost') {
        const settle = 1.12 + Math.sin(t * 1.4) * 0.03;
        raven.wingL.rotation.z = settle;
        raven.wingR.rotation.z = -settle;
      }
    }

    for (const f of fish) {
      const o = f.loop;

      // Drawn to a seated watcher: the nearest fish eases its loop's anchor
      // toward the lure (kept within the wadable stretch) and rises so its
      // back nears the surface; all others ease home and settle back down.
      const drawn = f === luredFish;
      // Keep a drawn fish's loop within the wadable stretch and well west of
      // the crossing stones (x ≈ 9.1) — its far reach is cx + lx (lx ≤ 6).
      const targetCx = drawn ? clamp(lure.x, -40, 1) : o.baseCx;
      o.cx += (targetCx - o.cx) * clamp(dt * 0.6, 0, 1);
      o.rise = damp(o.rise, drawn ? 1 : 0, 1.2, dt);

      o.theta += o.speed * dt * REST;
      const nx = o.cx + Math.cos(o.theta) * o.lx;
      const nz = riverZ(nx) + Math.sin(o.theta) * o.lz;
      const p = f.group.position;

      // Face the way it moves — the frame-to-frame delta already folds the
      // meander in, so no derivative of the centreline is needed.
      const dx = nx - p.x, dz = nz - p.z;
      if (Math.hypot(dx, dz) > 1e-5) {
        const targetYaw = Math.atan2(dx, dz);
        f.group.rotation.y += shortestAngle(f.group.rotation.y, targetYaw) * clamp(dt * 6, 0, 1);
      }

      // Glide below the surface (-0.5), dipping toward the bed (-1.3) and
      // rising so the back just crests; never into the ground. Drawn to a
      // seated watcher (o.rise), it hangs shallower, just under the ripples.
      const y = -0.78 + o.rise * 0.26 + Math.sin(o.theta * 3 + o.bob) * (0.22 - o.rise * 0.1);
      p.set(nx, Math.max(y, heightAt(nx, nz) + 0.12), nz);

      o.wig += dt * (6 + Math.abs(o.speed) * 4);
      f.tail.rotation.y = Math.sin(o.wig) * 0.6;
    }

    // Small wings, by day only: dusk settles the butterflies into the grass
    // with folded wings, and sends the bees home out of sight; morning
    // lifts them all again.
    for (const B of butterflies) {
      if (night >= 0.45 && B.mode === 'flit') B.mode = 'rest';
      else if (night < 0.18 && B.mode === 'rest') {
        B.mode = 'flit';
        B.target = flutterSpot();
        B.until = 6 + wingRng() * 8;
      }
      const p = B.group.position;
      if (B.mode === 'flit') {
        // A butterfly close to a seated watcher lets its wandering target
        // drift in toward them, so one or two come to hover near — and drifts
        // free again the moment the lure clears.
        if (lure && Math.hypot(p.x - lure.x, p.z - lure.z) < 11) {
          B.target.x += (lure.x - B.target.x) * clamp(dt * 0.5, 0, 1);
          B.target.z += (lure.z - B.target.z) * clamp(dt * 0.5, 0, 1);
        }
        const dx = B.target.x - p.x, dz = B.target.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.4 || (B.until -= dt) <= 0) {
          B.target = flutterSpot();
          B.until = 6 + wingRng() * 8;
        } else {
          const step = Math.min(dist, 1.15 * dt * REST);
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          const yaw = Math.atan2(dx, dz);
          B.group.rotation.y += shortestAngle(B.group.rotation.y, yaw) * clamp(dt * 3, 0, 1);
        }
        B.bob += dt * 2.6;
        p.y = Math.max(heightAt(p.x, p.z), -0.45) + 0.55 + Math.sin(B.bob) * 0.28;
        B.flap += dt * 13;
        const flap = 0.15 + Math.sin(B.flap) * 0.85;
        B.wingL.rotation.z = flap;
        B.wingR.rotation.z = -flap;
      } else {
        // Settle to the grass; wings held upright, barely breathing.
        p.y = damp(p.y, Math.max(heightAt(p.x, p.z), -0.45) + 0.07, 2.2, dt);
        B.flap += dt * 1.4;
        const fold = 1.15 + Math.sin(B.flap) * 0.1;
        B.wingL.rotation.z = fold;
        B.wingR.rotation.z = -fold;
      }
    }

    beeMesh.visible = night < 0.5;
    if (beeMesh.visible) {
      for (let i = 0; i < swarm.length; i++) {
        const B = swarm[i];
        B.theta += B.rate * dt * REST;
        const r = B.r * (1 + 0.15 * Math.sin(t * 1.1 + B.bob));
        const x = B.patch.x + Math.cos(B.theta) * r;
        const z = B.patch.z + Math.sin(B.theta) * r;
        B.pos.set(x, heightAt(x, z) + B.lift + Math.sin(t * 4 + B.bob) * 0.1, z);
        beeM.setPosition(B.pos);
        beeMesh.setMatrixAt(i, beeM);
      }
      beeMesh.instanceMatrix.needsUpdate = true;
    }

    // A still walker by the water draws the nearest lamb to lie down close
    // beside them (Psalm 23:2: "he maketh me to lie down... he leadeth me
    // beside the still waters") — the same lure the fish and butterflies
    // already answer, but only ever the one lamb nearest it.
    let luredLamb = null;
    if (lure) {
      let bestD = Infinity;
      for (const G of grazers) {
        if (G.kind !== 'lamb') continue;
        const d = Math.hypot(G.group.position.x - lure.x, G.group.position.z - lure.z);
        if (d < bestD && d < 16) { bestD = d; luredLamb = G; }
      }
    }

    // Where the flock presently stands — the lion keeps to it (Isaiah
    // 11:6-7). Averaged once, before the loop, so every lamb counts toward
    // it whatever order they are walked in.
    let flockX = 0, flockZ = 0, flockN = 0;
    for (const G of grazers) {
      if (G.kind !== 'lamb') continue;
      flockX += G.group.position.x;
      flockZ += G.group.position.z;
      flockN++;
    }
    if (flockN) { flockX /= flockN; flockZ /= flockN; }

    // Grazers: graze a while, wander to a new patch, graze again.
    for (const G of grazers) {
      // The lion — and now the wolf too (v18, Isaiah 11:6) — keeps company
      // with the flock, and the fear between them is not yet (Isaiah
      // 11:6-7). Neither hunts the lambs nor startles at the walker: each
      // follows the flock at an easy walk, lies down among them once it has
      // caught them up, and takes its own straw like the ox.
      if (G.kind === 'lion' || G.kind === 'wolf') {
        const p = G.group.position;
        const dx = flockX - p.x, dz = flockZ - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > LION_NEAR) {
          G.rest = damp(G.rest, 0, 2.4, dt);
          const targetYaw = Math.atan2(dx, dz);
          G.group.rotation.y += shortestAngle(G.group.rotation.y, targetYaw) * clamp(dt * 3, 0, 1);
          const step = Math.min(dist - LION_NEAR, G.speed * dt * REST);
          p.x += Math.sin(G.group.rotation.y) * step;
          p.z += Math.cos(G.group.rotation.y) * step;
          G.phase += dt * G.stepFreq;
          for (let i = 0; i < 4; i++) {
            G.legs[i].rotation.x = Math.sin(G.phase + (i % 2) * Math.PI) * 0.4 * (1 - G.rest);
          }
          G.headPivot.rotation.x = Math.max(0, G.headPivot.rotation.x - dt * 2);
          G.mode = 'walk';
        } else {
          G.rest = damp(G.rest, 1, 0.9, dt);
          for (const leg of G.legs) leg.rotation.x = damp(leg.rotation.x, -1.15, 3, dt);
          G.until -= dt;
          if (G.until <= 0) {
            G.graze = !G.graze;
            G.until = (G.graze ? 3 : 7) + rng() * 5;
          }
          G.headPivot.rotation.x = G.graze
            ? Math.min(G.dip, G.headPivot.rotation.x + dt * 1.2)
            : Math.max(0, G.headPivot.rotation.x - dt * 1.2);
          G.mode = 'rest';
        }
        p.y = heightAt(p.x, p.z) - 0.2 * G.rest;
        G.group.scale.y = 1 - 0.24 * G.rest;
        continue;
      }

      // The fawn never grazes on its own — it simply keeps close beside its
      // mother, a little behind and to the side, with an unsteady wobble of
      // its own (Job 39:1).
      if (G.kind === 'fawn') {
        const mother = G.follow.group.position;
        const followYaw = G.follow.group.rotation.y;
        const tx = mother.x - Math.sin(followYaw) * 0.9 + Math.sin(t * 3 + G.wobble) * 0.3;
        const tz = mother.z - Math.cos(followYaw) * 0.9 + Math.cos(t * 2.6 + G.wobble) * 0.3;
        const p = G.group.position;
        const dx = tx - p.x, dz = tz - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          const targetYaw = Math.atan2(dx, dz);
          G.group.rotation.y += shortestAngle(G.group.rotation.y, targetYaw) * clamp(dt * 5, 0, 1);
          const step = Math.min(dist, G.speed * dt * REST * (dist > 2 ? 1.8 : 1));
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          G.phase += dt * G.stepFreq * 1.3;
          for (let i = 0; i < 4; i++) {
            G.legs[i].rotation.x = Math.sin(G.phase + (i % 2) * Math.PI) * 0.5;
          }
        } else {
          for (const leg of G.legs) leg.rotation.x = damp(leg.rotation.x, 0, 3, dt);
        }
        p.y = heightAt(p.x, p.z);
        continue;
      }

      // A wary creature (the wild ass) puts ground between itself and the
      // walker the moment they come too close, then goes back to its own
      // free range once they're clear (Job 39:5-8).
      if (G.wary && walker) {
        const dx0 = G.group.position.x - walker.x, dz0 = G.group.position.z - walker.z;
        const d0 = Math.hypot(dx0, dz0);
        if (d0 < WARY_RADIUS) {
          const p = G.group.position;
          const fleeYaw = Math.atan2(dx0, dz0);
          G.group.rotation.y += shortestAngle(G.group.rotation.y, fleeYaw) * clamp(dt * 5, 0, 1);
          const step = G.speed * 1.8 * dt * REST;
          p.x += Math.sin(G.group.rotation.y) * step;
          p.z += Math.cos(G.group.rotation.y) * step;
          p.y = heightAt(p.x, p.z);
          G.phase += dt * G.stepFreq * 1.6;
          for (let i = 0; i < 4; i++) {
            G.legs[i].rotation.x = Math.sin(G.phase + (i % 2) * Math.PI) * 0.5;
          }
          G.headPivot.rotation.x = Math.max(0, G.headPivot.rotation.x - dt * 2.2);
          G.mode = 'walk';
          G.until = 1.5;   // resume its own free range shortly after it's clear
          continue;
        }
      }

      if (G === luredLamb) {
        // Ease toward a spot just beside the lure, on the drier side of the
        // bank (never wading in), then settle low and still — reversible,
        // so the flock returns to itself once the walker rises.
        G.rest = damp(G.rest, 1, 1.2, dt);
        const awayZ = Math.sign(lure.z - riverZ(lure.x)) || 1;
        const tx = lure.x + 0.9, tz = lure.z + awayZ * 1.5;
        const p = G.group.position;
        const dx = tx - p.x, dz = tz - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.15) {
          const targetYaw = Math.atan2(dx, dz);
          G.group.rotation.y += shortestAngle(G.group.rotation.y, targetYaw) * clamp(dt * 4, 0, 1);
          const step = Math.min(dist, G.speed * dt * REST);
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          G.phase += dt * G.stepFreq;
          for (let i = 0; i < 4; i++) {
            G.legs[i].rotation.x = Math.sin(G.phase + (i % 2) * Math.PI) * 0.45 * (1 - G.rest);
          }
        } else {
          for (const leg of G.legs) leg.rotation.x = damp(leg.rotation.x, -1.1, 3, dt);
        }
        G.headPivot.rotation.x = Math.min(G.dip * 0.5, G.headPivot.rotation.x + dt * 1.2);
        p.y = heightAt(p.x, p.z) - 0.16 * G.rest;
        G.group.scale.y = 1 - 0.22 * G.rest;
        G.mode = 'lie';
        continue;
      }
      if (G.kind === 'lamb' && G.mode === 'lie') {
        // The lure has cleared: rise before rejoining the graze/walk cycle.
        G.rest = damp(G.rest, 0, 1.2, dt);
        const p = G.group.position;
        p.y = heightAt(p.x, p.z) - 0.16 * G.rest;
        G.group.scale.y = 1 - 0.22 * G.rest;
        for (const leg of G.legs) leg.rotation.x = damp(leg.rotation.x, 0, 3, dt);
        if (G.rest < 0.02) {
          G.rest = 0;
          G.group.scale.y = 1;
          G.mode = 'graze';
          G.until = 2 + rng() * 3;
        }
        continue;
      }

      G.until -= dt;
      if (G.mode === 'graze') {
        G.headPivot.rotation.x = Math.min(G.dip, G.headPivot.rotation.x + dt * 1.6);
        if (G.until <= 0) {
          G.mode = 'walk';
          G.target = G.spot(rng);
          G.until = 40;   // generous cap; arrival ends the walk
        }
      } else {
        G.headPivot.rotation.x = Math.max(0, G.headPivot.rotation.x - dt * 2.2);
        const p = G.group.position;
        const dx = G.target.x - p.x, dz = G.target.z - p.z;
        const dist = Math.hypot(dx, dz);
        const targetYaw = Math.atan2(dx, dz);
        G.group.rotation.y += shortestAngle(G.group.rotation.y, targetYaw) * clamp(dt * 4, 0, 1);
        const step = G.speed * dt * REST;
        p.x += Math.sin(G.group.rotation.y) * step;
        p.z += Math.cos(G.group.rotation.y) * step;
        p.y = heightAt(p.x, p.z);
        G.phase += dt * G.stepFreq;
        for (let i = 0; i < 4; i++) {
          G.legs[i].rotation.x = Math.sin(G.phase + (i % 2) * Math.PI) * 0.45;
        }
        if (dist < 0.5 || G.until <= 0) {
          G.mode = 'graze';
          G.until = 2.5 + rng() * 4;
          for (const leg of G.legs) leg.rotation.x = 0;
        }
      }
    }

    // Every branch above writes leg angles onto stand-in objects; this is
    // where they reach the instanced meshes. One pass after the loop, so no
    // early `continue` can skip it.
    for (const G of grazers) G.syncLegs();
  }

  // A census for the debug state and the smoke suite. Grazers and fish
  // report where they presently stand, so a test can walk right up to one.
  function fauna() {
    return {
      flyers: flyers.map(b => ({ kind: b.kind, mode: b.mode })),
      grazers: grazers.map(G => ({ kind: G.kind, x: G.group.position.x, z: G.group.position.z, rest: G.rest || 0 })),
      shoal: fish.map(f => ({ name: f.name, x: f.group.position.x, z: f.group.position.z, rise: f.loop.rise })),
      butterflies: butterflies.map(B => ({ x: B.group.position.x, z: B.group.position.z, mode: B.mode })),
      bees: { count: swarm.length, mode: beeMesh.visible ? 'hum' : 'home', patches: BEE_PATCHES },
      covey: {
        count: covey.length,
        here: quailMesh.visible,
        birds: covey.map(Q => ({ x: Q.pos.x, y: Q.pos.y, z: Q.pos.z })),
      },
      raven: {
        mode: ravenMode,
        x: raven.group.position.x,
        y: raven.group.position.y,
        z: raven.group.position.z,
      },
      cattle: 2,
      lamb: grazers.filter(G => G.kind === 'lamb').length,
      fish: fish.length,
    };
  }

  // The name presently given, if the walker stands near a creature.
  function namedNow() {
    return named ? { name: named.name, label: named.label, kind: named.kind } : null;
  }

  return { update, fauna, named: namedNow };
}
