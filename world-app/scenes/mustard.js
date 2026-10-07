// "The kingdom of heaven is like to a grain of mustard seed … which indeed is
// the least of all seeds: but when it is grown, it is the greatest among
// herbs, and becometh a tree, so that the birds of the air come and lodge in
// the branches thereof" (Matthew 13:31-32).
//
// South of the meadow's heart a mustard has grown past every herb round it
// into a tree: many stems out of one root, not a single trunk, spreading into
// a broad low crown, yellow with its own small flowers. The birds of the air
// lodge in it — five small brown birds sat about the outside of the crown,
// each turning on its twig and now and then hopping across to another.
// Come under it and it is named.
//
// The tree never moves, so stems, crown and flowers are baked to one merged
// vertex-coloured geometry; the birds share one InstancedMesh, written once
// a frame from where each presently sits. Two draw calls, both well south of
// the opening frame.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32, smoothstep, shortestAngle } from '../util.js';

const AT = { x: 8, z: -24 };
const BIRDS = 5;   // one to each stem's lobe of the crown

const STEM = new THREE.Color(0x7A6A48);
const STEM_PALE = new THREE.Color(0x8E7E58);
const LEAF = new THREE.Color(0x6E8F3E);
const LEAF_PALE = new THREE.Color(0x86A24A);
const LEAF_DEEP = new THREE.Color(0x5A7A34);
const FLOWER = new THREE.Color(0xE8CF4A);
const BIRD = new THREE.Color(0x7E6247);
const BIRD_BREAST = new THREE.Color(0xB89A76);
const BIRD_BEAK = new THREE.Color(0x3A2E22);

// One small lodging bird, built facing +z about its own feet.
function birdGeometry() {
  return mergeColored([
    { geo: new THREE.SphereGeometry(0.11, 6, 4).toNonIndexed().scale(1, 0.9, 1.35).translate(0, 0.11, 0), color: BIRD },
    { geo: new THREE.SphereGeometry(0.085, 6, 4).toNonIndexed().scale(1, 0.8, 1).translate(0, 0.09, 0.06), color: BIRD_BREAST },
    { geo: new THREE.SphereGeometry(0.075, 6, 4).toNonIndexed().translate(0, 0.21, 0.1), color: BIRD },
    { geo: new THREE.ConeGeometry(0.025, 0.07, 4).toNonIndexed().rotateX(Math.PI / 2).translate(0, 0.2, 0.19), color: BIRD_BEAK },
    { geo: new THREE.BoxGeometry(0.07, 0.02, 0.16).toNonIndexed().rotateX(-0.35).translate(0, 0.14, -0.17), color: BIRD },
  ]);
}

