// "The LORD God is my strength, and he will make my feet like hinds' feet,
// and he will make me to walk upon mine high places" (Habakkuk 3:19).
//
// Under the eagle's crag on the south-western rim (scenes/eyrie.js) a stair
// of rough ledges is shouldered against the rock on the side that faces the
// garden, and a hind keeps it. She grazes a while at the foot, then goes up
// it ledge by ledge — a short sure leap, a stand, a look round, the next —
// to the highest of them, where she stands longest and looks out over the
// whole garden; then she picks her way down again the same way. She never
// slips and never hurries: every leap lands square.
//
// Three draw calls: the ledges bake to one merged mesh, her body (legs and
// all) is one more, and her head on its own pivot, so she can lower it to
// graze and lift it to look out, is the third. Her round is laid out once at
// build time; the update reads only the clock, never the seeded stream.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { CRAG, roughPrism } from './eyrie.js';
import { mergeColored, mulberry32, damp, shortestAngle } from '../util.js';

const LEDGES = 5;
const LEDGE_R = 3.9;      // ledge centres, out from the crag's own axis
const LEDGE_SIZE = 0.95;
const STAND_OUT = 0.2;    // she stands a little out from the centre of each
const LEAP = 0.62;        // seconds in the air between ledges
const TOP_LOOK = 8;       // seconds she stands at the top, looking out
const FOOT_GRAZE = 16;    // seconds she grazes at the foot before going up

const TAWNY = new THREE.Color(0xA97A4E);
const TAWNY_DARK = new THREE.Color(0x8A603A);
const BELLY = new THREE.Color(0xDCC6A2);
const HOOF = new THREE.Color(0x3E2F22);
const NOSE = new THREE.Color(0x2E2620);
const ROCK = new THREE.Color(0xA0978A);
const ROCK_WARM = new THREE.Color(0xB2A68F);
const MOSS = new THREE.Color(0x8A9466);

// Her body, legs and tail, built facing +z with her feet on the origin.
function bodyGeometry() {
  const parts = [
    { geo: new THREE.SphereGeometry(0.24, 9, 6).toNonIndexed().scale(0.85, 0.9, 2.0).translate(0, 0.78, 0), color: TAWNY },
    { geo: new THREE.SphereGeometry(0.2, 8, 5).toNonIndexed().scale(0.8, 0.55, 1.7).translate(0, 0.66, 0.02), color: BELLY },
    { geo: new THREE.ConeGeometry(0.05, 0.14, 4).toNonIndexed().rotateX(-2.5).translate(0, 0.86, -0.5), color: BELLY },
  ];
  for (const [x, z] of [[-0.11, 0.3], [0.11, 0.3], [-0.11, -0.3], [0.11, -0.3]]) {
    parts.push({ geo: new THREE.CylinderGeometry(0.028, 0.034, 0.62, 5).toNonIndexed().translate(x, 0.37, z), color: TAWNY_DARK });
    parts.push({ geo: new THREE.CylinderGeometry(0.036, 0.03, 0.07, 5).toNonIndexed().translate(x, 0.035, z), color: HOOF });
  }
  return mergeColored(parts);
}

// Her neck and head, built about the pivot at the root of the neck and
// facing +z: ears up, a dark nose.
function headGeometry() {
  return mergeColored([
    { geo: new THREE.CylinderGeometry(0.06, 0.085, 0.42, 6).toNonIndexed().rotateX(0.55).translate(0, 0.18, 0.1), color: TAWNY },
    { geo: new THREE.SphereGeometry(0.1, 7, 5).toNonIndexed().scale(0.85, 0.85, 1.5).translate(0, 0.39, 0.25), color: TAWNY },
    { geo: new THREE.SphereGeometry(0.04, 5, 4).toNonIndexed().translate(0, 0.37, 0.4), color: NOSE },
    { geo: new THREE.ConeGeometry(0.045, 0.16, 4).toNonIndexed().scale(1, 1, 0.5).rotateZ(0.5).translate(-0.08, 0.5, 0.17), color: TAWNY_DARK },
    { geo: new THREE.ConeGeometry(0.045, 0.16, 4).toNonIndexed().scale(1, 1, 0.5).rotateZ(-0.5).translate(0.08, 0.5, 0.17), color: TAWNY_DARK },
  ]);
}

