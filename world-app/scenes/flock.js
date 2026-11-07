// "And when he putteth forth his own sheep, he goeth before them, and the
// sheep follow him: for they know his voice" (John 10:4). "He maketh me to
// lie down in green pastures: he leadeth me beside the still waters"
// (Psalm 23:2).
//
// A flock of its own keeps a pasture on the open meadow south of the river,
// a little way from where every visit begins — a ewe and a ram and their lamb, grazing
// with their heads down, wandering a few steps to fresh grass, grazing again.
// Walk in among them and they know him: each one near him lifts its head and
// falls in behind, and any still grazing beside one that has joined comes
// too, so a walk through the flock gathers it. They follow the very way he
// went — round the rock where he went round it, along the bank where he
// walked it — strung out behind him, the lambs frisking. They will not wade:
// if he goes into the river they wait at the brink and drink until he comes
// back, or until he has gone so far on that they let him go and graze where
// he left them.
//
// Stand still and they come up round him; stand a little longer and they
// lie down at his feet, and there they stay: they follow no further until
// he has walked off and come back to them. Wherever he leads them is their
// pasture after that,
// and the garden remembers it (`camino_fold`), so next visit the flock is
// grazing where it was left. Through the heat of the middle day and through
// the night the grazing flock lies down where it is, "where thou makest thy
// flock to rest at noon" (Song of Solomon 1:7).
//
// v36, "he shall gather the lambs with his arm, and carry them in his
// bosom, and shall gently lead those that are with young" (Isaiah 40:11):
// when the lamb has come up to him and he stands, he stoops and lifts it into
// his arms, and carries it at his breast wherever he goes — through the
// river, too, where the others will not follow. Once he walks on with it he
// swings it up across his shoulders, "he layeth it on his shoulders,
// rejoicing" (Luke 15:5), and down into his arms again when he stops; its
// head turns to look about, its mother close at his heel looking up at it and calling, and the
// lamb answering her. Stand a while, or lie back in the grass, and he sets
// it down beside him — never across the water from its mother, where it
// could not go to her. Set down while the flock stands round him, it skips
// about, and then they all lie down round him; standing among them, they
// lie down round him as they always did, and the lamb lies down by its
// mother once he sets it down.
//
// No score, no count, nothing to lose: a sheep that strays is only a sheep
// grazing. Three sheep in four draw calls — bodies, heads, legs and the
// shadows they stand on are each one instanced mesh, written once a frame.

