// The saints (AB#106): "clothed with white robes, and palms in their hands"
// (Revelation 7:9). Each of the site's calendar saints stands in heaven as a
// figure of light — a white robe, no face, a halo — in ranks along both
// banks of the river, in the order of their feasts through the year, so that
// walking toward the glory walks through the year of the saints. Draw near
// one and the caption gives its name, its title and its feast day.
//
// Who they are comes only from heaven/saints.js (the site's own records).
// What each carries comes from the words of its title alone: a palm for the
// martyrs, a book for the doctors and evangelists, a lily for the virgins, a
// shepherd's crook for the bishops and popes, and over the apostles a small
// flame (Acts 2:3). Anyone else is light only. A record naming several
// saints stands as a small cluster of two or three.
//
// Today's saint, if today keeps one, stands at the head of the ladder to
// greet him, robed in the day's liturgical colour, and turns to him.
//
// Everything is instanced: one draw for every figure, one for every halo,
// one for each kind of emblem — seven, whatever the number of saints.

import * as THREE from 'three';
import { mergeColored, shortestAngle } from '../util.js';
import { feastText } from './saints.js';
import { ARRIVAL, GREETING, RANKS } from './layout.js';

const SCALE = 1.08;
const REACH = 1.55;          // this near a saint, its name is given
const GREET_REACH = 4.6;     // today's saint greets from further off
const LEAVE = 0.8;           // and keeps the name this much further, so it never flickers
const DWELL = 0.3;           // seconds a new nearest saint must stay nearest before it is named

const ROBE = new THREE.Color(0xFFFDF7);
const HEM = new THREE.Color(0xF3E6C4);
const FACE = new THREE.Color(0xFFF8EC);
// The robe today's saint wears: the day's liturgical colour, as light.
const LITURGICAL = {
  white: 0xFFF6DE, red: 0xF08A78, green: 0x9FD7A6, violet: 0xC2A6E6, rose: 0xF5B3C8,
};

// Hands, in the figure's own space (it faces +z).
const HAND_R = new THREE.Vector3(0.17, 0.98, 0.21);
const HAND_L = new THREE.Vector3(-0.17, 0.98, 0.21);

function figureGeometry() {
  const profile = [
    [0.3, 0], [0.29, 0.08], [0.25, 0.45], [0.21, 0.9], [0.205, 1.18],
    [0.17, 1.31], [0.08, 1.39], [0.001, 1.4],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const robe = new THREE.LatheGeometry(profile, 10).toNonIndexed();
  const hem = new THREE.CylinderGeometry(0.302, 0.31, 0.07, 10, 1, true).toNonIndexed();
  hem.translate(0, 0.035, 0);
  const head = new THREE.IcosahedronGeometry(0.115, 1);
  head.translate(0, 1.52, 0);
  const parts = [
    { geo: robe, color: ROBE },
    { geo: hem, color: HEM },
    { geo: head, color: FACE },
  ];
  // Sleeves from the shoulders forward to the hands, which hold whatever
  // each carries before them.
  const up = new THREE.Vector3(0, 1, 0);
  for (const hand of [HAND_R, HAND_L]) {
    const shoulder = new THREE.Vector3(Math.sign(hand.x) * 0.19, 1.25, 0);
    const d = hand.clone().sub(shoulder);
    const g = new THREE.CylinderGeometry(0.05, 0.075, d.length(), 6).toNonIndexed();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()));
    g.translate((shoulder.x + hand.x) / 2, (shoulder.y + hand.y) / 2, (shoulder.z + hand.z) / 2);
    parts.push({ geo: g, color: ROBE });
  }
  return mergeColored(parts);
}

// The emblems, each built round the hand that holds it (or, the flame, over
// the head), in the figure's own space.
function palmGeometry() {
  const parts = [];
  const GREEN = new THREE.Color(0x9CC765), PALE = new THREE.Color(0xD6EBA2);
  const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.95, 4).toNonIndexed();
  stem.translate(0, 0.42, 0);
  parts.push({ geo: stem, color: GREEN });
  // Leaflets in pairs up the upper part of the frond, sweeping up and out.
  for (let k = 0; k < 7; k++) {
    const y = 0.45 + k * 0.075;
    const len = 0.2 - k * 0.018;
    for (const side of [-1, 1]) {
      const leaf = new THREE.BufferGeometry();
      leaf.setAttribute('position', new THREE.Float32BufferAttribute([
        0, y, 0, side * len, y + 0.09, 0.015, side * len * 0.55, y + 0.012, -0.012,
      ], 3));
      parts.push({ geo: leaf, color: k % 2 ? PALE : GREEN });
    }
  }
  const g = mergeColored(parts);
  g.rotateZ(-0.22);                 // leaning out from the body
  g.translate(0, -0.1, 0);
  return g;
}

