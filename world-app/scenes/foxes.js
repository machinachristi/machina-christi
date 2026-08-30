// "Take us the foxes, the little foxes, that spoil the vines: for our vines
// have tender grapes" (Song of Solomon 2:15) — two little foxes keep to the
// one vine that has climbed a planted tree (scenes/vine.js). They come out
// in the low light, circle the vine at an easy trot, stop to nose at the
// clusters, and are gone into the grass again once the day is up.
//
// Nothing is spoiled here and nothing is caught: this is the garden before
// any of that. They are only ever glimpsed near the vine, and they are
// namable there like every other creature that will hold still long enough.
//
// Both foxes ride ONE instanced mesh whose geometry is itself a merge of
// body, head, ears and brush (the quail's build in scenes/creatures.js) —
// two little foxes for a single draw call.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, clamp, damp, mulberry32, smoothstep } from '../util.js';

const COUNT = 2;
const RING_MIN = 1.7;   // how close to the vine's trunk they will come
const RING_MAX = 3.4;

const COAT = new THREE.Color(0xB4682F);
const COAT_DARK = new THREE.Color(0x8A4A20);
const BRUSH_TIP = new THREE.Color(0xF0E6D2);
const SOCK = new THREE.Color(0x3A2A20);

// How far out of hiding the foxes presently are, 0 (gone) to 1 (out among
// the vines), from the sky's own clock. They keep the two low lights —
// before the dew has lifted, and again as the evening comes on — and lie up
// through the middle of the day and the deep of the night. Pure, so a test
// can ask the same question the foxes are answering.
export function foxOf(cycleT) {
  const t = ((cycleT % 1) + 1) % 1;
  const morning = smoothstep(0.02, 0.09, t) * (1 - smoothstep(0.13, 0.2, t));
  const evening = smoothstep(0.5, 0.58, t) * (1 - smoothstep(0.68, 0.76, t));
  return Math.max(morning, evening);
}

function foxGeometry() {
  const parts = [];
  // A low, long body — a fox's whole look is that it is nearer the ground
  // than anything else its length.
  parts.push({
    geo: new THREE.CapsuleGeometry(0.1, 0.28, 3, 6)
      .toNonIndexed()
      .rotateZ(Math.PI / 2)
      .translate(0, 0.17, 0),
    color: COAT,
  });
  parts.push({
    geo: new THREE.SphereGeometry(0.085, 7, 6).toNonIndexed().translate(0, 0.22, 0.24),
    color: COAT,
  });
  // The sharp muzzle, and the two ears that are half of what makes it a fox.
  parts.push({
    geo: new THREE.ConeGeometry(0.05, 0.16, 5)
      .toNonIndexed()
      .rotateX(Math.PI / 2)
      .translate(0, 0.2, 0.34),
    color: COAT_DARK,
  });
  for (const sx of [-1, 1]) {
    parts.push({
      geo: new THREE.ConeGeometry(0.045, 0.13, 4)
        .toNonIndexed()
        .rotateZ(sx * 0.2)
        .translate(sx * 0.05, 0.32, 0.21),
      color: COAT_DARK,
    });
  }
  // The brush, carried low and straight out behind, white at the tip.
  parts.push({
    geo: new THREE.ConeGeometry(0.07, 0.3, 5)
      .toNonIndexed()
      .rotateX(-Math.PI / 2.2)
      .translate(0, 0.17, -0.28),
    color: COAT,
  });
  parts.push({
    geo: new THREE.SphereGeometry(0.05, 6, 5).toNonIndexed().translate(0, 0.24, -0.42),
    color: BRUSH_TIP,
  });
  // Four dark stockings, no more than that — at this size legs are a colour,
  // not a mechanism.
  for (const [sx, sz] of [[-0.07, 0.12], [0.07, 0.12], [-0.07, -0.12], [0.07, -0.12]]) {
    parts.push({
      geo: new THREE.CylinderGeometry(0.022, 0.02, 0.16, 4)
        .toNonIndexed()
        .translate(sx, 0.08, sz),
      color: SOCK,
    });
  }
  const geo = mergeColored(parts);
  for (const part of parts) part.geo.dispose();
  return geo;
}

// `vinePos` is scenes/vine.js's own naming spot — {x, y, z} at the lowest
// hanging cluster, which is exactly what a little fox is interested in.
export function createFoxes(scene, vinePos) {
  // Own seeded stream: two foxes about a tree already chosen shift nothing
  // already planted.
  const rng = mulberry32(20260820);

  const mesh = new THREE.InstancedMesh(
    foxGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    COUNT,
  );
  mesh.frustumCulled = false;   // the pair sits well off scene-centre, out at the vine
  mesh.visible = false;
  scene.add(mesh);

  const foxes = [];
  const spots = [];
  for (let i = 0; i < COUNT; i++) {
    const theta = rng() * Math.PI * 2;
    const pos = new THREE.Vector3(vinePos.x, 0, vinePos.z);
    foxes.push({
      theta,
      radius: RING_MIN + rng() * (RING_MAX - RING_MIN),
      rate: (0.34 + rng() * 0.22) * (rng() < 0.5 ? -1 : 1),   // which way round
      pause: 2 + rng() * 5,
      nosing: 0,
      out: 0,
      pos,
    });
    spots.push({ pos, name: 'Shual', label: 'the little fox', kind: 'fox' });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();

  let t = 0;
  let outNow = 0;

  function update(dt, cycleT = 0.1) {
    t += dt;
    const want = foxOf(cycleT);
    outNow = damp(outNow, want, 1.1, dt);
    if (outNow < 0.004) outNow = 0;
    mesh.visible = outNow > 0.01;
    if (!mesh.visible) return;

    for (let i = 0; i < COUNT; i++) {
      const F = foxes[i];
      // Trot, stop to nose at the vine, trot on — never in step with each
      // other, and never on anyone's clock but their own.
      if (F.nosing > 0) {
        F.nosing -= dt;
      } else {
        F.pause -= dt;
        if (F.pause <= 0) {
          F.nosing = 1.2 + rng() * 2.2;
          F.pause = 3 + rng() * 7;
        }
        F.theta += F.rate * dt;
      }
      const nose = F.nosing > 0 ? 1 : 0;
      const x = vinePos.x + Math.cos(F.theta) * F.radius;
      const z = vinePos.z + Math.sin(F.theta) * F.radius;
      // Rising out of the grass as their hour comes on, sinking back as it
      // passes — never a fox appearing from nothing in plain sight.
      const hide = (1 - clamp(outNow, 0, 1)) * 0.34;
      F.pos.set(x, heightAt(x, z) - hide + Math.sin(t * 6 + i) * 0.01 * (1 - nose), z);
      // Facing the way it is going, or dipped in toward the clusters when
      // it has stopped at them.
      // The tangent of its own circle, in the direction it is going round.
      const way = Math.sign(F.rate);
      const along = Math.atan2(-Math.sin(F.theta) * way, Math.cos(F.theta) * way);
      const inward = Math.atan2(vinePos.x - x, vinePos.z - z);
      e.set(nose ? 0.34 : 0, nose ? inward : along, 0);
      s.setScalar(0.9 + (i % 2) * 0.12);
      m.compose(F.pos, q.setFromEuler(e), s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // The vine they keep rides along in the state: it is chosen from the
  // planted trees at build time, so this is the only account of where the
  // pair of them will ever be (the same precedent as the spring's own x/z).
  function state() {
    return { count: COUNT, out: outNow, x: vinePos.x, z: vinePos.z };
  }

  update(0);   // seat every matrix before the pre-ready warm-up frame
  return { update, state, spots };
}
