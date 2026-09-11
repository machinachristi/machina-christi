// "Deep calleth unto deep at the noise of thy waterspouts: all thy waves and
// thy billows are gone over me" (Psalm 42:7). Five springs break out of the
// rim (scenes/springs.js) and run down by whatever way the land gives them;
// of the five, one finds the great river. Where it arrives the water it has
// carried the whole way down off the rim goes into water that was already
// there, and the two are one water from then on.
//
// What the verse is about is answering — one deep calls and another deep
// calls back — so that is the whole of what happens here. A ring widens out
// from the mouth into the channel, and a moment later a ring comes back in
// toward it, off the river; then the pair begins again. Neither is louder
// than the other, and it never stops.
//
// The land gives no cliff for the rill to fall over — it shelves down into
// the channel — so there is no waterfall here and nothing is built standing
// up. What is built is what is actually there: broken white water lying flat
// on the last stretch of the rill, and the churn where it goes under.
//
// Two draw calls: every confluence in the garden baked into one merged
// geometry (there is presently one), and every ring of the call and the
// answer sharing one instanced mesh.

import * as THREE from 'three';
import { mergeColored, clamp, smoothstep } from '../util.js';

const SURFACE_Y = -0.5;    // scenes/water.js's own surface
const RINGS = 6;           // recycled between the calls and the answers
const CALL_LIFE = 2.6;     // how long one ring takes to cross the water
const BEAT = 1.45;         // between a call and the answer that comes back
const OUT = 2.3;           // how far out into the channel the call carries
const TONGUE = 2.2;        // how far back up the course the white water runs
const STEPS = 7;
const LIFT = 0.02;         // laid on the surface, never proud of it

const FROTH = new THREE.Color(0xE9F6FA);
const BROKEN = new THREE.Color(0x9FCBDE);
const UNDER = new THREE.Color(0x3E7BA1);

export function createDeeps(scene, mouths = []) {
  // No seeded stream of its own: everything here is decided by where the
  // springs already arrived and where the water already is.
  const places = [];
  const parts = [];

  for (const mouth of mouths) {
    // The white water: a tapering ribbon laid flat along the last stretch of
    // the course, whitest where the rill is still running fast and gone by
    // the time the river has taken it. Two triangles a step, hand-coloured
    // and merged, the same build as the rills themselves (scenes/springs.js).
    const nx = -mouth.dz;
    const nz = mouth.dx;
    const rim = [];
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS;
      const cx = mouth.x - mouth.dx * TONGUE * (1 - u);
      const cz = mouth.z - mouth.dz * TONGUE * (1 - u);
      const w = 0.1 + 0.34 * Math.sin(u * Math.PI * 0.92);
      rim.push([
        [cx + nx * w, SURFACE_Y + LIFT, cz + nz * w],
        [cx - nx * w, SURFACE_Y + LIFT, cz - nz * w],
      ]);
    }
    const tone = new THREE.Color();
    for (let i = 0; i < rim.length - 1; i++) {
      const [l0, r0] = rim[i];
      const [l1, r1] = rim[i + 1];
      const quad = new THREE.BufferGeometry();
      quad.setAttribute('position', new THREE.Float32BufferAttribute(
        [...l0, ...r0, ...l1, ...r0, ...r1, ...l1], 3,
      ));
      tone.copy(FROTH).lerp(BROKEN, Math.pow(i / (rim.length - 1), 0.7));
      parts.push({ geo: quad, color: tone.clone() });
    }

    // And the churn where it goes under: darker than the channel about it,
    // flat on the surface.
    parts.push({
      geo: new THREE.CircleGeometry(0.5, 14).toNonIndexed()
        .rotateX(-Math.PI / 2)
        .translate(mouth.x, SURFACE_Y + LIFT * 0.5, mouth.z),
      color: UNDER,
    });

    places.push({
      x: mouth.x, z: mouth.z,
      // Where the answer comes back from: out in the channel, on the line
      // the rill was already travelling when the river took it.
      outX: mouth.x + mouth.dx * OUT,
      outZ: mouth.z + mouth.dz * OUT,
    });
  }

  if (parts.length) {
    const churn = new THREE.Mesh(
      mergeColored(parts),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        // Which way round a quad winds depends on the way the course happened
        // to arrive; one bend and half of it would face away and vanish —
        // the same lesson the rills themselves learned (scenes/springs.js).
        side: THREE.DoubleSide,
      }),
    );
    scene.add(churn);
    for (const part of parts) part.geo.dispose();
  }

  const rings = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.82, 1, 22).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false }),
    Math.max(1, RINGS * places.length),
  );
  rings.frustumCulled = false;
  rings.visible = places.length > 0;
  scene.add(rings);

  const WATER = new THREE.Color(0x4E8FB8);
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  // Each place keeps its own pair of voices going: a call out from the mouth,
  // then an answer back to it, then the call again.
  const voices = [];
  for (let i = 0; i < places.length; i++) {
    for (let r = 0; r < RINGS; r++) {
      voices.push({
        place: places[i],
        answering: r % 2 === 1,
        // Staggered so the pair is always mid-conversation, never in step.
        age: CALL_LIFE - (r / RINGS) * (CALL_LIFE + BEAT),
      });
    }
  }

  let speaking = 0;

  function update(dt, rain = 0) {
    if (!places.length) return;
    speaking = 0;
    // More water off the hills means a fuller voice, not a faster one.
    const swell = 1 + rain * 0.35;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      v.age += dt;
      if (v.age > CALL_LIFE + BEAT) v.age -= CALL_LIFE + BEAT;
      const k = clamp(v.age / CALL_LIFE, 0, 1);
      // Between the two there is a beat of quiet: the ring has gone, and the
      // one coming the other way has not started.
      const alive = v.age >= 0 && v.age <= CALL_LIFE;
      if (alive) speaking++;
      // The call goes out from the mouth and widens; the answer comes in off
      // the river and closes on it.
      const cx = v.answering ? v.place.outX : v.place.x;
      const cz = v.answering ? v.place.outZ : v.place.z;
      const radius = alive
        ? (v.answering ? 1.5 - k * 1.15 : 0.3 + k * 1.35) * swell
        : 0;
      p.set(cx, SURFACE_Y + 0.03, cz);
      s.set(radius, 1, radius);
      rings.setMatrixAt(i, m.compose(p, q, s));
      // Whitest as it is given, the river's own colour by the time it is
      // answered — and an answer arrives already half the river's.
      const white = v.answering ? 1 - k : k;
      c.copy(WATER).lerp(FROTH, smoothstep(0, 1, 1 - white) * 0.9);
      rings.setColorAt(i, c);
    }
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  }
  update(0);

  // Namable where the waters meet — and `tehom` is the word the psalm uses
  // for both of the deeps that are calling.
  const spots = places.map(pl => ({
    pos: { x: pl.x, y: SURFACE_Y + 0.4, z: pl.z },
    name: 'Tehom', label: 'the deep', kind: 'deep',
  }));

  return {
    update, spots,
    state: () => ({
      mouths: places.length,
      speaking,
      at: places.map(pl => ({ x: pl.x, z: pl.z })),
    }),
  };
}