function bookGeometry() {
  const cover = new THREE.BoxGeometry(0.16, 0.21, 0.045).toNonIndexed();
  const pages = new THREE.BoxGeometry(0.15, 0.198, 0.05).toNonIndexed();
  pages.translate(0.006, 0, 0);
  const g = mergeColored([
    { geo: cover, color: new THREE.Color(0xD9A94B) },
    { geo: pages, color: new THREE.Color(0xFFF8E6) },
  ]);
  g.rotateX(-0.45);
  g.translate(0, 0.06, 0.04);
  return g;
}

function lilyGeometry() {
  const parts = [];
  const STEM = new THREE.Color(0x8CBF6E), WHITE = new THREE.Color(0xFFFFFF), HEART = new THREE.Color(0xF4D06A);
  const stem = new THREE.CylinderGeometry(0.01, 0.012, 0.6, 4).toNonIndexed();
  stem.translate(0, 0.27, 0);
  parts.push({ geo: stem, color: STEM });
  const blooms = [[0, 0.6, 0], [0.06, 0.48, 0.02], [-0.05, 0.42, 0.01]];
  for (const [x, y, z] of blooms) {
    const cup = new THREE.ConeGeometry(0.055, 0.12, 6, 1, true).toNonIndexed();
    cup.rotateX(Math.PI);           // open upward, a trumpet
    cup.translate(x, y + 0.04, z);
    parts.push({ geo: cup, color: WHITE });
    const heart = new THREE.IcosahedronGeometry(0.018, 0);
    heart.translate(x, y + 0.08, z);
    parts.push({ geo: heart, color: HEART });
  }
  const leaf = new THREE.ConeGeometry(0.025, 0.2, 4).toNonIndexed();
  leaf.rotateZ(0.5);
  leaf.translate(0.04, 0.2, 0);
  parts.push({ geo: leaf, color: STEM });
  const g = mergeColored(parts);
  g.rotateZ(-0.12);
  return g;
}

function crookGeometry() {
  const GOLD = new THREE.Color(0xE2B95A);
  // A staff standing on the ground beside the hand, its crook over the head.
  const staff = new THREE.CylinderGeometry(0.018, 0.02, 1.88, 5).toNonIndexed();
  staff.translate(0.06, 0.94 - 0.98, 0);
  const curl = new THREE.TorusGeometry(0.095, 0.017, 4, 10, Math.PI * 1.3).toNonIndexed();
  curl.rotateZ(-0.15);
  curl.translate(0.06 - 0.095, 1.88 - 0.98, 0);
  return mergeColored([{ geo: staff, color: GOLD }, { geo: curl, color: GOLD }]);
}

function flameGeometry() {
  const tongue = new THREE.ConeGeometry(0.045, 0.16, 7).toNonIndexed();
  tongue.translate(0, 0.1, 0);
  const bulb = new THREE.IcosahedronGeometry(0.045, 1);
  bulb.translate(0, 0.03, 0);
  return mergeColored([
    { geo: tongue, color: new THREE.Color(0xFFC861) },
    { geo: bulb, color: new THREE.Color(0xFF9F45) },
  ]);
}