import * as THREE from 'three';
import { heightAt, riverEdgeDist, GARDEN_RADIUS } from './terrain.js';
import { TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { createFooting } from '../footing.js';
import { clamp, damp, shortestAngle, mulberry32, smoothstep, mergeColored } from '../util.js';

const ADULTS = 2;   // the mother and the father
const LAMBS = 1;
const PASTURE_LIM = GARDEN_RADIUS - 10.5;   // no pasture further out than this
const COUNT = ADULTS + LAMBS;
// The first pasture: the open meadow between the two sacred trees and the
// river, dead ahead of where every visit begins — the very place the opening
// shot gazes at, so the flock is in sight from the first moment, even on a
// narrow phone — and far enough off (≈15 m) that it waits to be walked to.
const HOME = { x: 0, z: 5.5 };
const PASTURE = 4.5;              // how far a grazing sheep wanders from it
const JOIN = 3.2;                 // he comes this near a sheep: it knows him
const CHAIN = 2.0;                // …and one this near a follower comes too
const LEAVE = 26;                 // he has gone this far on: it lets him go
const REGATHER = LEAVE - 4;       // …and a neighbour gathers it only inside this
const STILL_SPEED = 0.3;          // m/s; slower than this he is standing
const GATHER_AFTER = 1.2;         // seconds standing before they come round him
const LIE_AFTER = 3.5;            // …and this much longer before they lie down
const AWAY = JOIN + 1.5;          // a sheep laid down stays down until he is this far off
const CRUMB = 0.4;                // spacing of the way he went, metres
const CRUMBS = 96;                // how much of it is kept (≈38 m)
const BRINK = 0.35;               // riverEdgeDist nearer than this is the water
const KEY = 'camino_fold';
const CAPTION_FOR = 4;
const FOLLOW_CAPTION = { name: 'Tson', label: 'the flock' };
const REST_CAPTION = { name: 'Yarbitseni', label: 'he maketh me to lie down' };
// v36 (Isaiah 40:11): the lamb carried in his bosom, and set down again.
const LIFT_AFTER = GATHER_AFTER + 0.9;   // seconds standing before he stoops for the lamb
const LIFT_REACH = 1.3;           // the lamb is this near him
const LIFT_TIME = 0.8;            // seconds from the grass up into his arms, or back down
const PUT_AFTER = 3.2;            // seconds standing with it held before he sets it down
const REARM = 2.5;                // metres he walks after setting it down before he lifts it again
const FRISK_FOR = 2.6;            // seconds the lamb skips about once it is down
// v38 (Psalm 114:4, "the little hills like lambs"): while he dances, the
// lambs near him leap about too, and go on a moment after he has bowed.
const JOY_NEAR = 12;              // metres
const JOY_FRISK = 1.1;            // seconds of skipping kept topped up while he dances…
const JOY_AGAIN = 0.45;           // …from whenever it runs down to this
const CALL_EVERY = 4.5;           // the ewe calls up to her lamb about this often
// Where he sets the lamb down, in order of choice: a step before him on his
// right, then on his left, then straight before him, at either side, and
// behind — the first good one (setDownSpot). (Metres ahead, metres to his
// right.)
const SET_DOWN_AT = [[0.8, 0.45], [0.8, -0.45], [1.0, 0], [0.2, 0.8], [0.2, -0.8], [-0.6, 0.5], [-0.6, -0.5]];
const TRY_EVERY = 0.25;           // seconds between looks for a place to set it down
const CARRY_CAPTION = { name: 'Uvecheiko yissa', label: 'he carrieth them in his bosom' };
const SET_DOWN_CAPTION = { name: 'Alot yenahel', label: 'he gently leadeth those with young' };

// The shepherd's tune: semitones above E4, in the E major pentatonic the
// garden's chime and blossom notes already keep. One note as each sheep
// joins, and one every few steps while the flock walks behind him.
const MELODY = [7, 9, 12, 9, 7, 4, 7, 9, 7, 4, 2, 0];
const PIPE_EVERY = 2.4;
const NOTE_GAP = 0.34;   // the notes owed as several fall in at once, one by one

// Through the heat of the middle day (inside sky.js's noon, 0.24–0.46) and
// through the night, the grazing flock lies down where it is. Pure, so a
// test can ask it a question.
export function restOf(t, night) {
  const noon = smoothstep(0.27, 0.3, t) * (1 - smoothstep(0.41, 0.44, t));
  return Math.max(noon, smoothstep(0.45, 0.7, night));
}

const WOOL = new THREE.Color(0xF7F1E3);
const FACE = new THREE.Color(0x5A4636);
const HOOF = 0x4A3A2E;

function ewe() {
  const wool = (geo) => ({ geo: geo.toNonIndexed(), color: WOOL });
  const body = [
    wool(new THREE.CapsuleGeometry(0.3, 0.5, 3, 8).rotateX(Math.PI / 2).translate(0, 0.64, 0)),
    // Fleece in lumps, so the back reads as wool and not as a smooth pod.
    // Rounded (detail 1), not chunky: big flat facets on a grey fleece read
    // as a heap of stones, worst of all once the sheep has lain down.
    // Six lumps along the back are enough: the capsule already rounds the
    // flanks, and every lump is paid for once per sheep.
    ...[[0.15, 0.8, 0.16], [-0.15, 0.8, 0.12], [0, 0.86, -0.08], [0.16, 0.76, -0.25],
      [-0.15, 0.77, -0.23], [0, 0.82, 0.3]]
      .map(([x, y, z]) => wool(new THREE.IcosahedronGeometry(0.18, 1).translate(x, y, z))),
    wool(new THREE.IcosahedronGeometry(0.09, 0).translate(0, 0.66, -0.5)),   // the tail
  ];
  // The head, built about its own pivot at the top of the neck.
  const head = [
    { geo: new THREE.CapsuleGeometry(0.095, 0.16, 2, 6).toNonIndexed()
      .rotateX(Math.PI / 2 + 0.55).translate(0, -0.06, 0.13), color: FACE },
    wool(new THREE.IcosahedronGeometry(0.12, 1).translate(0, 0.07, 0.02)),
    ...[-1, 1].map(sx => ({
      geo: new THREE.ConeGeometry(0.045, 0.15, 4).toNonIndexed()
        .rotateZ(sx * 1.35).translate(sx * 0.14, 0.02, 0.04),
      color: FACE,
    })),
  ];
  return { body: mergeColored(body), head: mergeColored(head) };
}

const HEAD_AT = new THREE.Vector3(0, 0.8, 0.44);
const LEG_AT = [[-0.13, 0.22], [0.13, 0.22], [-0.13, -0.22], [0.13, -0.22]];
const LEG_Y = 0.21;   // legs pivot about their middle (0.42 long)
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function loadHome() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw);
    if (!h || !Number.isFinite(h.x) || !Number.isFinite(h.z)) return null;
    if (Math.hypot(h.x, h.z) > PASTURE_LIM + 0.5) return null;
    if (riverEdgeDist(h.x, h.z) < 2.5) return null;
    return { x: h.x, z: h.z };
  } catch (e) {
    return null;
  }
}

function saveHome(h) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ x: +h.x.toFixed(2), z: +h.z.toFixed(2) }));
  } catch (e) { /* a private window keeps no memory; the flock is no worse for it */ }
}

