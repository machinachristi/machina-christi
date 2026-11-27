// On eagles' wings (v46).
//
// High over the garden a great eagle wheels all day: "a great eagle with
// great wings, longwinged, full of feathers, which had divers colours"
// (Ezekiel 17:3). Stand and wait a while — "they that wait upon the LORD
// shall renew their strength; they shall mount up with wings as eagles"
// (Isaiah 40:31) — and she comes down out of the sky and settles on the open
// grass beside him, where he can see her. Go to her (walk into her, or tap
// her) and she takes him up on her back, "beareth them on her wings"
// (Deuteronomy 32:11), and carries him once round the whole garden: out over
// the meadow, above the river's four heads and the eastward gate, past
// Jacob's ladder with its angels, over the west reach and by the eagle's
// crag; and she brings him home to the very place he stood — "I bare you on
// eagles' wings, and brought you unto myself" (Exodus 19:4).
//
// As far as the garden knows, he never leaves the ground. He stands where he
// climbed on, quite still, so nothing that answers to him — the flowers at
// his feet, the flock, the ladder, the stations — sees him fly. What rides on
// her back is a second figure of him, which takes his place as he climbs on
// and gives it back as he climbs down. For the flight the camera rides
// behind her (CameraRig.setGaze, the way v34's lying back takes the view),
// and it comes back down to where it was when he is set down again.
//
// A tap or a drag while he flies asks her to turn for home, and she does.
//
// She and the rider are drawn together as one troupe (troupe.js): one draw
// call for the eagle, her wings and him on her back.

import * as THREE from 'three';
import { createCharacter } from './character.js';
import { gatherTroupes } from './troupe.js';
import { clamp, damp, smoothstep, shortestAngle, mergeColored } from './util.js';

// Her wheel high over the garden.
const SOAR = { x: 0, z: 2, r: 36, y: 25 };
const SOAR_SPEED = 8.5;        // m/s round it
const WAIT = 9;                // seconds he stands still before she comes
const STILL_SPEED = 0.25;      // m/s: slower than this he is standing (murmuration.js's own measure)
// Where she may come down: this far from him, and this far either side of the
// camera's line through him, so that she lands where he can be seen to see her.
// (A phone held upright sees only some 20° either side of straight ahead,
// and the camera stands 10.5 m behind him, so these keep her in the picture.)
const LAND_OUT = [6.2, 7.2, 5.6, 8.2];
const LAND_SIDE = [0.5, -0.5, 0.62, -0.62, 0.42, -0.42, 0.75, -0.75];
const STAY = 18;               // seconds she waits for him on the grass
const STAY_NEAR = 15;          // m: if he goes farther off than this she rises again
const REACH = 2.3;             // m from her: close enough to climb on
const AGAIN = 40;              // seconds after she has gone before she comes again
const FLY = 10.5;              // m/s at full flight
const STAND = 1.02;            // her body's centre above the grass when she stands
const MOUNT_T = 1.7;           // seconds: up onto her back, and her turn to the way out
const DISMOUNT_T = 1.5;        // seconds: down again
const PART_T = 1.4;            // seconds she stands after setting him down, before she goes

