// The birds nest in the sacred trees' branches, and in time a chick or two
// of their own (Genesis 1:22): "let fowl multiply in the earth." Two nests,
// one in each sacred tree's canopy — empty at first, each quietly given a
// chick as the visit goes on. Nothing to summon; only to notice, and to come
// back to.
//
// And the nests are kept (v15, Psalm 84:3): "yea, the sparrow hath found an
// house, and the swallow a nest for herself, where she may lay her young."
// One small bird belongs to each — perched at home most of the time, off on
// a short errand now and then, always coming back to her own nest.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { clamp, shortestAngle, mulberry32, smoothstep } from '../util.js';

// `hatchAt`: seconds into the visit before that nest's chick shows itself.
// `keeper`: the bird whose house this nest is (Psalm 84:3).
const SPOTS = [
  {
    base: TREE_OF_LIFE_POS, dx: 0.55, dy: 4.85, dz: -0.35, hatchAt: 45,
    keeper: { tone: 0xA98A5F, wing: 0x7C6440, name: 'Tsippor', label: 'the sparrow', kind: 'sparrow' },
  },
  {
    base: TREE_OF_KNOWLEDGE_POS, dx: -0.4, dy: 4.15, dz: 0.5, hatchAt: 110,
    keeper: { tone: 0x35406A, wing: 0x232B4A, name: 'Deror', label: 'the swallow', kind: 'swallow' },
  },
];
const GROW = 2.5;   // seconds a chick takes to fill out once its moment comes

// Both keepers share two instanced meshes — every body in one, every wing in
// the other — so the pair of them costs two draw calls however far they
// range. Their bodies nose forward along +z, as every other flyer here does.
const BIRD_BODY = new THREE.ConeGeometry(0.062, 0.24, 5).rotateX(Math.PI / 2);
const BIRD_WING = new THREE.BoxGeometry(0.26, 0.016, 0.1);