// solids: garden.js's rock circles — sheep go round the rock as he does.
// trees: vegetation's own tree spots. He walks through a trunk without
// noticing; a sheep grazing through one would be the first thing noticed, so
// for the flock every trunk is solid too, the two sacred trees' the widest.
export function createFlock(scene, solids = [], trees = []) {
  // Own seeded stream: a flock of its own shifts nothing already planted.
  const rng = mulberry32(20260853);
  const footing = createFooting([
    ...solids,
    { x: TREE_OF_LIFE_POS.x, z: TREE_OF_LIFE_POS.z, r: 0.7 },
    { x: TREE_OF_KNOWLEDGE_POS.x, z: TREE_OF_KNOWLEDGE_POS.z, r: 0.7 },
    ...trees.map(t => ({ x: t.x, z: t.z, r: 0.45 })),
  ], GARDEN_RADIUS - 2);
  const home = loadHome() || { x: HOME.x, z: HOME.z };
  const remembered = !(home.x === HOME.x && home.z === HOME.z);

  const parts = ewe();
  const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const bodyMesh = new THREE.InstancedMesh(parts.body, lambert(), COUNT);
  const headMesh = new THREE.InstancedMesh(parts.head, lambert(), COUNT);
  const legMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.042, 0.034, 0.42, 5),
    new THREE.MeshLambertMaterial({ color: HOOF, flatShading: true }),
    COUNT * 4,
  );
  const shadowMesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1c2814, transparent: true, opacity: 0.22, depthWrite: false }),
    COUNT,
  );
  for (const m of [bodyMesh, headMesh, legMesh, shadowMesh]) {
    m.frustumCulled = false;   // the flock ranges wherever he leads it
    scene.add(m);
  }

  // Each sheep: where it stands and how. `rank` is its place in the line
  // behind him while it follows (-1 while it grazes).
  const sheep = [];
  const tint = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const lamb = i >= ADULTS;
    let x = home.x, z = home.z;
    for (let k = 0; k < 20; k++) {
      const a = rng() * Math.PI * 2, r = PASTURE * Math.sqrt(rng());
      x = home.x + Math.cos(a) * r;
      z = home.z + Math.sin(a) * r;
      if (riverEdgeDist(x, z) > 1.5) break;
    }
    ({ x, z } = footing.keepOut({ x, z }));
    const s = lamb ? 0.6 + rng() * 0.08 : 0.92 + rng() * 0.14;
    // The lamb whitest; the parents' fleece a little cream or a little grey.
    const shade = lamb ? 1 : 0.93 + rng() * 0.07;
    tint.setRGB(shade, shade * (0.98 + rng() * 0.02), shade * (0.94 + rng() * 0.05));
    bodyMesh.setColorAt(i, tint);
    headMesh.setColorAt(i, tint);
    sheep.push({
      pos: new THREE.Vector3(x, heightAt(x, z), z),
      yaw: rng() * Math.PI * 2, s, lamb,
      mode: 'graze', until: 1 + rng() * 5, target: { x, z },
      rank: -1, side: rng() * 2 - 1, rested: false,
      phase: rng() * 6, pace: 0, dip: 0.8, lie: 0, hop: 0, drinking: false,
      // v36: how far up into his arms (0..1), the height it is held at, the
      // head's turn to the side, and how long it has left to frisk.
      up: 0, heldY: 0, turn: 0, frisk: 0,
    });
  }

  // The way he went, newest last: a ring of points CRUMB apart.
  const crumbs = new Float32Array(CRUMBS * 2);
  let crumbHead = 0, crumbCount = 0;
  function crumbAt(k) {   // k = 0 is the newest
    const j = ((crumbHead - 1 - k) % CRUMBS + CRUMBS) % CRUMBS;
    return j;
  }
  function layCrumb(x, z) {
    crumbs[crumbHead * 2] = x;
    crumbs[crumbHead * 2 + 1] = z;
    crumbHead = (crumbHead + 1) % CRUMBS;
    crumbCount = Math.min(crumbCount + 1, CRUMBS);
  }
  // The point `dist` back along the way he went, written into `out`.
  function pointBack(w, dist, out) {
    let px = w.x, pz = w.z, left = dist;
    for (let k = 0; k < crumbCount; k++) {
      const j = crumbAt(k);
      const cx = crumbs[j * 2], cz = crumbs[j * 2 + 1];
      const seg = Math.hypot(cx - px, cz - pz);
      if (seg >= left && seg > 1e-6) {
        out.x = px + (cx - px) * (left / seg);
        out.z = pz + (cz - pz) * (left / seg);
        return out;
      }
      left -= seg;
      px = cx; pz = cz;
    }
    out.x = px; out.z = pz;
    return out;
  }

  let followers = 0;
  let lying = 0;
  let round = 0;          // of the followers, how many lie round him
  let joins = 0;
  let rests = 0;
  let still = 0;
  let speed = 0;
  let restAnnounced = false;
  let caption = null;
  let captionLeft = 0;
  let notes = 0;
  let note = MELODY[0];
  let tune = 0;
  let pipeT = 0;
  let owed = 0;           // notes still to sing for sheep that fell in
  let noteT = 0;
  const last = new THREE.Vector3();
  let hasLast = false;

  const sung = { notes: 0, note: MELODY[0], bleats: 0, calls: 0 };
  const back = { x: 0, z: 0 };

  // v36 (Isaiah 40:11): the lamb in his arms. `stage` is none | lifting |
  // held | lowering; the mother is the first of the two grown sheep.
  const lamb = sheep[ADULTS];
  const mother = sheep[0];
  let stage = 'none';
  let stageT = 0;
  let holdStill = 0;      // seconds he has stood with it held
  let armed = true;       // whether he will stoop for it again
  let walked = 0;         // metres walked since he last set it down
  let lifts = 0;
  let leaps = 0;
  let setDowns = 0;
  let bleats = 0;         // the lamb's voice
  let calls = 0;          // its mother's
  let callT = CALL_EVERY * 0.6;
  let answerT = -1;       // the lamb answers her a moment after she calls
  let stoop = 0;          // 0..1: how far he is bent down to it
  let walkFor = 0;        // seconds he has walked on with it held
  let shoulder = 0;       // 0 at his breast → 1 up on his shoulders
  let onShoulders = false;
  let liftable = false;   // whether he would take the lamb up now, were it at his feet
  let tryT = 0;           // until the next look for a place to set it down
  const spot = { x: 0, z: 0 };
  const liftFrom = new THREE.Vector3();
  const putTo = new THREE.Vector3();
  const holdAt = new THREE.Vector3();

  function sing(n) {
    notes++;
    note = n;
  }

  function join(S) {
    S.rank = followers++;
    S.mode = 'follow';
    S.drinking = false;
    joins++;
    if (S.rank === 0) {
      caption = FOLLOW_CAPTION;
      captionLeft = CAPTION_FOR;
      tune = 0;
    }
    // A note for every sheep that falls in — owed, and sung one at a time,
    // since a walk into the flock can gather most of it in a frame or two.
    owed = Math.min(owed + 1, COUNT);
  }

  // True when the straight way from (ax, az) to (bx, bz) never enters the river.
  function dryWay(ax, az, bx, bz) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      if (riverEdgeDist(ax + (bx - ax) * u, az + (bz - az) * u) < 0.05) return false;
    }
    return true;
  }

  // The flock's pasture, as near (x, z) as a good one lies: dry grass well
  // back from the water, inside the rim, and reached from (x, z) without
  // crossing the river. So a flock let go at the brink grazes on the bank
  // just above it, rather than trekking back to wherever it grazed before.
  function settleHome(x, z) {
    const r = Math.hypot(x, z);
    if (r > PASTURE_LIM) { x *= PASTURE_LIM / r; z *= PASTURE_LIM / r; }
    for (let ring = 0; ring <= 10; ring++) {
      const n = ring === 0 ? 1 : 16;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const hx = x + Math.cos(a) * ring, hz = z + Math.sin(a) * ring;
        if (Math.hypot(hx, hz) > PASTURE_LIM || riverEdgeDist(hx, hz) < 2.5) continue;
        if (!dryWay(x, z, hx, hz)) continue;
        home.x = hx;
        home.z = hz;
        saveHome(home);
        return;
      }
    }
  }

  function release(S) {
    S.mode = 'graze';
    S.until = 1 + rng() * 3;
    S.rank = -1;
    S.drinking = false;
  }

  function wanderTarget(S) {
    for (let k = 0; k < 12; k++) {
      const a = rng() * Math.PI * 2, r = PASTURE * Math.sqrt(rng());
      const x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r;
      // Never a patch inside a trunk or the rock, where it could only press.
      const out = footing.keepOut({ x, z });
      if (riverEdgeDist(x, z) > 1.5 && out.x === x && out.z === z) {
        S.target.x = x;
        S.target.z = z;
        return;
      }
    }
    S.target.x = home.x;
    S.target.z = home.z;
  }

  // Step one sheep toward (tx, tz) at no more than `v` m/s. It turns as it
  // goes, and never sets foot in the river: a step that would is not taken.
  function walkToward(S, tx, tz, v, dt) {
    const p = S.pos;
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    S.drinking = false;
    if (dist < 0.12 || v <= 0) { S.pace = damp(S.pace, 0, 8, dt); return dist; }
    S.yaw += shortestAngle(S.yaw, Math.atan2(dx, dz)) * clamp(dt * 6, 0, 1);
    const step = Math.min(dist, v * dt);
    const nx = p.x + (dx / dist) * step, nz = p.z + (dz / dist) * step;
    const here = riverEdgeDist(p.x, p.z), there = riverEdgeDist(nx, nz);
    if (there < BRINK && there < here) {
      // The water's edge: wait here, and drink while waiting.
      S.drinking = true;
      S.pace = damp(S.pace, 0, 8, dt);
      return dist;
    }
    p.x = nx;
    p.z = nz;
    S.pace = step / Math.max(dt, 1e-4);
    return dist;
  }

  const yawQ = new THREE.Quaternion();
  const tipQ = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const flatQ = new THREE.Quaternion();
  const turnQ = new THREE.Quaternion();

  function sync() {
    for (let i = 0; i < COUNT; i++) {
      const S = sheep[i];
      const p = S.pos;
      const s = S.s;
      const ground = heightAt(p.x, p.z);
      // Held, it rides at the height it is held at (S.up, eased from the
      // grass into his arms), its legs folded under it.
      const y = S.up > 0
        ? (ground + S.hop - S.lie * 0.24 * s) * (1 - S.up) + S.heldY * S.up
        : ground + S.hop - S.lie * 0.24 * s;
      yawQ.setFromAxisAngle(Y_AXIS, S.yaw);

      v.set(p.x, y, p.z);
      sc.set(s, s, s);
      bodyMesh.setMatrixAt(i, m.compose(v, yawQ, sc));

      turnQ.setFromAxisAngle(Y_AXIS, S.turn);
      tipQ.setFromAxisAngle(X_AXIS, S.dip);
      q.multiplyQuaternions(yawQ, turnQ).multiply(tipQ);
      v.copy(HEAD_AT).multiplyScalar(s).applyQuaternion(yawQ);
      v.x += p.x; v.y += y; v.z += p.z;
      headMesh.setMatrixAt(i, m.compose(v, q, sc));

      // Legs swing with the stride and fold under as it lies down.
      const swing = Math.min(1, S.pace / 0.6) * 0.5;
      sc.set(s, s * (1 - 0.55 * S.lie), s);
      for (let k = 0; k < 4; k++) {
        const ang = Math.sin(S.phase + (k % 2) * Math.PI + (k > 1 ? Math.PI : 0)) * swing * (1 - S.lie)
          - 1.2 * S.lie;
        tipQ.setFromAxisAngle(X_AXIS, ang);
        q.multiplyQuaternions(yawQ, tipQ);
        v.set(LEG_AT[k][0] * s, LEG_Y * s * (1 - 0.55 * S.lie), LEG_AT[k][1] * s).applyQuaternion(yawQ);
        v.x += p.x; v.y += y; v.z += p.z;
        legMesh.setMatrixAt(i * 4 + k, m.compose(v, q, sc));
      }

      v.set(p.x, ground + 0.03, p.z);
      // Up in his arms its shadow is his.
      const r = 0.5 * s * (1 + 0.25 * S.lie) * (1 - S.up);
      sc.set(Math.max(r, 1e-4), 1, Math.max(r, 1e-4));
      shadowMesh.setMatrixAt(i, m.compose(v, flatQ, sc));
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    legMesh.instanceMatrix.needsUpdate = true;
    shadowMesh.instanceMatrix.needsUpdate = true;
  }
  sync();

  function rerank() {
    followers = 0;
    for (const S of sheep) if (S.mode === 'follow') S.rank = followers++;
  }

  // A place to set the lamb down near (x, z), written into `out`: dry
  // grass (nudged out of a trunk, or in from the rim, if need be) from which
  // it can walk to its mother without wading — sheep never wade, so a lamb
  // set down across the river from her could never come back. Null if
  // there is none there.
  function setDownSpot(x, z, out) {
    out.x = x;
    out.z = z;
    footing.keepOut(out);
    if (Math.hypot(out.x - x, out.z - z) > 1.6) return null;
    if (riverEdgeDist(out.x, out.z) < BRINK + 0.25) return null;
    if (!dryWay(out.x, out.z, mother.pos.x, mother.pos.z)) return null;
    return out;
  }

  // …and the nearest such place round its mother herself; failing that,
  // the pasture.
  function besideMother(out) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (setDownSpot(mother.pos.x + Math.cos(a) * 0.9, mother.pos.z + Math.sin(a) * 0.9, out)) return out;
    }
    out.x = home.x;
    out.z = home.z;
    return out;
  }

  // Let the lamb go at once, with no setting down: he has been taken
  // somewhere in a moment (a jump, or the way up the ladder from where it
  // could not reach its mother). It stays on the grass where it was if it
  // can go to her from there, and is otherwise back beside her.
  function letGo() {
    if (!setDownSpot(lamb.pos.x, lamb.pos.z, spot)) besideMother(spot);
    lamb.pos.x = spot.x;
    lamb.pos.z = spot.z;
    lamb.pos.y = heightAt(spot.x, spot.z);
    lamb.up = 0;
    lamb.lie = Math.min(lamb.lie, 0.2);
    if (mother.mode === 'follow') {
      lamb.mode = 'follow';
      rerank();
    } else {
      release(lamb);
    }
    stage = 'none';
    stageT = 0;
    armed = false;
    walked = 0;
  }

  // The lamb in his arms (v36), one frame: stooping for it, holding it, and
  // setting it down. `o.arms` holds where his arms hold it at his breast and
  // on his shoulders (`bosom`, `shoulders`, world), or is null.
  function carry(dt, walker, step, jumped, o) {
    const { arms, facing = 0, resting = false, handsFull = false } = o;
    // Up on his shoulders once he has walked on with it a moment; down into
    // his arms again as soon as he stands.
    walkFor = stage === 'held' && speed > 0.9 ? walkFor + dt : 0;
    if (stage !== 'held' || still > 0.35) onShoulders = false;
    else if (walkFor > 0.4) onShoulders = true;
    shoulder = damp(shoulder, onShoulders ? 1 : 0, 5, dt);
    if (shoulder < 0.002 && !onShoulders) shoulder = 0;
    let cradle = null;
    if (arms) {
      cradle = holdAt.lerpVectors(arms.bosom, arms.shoulders, shoulder);
      cradle.y += Math.sin(Math.PI * shoulder) * 0.12;   // swung up, not slid
    }
    stageT += dt;
    if (stage === 'none' && !armed) {
      walked += step;
      if (walked > REARM || Math.hypot(lamb.pos.x - walker.x, lamb.pos.z - walker.z) > AWAY) armed = true;
    }
    liftable = stage === 'none' && armed && !!cradle && !handsFull && !resting
      && riverEdgeDist(walker.x, walker.z) > BRINK;
    if (stage === 'none') {
      if (liftable && still > LIFT_AFTER && lamb.mode === 'follow' && lamb.lie < 0.3
        && Math.hypot(lamb.pos.x - walker.x, lamb.pos.z - walker.z) < LIFT_REACH) {
        stage = 'lifting';
        stageT = 0;
        holdStill = 0;
        lifts++;
        lamb.mode = 'carried';
        lamb.rank = -1;
        lamb.drinking = false;
        liftFrom.copy(lamb.pos);
        rerank();
        caption = CARRY_CAPTION;
        captionLeft = CAPTION_FOR;
        bleats++;
        callT = 1.6;
      }
    } else if (jumped) {
      letGo();
    } else if (!cradle && stage !== 'lowering') {
      // His arms are wanted for the ladder: he sets it down at once where
      // it is — if it can go to its mother from there; if not, it is let go
      // back beside her.
      if (setDownSpot(lamb.pos.x, lamb.pos.z, spot)) {
        stage = 'lowering';
        stageT = 0;
        liftFrom.set(lamb.pos.x, 0, lamb.pos.z);
        putTo.set(spot.x, 0, spot.z);
      } else {
        letGo();
      }
    } else if (stage === 'lifting' || stage === 'held') {
      const k = stage === 'lifting' ? smoothstep(0, 1, stageT / LIFT_TIME) : 1;
      lamb.heldY = cradle.y - 0.36 * lamb.s;
      lamb.up = k;
      lamb.pos.x = liftFrom.x + (cradle.x - liftFrom.x) * k;
      lamb.pos.z = liftFrom.z + (cradle.z - liftFrom.z) * k;
      // Across his arms, its head up by his left shoulder, turned back
      // over it — toward whoever is following behind him; on his shoulders,
      // lying straight across them.
      lamb.yaw += shortestAngle(lamb.yaw, facing + Math.PI / 2 + 0.7 * (1 - shoulder)) * clamp(dt * (stage === 'held' ? 12 : 5), 0, 1);
      if (stage === 'lifting' && stageT >= LIFT_TIME) { stage = 'held'; stageT = 0; }
      if (stage === 'held') {
        holdStill = speed < STILL_SPEED ? holdStill + dt : 0;
        tryT = Math.max(0, tryT - dt);
        if ((holdStill > PUT_AFTER || resting) && tryT === 0) {
          // Set down beside him, at the first good place of SET_DOWN_AT.
          // Standing in the river, or across it from its mother, there is
          // none, and he keeps holding it until he has brought it back.
          tryT = TRY_EVERY;
          const fs = Math.sin(facing), fc = Math.cos(facing);
          for (const [ahead, right] of SET_DOWN_AT) {
            // His right is (−cos, sin) of his facing (character.js).
            if (!setDownSpot(walker.x + fs * ahead - fc * right, walker.z + fc * ahead + fs * right, spot)) continue;
            stage = 'lowering';
            stageT = 0;
            liftFrom.set(lamb.pos.x, 0, lamb.pos.z);
            putTo.set(spot.x, 0, spot.z);
            break;
          }
        }
      }
    } else if (stage === 'lowering') {
      const k = smoothstep(0, 1, stageT / LIFT_TIME);
      // (From where his arms last held it, if they are not to be had now.)
      lamb.heldY = (cradle || holdAt).y - 0.36 * lamb.s;
      lamb.up = 1 - k;
      lamb.pos.x = liftFrom.x + (putTo.x - liftFrom.x) * k;
      lamb.pos.z = liftFrom.z + (putTo.z - liftFrom.z) * k;
      if (stageT >= LIFT_TIME) {
        lamb.up = 0;
        lamb.lie = Math.min(lamb.lie, 0.2);   // on its feet
        if (mother.rested) {
          // The flock has already lain down round him while he held it: set
          // down beside its mother, it lies down by her.
          release(lamb);
          lamb.rested = true;
        } else {
          // Down among them while they stand: it follows again, and skips
          // about a while before they all lie down round him.
          lamb.mode = 'follow';
          rerank();
          lamb.frisk = FRISK_FOR;
        }
        stage = 'none';
        stageT = 0;
        armed = false;
        walked = 0;
        setDowns++;
        // (The psalm's word for their lying down keeps the line while it lasts.)
        if (caption !== REST_CAPTION || captionLeft <= 0) {
          caption = SET_DOWN_CAPTION;
          captionLeft = CAPTION_FOR;
        }
        bleats++;
      }
    }
    // How far he is bent down to it: all the way as he takes it up from the
    // grass, rising as it comes; and down again as he sets it on the grass.
    const want = stage === 'lifting' ? 1 - smoothstep(0.15, 1, stageT / LIFT_TIME)
      : stage === 'lowering' ? smoothstep(0, 0.7, stageT / LIFT_TIME) : 0;
    stoop = damp(stoop, want, 10, dt);

    // While he holds it its mother calls up to it now and then, and it answers.
    if (stage === 'held') {
      callT -= dt;
      if (callT <= 0 && mother.mode === 'follow'
        && Math.hypot(mother.pos.x - walker.x, mother.pos.z - walker.z) < 6) {
        calls++;
        answerT = 0.7;
        callT = CALL_EVERY * (0.8 + 0.4 * ((calls * 0.618) % 1));
      }
    }
    if (answerT >= 0) {
      answerT -= dt;
      if (answerT < 0) bleats++;
    }
  }

  function update(dt, walker, cycleT = 0.075, night = 0, o = {}) {
    if (!walker || dt <= 0) return;
    let step = 0, jumped = false;
    // How he goes: a jump (a teleport) starts the way afresh.
    if (!hasLast || Math.hypot(walker.x - last.x, walker.z - last.z) > 3) {
      jumped = hasLast;
      crumbCount = 0;
      layCrumb(walker.x, walker.z);
      speed = 0;
    } else {
      step = Math.hypot(walker.x - last.x, walker.z - last.z);
      speed = damp(speed, Math.hypot(walker.x - last.x, walker.z - last.z) / dt, 8, dt);
      const j = crumbAt(0);
      if (Math.hypot(walker.x - crumbs[j * 2], walker.z - crumbs[j * 2 + 1]) >= CRUMB) {
        layCrumb(walker.x, walker.z);
      }
    }
    last.copy(walker);
    hasLast = true;
    still = speed < STILL_SPEED ? still + dt : 0;
    carry(dt, walker, step, jumped, o);
    if (o.joy) {
      for (const S of sheep) {
        if (S.lamb && S.mode !== 'carried'
          && Math.hypot(S.pos.x - walker.x, S.pos.z - walker.z) < JOY_NEAR) {
          // Topped up only once it has nearly run down, so the skipping
          // (which keeps time by it) goes on rather than holding still.
          if (S.frisk === 0) leaps++;
          if (S.frisk < JOY_AGAIN) S.frisk = JOY_FRISK;
        }
      }
    }
    if (still === 0) restAnnounced = false;
    const holding = stage !== 'none';

    // Who knows him: near enough to him, or to one already following.
    for (const S of sheep) {
      if (S.mode === 'follow' || S.mode === 'carried') continue;
      const dW = Math.hypot(S.pos.x - walker.x, S.pos.z - walker.z);
      // One that lay down at his feet stays down, and will not be gathered,
      // until he has gone off from it; then coming near it again is enough.
      if (S.rested) {
        if (dW > AWAY) S.rested = false;
        else continue;
      }
      if (dW < JOIN) { join(S); continue; }
      // Gathered by a neighbour only while he is well inside the distance at
      // which they let him go — or a sheep just let go would be gathered
      // straight back by the one beside it, and let go again, every frame.
      if (dW > REGATHER) continue;
      for (const F of sheep) {
        if (F.mode !== 'follow' || F === S) continue;
        if (Math.hypot(S.pos.x - F.pos.x, S.pos.z - F.pos.z) < CHAIN) { join(S); break; }
      }
    }

    // Who has let him go: gone on so far that they graze where they are,
    // and the place they were left becomes the pasture.
    let lostX = 0, lostZ = 0, lost = 0;
    for (const S of sheep) {
      if (S.mode !== 'follow') continue;
      if (Math.hypot(S.pos.x - walker.x, S.pos.z - walker.z) > LEAVE) {
        lostX += S.pos.x; lostZ += S.pos.z; lost++;
        release(S);
      }
    }
    if (lost) {
      rerank();
      if (!followers && !holding) settleHome(lostX / lost, lostZ / lost);
    }

    const rest = restOf(cycleT, night);
    const gathered = followers > 0 && still > GATHER_AFTER;
    lying = 0;
    round = 0;
    let roundX = 0, roundZ = 0;

    for (const S of sheep) {
      let lieTo = 0;
      let dipTo = 0.05;
      let turnTo = 0;
      S.drinking = false;   // set afresh by a step at the water's edge below
      if (S.mode === 'carried') {
        // In his arms: legs folded under it, head up, looking about — and
        // unfolding them as it is set down, so it lands on its feet.
        S.pace = 0;
        lieTo = stage === 'lowering' ? 0 : 1;
        dipTo = -0.35 + Math.sin(S.phase * 0.7) * 0.12;
        turnTo = 0.3 + 0.45 * shoulder + Math.sin(S.phase * 0.43) * 0.4;
        S.phase += dt;
      } else if (S.mode === 'follow') {
        if (gathered) {
          // Come up round him, each along its own bearing, to its own ring.
          const dx = S.pos.x - walker.x, dz = S.pos.z - walker.z;
          const d = Math.hypot(dx, dz) || 1;
          // The lamb, while he would take it up, comes right in to his feet
          // (and does not lie down first, even if it joined them late).
          const waiting = S === lamb && liftable;
          const ring = waiting
            ? 0.85
            : (1.35 + (S.rank % 3) * 0.55) * (S.lamb ? 0.85 : 1);
          const left = walkToward(S, walker.x + (dx / d) * ring, walker.z + (dz / d) * ring,
            clamp((Math.abs(d - ring) - 0.1) * 1.4, 0, 2.2), dt);
          // They lie down round him when they always did, lamb in his arms
          // or not — looking up at it while they still stand.
          if (!waiting && still > GATHER_AFTER + LIE_AFTER && left < 0.7) lieTo = 1;
          dipTo = holding && S.lie < 0.6 ? -0.2 : 0.15;
        } else {
          // Strung out along the way he went, a little to one side or the
          // other — and while he carries her lamb its mother close at his
          // heel, her head up toward it.
          const heel = holding && S === mother;
          if (heel) dipTo = -0.15;
          pointBack(walker, heel ? 1.15 : 1.7 + S.rank * 0.6, back);
          let ox = walker.x - back.x, oz = walker.z - back.z;
          const ol = Math.hypot(ox, oz) || 1;
          ox /= ol; oz /= ol;
          const tx = back.x + oz * S.side * 0.55, tz = back.z - ox * S.side * 0.55;
          const d = Math.hypot(tx - S.pos.x, tz - S.pos.z);
          walkToward(S, tx, tz, clamp((d - 0.1) * 1.6, 0, 4.6), dt);
        }
      } else if (S.rested) {
        // Lying where it lay down round him, while he stays near.
        S.pace = damp(S.pace, 0, 8, dt);
        lieTo = 1;
        dipTo = 0.3;
      } else if (rest > 0.5) {
        // Noon, or night: lie down where it grazes.
        S.pace = damp(S.pace, 0, 8, dt);
        lieTo = 1;
        dipTo = 0.3;
      } else {
        S.until -= dt;
        if (S.mode === 'graze') {
          S.pace = damp(S.pace, 0, 8, dt);
          dipTo = 0.85;
          if (S.until <= 0) {
            S.mode = 'walk';
            wanderTarget(S);
            S.until = 30;   // generous cap; arrival ends the walk
          }
        } else {
          const d = walkToward(S, S.target.x, S.target.z, 0.65, dt);
          if (d < 0.3 || S.until <= 0 || S.drinking) {
            S.mode = 'graze';
            S.until = 3 + rng() * 6;
          }
        }
      }
      if (S.drinking) dipTo = 1.05;
      if (S.frisk > 0) {
        // Set down, it skips about: little hops, and its head tossed side to side.
        S.frisk = Math.max(0, S.frisk - dt);
        turnTo = Math.sin(S.frisk * 7) * 0.5;
      }
      S.turn = damp(S.turn, turnTo, 5, dt);
      S.lie = damp(S.lie, S.frisk > 0 ? 0 : lieTo, S.mode === 'carried' ? 5 : 1.6, dt);
      if (S.lie > 0.6) {
        lying++;
        if (S.mode === 'follow') { round++; roundX += S.pos.x; roundZ += S.pos.z; }
      }
      S.dip = damp(S.dip, dipTo, 4, dt);
      S.phase += dt * S.pace * (S.lamb ? 9 : 6.5);
      // Lambs frisk when the flock trots to keep up with him.
      S.hop = S.frisk > 0
        ? Math.abs(Math.sin(S.frisk * 9)) * 0.2 * S.s * Math.min(1, S.frisk)
        : S.lamb && S.pace > 1.4
          ? Math.abs(Math.sin(S.phase * 0.5)) * 0.16 * S.s * (1 - S.lie)
          : damp(S.hop, 0, 10, dt);
    }

    // Shoulder room: no two sheep in one place, and none underfoot. A push
    // that would put a sheep into the river is not given.
    for (let i = 0; i < COUNT; i++) {
      const A = sheep[i];
      if (A.mode === 'carried') continue;   // up in his arms, it takes no room on the grass
      for (let j = i + 1; j < COUNT; j++) {
        const B = sheep[j];
        if (B.mode === 'carried') continue;
        const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z;
        const d = Math.hypot(dx, dz), want = 0.42 * (A.s + B.s);
        if (d >= want || d < 1e-5) continue;
        const push = (want - d) * 0.5 / d;
        nudge(A, -dx * push, -dz * push);
        nudge(B, dx * push, dz * push);
      }
      const dx = A.pos.x - walker.x, dz = A.pos.z - walker.z;
      const d = Math.hypot(dx, dz), want = 0.55 + 0.4 * A.s;
      if (d < want && d > 1e-5) nudge(A, dx * (want - d) / d, dz * (want - d) / d);
      footing.keepOut(A.pos);
      A.pos.y = heightAt(A.pos.x, A.pos.z);
    }

    // They have lain down round him — his own followers, not the rest of the
    // flock keeping noon or night where it grazes: the psalm's word for it,
    // and where they lie is where they graze from now on. (A lamb in his arms
    // is no follower on the grass; it lies down by them when he sets it down.)
    if (gathered && !restAnnounced && round >= Math.min(3, followers)) {
      restAnnounced = true;
      rests++;
      caption = REST_CAPTION;
      captionLeft = CAPTION_FOR;
      owed = 0;
      tune = 0;
      sing(0);
      noteT = NOTE_GAP;
      settleHome(roundX / round, roundZ / round);
      // And having lain down, they follow no further: each one laid down is
      // let go where it lies, until he goes off and comes back to it.
      for (const S of sheep) {
        if (S.mode === 'follow' && S.lie > 0.6) { release(S); S.rested = true; }
      }
      rerank();
    }

    // The pipe: first any notes owed for sheep that have just fallen in, one
    // by one; then a note every few steps while the flock walks behind him.
    noteT = Math.max(0, noteT - dt);
    if (owed > 0) {
      if (noteT === 0) {
        sing(MELODY[tune++ % MELODY.length]);
        owed--;
        noteT = NOTE_GAP;
      }
    } else if (followers >= 2 && speed > 0.8) {
      pipeT += dt;
      if (pipeT >= PIPE_EVERY && noteT === 0) {
        pipeT = 0;
        sing(MELODY[tune++ % MELODY.length]);
        noteT = NOTE_GAP;
      }
    } else {
      pipeT = Math.min(pipeT, PIPE_EVERY * 0.6);
    }

    if (captionLeft > 0) {
      captionLeft -= dt;
      if (captionLeft <= 0) caption = null;
    }
    sync();
  }

  function nudge(S, dx, dz) {
    const nx = S.pos.x + dx, nz = S.pos.z + dz;
    if (riverEdgeDist(nx, nz) < BRINK && riverEdgeDist(nx, nz) < riverEdgeDist(S.pos.x, S.pos.z)) return;
    S.pos.x = nx;
    S.pos.z = nz;
  }

  return {
    update,
    caption: () => caption,
    song() {
      sung.notes = notes;
      sung.note = note;
      sung.bleats = bleats;
      sung.calls = calls;
      return sung;
    },
    // v36: whether his arms are full with the lamb (they are from the
    // moment he stoops for it until it stands on the grass again), and how
    // far he is bent down to it.
    get cradling() { return stage !== 'none'; },
    get stoop() { return stoop; },
    get shoulder() { return shoulder; },
    state() {
      return {
        count: COUNT,
        home: { x: home.x, z: home.z },
        remembered,
        following: followers,
        lying,
        round,
        gathered: followers > 0 && still > GATHER_AFTER,
        joins,
        rests,
        // v36 (Isaiah 40:11): the lamb carried — none|lifting|held|lowering.
        carry: { stage, lifts, setDowns, calls, bleats, shoulders: onShoulders },
        // v38: how many times a lamb has started leaping for joy with him.
        leaps,
        sheep: sheep.map(S => ({ x: S.pos.x, z: S.pos.z, mode: S.mode, lie: S.lie, lamb: S.lamb, rested: S.rested, up: S.up })),
      };
    },
  };
}
