// Every tree "pleasant to the sight" (Genesis 2:9) — instanced low-poly
// trees, shrubs, and meadow flowers, and at the heart of the garden the two
// named trees: the Tree of Life, golden and luminous, and the Tree of the
// Knowledge of Good and Evil, dark-canopied and bearing fruit. Drifting
// golden motes carry the same light motif as the runner game and home page.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mergeGeos, smoothstep, mulberry32 } from '../util.js';
import { buildLifeTree, LIFE_TREE, LIFE_FRUITS } from './lifetree.js';
import { windOf, gustAt } from './wind.js';

// A fixed lean direction for the wind — +X, the same way the gust's own
// leading edge sweeps — so everything leans the same way at once, as one
// body of moving air would, rather than each its own random direction.
// (Rotating about -Z by a positive angle tips a point above the origin
// toward +X; see the sway math in update() and swayCanopies() below.)
const WIND_AXIS = new THREE.Vector3(0, 0, -1);
const LIFE_GLOW = 0.3;   // the golden crown's own light by day; more by night and when he is near
const TREE_TILT = 0.16;    // radians at full gust, sacred trees (hinged at the ground)
const CANOPY_TILT = 0.5;   // radians at full gust, background canopies (hinged at the trunk top)
// "All the trees of the field shall clap their hands" (Isaiah 55:12, v24): on
// top of the slow lean, every canopy shivers quickly while the gust is on it
// — each at its own beat, so the meadow claps rather than sways in step.
const CLAP_TILT = 0.075;   // radians of quick shiver at full gust
const CLAP_RATE = 13;      // radians per second

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