// Where the flight goes: round the garden, high enough to see it whole and
// low enough to see what is in it (absolute heights; the ground lies 0–3).
const ROUND = [
  [26, 15, -16],    // over the south-east meadow
  [36, 14, 6],      // above the river's four heads, toward the eastward gate
  [20, 17, 25],     // the far bank in the north-east
  [-6, 19, 23],     // past Jacob's ladder, a little south of its foot
  [-28, 16, 13],    // the north-west
  [-34, 14, -8],    // above the west reach
  [-20, 16, -26],   // by the eagle's crag
  [2, 15, -29],     // the south
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

// Her colours, "divers colours": dark bronze, a golden nape, a pale band.
const BRONZE = new THREE.Color(0x5C3E26);
const BREAST = new THREE.Color(0x7E5836);
const GOLD = new THREE.Color(0xC9973F);
const NAPE = new THREE.Color(0xA87634);
const BEAK = new THREE.Color(0xE7B63B);
const HOOK = new THREE.Color(0x2F251A);
const EYE = new THREE.Color(0x17110C);
const QUILL = new THREE.Color(0x3F2B1C);
const TIP = new THREE.Color(0x261A11);
const BAND = new THREE.Color(0xE8DDC4);
const LEG = new THREE.Color(0xD8A83A);
const TALON = new THREE.Color(0x2A2016);

const ni = g => (g.index ? g.toNonIndexed() : g);

// A copy of a coloured shape laid out for the other side: mirrored across x,
// with each triangle's corners (and their colours) put back in turning order
// so that it still faces outward.
function mirrored(geo) {
  const p = geo.attributes.position.array.slice();
  const c = geo.attributes.color.array.slice();
  for (let i = 0; i < p.length; i += 3) p[i] = -p[i];
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const a = i + 3 + k, b = i + 6 + k;
      let t = p[a]; p[a] = p[b]; p[b] = t;
      t = c[a]; c[a] = c[b]; c[b] = t;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

// A slab whose far end (x = len) is narrowed to `taper` of its chord.
function slab(len, thick, chord, taper = 1) {
  const g = new THREE.BoxGeometry(len, thick, chord, 2, 1, 1).translate(len / 2, 0, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / len;
    p.setZ(i, p.getZ(i) * (1 + (taper - 1) * t));
  }
  return ni(g);
}

function buildEagle() {
  const bird = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const sphere = (r, w, h) => ni(new THREE.SphereGeometry(r, w, h));

  const body = mergeColored([
    { geo: sphere(0.5, 10, 8).scale(1, 0.9, 2.3), color: BRONZE },
    { geo: sphere(0.42, 9, 7).scale(1, 0.9, 1.35).translate(0, -0.12, 0.5), color: BREAST },
    { geo: sphere(0.34, 9, 7).translate(0, 0.2, 1.0), color: NAPE },
    { geo: sphere(0.3, 9, 7).scale(1, 0.95, 1.15).translate(0, 0.33, 1.3), color: GOLD },
    { geo: ni(new THREE.ConeGeometry(0.11, 0.38, 6)).rotateX(Math.PI / 2).translate(0, 0.27, 1.72), color: BEAK },
    { geo: ni(new THREE.ConeGeometry(0.05, 0.15, 5)).rotateX(Math.PI).translate(0, 0.21, 1.87), color: HOOK },
    { geo: sphere(0.045, 6, 4).translate(0.17, 0.41, 1.44), color: EYE },
    { geo: sphere(0.045, 6, 4).translate(-0.17, 0.41, 1.44), color: EYE },
    { geo: slab(0.95, 0.07, 0.95, 0.55).rotateY(Math.PI / 2).translate(0, 0.04, -1.05), color: QUILL },
    { geo: slab(0.22, 0.075, 1.0).rotateY(Math.PI / 2).translate(0, 0.04, -1.98), color: BAND },
    { geo: sphere(0.17, 7, 5).translate(0.24, -0.33, 0.22), color: BREAST },
    { geo: sphere(0.17, 7, 5).translate(-0.24, -0.33, 0.22), color: BREAST },
    { geo: ni(new THREE.CylinderGeometry(0.07, 0.06, 0.62, 6)).translate(0.24, -0.72, 0.24), color: LEG },
    { geo: ni(new THREE.CylinderGeometry(0.07, 0.06, 0.62, 6)).translate(-0.24, -0.72, 0.24), color: LEG },
    { geo: ni(new THREE.BoxGeometry(0.24, 0.06, 0.32)).translate(0.24, -1.0, 0.33), color: TALON },
    { geo: ni(new THREE.BoxGeometry(0.24, 0.06, 0.32)).translate(-0.24, -1.0, 0.33), color: TALON },
  ]);
  bird.add(new THREE.Mesh(body, mat));

  // Each wing: an inner part from the shoulder and an outer part from the
  // "elbow", with the long primary feathers spread at its tip like fingers.
  const innerParts = [
    { geo: slab(1.75, 0.08, 1.25, 0.95).translate(0, 0, -0.05), color: QUILL },
    { geo: slab(1.75, 0.1, 0.5, 0.9).translate(0, 0.015, 0.33), color: GOLD },
  ];
  const outerParts = [
    { geo: slab(1.3, 0.07, 1.15, 0.8).translate(0, 0, -0.08), color: QUILL },
    { geo: slab(1.1, 0.08, 0.42, 0.75).translate(0, 0.012, 0.3), color: NAPE },
  ];
  for (let i = 0; i < 5; i++) {
    const a = -0.3 + i * 0.15;
    outerParts.push({
      geo: slab(0.85, 0.035, 0.16, 0.6).rotateY(a).translate(1.22, 0, 0.36 - i * 0.2),
      color: i === 4 ? BAND : TIP,
    });
  }
  const innerR = mergeColored(innerParts);
  const outerR = mergeColored(outerParts);
  const innerL = mirrored(innerR);
  const outerL = mirrored(outerR);

  const wing = (side, inner, outer) => {
    const shoulder = new THREE.Object3D();
    shoulder.position.set(0.42 * side, 0.18, 0.32);
    shoulder.rotation.order = 'YZX';
    shoulder.add(new THREE.Mesh(inner, mat));
    const elbow = new THREE.Object3D();
    elbow.position.set(1.75 * side, 0, 0);
    elbow.rotation.order = 'YZX';
    elbow.add(new THREE.Mesh(outer, mat));
    shoulder.add(elbow);
    bird.add(shoulder);
    return { shoulder, elbow, side };
  };
  // His right is −x seen from behind (character.js): the bird's +x wing is her left.
  const wings = [wing(1, innerR, outerR), wing(-1, innerL, outerL)];
  return { bird, wings, mat };
}

// A way through the air: a smooth curve through the given points, travelled
// by distance, with its own speeds at the start, on the way and at the end.
function wayOf(points, { from, top, to, rise = 24, fall = 28 }) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = Math.max(400, points.length * 8);
  const length = curve.getLength();
  return {
    curve, length, s: 0,
    speed(s) {
      const up = from + (top - from) * smoothstep(0, rise, s);
      const down = to + (top - to) * smoothstep(0, fall, length - s);
      return Math.max(0.8, Math.min(up, down));
    },
  };
}

// How she turns. A great bird on the wing cannot turn on the spot: she wheels
// round, never tighter than a circle of some 11 m. Her ways in and out of the
// round, home, and down to him are drawn the way a pilot's are: round an
// arc, straight on, round another arc, whichever of the four ways of turning
// left or right at each end is shortest (Dubins' curves). She rises straight
// from the grass for the first STRAIGHT metres and comes in straight for the
// last; the points her ways are drawn through lie STEP metres apart; and her
// ways keep inside RIM metres of the garden's middle.
const TURN_R = 11;
const STRAIGHT = 10;
const STEP = 3;
const RIM = 46;
const TAU = Math.PI * 2;

// The round itself, closed: the smooth curve through all its waypoints, how
// far round it (0..1) each waypoint lies, and which way she is going there.
const RING = new THREE.CatmullRomCurve3(ROUND, true, 'centripetal');
RING.arcLengthDivisions = ROUND.length * 100;
const RING_LEN = RING.getLength();
const RING_AT = ROUND.map((_, i) => RING.getLengths()[i * 100] / RING_LEN);
const RING_DIR = RING_AT.map((u) => {
  const d = RING.getTangentAt(u);
  const l = Math.hypot(d.x, d.z) || 1;
  return [d.x / l, d.z / l];
});
const ringSpan = (i, j) => ((RING_AT[j] - RING_AT[i]) % 1 + 1) % 1;

// Sixteen ways to face, [x, z].
const HEADINGS = Array.from({ length: 16 }, (_, i) => [Math.sin(i * TAU / 16), Math.cos(i * TAU / 16)]);

// How far round (radians) from facing h to facing u, turning one way: s = 1
// the way an angle grows from x toward z, s = −1 the other.
function turnOf(s, hx, hz, ux, uz) {
  const a = ((s * (Math.atan2(uz, ux) - Math.atan2(hz, hx))) % TAU + TAU) % TAU;
  return a > TAU - 1e-6 ? 0 : a;
}

// The shortest way, seen from above, from (x0, z0) facing (hx0, hz0) to
// (x1, z1) facing (hx1, hz1), turning no tighter than radius r: its length,
// and at(s, out), the point s metres along it.
function dubins(x0, z0, hx0, hz0, x1, z1, hx1, hz1, r = TURN_R) {
  let best = null;
  for (const s0 of [1, -1]) {
    for (const s1 of [1, -1]) {
      // The middle of each turning circle lies a radius off to that side.
      const ax = x0 - s0 * r * hz0, az = z0 + s0 * r * hx0;
      const bx = x1 - s1 * r * hz1, bz = z1 + s1 * r * hx1;
      const dx = bx - ax, dz = bz - az, d2 = dx * dx + dz * dz, d = Math.sqrt(d2);
      let ux, uz, L;
      if (s0 === s1) {
        // Both the same way round: the straight runs alongside the line
        // between the two middles.
        if (d < 1e-6) { ux = hx0; uz = hz0; L = 0; } else { ux = dx / d; uz = dz / d; L = d; }
      } else {
        // Opposite ways round: the straight crosses over between them.
        if (d <= 2 * r) continue;
        L = Math.sqrt(d2 - 4 * r * r);
        ux = (L * dx - 2 * s0 * r * dz) / d2;
        uz = (2 * s0 * r * dx + L * dz) / d2;
      }
      const a0 = turnOf(s0, hx0, hz0, ux, uz), a1 = turnOf(s1, ux, uz, hx1, hz1);
      const length = r * (a0 + a1) + L;
      if (!best || length < best.length) best = { length, s0, s1, a0, L, ax, az, bx, bz, ux, uz };
    }
  }
  const { s0, s1, a0, L, ax, az, bx, bz, ux, uz } = best;
  const l0 = r * a0, l1 = l0 + L;
  const tx = ax + s0 * r * uz, tz = az - s0 * r * ux;   // where the first arc meets the straight
  const round = (cx, cz, px, pz, a, out) => {
    const c = Math.cos(a), s = Math.sin(a), vx = px - cx, vz = pz - cz;
    out.x = cx + vx * c - vz * s;
    out.z = cz + vx * s + vz * c;
    return out;
  };
  return {
    length: best.length,
    at(s, out) {
      if (s < l0) return round(ax, az, x0, z0, s0 * s / r, out);
      if (s < l1) { out.x = tx + ux * (s - l0); out.z = tz + uz * (s - l0); return out; }
      return round(bx, bz, tx + ux * L, tz + uz * L, s1 * (s - l1) / r, out);
    },
  };
}

// One of her ways, seen from above, as points no more than STEP apart, each
// with how far along it lies (s): `lead` metres straight on from (x0, z0),
// the shortest turning way, and `tail` metres straight in to (x1, z1).
function join(x0, z0, hx0, hz0, x1, z1, hx1, hz1, lead = 0, tail = 0) {
  const d = dubins(x0 + hx0 * lead, z0 + hz0 * lead, hx0, hz0, x1 - hx1 * tail, z1 - hz1 * tail, hx1, hz1);
  const length = lead + d.length + tail;
  const n = Math.max(2, Math.ceil(length / STEP));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = length * i / n;
    const p = { x: 0, y: 0, z: 0, s, ground: 0 };
    if (s <= lead) { p.x = x0 + hx0 * s; p.z = z0 + hz0 * s; }
    else if (s < lead + d.length) d.at(s - lead, p);
    else { p.x = x1 - hx1 * (length - s); p.z = z1 - hz1 * (length - s); }
    pts.push(p);
  }
  return { length, pts, strain: 0, cost: 0 };
}

