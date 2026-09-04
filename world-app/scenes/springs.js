// "He sendeth the springs into the valleys, which run among the hills. They
// give drink to every beast of the field" (Psalm 104:10-11). The one great
// river is not the only water here. Up on the rim, where the land lifts
// toward the fog, small springs break out of the hillside and run down —
// each finding its own way by the only rule water knows, which is to take
// the ground as it is given and go always to the lower place. Some reach a
// channel of the river; some simply sink away into a hollow of the meadow.
// Either way the beasts of the field drink on their way up the hills, and
// the garden is watered where the great river never comes.
//
// Each rill's course is found at build time by walking the garden's own
// `heightAt` downhill from its head — so a spring runs where the land
// actually falls, and would find a different way if the land were ever
// reshaped. The courses bake into ONE merged ribbon, and the water sliding
// down them shares ONE instanced mesh: two draw calls for every spring in
// the garden.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32, clamp, lerp } from '../util.js';

const COUNT = 5;          // springs broken out of the rim
const STEP = 0.95;        // how far the course is walked at a time
const MAX_STEPS = 30;     // how far a rill may run before it has soaked away
const MOMENTUM = 0.55;    // water does not turn on a sixpence
const PROBE = 0.6;        // how wide a footing the slope is read over
const WIDTH = 0.34;       // the rill at its fullest
// How far the water is laid above the height function. The ground *mesh* is
// a 64-segment plane, so between its vertices a flat triangle bridges the
// true curve — and in a hollow, which is exactly where a rill runs, that
// bridge sits above the curve and swallows anything laid too close to it.
// (An earlier 0.035 — ants.js's figure for its road out on flatter ground —
// buried every rill in the garden completely.)
const LIFT = 0.13;
const BEADS = 18;         // glints of water sliding down them
const BEAD_SPEED = 0.16;  // fractions of a course per second

const RILL_DEEP = new THREE.Color(0x35719B);
const RILL_PALE = new THREE.Color(0xA9CEE0);

// Walk one course downhill from a head on the rim: read the slope under the
// present step, ease the heading toward it, and take another step — until
// the water either reaches a channel of the river or has run as far as a
// rill of this size ever does.
function courseFrom(x, z, headingX, headingZ) {
  const pts = [{ x, y: heightAt(x, z), z }];
  let dx = headingX;
  let dz = headingZ;
  for (let i = 0; i < MAX_STEPS; i++) {
    const gx = (heightAt(x + PROBE, z) - heightAt(x - PROBE, z)) / (2 * PROBE);
    const gz = (heightAt(x, z + PROBE) - heightAt(x, z - PROBE)) / (2 * PROBE);
    const gl = Math.hypot(gx, gz);
    // Steepest descent, or — on ground too flat to read — straight on.
    const sx = gl > 1e-4 ? -gx / gl : dx;
    const sz = gl > 1e-4 ? -gz / gl : dz;
    dx = dx * MOMENTUM + sx * (1 - MOMENTUM);
    dz = dz * MOMENTUM + sz * (1 - MOMENTUM);
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    x += dx * STEP;
    z += dz * STEP;
    pts.push({ x, y: heightAt(x, z), z });
    if (riverEdgeDist(x, z) < 0.45) break;   // it has found the river
  }
  return pts;
}