export function createHind(scene) {
  // Own seeded stream: the ledges and her round shift nothing already planted.
  const rng = mulberry32(20260845);

  // The ledges climb round the face of the crag that looks into the garden.
  const toGarden = Math.atan2(-CRAG.z, -CRAG.x);
  const parts = [];
  const stands = [];
  let lastTop = CRAG.ground;
  for (let i = 0; i < LEDGES; i++) {
    const a = toGarden - 0.95 + i * 0.42;
    const x = CRAG.x + Math.cos(a) * LEDGE_R;
    const z = CRAG.z + Math.sin(a) * LEDGE_R;
    const g = heightAt(x, z);
    // Each ledge a clear step above the last, and always well up off the
    // ground under it, however the rim slopes there.
    const top = Math.max(CRAG.ground + 0.8 * (i + 1), g + 0.45, lastTop + 0.55);
    lastTop = top;
    const foot = g - 0.6;
    const h = top - foot;
    const size = LEDGE_SIZE * (0.9 + rng() * 0.25);
    parts.push({
      geo: roughPrism(size, size * 0.92, h).rotateY(rng() * Math.PI).translate(x, foot + h / 2, z),
      color: i % 2 ? ROCK_WARM : ROCK,
    });
    // A tuft of moss on the lip of some of them.
    if (rng() < 0.6) {
      const ma = rng() * Math.PI * 2;
      parts.push({
        geo: new THREE.DodecahedronGeometry(0.16 + rng() * 0.08, 0).scale(1, 0.45, 1)
          .translate(x + Math.cos(ma) * size * 0.6, top + 0.02, z + Math.sin(ma) * size * 0.6),
        color: MOSS,
      });
    }
    stands.push({
      x: CRAG.x + Math.cos(a) * (LEDGE_R + STAND_OUT),
      // `y` is the ledge's flat, which roughPrism leaves within ±0.15 of `top`.
      y: top + 0.04,
      z: CRAG.z + Math.sin(a) * (LEDGE_R + STAND_OUT),
      pause: 1.2 + rng() * 1.8,
    });
  }
  const ledges = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  scene.add(ledges);
  for (const part of parts) part.geo.dispose();

  // Her pasture at the foot, a little round from the bottom ledge.
  const fa = toGarden - 1.45;
  const fx = CRAG.x + Math.cos(fa) * (LEDGE_R + 1.8);
  const fz = CRAG.z + Math.sin(fa) * (LEDGE_R + 1.8);
  const foot = { x: fx, y: heightAt(fx, fz), z: fz, pause: FOOT_GRAZE, graze: true };
  stands[LEDGES - 1].pause = TOP_LOOK;
  stands[LEDGES - 1].look = true;

  // The round: the foot, up every ledge, and back down them to the foot.
  const route = [foot, ...stands, ...stands.slice(0, -1).reverse()];

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(bodyGeometry(), material));
  const head = new THREE.Group();
  head.position.set(0, 0.8, 0.38);
  head.add(new THREE.Mesh(headGeometry(), material));
  group.add(head);
  group.scale.setScalar(1.1);
  // Yaw first, so the leap's pitch tips her about her own flank, not the
  // world's x axis (eyrie.js's idiom).
  group.rotation.order = 'YXZ';
  scene.add(group);

  // Out over the garden from the top of her stair.
  const lookOut = Math.atan2(-CRAG.x, -CRAG.z);

  let at = 0;                       // the stop she is at (or leaping from)
  let wait = 6 + rng() * 6;         // first stand: she begins at the foot, grazing
  let leap = -1;                    // < 0 standing; else 0..1 through a leap
  let headDip = 0;
  let leaps = 0;
  group.position.set(foot.x, foot.y, foot.z);
  group.rotation.y = Math.atan2(stands[0].x - foot.x, stands[0].z - foot.z);

  // Her name lives on a Vector3 moved with her (conies.js's idiom).
  const pos = group.position;
  const spots = [{ pos, name: 'Ayyalah', label: 'the hind', kind: 'hind' }];

  function update(dt, sabbath = false) {
    const here = route[at];
    const next = route[(at + 1) % route.length];
    if (leap < 0) {
      // Standing: graze at the foot, look out from the top, otherwise only
      // look across to the next ledge before she goes.
      wait -= dt * (sabbath ? 0.4 : 1);
      // In the last moment before a leap she always turns to the next
      // ledge, so the leap itself sets off the way she is already facing.
      const toNext = Math.atan2(next.x - here.x, next.z - here.z);
      const face = here.look && wait > 1.2 ? lookOut : toNext;
      group.rotation.y += shortestAngle(group.rotation.y, face) * (1 - Math.exp(-(wait > 1.2 ? 3 : 6) * dt));
      group.rotation.x = damp(group.rotation.x, 0, 8, dt);   // settle level after landing
      headDip = damp(headDip, here.graze && wait > 1 ? 1 : 0, 2.5, dt);
      if (wait <= 0) leap = 0;
    } else {
      leap += dt / LEAP;
      const u = Math.min(leap, 1);
      const rise = Math.abs(next.y - here.y);
      pos.set(
        here.x + (next.x - here.x) * u,
        here.y + (next.y - here.y) * u + 4 * u * (1 - u) * (0.3 + 0.35 * rise),
        here.z + (next.z - here.z) * u,
      );
      group.rotation.y = Math.atan2(next.x - here.x, next.z - here.z);
      // Going up: nose up at the take-off, down to land. Going down: nose
      // down the whole way, front feet first.
      group.rotation.x = next.y >= here.y
        ? -0.3 * Math.cos(Math.PI * u)
        : 0.25 * Math.sin(Math.PI * u);
      headDip = damp(headDip, 0, 6, dt);
      if (leap >= 1) {
        leap = -1;
        leaps++;
        at = (at + 1) % route.length;
        wait = route[at].pause;
      }
    }
    // Head down to the grass, or up and a little lifted to look out.
    head.rotation.x = headDip * 2.0 - (here.look && leap < 0 ? 0.12 : 0);
  }
  update(0);

  function state() {
    return { x: pos.x, y: pos.y, z: pos.z, ledge: at === 0 ? 0 : (at <= LEDGES ? at : 2 * LEDGES - at), leaps };
  }

  return { update, state, spots };
}