export function createFigures(scene, data) {
  const saints = (data && Array.isArray(data.saints)) ? data.saints : [];
  const todayInfo = data && data.today;

  // ── Where each stands. Today's saint at the head of the ladder; every
  // other one in rank order through the year, rank after rank up the river,
  // filling each rank from the river outward on both banks.
  const stations = [];
  const others = saints.filter(s => !(todayInfo && s.key === todayInfo.key));
  const today = todayInfo ? saints.find(s => s.key === todayInfo.key) : null;
  if (today) {
    stations.push({
      entry: today, today: true, x: GREETING.x, z: GREETING.z,
      yaw: Math.atan2(ARRIVAL.x - GREETING.x, ARRIVAL.z - GREETING.z),
      color: LITURGICAL[todayInfo.color] || LITURGICAL.white,
      thing: { pos: { x: GREETING.x, z: GREETING.z } },
    });
  }
  const perRank = RANKS.rowsX.length * 2;
  others.forEach((entry, i) => {
    const rank = Math.floor(i / perRank);
    const slot = i % perRank;
    const row = Math.floor(slot / 2);
    const side = slot % 2 ? 1 : -1;
    const x = side * RANKS.rowsX[row];
    const z = RANKS.from + rank * RANKS.step + (row % 2 ? RANKS.step * 0.5 : 0);
    // Turned in toward the river, and a little toward whoever comes up it.
    const yaw = Math.atan2(-x, -3.5);
    stations.push({ entry, today: false, x, z, yaw, color: null, thing: { pos: { x, z } } });
  });

  // ── Each figure: one per saint, or a cluster of two or three.
  const figures = [];
  const CLUSTER = {
    1: [[0, 0]],
    2: [[-0.42, 0], [0.42, 0]],
    3: [[-0.48, 0.12], [0.48, 0.12], [0, -0.36]],
  };
  for (const st of stations) {
    const n = Math.min(3, Math.max(1, st.entry.figures | 0));
    for (const [ox, oz] of CLUSTER[n]) {
      // Cluster offsets are in the station's own frame (facing its yaw).
      const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
      figures.push({
        station: st,
        x: st.x + ox * c + oz * s,
        z: st.z - ox * s + oz * c,
        yaw: st.yaw,
        kind: st.entry.kind || {},
      });
    }
  }

  // Robes of light: lit like everything else, and glowing from within in
  // their own colour (the glow is tinted by each robe's colour, so today's
  // saint's robe glows in the day's colour, not white).
  const robeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xB4AFA4 });
  robeMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive * vColor.rgb;',
    );
  };
  const figureMesh = new THREE.InstancedMesh(figureGeometry(), robeMaterial, Math.max(1, figures.length));
  figureMesh.count = figures.length;
  figureMesh.frustumCulled = false;
  const halo = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.135, 0.19, 20),
    new THREE.MeshBasicMaterial({ color: 0xF2C65E, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    Math.max(1, figures.length),
  );
  halo.count = figures.length;
  halo.frustumCulled = false;

  // The emblems: which hand holds what. A palm, if a martyr, in the right;
  // then a book, a crook or a lily, filling the hands in that order.
  const emblemKinds = {
    palm: { geo: palmGeometry(), list: [] },
    book: { geo: bookGeometry(), list: [] },
    crook: { geo: crookGeometry(), list: [] },
    lily: { geo: lilyGeometry(), list: [] },
    flame: { geo: flameGeometry(), list: [] },
  };
  for (const f of figures) {
    const held = [];
    if (f.kind.martyr) held.push('palm');
    if (f.kind.doctor || f.kind.evangelist) held.push('book');
    if (f.kind.pastor) held.push('crook');
    if (f.kind.virgin) held.push('lily');
    held.slice(0, 2).forEach((name, h) => emblemKinds[name].list.push({ f, hand: h === 0 ? HAND_R : HAND_L, mirror: h === 1 }));
    if (f.kind.apostle) emblemKinds.flame.list.push({ f, hand: null, mirror: false });
  }
  const emblemMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const flameMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const [name, e] of Object.entries(emblemKinds)) {
    e.mesh = new THREE.InstancedMesh(e.geo, name === 'flame' ? flameMaterial : emblemMaterial, Math.max(1, e.list.length));
    e.mesh.count = e.list.length;
    e.mesh.frustumCulled = false;
  }

  // ── Placing them.
  const _m = new THREE.Matrix4();
  const _l = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
  const tint = new THREE.Color();

  function figureMatrix(f, out) {
    _q.setFromAxisAngle(UP, f.yaw);
    _p.set(f.x, 0, f.z);
    _s.setScalar(SCALE);
    return out.compose(_p, _q, _s);
  }

  function place(f, i) {
    figureMatrix(f, _m);
    figureMesh.setMatrixAt(i, _m);
    _l.makeTranslation(0, 1.55, -0.075);
    halo.setMatrixAt(i, _l.premultiply(_m));
  }

  function placeEmblems(name) {
    const e = emblemKinds[name];
    e.list.forEach((it, i) => {
      figureMatrix(it.f, _m);
      if (it.hand) {
        _l.makeTranslation(it.hand.x, it.hand.y, it.hand.z);
        if (it.mirror) _l.multiply(MIRROR);
      } else {
        // The flame rests over the head, a little forward, breathing.
        const k = 1 + 0.12 * Math.sin(time * 9 + i * 1.7) + 0.06 * Math.sin(time * 23 + i);
        _l.compose(_p.set(0, 1.8, 0.02), _q.identity(), _s.set(1, k, 1));
      }
      e.mesh.setMatrixAt(i, _m.multiply(_l));
    });
    e.mesh.instanceMatrix.needsUpdate = true;
  }

  let time = 0;
  figures.forEach((f, i) => {
    place(f, i);
    // White robes, each a little warmer or cooler; today's saint in the
    // day's colour.
    if (f.station.color) tint.setHex(f.station.color);
    else tint.copy(ROBE).lerp(HEM, (i % 5) * 0.07);
    figureMesh.setColorAt(i, tint);
  });
  figureMesh.instanceMatrix.needsUpdate = true;
  if (figureMesh.instanceColor) figureMesh.instanceColor.needsUpdate = true;
  halo.instanceMatrix.needsUpdate = true;
  for (const name of Object.keys(emblemKinds)) placeEmblems(name);

  scene.add(figureMesh, halo);
  for (const e of Object.values(emblemKinds)) scene.add(e.mesh);

  // ── Drawing near: the nearest saint within reach is named, once it has
  // stayed nearest a moment; it keeps the name a little beyond the reach.
  let named = null;
  let candidate = null;
  let candidateFor = 0;
  const greeters = figures.map((f, i) => ({ f, i })).filter(g => g.f.station.today);

  function update(dt, walker) {
    time += dt;
    if (walker) {
      let best = null, bestD = Infinity;
      for (const st of stations) {
        const d = Math.hypot(walker.x - st.x, walker.z - st.z);
        const reach = st.today ? GREET_REACH : REACH;
        if (d < reach && d - reach < bestD) { best = st; bestD = d - reach; }
      }
      if (named) {
        const d = Math.hypot(walker.x - named.x, walker.z - named.z);
        if (d > (named.today ? GREET_REACH : REACH) + LEAVE) named = null;
      }
      if (best && best !== named) {
        if (best !== candidate) { candidate = best; candidateFor = 0; }
        candidateFor += dt;
        if (candidateFor >= DWELL) { named = best; candidate = null; candidateFor = 0; }
      } else {
        candidate = null;
        candidateFor = 0;
      }

      // Today's saint turns to him as he comes and goes.
      if (greeters.length) {
        for (const g of greeters) {
          const want = Math.atan2(walker.x - g.f.x, walker.z - g.f.z);
          g.f.yaw += shortestAngle(g.f.yaw, want) * (1 - Math.exp(-1.5 * dt));
          place(g.f, g.i);
        }
        figureMesh.instanceMatrix.needsUpdate = true;
        halo.instanceMatrix.needsUpdate = true;
        for (const name of Object.keys(emblemKinds)) {
          if (emblemKinds[name].list.some(it => it.f.station.today)) placeEmblems(name);
        }
      }
    }
    if (emblemKinds.flame.list.length) placeEmblems('flame');
  }

  function caption() {
    if (!named) return null;
    const e = named.entry;
    const when = named.today ? 'today' : (e.feasts || []).map(feastText).filter(Boolean).join(' · ');
    return { name: e.name, label: [e.title, when].filter(Boolean).join(' · ') };
  }

  return {
    update,
    caption,
    // The one named now, for the walk to stop beside (wayfinding.js reads
    // only where it stands).
    namedThing: () => (named ? named.thing : null),
    count: stations.length,
    figures: figures.length,
    today: () => (today ? { name: today.name, title: today.title, color: todayInfo.color } : null),
    // One saint's name and place (the first in the ranks), for the curious
    // and for the checks.
    sample: () => {
      const st = stations.find(s => !s.today);
      return st ? { name: st.entry.name, x: st.x, z: st.z } : null;
    },
    near: () => (named ? named.entry.name : null),
  };
}