export function createMustard(scene) {
  // Own seeded stream: the tree's own shape shifts nothing already planted.
  const rng = mulberry32(20260844);
  const ground = heightAt(AT.x, AT.z);

  const parts = [];
  // Many stems out of one root, leaning out from one another as they rise —
  // an herb grown great, not a timber tree.
  const STEMS = 5;
  const crowns = [];
  for (let i = 0; i < STEMS; i++) {
    const a = (i / STEMS) * Math.PI * 2 + rng() * 0.5;
    const lean = 0.28 + rng() * 0.18;
    const h = 2.4 + rng() * 0.6;
    const geo = new THREE.CylinderGeometry(0.07, 0.15, h, 5).toNonIndexed()
      .translate(0, h / 2, 0)
      .rotateZ(lean)
      .rotateY(-a);
    parts.push({ geo, color: i % 2 ? STEM : STEM_PALE });
    // Where this stem's own part of the crown spreads.
    const reach = Math.sin(lean) * h;
    crowns.push({ x: Math.cos(a) * -reach, z: Math.sin(a) * -reach, y: Math.cos(lean) * h });
  }
  // The broad low crown: a lobe at the head of every stem, one over the
  // middle, and the whole of it flattened wider than it is tall.
  crowns.push({ x: 0, z: 0, y: 3.0 });
  const perches = [];
  crowns.forEach((c, i) => {
    const r = i === STEMS ? 1.6 : 1.25 + rng() * 0.3;
    parts.push({
      geo: new THREE.IcosahedronGeometry(r, 1).scale(1.25, 0.72, 1.25).translate(c.x, c.y, c.z),
      color: [LEAF, LEAF_PALE, LEAF_DEEP][i % 3],
    });
    // Yellow flower heads held clear of the leaf, all over the top.
    for (let k = 0; k < 10; k++) {
      const fa = rng() * Math.PI * 2;
      const fr = r * 1.2 * Math.sqrt(rng());
      const fy = c.y + r * 0.72 * Math.sqrt(Math.max(0, 1 - (fr / (r * 1.25)) ** 2)) + 0.05;
      parts.push({
        geo: new THREE.IcosahedronGeometry(0.09 + rng() * 0.05, 0)
          .translate(c.x + Math.cos(fa) * fr, fy, c.z + Math.sin(fa) * fr),
        color: FLOWER,
      });
    }
    // Twigs on the outside of the lobe where a bird can sit: a little out
    // past the leaf, low enough on the shoulder to be seen from below.
    if (i < STEMS) {
      const out = Math.atan2(c.z, c.x);
      for (const side of [-0.5, 0.5]) {
        const pa = out + side;
        perches.push({
          x: c.x + Math.cos(pa) * r * 1.2,
          y: c.y + r * 0.3,
          z: c.z + Math.sin(pa) * r * 1.2,
          face: Math.atan2(Math.cos(pa), Math.sin(pa)),   // looking outward
        });
      }
    }
  });

  const tree = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  tree.position.set(AT.x, ground, AT.z);
  scene.add(tree);

  // The birds of the air, lodging. Each keeps the two twigs on its own lobe
  // of the crown and every so often hops across from one to the other, so no
  // two ever share a twig — all of it timed off the clock and each bird's own
  // phase, so nothing draws on any stream after the build.
  const birds = new THREE.InstancedMesh(
    birdGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    BIRDS,
  );
  birds.frustumCulled = false;
  scene.add(birds);
  const lodgers = [];
  for (let i = 0; i < BIRDS; i++) {
    lodgers.push({
      at: i * 2,                                 // its own lobe's pair of twigs
      period: 9 + rng() * 9,                     // seconds between its hops
      phase: rng(),
      turn: rng() * Math.PI * 2,
    });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const HOP = 0.7;   // seconds a hop to the next twig takes

  let t = 0;
  function update(dt) {
    t += dt;
    for (let i = 0; i < BIRDS; i++) {
      const L = lodgers[i];
      const cycle = t / L.period + L.phase;
      const round = Math.floor(cycle);
      const into = (cycle - round) * L.period;     // seconds into this round
      // Which of its two twigs it keeps this round; it hops to the other.
      const from = perches[L.at + (round % 2)];
      const to = perches[L.at + ((round + 1) % 2)];
      const k = smoothstep(L.period - HOP, L.period, into);
      p.set(
        from.x + (to.x - from.x) * k,
        from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 0.6,
        from.z + (to.z - from.z) * k,
      );
      // Sat, it turns its head this way and that; hopping, it swings round to
      // face the way it goes — eased in and out, so the turn never snaps.
      const face = from.face + shortestAngle(from.face, to.face) * k;
      const look = face + Math.sin(t * 0.8 + L.turn) * 0.9;
      const go = Math.atan2(to.x - from.x, to.z - from.z);
      const yaw = look + shortestAngle(look, go) * Math.sin(k * Math.PI);
      e.set(0, yaw, 0);
      p.x += AT.x; p.y += ground; p.z += AT.z;
      birds.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
    }
    birds.instanceMatrix.needsUpdate = true;
  }
  update(0);

  const spots = [{
    pos: new THREE.Vector3(AT.x, ground + 1.5, AT.z),
    name: 'Chardal', label: 'the mustard tree', kind: 'mustard',
  }];

  function state() {
    return { x: AT.x, z: AT.z, birds: BIRDS };
  }

  return { update, spots, state };
}