export function createNests(scene) {
  // Own seeded stream: a small twiggy tilt at two fixed spots shifts nothing
  // already planted.
  const rng = mulberry32(20260718);

  const nestMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.16, 0),
    new THREE.MeshLambertMaterial({ color: 0x6E5230, flatShading: true }),
    SPOTS.length,
  );
  const chickMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0xE8D77A, flatShading: true }),
    SPOTS.length,
  );
  scene.add(nestMesh, chickMesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const nests = SPOTS.map(spot => {
    const groundY = heightAt(spot.base.x, spot.base.z);
    return {
      x: spot.base.x + spot.dx,
      y: groundY + spot.dy,
      z: spot.base.z + spot.dz,
      hatchAt: spot.hatchAt,
      hatched: false,
      grownFor: 0,
    };
  });

  for (let i = 0; i < nests.length; i++) {
    const n = nests[i];
    q.setFromEuler(new THREE.Euler(rng() * 0.3, rng() * Math.PI * 2, rng() * 0.3));
    s.set(1.3, 0.7, 1.3);
    m.compose(p.set(n.x, n.y, n.z), q, s);
    nestMesh.setMatrixAt(i, m);
    // Chicks start hidden — scale 0 — until their own moment comes.
    m.compose(p.set(n.x, n.y + 0.08, n.z), q.identity(), s.setScalar(0));
    chickMesh.setMatrixAt(i, m);
  }
  nestMesh.instanceMatrix.needsUpdate = true;
  chickMesh.instanceMatrix.needsUpdate = true;

  // ── The keepers of the nests (Psalm 84:3) ─────────────────
  // Own seeded stream, appended after the twiggy tilts above, so the nests
  // themselves sit exactly where they always have.
  const birdRng = mulberry32(20260733);
  const bodyMesh = new THREE.InstancedMesh(
    BIRD_BODY, new THREE.MeshLambertMaterial({ flatShading: true }), SPOTS.length,
  );
  const wingMesh = new THREE.InstancedMesh(
    BIRD_WING, new THREE.MeshLambertMaterial({ flatShading: true }), SPOTS.length * 2,
  );
  bodyMesh.frustumCulled = false;
  wingMesh.frustumCulled = false;
  scene.add(bodyMesh, wingMesh);

  const keepers = nests.map((n, i) => {
    const def = SPOTS[i].keeper;
    const c = new THREE.Color(def.tone);
    bodyMesh.setColorAt(i, c);
    c.setHex(def.wing);
    wingMesh.setColorAt(i * 2, c);
    wingMesh.setColorAt(i * 2 + 1, c);
    return {
      ...def,
      home: { x: n.x, y: n.y + 0.12, z: n.z },
      // The walker names her wherever she presently is, so this rides with
      // her rather than resting at the nest (see creatures.js's naming).
      pos: new THREE.Vector3(n.x, n.y + 0.12, n.z),
      yaw: birdRng() * Math.PI * 2,
      beat: 0.06,
      mode: 'perch',                       // perch at home | out on an errand
      until: 6 + birdRng() * 14,
      errand: null,
      flap: birdRng() * Math.PI * 2,
    };
  });
  bodyMesh.instanceColor.needsUpdate = true;
  wingMesh.instanceColor.needsUpdate = true;

  // Scratch for laying the keepers out each frame — never allocated per bird.
  const birdM = new THREE.Matrix4();
  const wingM = new THREE.Matrix4();
  const wingLocal = new THREE.Matrix4();
  const birdQ = new THREE.Quaternion();
  const wingQ = new THREE.Quaternion();
  const wingOff = new THREE.Vector3();
  const ONE = new THREE.Vector3(1, 1, 1);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);

  // Lay one keeper — her body, and her two wings hinged either side of it —
  // into the shared instanced meshes.
  function placeKeeper(k, i) {
    birdQ.setFromAxisAngle(Y_AXIS, k.yaw);
    birdM.compose(k.pos, birdQ, ONE);
    bodyMesh.setMatrixAt(i, birdM);
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      wingOff.set(side * 0.15, 0, 0);
      wingQ.setFromAxisAngle(Z_AXIS, -side * Math.sin(k.flap) * k.beat);
      wingLocal.compose(wingOff, wingQ, ONE);
      wingM.multiplyMatrices(birdM, wingLocal);
      wingMesh.setMatrixAt(i * 2 + s, wingM);
    }
  }

  // A short errand: a point out over the clearing, near enough that her own
  // nest is never out of sight.
  function errandSpot(k) {
    const a = birdRng() * Math.PI * 2;
    const r = 2.5 + birdRng() * 3.5;
    return {
      x: k.home.x + Math.cos(a) * r,
      y: k.home.y - 1.2 + birdRng() * 2.2,
      z: k.home.z + Math.sin(a) * r,
    };
  }

  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    let dirty = false;
    for (let i = 0; i < nests.length; i++) {
      const n = nests[i];
      if (elapsed < n.hatchAt) continue;
      n.hatched = true;
      n.grownFor = Math.min(GROW, n.grownFor + dt);
      const k = smoothstep(0, GROW, n.grownFor);
      m.compose(p.set(n.x, n.y + 0.08, n.z), q.identity(), s.setScalar(0.55 * k));
      chickMesh.setMatrixAt(i, m);
      dirty = true;
    }
    if (dirty) chickMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < keepers.length; i++) {
      const k = keepers[i];
      k.until -= dt;
      const target = k.mode === 'out' ? k.errand : k.home;
      const dx = target.x - k.pos.x, dy = target.y - k.pos.y, dz = target.z - k.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 1e-3) {
        const step = Math.min(dist, 2.6 * dt);
        k.pos.x += (dx / dist) * step;
        k.pos.y += (dy / dist) * step;
        k.pos.z += (dz / dist) * step;
        k.yaw += shortestAngle(k.yaw, Math.atan2(dx, dz)) * clamp(dt * 4, 0, 1);
      }
      // Wings beat on the wing and fold at the nest.
      const flying = dist > 0.06;
      k.flap += dt * (flying ? 17 : 1.6);
      k.beat = flying ? 0.7 : 0.06;
      placeKeeper(k, i);

      if (k.until <= 0) {
        if (k.mode === 'perch') {
          k.mode = 'out';
          k.errand = errandSpot(k);
          k.until = 5 + birdRng() * 5;
        } else {
          k.mode = 'perch';
          k.until = 9 + birdRng() * 16;
        }
      }
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    wingMesh.instanceMatrix.needsUpdate = true;
  }

  function state() {
    return {
      hatched: nests.filter(n => n.hatched).length,
      keepers: keepers.map(k => ({ kind: k.kind, mode: k.mode })),
    };
  }

  update(0);
  // The keepers join the one naming candidate list every other living thing
  // in the garden shares (see creatures.js) — each carries its own `group`,
  // so a bird off on an errand is named where she presently is, not at home.
  const spots = keepers.map(k => ({
    pos: k.pos, name: k.name, label: k.label, kind: k.kind,
  }));
  return { update, state, spots };
}