// Returns each instance's base placement (ground point, lift above it, yaw,
// scale) — unused by most callers, but it's what lets the wind (v10) later
// re-lean a canopy from the ground up without disturbing its planting.
function fillInstances(mesh, spots, rng, { yOf, scaleMin, scaleMax, colorA, colorB }) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const bases = [];
  for (let i = 0; i < spots.length; i++) {
    const sc = scaleMin + rng() * (scaleMax - scaleMin);
    const yaw = rng() * Math.PI * 2;
    const groundY = heightAt(spots[i].x, spots[i].z);
    const y = yOf(spots[i], sc);
    p.set(spots[i].x, y, spots[i].z);
    q.setFromEuler(new THREE.Euler(0, yaw, 0));
    s.setScalar(sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.copy(colorA).lerp(colorB, rng());
    mesh.setColorAt(i, c);
    bases.push({ x: spots[i].x, z: spots[i].z, groundY, lift: y - groundY, yaw, scale: sc });
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return bases;
}

export function createVegetation(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);

  // Kept in scope for the night: after dark the Tree of Life's lamp and
  // golden canopy brighten, and the motes turn firefly (see update()).
  let lifeLamp, lifeGold;
  // Its twelve fruits (v44, Psalm 150:6): kindled one by one when the
  // garden praises (praise.js), and set back as they were after.
  let lifeFruit;
  let fruitsKindled = false;
  // Kept in scope for the cool of the day (v10): each sacred tree's own
  // group, so the whole tree can bow from its root as the gust passes.
  let lifeTreeGroup, knowledgeTreeGroup;
  // The Tree of Life's own fruit (v11), for the naming — see the return below.
  let lifeFruitSpot;

  // ── The two sacred trees, hand-shaped ─────────────────────
  // Tree of Life (AB#129): the greatest and brightest thing in the garden —
  // a pale trunk, seven boughs opening like a lampstand, a broad layered
  // crown of gold about ten metres to its top. Shaped in lifetree.js; all
  // its wood is one mesh and all its crown another, so it costs what the
  // old trunk and three-lobed canopy did.
  {
    const t = new THREE.Group();
    const { woodGeo, crownGeo } = buildLifeTree();
    t.add(new THREE.Mesh(woodGeo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, emissive: 0x6A5A3C, emissiveIntensity: 0.25,
    })));
    // The crown glows of itself, and answers the dark (see update).
    const gold = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, emissive: 0xC8962E, emissiveIntensity: LIFE_GLOW,
    });
    t.add(new THREE.Mesh(crownGeo, gold));

    // Its own fruit in season, not just gold leaves (v11, Revelation 22:2,
    // echoing): "which bare twelve manner of fruits" — twelve small lights
    // hung under the crown, each its own colour. One instanced mesh; unlit,
    // so each shines its own hue by day and by night.
    const fruitMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.19, 1),
      new THREE.MeshBasicMaterial(),
      LIFE_FRUITS.length,
    );
    {
      const fm = new THREE.Matrix4();
      const fc = new THREE.Color();
      LIFE_FRUITS.forEach((f, i) => {
        fruitMesh.setMatrixAt(i, fm.makeTranslation(f.x, f.y, f.z));
        fruitMesh.setColorAt(i, fc.set(f.hue));
      });
      fruitMesh.instanceMatrix.needsUpdate = true;
      fruitMesh.instanceColor.needsUpdate = true;
    }
    t.add(fruitMesh);

    // Its lamp hangs up under the crown now, lighting the gold from below
    // and the grass in a wider ring.
    const lamp = new THREE.PointLight(0xFFD98A, 26, 24, 2);
    lamp.position.y = LIFE_TREE.lamp;
    t.add(lamp);
    t.position.set(TREE_OF_LIFE_POS.x, heightAt(TREE_OF_LIFE_POS.x, TREE_OF_LIFE_POS.z), TREE_OF_LIFE_POS.z);
    group.add(t);
    lifeLamp = lamp;
    lifeGold = gold;
    lifeFruit = fruitMesh;
    lifeTreeGroup = t;
    lifeFruitSpot = {
      pos: { x: t.position.x, y: t.position.y + 3.6, z: t.position.z },
      name: 'Peri', label: 'the fruit of the Tree of Life', kind: 'treeoflife',
    };
  }

  // Tree of Knowledge: a leaning, twisted trunk, deep shadowed canopy,
  // and low-hanging fruit.
  {
    const t = new THREE.Group();
    // Trunk segments and canopy lobes each merge into one mesh from v20 on
    // — the twist of the trunk is baked into the geometry rather than held
    // in three separate meshes' transforms, so the tree looks the same and
    // costs two draws instead of five.
    const bark = new THREE.MeshLambertMaterial({ color: 0x4A3828, flatShading: true });
    const segs = [];
    let y = 0;
    let lean = 0;
    for (const [h, r1, r2, tilt] of [[1.3, 0.34, 0.26, 0.22], [1.1, 0.26, 0.2, -0.3], [0.9, 0.2, 0.15, 0.26]]) {
      lean += tilt;
      segs.push(
        new THREE.CylinderGeometry(r2, r1, h, 6)
          .toNonIndexed()
          .rotateZ(lean)
          .translate(Math.sin(lean) * (y * 0.25 + 0.15), y + h / 2, 0),
      );
      y += h * 0.92;
    }
    t.add(new THREE.Mesh(mergeGeos(segs), bark));
    for (const seg of segs) seg.dispose();

    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2E5240, flatShading: true });
    const lobes = [];
    for (const [dx, dy, dz, s] of [[0.5, 3.3, 0, 1.5], [-0.5, 2.9, 0.4, 1.0]]) {
      lobes.push(new THREE.IcosahedronGeometry(1, 0).scale(s, s, s).translate(dx, dy, dz));
    }
    t.add(new THREE.Mesh(mergeGeos(lobes), canopyMat));
    for (const lobe of lobes) lobe.dispose();
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
    knowledgeTreeGroup = t;
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
  // Each canopy's bases are kept for the cool of the day (v10): the trunks
  // (a separate mesh) stay put, so only the canopies lean, hinged where each
  // one's own trunk would meet it.
  const canopySway = [];
  for (const def of canopyDefs) {
    const canopy = new THREE.InstancedMesh(
      def.geo,
      new THREE.MeshLambertMaterial({ flatShading: true }),
      def.spots.length,
    );
    const bases = fillInstances(canopy, def.spots, rng, {
      yOf: (s2, sc) => heightAt(s2.x, s2.z) + def.lift * sc,
      scaleMin: 0.85, scaleMax: 1.5,
      colorA: new THREE.Color(def.a), colorB: new THREE.Color(def.b),
    });
    group.add(canopy);
    canopySway.push({ mesh: canopy, bases });
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
    // From anywhere under the crown's spread, at the height of its underside.
    const a = leafRng() * Math.PI * 2;
    const r = 0.6 + leafRng() * (LIFE_TREE.crownRadius - 1.2);
    s2.x = TREE_OF_LIFE_POS.x + Math.cos(a) * r;
    s2.z = TREE_OF_LIFE_POS.z + Math.sin(a) * r;
    s2.y = lifeGroundY + LIFE_TREE.crownUnder + leafRng() * 1.6;
    s2.vy = 0.28 + leafRng() * 0.24;
    s2.sway = leafRng() * Math.PI * 2;
    s2.spin = leafRng() * Math.PI * 2;
    s2.spinRate = 1 + leafRng() * 2;
  }
  for (let i = 0; i < LEAVES; i++) {
    const s2 = {};
    shedLeaf(s2);
    s2.y = lifeGroundY + 0.2 + leafRng() * (LIFE_TREE.crownUnder + 1.2);   // first fall: already mid-air
    leafSeed.push(s2);
  }
  group.add(leaves);
  const leafM = new THREE.Matrix4();
  const leafQ = new THREE.Quaternion();
  const leafE = new THREE.Euler();
  const leafP = new THREE.Vector3();
  const leafS = new THREE.Vector3();

  // Scratch for the wind (v10) — reused every frame, never allocated per
  // instance. `windQ` is the lean alone (world axes); `mixQ` composes it
  // with an instance's own baked yaw so the blob still shows its planted
  // facing while the whole thing leans one way, together, in world space.
  const windQ = new THREE.Quaternion();
  const yawQ = new THREE.Quaternion();
  const mixQ = new THREE.Quaternion();
  const liftVec = new THREE.Vector3();
  const windM = new THREE.Matrix4();
  const windP = new THREE.Vector3();
  const windS = new THREE.Vector3();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  // v44: the bow as the garden's praise passes a tree — about a level axis
  // square to the way out from the Tree of Life, so the crown goes outward.
  const bowAxis = new THREE.Vector3();
  const bowQ = new THREE.Quaternion();
  let bowing = false;
  const fruitM = new THREE.Matrix4();
  const fruitC = new THREE.Color();
  const WHITE = new THREE.Color(1, 1, 1);
  // Which way out from the Tree of Life the Tree of Knowledge stands.
  const KNOW_OUT = new THREE.Vector2(
    TREE_OF_KNOWLEDGE_POS.x - TREE_OF_LIFE_POS.x, TREE_OF_KNOWLEDGE_POS.z - TREE_OF_LIFE_POS.z,
  ).normalize();

  // The cool of the day (Genesis 3:8, foreshadowed): re-lean every canopy
  // instance from its own ground point as the evening gust's leading edge
  // reaches it, then settle it back as the edge moves on. Skipped entirely
  // outside the gust's window — by the time it fully fades every instance
  // has already been written back to its resting lean of zero.
  // `praise` (v44): while the garden's praise goes out (praise.js), each
  // crown also bows outward as the ring reaches it, and shivers back — "all
  // the trees of the field shall clap their hands" (Isaiah 55:12).
  function swayCanopies(cycleT, sabbath, praise = null) {
    for (const { mesh, bases } of canopySway) {
      for (let i = 0; i < bases.length; i++) {
        const b = bases[i];
        const g = gustAt(cycleT, b.x, sabbath);
        const clap = Math.sin(t * CLAP_RATE + b.yaw * 5) * Math.sin(t * 2.1 + b.x) * CLAP_TILT;
        windQ.setFromAxisAngle(WIND_AXIS, g * (CANOPY_TILT + clap));
        const bow = praise ? praise.bow(b.x, b.z) : 0;
        if (bow !== 0) {
          const ox = b.x - TREE_OF_LIFE_POS.x, oz = b.z - TREE_OF_LIFE_POS.z;
          const ol = Math.hypot(ox, oz) || 1;
          bowAxis.set(oz / ol, 0, -ox / ol);
          windQ.premultiply(bowQ.setFromAxisAngle(bowAxis, bow));
        }
        yawQ.setFromAxisAngle(Y_AXIS, b.yaw);
        mixQ.multiplyQuaternions(windQ, yawQ);
        liftVec.set(0, b.lift, 0).applyQuaternion(windQ);
        windP.set(b.x + liftVec.x, b.groundY + liftVec.y, b.z + liftVec.z);
        windS.setScalar(b.scale);
        windM.compose(windP, mixQ, windS);
        mesh.setMatrixAt(i, windM);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  let t = 0;
  // `night` (0 day → 1 full dark, from the sky's cycle): after sundown the
  // Tree of Life answers the dark — lamp and canopy brighten — and the
  // drifting motes glow larger and fuller, reading as fireflies.
  // `playerPos`: the walker's position; drawing near either sacred tree
  // kindles a quiet reverence — the gold deepens, the motes lean brighter —
  // returned to the caller so the ambience can answer it too.
  // `cycleT`: the sky's own clock, in [0,1) — all the cool of the day (v10)
  // needs to know when and where the evening gust presently stands.
  // `sabbath` (v11): the seventh day's deeper rest — passed straight through
  // to wind.js, which holds the gust still when it's true.
  // `praise` (v44, praise.js): the garden's praise, when it goes out from
  // the Tree of Life — its twelve fruits kindle, its lamp flares, and every
  // tree bows as the ring passes. Null, or idle, the rest of the time.
  function update(dt, night = 0, playerPos = null, cycleT = 0.1, sabbath = false, praise = null) {
    t += dt;
    const passing = praise && praise.ring.on ? praise : null;   // the praise, while its ring is out

    // The two sacred trees bow together from the root as the gust passes —
    // each at its own place, so the one it reaches first bows first.
    lifeTreeGroup.rotation.z = -gustAt(cycleT, TREE_OF_LIFE_POS.x, sabbath) * TREE_TILT;
    // …and the Tree of Knowledge bows outward too as the praise reaches it.
    const kBow = passing ? passing.bow(TREE_OF_KNOWLEDGE_POS.x, TREE_OF_KNOWLEDGE_POS.z) * 0.6 : 0;
    knowledgeTreeGroup.rotation.z = -gustAt(cycleT, TREE_OF_KNOWLEDGE_POS.x, sabbath) * TREE_TILT - kBow * KNOW_OUT.x;
    knowledgeTreeGroup.rotation.x = kBow * KNOW_OUT.y;
    // While the ring is out, and once more after it has gone (to set every
    // crown back as the wind alone would have it).
    if (windOf(cycleT, sabbath) > 0.001 || passing || bowing) {
      swayCanopies(cycleT, sabbath, passing);
      bowing = !!passing;
    }

    // The twelve fruits kindled, each as brightly as the praise says — more
    // than its own colour, so where the light pass runs it blooms into the
    // air round it; put back as they were the frame it ends.
    const kindling = !!(praise && praise.active);
    if (kindling || fruitsKindled) {
      for (let i = 0; i < LIFE_FRUITS.length; i++) {
        const f = LIFE_FRUITS[i];
        const g = kindling ? praise.fruitGlow(i) : 0;
        const s = 1 + 0.9 * Math.min(g, 1.3);
        fruitM.makeScale(s, s, s).setPosition(f.x, f.y, f.z);
        lifeFruit.setMatrixAt(i, fruitM);
        fruitC.set(f.hue).lerp(WHITE, 0.4 * Math.min(g, 1)).multiplyScalar(1 + 1.4 * g);
        lifeFruit.setColorAt(i, fruitC);
      }
      lifeFruit.instanceMatrix.needsUpdate = true;
      lifeFruit.instanceColor.needsUpdate = true;
      fruitsKindled = kindling;
    }
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

    const flare = praise ? praise.lamp : 0;   // v44: the lamp's flare as the praise goes out
    lifeLamp.intensity = 26 + night * 30 + reverence * 16 + flare * 70;
    lifeGold.emissiveIntensity = LIFE_GLOW + night * 0.22 + reverence * 0.12 + flare * 0.35;
    motes.material.opacity = Math.min(1, 0.8 + night * 0.2 + reverence * 0.15);
    motes.material.size = 0.16 + night * 0.06 + reverence * 0.03;

    return reverence;
  }

  // The planted trees' places, for anything that grows from or answers them
  // (v9: petals loosed from the canopies, impressions mirrored on the water).
  // `lifeFruitSpot` (v11): the Tree of Life's own fruit, folded into the
  // naming candidates the same way as fruit.js's fig and pomegranate spots.
  return { update, treeSpots, lifeFruitSpot };
}