const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _t0 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _l = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();

// scene: the garden's; character: him; rig: the camera rig; garden: for the
// ground; others(): where his companion and the beasts of the field stand
// now; note(text): a few quiet words on the screen; eve: whether he is she.
export function createWings({ scene, character, rig, garden, others, note, eve = false }) {
  const { bird, wings } = buildEagle();
  scene.add(bird);

  // The figure that rides on her back: him again, seated, unseen until he
  // climbs on. His shadow stays behind on the grass with the real one.
  const rider = createCharacter({ eve });
  rider.group.visible = false;
  rider.group.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry') o.visible = false;
  });
  scene.add(rider.group);
  const troupe = gatherTroupes(scene, [bird, rider.group]);

  const me = character.group;
  let mode = 'soar';      // soar | coming | waiting | mounting | flying | dismounting | parting | leaving
  let clock = 0;
  let theta = 1.1;        // where she is on her wheel
  let still = 0;
  let last = null;
  let pace = 0;
  let rest = 12;          // seconds before she may come at all
  let t = 0;              // seconds into the present mode
  let way = null;
  let landing = null;     // { x, y, z } where she stands on the grass
  let stand = null;       // { x, z, yaw } where he stood when he climbed on
  let asked = false;      // he was sent to her by a tap
  let homeward = false;
  let wantHome = false;   // asked to turn for home; she does once she is clear
  let comes = 0, rides = 0, cries = 0, takeoffs = 0, landings = 0, hurried = 0;
  let caption = null;
  let captionLeft = 0;
  let saidOnce = false;
  let saidHigh = false;   // the flight's second word given, once a flight
  let noted = false;
  let speed = SOAR_SPEED;
  let flap = 0;           // 0 gliding → 1 beating hard
  let phase = 0;
  let fold = 0;           // 0 wings open → 1 folded at her sides
  let flare = 0;          // 0 → 1 wings thrown up and forward to land or lift
  let yaw = 0;            // on the ground: which way she faces
  let gaze = 0;           // how far the camera is hers
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const pos = bird.position;

  try { noted = localStorage.getItem('camino_eagle') === 'rode'; } catch (_) { noted = false; }

  function soarPoint(th, out) {
    return out.set(SOAR.x + Math.sin(th) * SOAR.r, SOAR.y + 2.2 * Math.sin(clock * 0.21), SOAR.z + Math.cos(th) * SOAR.r);
  }
  soarPoint(theta, pos);

  function say(name, label, secs) {
    caption = { name, label };
    captionLeft = secs;
  }

  // Where she might come down near him, in his sight: open ground, and not
  // on top of his companion or any of the beasts.
  function chooseLanding() {
    const yawCam = rig.getYaw();
    const near = others();
    for (const out of LAND_OUT) {
      for (const side of LAND_SIDE) {
        const a = yawCam + side;
        const x = me.position.x + Math.sin(a) * out;
        const z = me.position.z + Math.cos(a) * out;
        if (!garden.openGround(x, z)) continue;
        if (near.some(o => Math.hypot(o.x - x, o.z - z) < 3.2)) continue;
        return { x, y: garden.heightAt(x, z) + STAND, z };
      }
    }
    return null;
  }

  // How high she is over the grass she comes down on, `s` metres short of
  // it: a long glide in, flattening as she comes to it (13 m up 26 m out,
  // 3.2 m up 9 m out); and how far out she must start down from h m up.
  const glide = s => 0.28 * s + 0.0085 * s * s;
  const glideFor = h => (-0.28 + Math.sqrt(0.0784 + 0.034 * Math.max(0, h))) / 0.017;
  // The lower of two heights, met smoothly (within k m of each other).
  const smin = (a, b, k = 3) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k / 4;
  };

  // Heights along a way up from the grass at y0 to y1: a climb that steepens
  // to some 27° and eases out at y1, then on at that height. (Strain: how
  // much too short the way is to climb it so.)
  function climbing(j, y0, y1) {
    const dy = y1 - y0;
    const span = Math.min(j.length, Math.max(1, 2.5 * dy));
    for (const p of j.pts) {
      const f = Math.min(1, p.s / span);
      p.y = y0 + dy * (0.5 * f + 0.5 * f * f * (3 - 2 * f));
    }
    j.strain = Math.max(0, 2.1 * dy - j.length) * 2;
    return settle(j);
  }

  // Heights along a way down from y0 (or up first to `high`) to the grass at
  // y1: on at her height until the glide meets it, then down along the glide.
  // A way too short for the whole glide starts down at once, more steeply.
  function gliding(j, y0, y1, high = y0) {
    const L = j.length;
    const at = s => smin(y0 + (high - y0) * smoothstep(0, 25, s), y1 + glide(L - s));
    const fix = y0 - at(0);
    for (const p of j.pts) p.y = at(p.s) + fix * (1 - smoothstep(0, 14, p.s));
    j.strain = Math.max(0, glideFor(high - y1) - L) * 2;
    return settle(j);
  }

  // Never lower over the ground than she stands on it, and once she is a
  // little way off the grass, never lower than 3 m.
  function settle(j) {
    const L = j.length;
    for (const p of j.pts) {
      p.ground = garden.heightAt(p.x, p.z);
      p.y = Math.max(p.y, p.ground + Math.min(3, STAND + 0.25 * Math.min(p.s, L - p.s)));
    }
    return j;
  }

  // What a way costs her: its length and strain, and a great deal more if it
  // strays outside the garden, skims low past the camera (`cam`), or brushes
  // low past a tree, a rock or a landmark on the way (not where she stands
  // at either end: the grass she lands on is open, whatever stands near it);
  // and a little more if it skims a head-height over anyone standing in her
  // way (`near` — though they will likely have wandered on by then).
  function weigh(j, cam, near) {
    let out = false, close = false, brush = false, skim = false;
    const L = j.length;
    for (const p of j.pts) {
      if (p.x * p.x + p.z * p.z > RIM * RIM) out = true;
      if (p.y < cam.y + 3 && Math.hypot(p.x - cam.x, p.z - cam.z) < 6) close = true;
      const e = Math.min(p.s, L - p.s), above = p.y - p.ground;
      if (above < 8 && e > 3 && garden.tallNear(p.x, p.z)) brush = true;
      if (above < 2.6 && e > 1.5 && near.some(o => Math.hypot(o.x - p.x, o.z - p.z) < 2.2)) skim = true;
    }
    j.cost = L + j.strain + (out ? 1000 : 0) + (close ? 400 : 0) + (brush ? 150 : 0) + (skim ? 40 : 0);
    return j;
  }
  const cheapest = list => list.reduce((a, b) => (b.cost < a.cost ? b : a));
  const pointsOf = j => j.pts.map(p => new THREE.Vector3(p.x, p.y, p.z));

  // Down out of her wheel to the grass beside him, the shortest way: she
  // comes in toward him (or near enough), so that she lands facing him.
  function beginComing() {
    const spot = chooseLanding();
    if (!spot) return false;
    landing = spot;
    let ax = spot.x - me.position.x, az = spot.z - me.position.z;
    const d = Math.hypot(ax, az) || 1;
    ax /= d; az /= d;
    const near = others();
    const hx0 = Math.cos(theta), hz0 = -Math.sin(theta);   // along her wheel
    const j = cheapest([0, 0.35, -0.35, 0.7, -0.7].map((da) => {
      const c = Math.cos(da), s = Math.sin(da);
      const hx = -ax * c + az * s, hz = -ax * s - az * c;   // toward him, turned by da
      return weigh(gliding(join(pos.x, pos.z, hx0, hz0, spot.x, spot.z, hx, hz, 0, STRAIGHT), pos.y, spot.y), rig.camera.position, near);
    }));
    const pts = pointsOf(j);
    pts[0].copy(pos);
    pts[pts.length - 1].set(spot.x, spot.y, spot.z);
    way = wayOf(pts, { from: SOAR_SPEED, top: 11, to: 1.1, rise: 10, fall: 26 });
    mode = 'coming';
    t = 0;
    comes++;
    return true;
  }

  // The way round the garden: up from where she stands into the round, once
  // round it, and down out of it to the same place — in at whichever
  // waypoint (and so out at the sixth after it) makes the shortest whole.
  function flightFrom(from) {
    const cam = rig.camera.position;
    const near = others();
    const n = ROUND.length;
    const ups = ROUND.map((w, i) => cheapest(HEADINGS.map(([hx, hz]) => weigh(climbing(
      join(from.x, from.z, hx, hz, w.x, w.z, RING_DIR[i][0], RING_DIR[i][1], STRAIGHT, 0), from.y, w.y), cam, near))));
    const downs = ROUND.map((w, i) => cheapest(HEADINGS.map(([hx, hz]) => weigh(gliding(
      join(w.x, w.z, RING_DIR[i][0], RING_DIR[i][1], from.x, from.z, hx, hz, 0, STRAIGHT), w.y, from.y), cam, near))));
    let e = 0, best = Infinity;
    for (let i = 0; i < n; i++) {
      const x = (i + n - 2) % n;
      const c = ups[i].cost + ringSpan(i, x) * RING_LEN + downs[x].cost;
      if (c < best) { best = c; e = i; }
    }
    const x = (e + n - 2) % n;
    const pts = pointsOf(ups[e]).slice(0, -1);
    const span = ringSpan(e, x), m = Math.ceil(span * RING_LEN / STEP);
    for (let i = 0; i < m; i++) pts.push(RING.getPointAt((RING_AT[e] + span * i / m) % 1));
    pts.push(...pointsOf(downs[x]));
    pts[0].set(from.x, from.y, from.z);
    pts[pts.length - 1].set(from.x, from.y, from.z);
    return wayOf(pts, { from: 0.9, top: FLY, to: 1.1, rise: 26, fall: 30 });
  }

  // Asked to turn for home: from where she is, the way she is going, the
  // shortest way down to the place (up to 12 m over it first, if she is not
  // so high yet), coming in over clear ground and clear of the camera.
  function wayHome() {
    way.curve.getTangentAt(clamp(way.s / way.length, 0, 1), _f);
    _f.y = 0;
    if (_f.lengthSq() < 1e-6) _f.set(Math.sin(yaw), 0, Math.cos(yaw));
    _f.normalize();
    const high = Math.max(pos.y, landing.y - STAND + 12);
    const near = others();
    const j = cheapest(HEADINGS.map(([hx, hz]) => weigh(gliding(
      join(pos.x, pos.z, _f.x, _f.z, landing.x, landing.z, hx, hz, 0, STRAIGHT), pos.y, landing.y, high), homeEye, near)));
    const pts = pointsOf(j);
    pts[0].copy(pos);
    pts[pts.length - 1].set(landing.x, landing.y, landing.z);
    return wayOf(pts, { from: speed, top: FLY, to: 1.1, rise: 6, fall: 28 });
  }

  // Up from the grass and back to her wheel: straight up and away from him,
  // and round onto the wheel, going its way, by the shortest way there.
  function beginLeaving() {
    let ax = landing.x - me.position.x, az = landing.z - me.position.z;
    const d = Math.hypot(ax, az) || 1;
    ax /= d; az /= d;
    const th0 = Math.atan2(landing.x + ax * 30 - SOAR.x, landing.z + az * 30 - SOAR.z);
    const near = others();
    const end = new THREE.Vector3();
    let best = null;
    for (const da of [0.2, 0.45, 0.7, 1.0, 1.3]) {
      soarPoint(th0 + da, end);
      const j = weigh(climbing(join(landing.x, landing.z, ax, az, end.x, end.z, Math.cos(th0 + da), -Math.sin(th0 + da), STRAIGHT, 0),
        landing.y, SOAR.y), rig.camera.position, near);
      if (!best || j.cost < best.cost) { best = j; theta = th0 + da; }
    }
    const pts = pointsOf(best);
    pts[0].set(landing.x, landing.y, landing.z);
    way = wayOf(pts, { from: 0.9, top: SOAR_SPEED + 1.5, to: SOAR_SPEED, rise: 18, fall: 10 });
    mode = 'leaving';
    t = 0;
    cries++;
  }

  // Up onto her back.
  function beginMounting() {
    mode = 'mounting';
    t = 0;
    asked = false;
    stand = { x: me.position.x, y: me.position.y, z: me.position.z, yaw: me.rotation.y };
    way = flightFrom(landing);
    homeward = false;
    wantHome = false;
    rider.setSitting(false);
    rider.setPraying(false);
    rider.group.position.copy(me.position);
    rider.group.rotation.set(0, me.rotation.y, 0);
    rider.group.visible = true;
    me.visible = false;
    eye.copy(rig.camera.position);
    look.copy(rig.lookPoint);
    homeEye.copy(rig.camera.position);
    saidHigh = false;
    rides++;
    try { localStorage.setItem('camino_eagle', 'rode'); } catch (_) { /* a private window: she comes all the same */ }
    noted = true;
    try { if (navigator.vibrate) navigator.vibrate([12, 50, 12]); } catch (_) { /* not every phone */ }
  }

  // Follow the way: where she is, which way she faces and how she banks
  // into her turns (her "up" leans toward the middle of the turn, by as much
  // as the turn needs at her speed, as a bird's does).
  function fly(dt) {
    const v = way.speed(way.s);
    speed = damp(speed, v, 4, dt);
    way.s = Math.min(way.length, way.s + speed * dt);
    const u = way.s / way.length;
    way.curve.getPointAt(u, pos);
    way.curve.getTangentAt(u, _f);
    const ds = 2;
    way.curve.getTangentAt(clamp((way.s - ds) / way.length, 0, 1), _t0);
    way.curve.getTangentAt(clamp((way.s + ds) / way.length, 0, 1), _t1);
    _t1.sub(_t0).multiplyScalar(speed * speed / (2 * ds));   // the turn's pull, m/s²
    // …but never more than a stately lean: some 27° at most.
    if (_t1.lengthSq() > 25) _t1.setLength(5);
    _u.copy(UP).multiplyScalar(9.8).add(_t1);
    _u.addScaledVector(_f, -_u.dot(_f)).normalize();
    _l.crossVectors(_u, _f).normalize();
    _u.crossVectors(_f, _l);
    _m.makeBasis(_l, _u, _f);
    _q.setFromRotationMatrix(_m);
    quat.slerp(_q, 1 - Math.exp(-6 * dt));
    bird.quaternion.copy(quat);
    return way.s >= way.length - 0.02;
  }

  // On the grass: level, facing `yaw`, breathing.
  function standAt(dt, faceYaw) {
    yaw += shortestAngle(yaw, faceYaw) * (1 - Math.exp(-3 * dt));
    pos.set(landing.x, landing.y + Math.sin(clock * 1.6) * 0.02, landing.z);
    _e.set(0, yaw, 0);
    _q.setFromEuler(_e);
    quat.slerp(_q, 1 - Math.exp(-6 * dt));
    bird.quaternion.copy(quat);
  }

  // Her wings: flapping, gliding, folded at her sides, or thrown up to land.
  function poseWings(dt, wantFlap, wantFold, wantFlare) {
    flap = damp(flap, wantFlap, 3, dt);
    fold = damp(fold, wantFold, 4, dt);
    flare = damp(flare, wantFlare, 5, dt);
    phase += dt * Math.PI * 2 * (1.1 + 0.7 * flap);
    const beat = Math.sin(phase);
    const lift = 0.1 + flap * 0.62 * beat + flare * 0.45;
    const bend = 0.05 + flap * 0.38 * Math.sin(phase - 0.8) + flare * 0.15;
    const sweep = 0.04 - flare * 0.32;
    // Folded, the inner wing lies back along her side and the outer back
    // along it, the long feathers crossing over her tail.
    for (const w of wings) {
      const s = w.side;
      w.shoulder.rotation.set(0, s * (sweep * (1 - fold) + 1.25 * fold), s * (lift * (1 - fold) - 0.12 * fold));
      w.elbow.rotation.set(0, s * 0.75 * fold, s * bend * (1 - fold));
    }
  }

  // The rider on her back: placed on her, turned and banked with her.
  const SEAT = new THREE.Vector3(0, 0.45 - 0.55, 0.02);
  function seatRider(dt, k = 1) {
    rider.update(dt, { x: 0, z: 0 }, null, () => rider.group.position.y, 1e6, null);
    _v.copy(SEAT).applyQuaternion(bird.quaternion).add(pos);
    if (k >= 1) {
      rider.group.position.copy(_v);
      rider.group.quaternion.copy(bird.quaternion);
    } else {
      // On his way up or down: an arc between where he stands and the seat.
      const e = smoothstep(0, 1, k);
      rider.group.position.set(
        stand.x + (_v.x - stand.x) * e,
        stand.y + (_v.y - stand.y) * e + Math.sin(Math.PI * e) * 1.1,
        stand.z + (_v.z - stand.z) * e,
      );
      _e.set(0, stand.yaw, 0);
      _q.setFromEuler(_e);
      rider.group.quaternion.copy(_q).slerp(bird.quaternion, e);
    }
  }

  // The camera for the flight. `w` is how far it rides behind her: 0 is the
  // place it stood when he climbed on (`homeEye`), watching her; 1 trails her
  // line a little above, looking a little down ahead of her. It eases
  // between the two, and round her turns; `k` is how far the view is hers.
  const homeEye = new THREE.Vector3();
  const _eyeT = new THREE.Vector3();
  const _lookT = new THREE.Vector3();
  function chase(dt, k, w) {
    _f.set(0, 0, 1).applyQuaternion(bird.quaternion);
    _f.y = 0;
    if (_f.lengthSq() < 1e-4) _f.set(Math.sin(yaw), 0, Math.cos(yaw));
    _f.normalize();
    _eyeT.set(pos.x - _f.x * 12, pos.y + 4.2, pos.z - _f.z * 12).sub(homeEye).multiplyScalar(w).add(homeEye);
    _lookT.set(pos.x + _f.x * 16, pos.y - 2.5, pos.z + _f.z * 16).sub(pos).multiplyScalar(w).add(pos);
    eye.x = damp(eye.x, _eyeT.x, 2.4, dt);
    eye.y = damp(eye.y, _eyeT.y, 2.4, dt);
    eye.z = damp(eye.z, _eyeT.z, 2.4, dt);
    look.x = damp(look.x, _lookT.x, 3, dt);
    look.y = damp(look.y, _lookT.y, 3, dt);
    look.z = damp(look.z, _lookT.z, 3, dt);
    gaze = k;
    rig.setGaze(k, eye, look);
  }

  function setDown() {
    rider.group.visible = false;
    rider.setSitting(false);
    rider.setPraying(false);
    me.visible = true;
    if (gaze > 0) rig.setGaze(0);
    gaze = 0;
  }

  // free: whether she may come to him, or he go up with her, just now — in
  // the garden, on his own feet, his hands empty, nothing else under way.
  function update(dt, free) {
    clock += dt;
    t += dt;
    if (captionLeft > 0 && (captionLeft -= dt) <= 0) caption = null;

    // Is he standing still? (Measured from his own steps, as the murmuration does.)
    if (!last) last = { x: me.position.x, z: me.position.z };
    const moved = Math.hypot(me.position.x - last.x, me.position.z - last.z);
    const stepX = me.position.x - last.x, stepZ = me.position.z - last.z;
    last.x = me.position.x; last.z = me.position.z;
    if (moved > 3) { still = 0; pace = 0; }   // a teleport is not a walk
    else {
      pace += (moved / Math.max(dt, 1e-4) - pace) * Math.min(1, dt * 10);
      still = pace < STILL_SPEED ? still + dt : 0;
    }

    if (mode === 'soar') {
      theta += (SOAR_SPEED / SOAR.r) * dt;
      soarPoint(theta, _p);
      // (Her way up from the grass ends at her wheel's middle height; from
      // there she drifts to its slow rise and fall.)
      pos.set(_p.x, pos.y + (_p.y - pos.y) * (1 - Math.exp(-0.8 * dt)), _p.z);
      _f.set(Math.cos(theta), 0, -Math.sin(theta));
      // A long glide, banked into her wheel, with a few slow beats now and then.
      _e.set(0, Math.atan2(_f.x, _f.z), -0.22, 'YXZ');
      _q.setFromEuler(_e);
      quat.slerp(_q, 1 - Math.exp(-3 * dt));
      bird.quaternion.copy(quat);
      const beating = (clock % 9) < 1.6 ? 0.55 : 0;
      poseWings(dt, beating, 0, 0);
      speed = SOAR_SPEED;
      rest = Math.max(0, rest - dt);
      if (free && rest <= 0 && still >= WAIT && !beginComing()) still = WAIT * 0.5;   // nowhere open: wait a little more
      return;
    }

    if (mode === 'coming') {
      const there = fly(dt);
      const left = way.length - way.s;
      // A long glide down, then beating to check her speed as she comes in.
      poseWings(dt, left < 18 ? 0.8 : 0, 0, smoothstep(12, 3, left));
      if (there) {
        mode = 'waiting';
        t = 0;
        _e.setFromQuaternion(quat, 'YXZ');
        yaw = _e.y;
        cries++;
        say('Hanesher hagadol', 'a great eagle', 7);
        if (!noted && !saidOnce) {
          saidOnce = true;
          note('A great eagle has come down beside you. Go to her, or tap her, and she will carry you.');
        }
      }
      return;
    }

    if (mode === 'waiting') {
      const dx = me.position.x - landing.x, dz = me.position.z - landing.z;
      const d = Math.hypot(dx, dz);
      // She faces him, and now and then half opens her wings.
      standAt(dt, Math.atan2(dx, dz) + 0.25 * Math.sin(clock * 0.7));
      poseWings(dt, 0, (t % 7) < 1.1 ? 0.55 : 1, 0);
      // He comes to her: walking into her, or sent to her by a tap.
      const toward = moved > 1e-4 && (stepX * -dx + stepZ * -dz) / (moved * Math.max(d, 1e-3)) > 0.85;
      if (free && d < REACH && (asked || (toward && pace > 0.3))) beginMounting();
      else if (t > STAY || d > STAY_NEAR) { asked = false; beginLeaving(); }
      return;
    }

    if (mode === 'mounting') {
      const k = clamp(t / 0.9, 0, 1);
      if (t > 0.35) rider.setSitting(true);
      // Then she turns to face the way out.
      way.curve.getTangentAt(Math.min(0.02, 4 / way.length), _f);
      const out = Math.atan2(_f.x, _f.z);
      standAt(dt, t > 0.9 ? out : yaw);
      poseWings(dt, 0, t > 1.1 ? 0.2 : 1, t > 1.1 ? 1 : 0);
      seatRider(dt, k);
      // (The camera stays where it stood, watching him climb up.)
      if (t >= MOUNT_T) {
        mode = 'flying';
        t = 0;
        takeoffs++;
        say('Al kanfei nesharim', "on eagles' wings", 7);
      }
      return;
    }

    if (mode === 'flying') {
      // Asked to turn for home, she does so once she is well up and away
      // (not in a hairpin over the grass she has just left), unless she is
      // already on her way in.
      if (wantHome && !homeward && way.s > 28) {
        wantHome = false;
        if (way.length - way.s >= 45) {
          way = wayHome();
          homeward = true;
          hurried++;
        }
      }
      const there = fly(dt);
      const left = way.length - way.s;
      const climbing = smoothstep(0.02, 0.2, _f.y);
      poseWings(dt, Math.max(climbing, smoothstep(6.5, 3, speed), left < 14 ? 0.7 : 0), 0, smoothstep(12, 3, left) + smoothstep(8, 0, way.s) * 0.6);
      // Halfway out he lifts up his hands, and lowers them again for the way in.
      const u = way.s / way.length;
      rider.setPraying(!homeward && u > 0.12 && u < 0.78);
      if (!homeward && u > 0.42 && !saidHigh) {
        saidHigh = true;
        say("Ya'alu ever kanesharim", 'mount up with wings as eagles', 6);
      }
      seatRider(dt);
      // The view watches her lift off from where it stood, swings round
      // behind her for the flight, and comes back to where it stood to
      // watch her come in.
      chase(dt, smoothstep(0, 0.8, t), smoothstep(0, 3, t) * (1 - smoothstep(34, 9, left)));
      if (there) {
        mode = 'dismounting';
        t = 0;
        landings++;
        _e.setFromQuaternion(quat, 'YXZ');
        yaw = _e.y;
        stand.y = me.position.y;
        try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) { /* not every phone */ }
      }
      return;
    }

    if (mode === 'dismounting') {
      standAt(dt, Math.atan2(stand.x - landing.x, stand.z - landing.z));
      poseWings(dt, 0, 1, 0);
      // Back down from the seat to where he stood: he slides off still
      // seated, and his legs come down under him halfway, in the air.
      if (t > 0.62) rider.setSitting(false);
      stand.x = me.position.x; stand.z = me.position.z;
      seatRider(dt, 1 - clamp((t - 0.25) / 0.9, 0, 1));
      chase(dt, 1 - smoothstep(0.2, DISMOUNT_T, t), 0);
      if (t >= DISMOUNT_T) {
        setDown();
        mode = 'parting';
        t = 0;
      }
      return;
    }

    if (mode === 'parting') {
      standAt(dt, Math.atan2(me.position.x - landing.x, me.position.z - landing.z));
      poseWings(dt, 0, 1, 0);
      if (t >= PART_T) beginLeaving();
      return;
    }

    if (mode === 'leaving') {
      const there = fly(dt);
      poseWings(dt, Math.max(smoothstep(0.02, 0.2, _f.y), smoothstep(6.5, 3, speed)), 0, smoothstep(6, 0, way.s) * 0.8);
      if (there) {
        mode = 'soar';
        t = 0;
        rest = AGAIN;
        still = 0;
        landing = null;
        way = null;
      }
    }
  }

  // While she has him (climbing on, in the air, climbing down) he is hers:
  // he stands, and taps and drags are hers to read.
  const HOLD = { move: { x: 0, z: 0, quick: false }, world: true };
  const riding = () => mode === 'mounting' || mode === 'flying' || mode === 'dismounting';
  function drive() { return riding() ? HOLD : null; }

  // A tap, or a pull on the stick, in the air: she turns for home.
  function hurry() {
    if (mode !== 'flying' || homeward) return false;
    if (way.length - way.s < 45) return false;   // already on her way in
    wantHome = true;
    return true;
  }

  // Put right at once (a teleport): he is set down where he is, she rises.
  // (Coming down, she comes on: if he is far off by then, she rises again
  // from the grass, as she does whenever he goes away from her.)
  function cancel() {
    if (mode === 'soar' || mode === 'leaving' || mode === 'coming') return;
    const wasRiding = riding();
    setDown();
    if (landing) {
      if (wasRiding) { pos.set(landing.x, landing.y, landing.z); }
      beginLeaving();
    }
  }

  // Test hooks: come now (if there is open ground in sight), go up now.
  function come() {
    if (mode !== 'soar') return mode === 'coming' || mode === 'waiting';
    return beginComing();
  }
  function ride() {
    if (mode !== 'waiting') return false;
    beginMounting();
    return true;
  }

  return {
    update, drive, hurry, cancel, come, ride,
    // A tap meant for her walks him to her and, once beside her, up.
    // (Or, with false, a tap or a step elsewhere: he has thought better of it.)
    ask(on = true) { asked = !!on && mode === 'waiting'; },
    get asked() { return asked && mode === 'waiting'; },
    get riding() { return riding(); },
    get busy() { return mode !== 'soar'; },
    // Where a tap may find her: only while she waits on the grass.
    target() { return mode === 'waiting' ? { x: landing.x, z: landing.z } : null; },
    caption() { return caption; },
    // The rush of the air past him while he flies, 0..1 (audio.js).
    get rush() { return riding() ? clamp((speed - 3) / 9, 0, 1) * 0.85 : 0; },
    sounds() { return { cries, takeoffs, landings }; },
    state() {
      return {
        mode, rides, comes, hurried, homeward,
        x: pos.x, y: pos.y, z: pos.z,
        landing: landing ? { x: landing.x, z: landing.z } : null,
        riding: riding(),
        hidden: !me.visible,
        rider: rider.group.visible,
        progress: way ? way.s / way.length : 0,
        still,
        troupes: troupe.count,
      };
    },
  };
}