export function createSprings(scene) {
  // Own seeded stream: springs on the rim shift nothing already planted.
  const rng = mulberry32(20260824);

  // ── The heads ─────────────────────────────────────────────
  // Spread round the rim, each jittered off its own quarter, and only where
  // the ground is genuinely high and genuinely far from the river — a spring
  // that broke out three steps from a channel would be no spring at all.
  const courses = [];
  let guard = 0;
  while (courses.length < COUNT && guard++ < COUNT * 40) {
    const a = (courses.length / COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.9;
    const r = 44.5 + rng() * 4;
    const hx = Math.cos(a) * r;
    const hz = Math.sin(a) * r;
    if (riverEdgeDist(hx, hz) < 6) continue;
    if (heightAt(hx, hz) < 0.15) continue;
    // It starts by running inward, off the rim, and the slope takes it from
    // there.
    courses.push(courseFrom(hx, hz, -Math.cos(a), -Math.sin(a)));
  }

  // ── The courses, as seen ──────────────────────────────────
  // A ribbon of running water laid along each course, two triangles a step,
  // built non-indexed and hand-coloured so the whole lot merges into one
  // flat geometry with no seams (scenes/ants.js's worn road, watered).
  const verts = [];
  const cols = [];
  const tone = new THREE.Color();
  for (const pts of courses) {
    const rim = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(i + 1, pts.length - 1)];
      const b = pts[Math.max(i - 1, 0)];
      const tx = q.x - b.x, tz = q.z - b.z;
      const tl = Math.hypot(tx, tz) || 1;
      const u = i / (pts.length - 1);
      // Narrow at the head, where it is only just out of the ground, and
      // narrowing again at the foot, where it soaks away.
      const w = WIDTH * (0.3 + 0.7 * Math.sin(Math.pow(u, 0.65) * Math.PI));
      const nx = (-tz / tl) * w, nz = (tx / tl) * w;
      rim.push([
        [p.x + nx, heightAt(p.x + nx, p.z + nz) + LIFT, p.z + nz],
        [p.x - nx, heightAt(p.x - nx, p.z - nz) + LIFT, p.z - nz],
      ]);
    }
    for (let i = 0; i < rim.length - 1; i++) {
      const [l0, r0] = rim[i];
      const [l1, r1] = rim[i + 1];
      verts.push(...l0, ...r0, ...l1, ...r0, ...r1, ...l1);
      // Palest where it first breaks out and is all froth, deepening fast as
      // it gathers — a slow lerp left almost the whole course the colour of
      // the froth, and a rill the colour of milk reads as a path, not water.
      tone.copy(RILL_PALE)
        .lerp(RILL_DEEP, Math.pow(clamp(i / (rim.length - 1), 0, 1), 0.45));
      for (let v = 0; v < 6; v++) cols.push(tone.r, tone.g, tone.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    // A course turns as it descends, so which way round a segment's two
    // triangles wind depends on the ground it happens to be crossing — one
    // bend and half the rill would face away and vanish.
    side: THREE.DoubleSide,
  });
  const rills = new THREE.Mesh(geo, mat);
  rills.renderOrder = -1;   // laid into the ground, never proud of it
  scene.add(rills);

  // ── The water running ─────────────────────────────────────
  // Cumulative lengths, so a glint slides down its course at an even pace
  // however unevenly the ground made the steps.
  const measured = courses.map(pts => {
    const along = [0];
    for (let i = 1; i < pts.length; i++) {
      along.push(along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    }
    return { pts, along, total: along[along.length - 1] || 1 };
  });

  function pointAt(c, u) {
    const want = clamp(u, 0, 1) * c.total;
    let i = 1;
    while (i < c.along.length - 1 && c.along[i] < want) i++;
    const span = c.along[i] - c.along[i - 1] || 1;
    const f = clamp((want - c.along[i - 1]) / span, 0, 1);
    const a = c.pts[i - 1], b = c.pts[i];
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) };
  }

  const glints = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.07, 0),
    // Kept soft and part-transparent: flat opaque white at this size reads
    // as something floating on the water rather than the water catching.
    new THREE.MeshBasicMaterial({ color: 0xDCEFF7, transparent: true, opacity: 0.6 }),
    BEADS,
  );
  glints.frustumCulled = false;   // instances spread the whole rim
  scene.add(glints);

  const drops = [];
  for (let i = 0; i < BEADS; i++) {
    drops.push({
      c: measured[i % measured.length],
      u: rng(),
      rate: 0.75 + rng() * 0.6,
      bob: rng() * Math.PI * 2,
    });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  let flow = 1;
  let t = 0;

  // Rain swells them: more water off the hills, and running faster for it.
  function update(dt, rain = 0) {
    t += dt;
    flow = 1 + rain * 0.7;
    mat.opacity = 0.8 + rain * 0.12;
    for (let i = 0; i < BEADS; i++) {
      const d = drops[i];
      d.u += BEAD_SPEED * d.rate * flow * dt;
      if (d.u > 1) d.u -= 1;
      const at = pointAt(d.c, d.u);
      p.set(at.x, at.y + LIFT + 0.09 + Math.sin(t * 6 + d.bob) * 0.014, at.z);
      m.compose(p, q, s);
      glints.setMatrixAt(i, m);
    }
    glints.instanceMatrix.needsUpdate = true;
  }
  update(0);

  // Namable at each head, where the water breaks out of the hill —
  // `ma'yan` is the very word Psalm 104:10 uses for these springs.
  const spots = courses.map(pts => ({
    pos: { x: pts[0].x, y: pts[0].y + 0.12, z: pts[0].z },
    name: "Ma'yan", label: 'the spring', kind: 'spring',
  }));

  return {
    update, spots,
    count: COUNT,
    state: () => ({
      count: COUNT,
      beads: BEADS,
      flow,
      heads: courses.map(pts => ({ x: pts[0].x, z: pts[0].z })),
      reach: courses.map(pts => Math.hypot(
        pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].z - pts[0].z,
      )),
    }),
  };
}
