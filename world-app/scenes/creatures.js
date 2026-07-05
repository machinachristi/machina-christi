// The garden's creatures: birds and doves on the wing (perching by day,
// roosting in the two sacred trees at dusk), a lamb and two cattle grazing
// the meadow, and a small school of fish swimming the river's wadable
// stretch — "every beast of the field, and every fowl of the air"
// (Genesis 2:19), each with a simple life of its own.
//
// Each creature also bears its name — the plain Hebrew nouns, as the first
// tongue might have spoken them — given to the walker who draws near
// (Genesis 2:19-20): "whatsoever Adam called every living creature, that
// was the name thereof."

import * as THREE from 'three';
import { heightAt, riverZ, riverEdgeDist } from './terrain.js';
import { TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { clamp, shortestAngle } from '../util.js';

function makeBird(tone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: tone, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), mat);
  body.rotation.x = Math.PI / 2;   // nose forward along +z
  g.add(body);
  const wingGeo = new THREE.BoxGeometry(0.55, 0.02, 0.18);
  const wingL = new THREE.Mesh(wingGeo, mat);
  wingL.position.x = -0.3;
  const wingR = new THREE.Mesh(wingGeo, mat);
  wingR.position.x = 0.3;
  g.add(wingL, wingR);
  return { group: g, wingL, wingR };
}

function makeLamb() {
  const g = new THREE.Group();
  const wool = new THREE.MeshLambertMaterial({ color: 0xEEE6D2, flatShading: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 3, 7), wool);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.42;
  g.add(body);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.55, 0.34);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), wool);
  head.position.set(0, 0, 0.12);
  headPivot.add(head);
  const earGeo = new THREE.ConeGeometry(0.045, 0.14, 4);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, wool);
    ear.position.set(sx * 0.12, 0.06, 0.1);
    ear.rotation.z = sx * 1.25;
    headPivot.add(ear);
  }
  g.add(headPivot);

  const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.34, 5);
  const legs = [];
  for (const [lx, lz] of [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.2], [0.12, -0.2]]) {
    const leg = new THREE.Mesh(legGeo, wool);
    leg.position.set(lx, 0.17, lz);
    g.add(leg);
    legs.push(leg);
  }

  addShadow(g, 0.36);
  return { group: g, headPivot, legs };
}

// Cattle after the same idiom as the lamb, at pasture scale: a heavier
// capsule body, a boxy head with a pale muzzle and small out-turned horns.
function makeCow(tone) {
  const g = new THREE.Group();
  const hide = new THREE.MeshLambertMaterial({ color: tone, flatShading: true });
  const pale = new THREE.MeshLambertMaterial({ color: 0xD8CBB4, flatShading: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.85, 3, 8), hide);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.78;
  g.add(body);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.0, 0.62);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.4), hide);
  head.position.set(0, 0, 0.14);
  headPivot.add(head);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.16), pale);
  muzzle.position.set(0, -0.07, 0.38);
  headPivot.add(muzzle);
  const hornGeo = new THREE.ConeGeometry(0.045, 0.22, 5);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(hornGeo, pale);
    horn.position.set(sx * 0.2, 0.2, 0.08);
    horn.rotation.z = sx * -0.9;
    headPivot.add(horn);
  }
  g.add(headPivot);

  const legGeo = new THREE.CylinderGeometry(0.07, 0.062, 0.6, 5);
  const legs = [];
  for (const [lx, lz] of [[-0.22, 0.34], [0.22, 0.34], [-0.22, -0.34], [0.22, -0.34]]) {
    const leg = new THREE.Mesh(legGeo, hide);
    leg.position.set(lx, 0.3, lz);
    g.add(leg);
    legs.push(leg);
  }

  addShadow(g, 0.62);
  return { group: g, headPivot, legs };
}

// A soft blob shadow grounds a creature without shadow maps.
function addShadow(g, r) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(r, 14),
    new THREE.MeshBasicMaterial({ color: 0x1c2814, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);
}

// A lamb wander target on open meadow south of the river.
function lambSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const x = (rng() * 2 - 1) * 24;
    const z = -2 - rng() * 20;
    if (riverEdgeDist(x, z) > 3.9 && Math.hypot(x, z) > 7) return { x, z };
  }
  return { x: -10, z: -14 };
}

// Cattle keep to the western meadow, clear of water and clearing alike.
function cowSpot(rng) {
  for (let i = 0; i < 40; i++) {
    const x = -8 - rng() * 22;
    const z = (rng() * 2 - 1) * 15;
    if (riverEdgeDist(x, z) > 4.2 && Math.hypot(x, z) > 9) return { x, z };
  }
  return { x: -18, z: -8 };
}

// A fish: a low-poly body nosing forward along +z, with a tail fin that
// sculls. Small enough that two cones read as life through the water.
function makeFish(tone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: tone, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.34, 4), mat);
  body.rotation.x = Math.PI / 2;   // nose forward along +z
  body.position.z = 0.05;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3), mat);
  tail.rotation.x = Math.PI / 2;   // apex tucks into the body's rear
  tail.position.z = -0.18;
  g.add(tail);
  return { group: g, tail };
}

export function createCreatures(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);

  // ── The flyers: three birds and two doves ─────────────────
  // Each is assigned its own roosting perch in the canopies of the two
  // sacred trees: at dusk every flyer comes home to them, and through the
  // day the doves take short perch-rests there too.
  const hL = heightAt(TREE_OF_LIFE_POS.x, TREE_OF_LIFE_POS.z);
  const hK = heightAt(TREE_OF_KNOWLEDGE_POS.x, TREE_OF_KNOWLEDGE_POS.z);
  const PERCHES = [
    new THREE.Vector3(TREE_OF_LIFE_POS.x, hL + 5.55, TREE_OF_LIFE_POS.z),
    new THREE.Vector3(TREE_OF_LIFE_POS.x - 0.95, hL + 4.2, TREE_OF_LIFE_POS.z + 0.3),
    new THREE.Vector3(TREE_OF_KNOWLEDGE_POS.x + 0.55, hK + 4.75, TREE_OF_KNOWLEDGE_POS.z),
    new THREE.Vector3(TREE_OF_LIFE_POS.x + 0.85, hL + 4.45, TREE_OF_LIFE_POS.z - 0.45),
    new THREE.Vector3(TREE_OF_KNOWLEDGE_POS.x - 0.5, hK + 3.85, TREE_OF_KNOWLEDGE_POS.z + 0.45),
  ];

  const flyers = [];
  const flyerDefs = [
    { kind: 'bird', tone: 0xF5F0E4, name: 'Tsippor', label: 'the bird' },
    { kind: 'bird', tone: 0xD9C9AC, name: 'Tsippor', label: 'the bird' },
    { kind: 'bird', tone: 0xFFFFFF, name: 'Tsippor', label: 'the bird' },
    { kind: 'dove', tone: 0xF7F4EC, name: 'Yonah', label: 'the dove' },
    { kind: 'dove', tone: 0xEFE8DA, name: 'Yonah', label: 'the dove' },
  ];
  for (let i = 0; i < flyerDefs.length; i++) {
    const def = flyerDefs[i];
    const bird = makeBird(def.tone);
    const dove = def.kind === 'dove';
    // Doves circle lower and closer to the heart of the garden.
    const orbit = dove
      ? {
          cx: -2 + (i - 3) * 5, cz: 2 - (i - 3) * 6,
          radius: 8 + (i - 3) * 2, height: 6 + (i - 3) * 1.4,
          speed: 0.16 * ((i % 2) ? -1 : 1),
          theta: rng() * Math.PI * 2, flap: rng() * Math.PI * 2,
        }
      : {
          cx: -8 + i * 9, cz: -4 + (i % 2) * 10,
          radius: 13 + i * 5, height: 9 + i * 2.6,
          speed: (0.14 + i * 0.035) * (i % 2 ? -1 : 1),
          theta: rng() * Math.PI * 2, flap: rng() * Math.PI * 2,
        };
    group.add(bird.group);
    flyers.push({
      ...bird, orbit,
      kind: def.kind, name: def.name, label: def.label,
      mode: 'fly',                              // fly | toRoost | roost | toPerch | perched | toFly
      perch: PERCHES[i],
      restIn: dove ? 14 + rng() * 20 : Infinity, // day perch-rests: doves only
      restFor: 0,
    });
  }

  // ── The grazers: one lamb, two cattle ─────────────────────
  // All share one life: graze a while, wander to a new patch, graze again.
  const grazers = [];
  {
    const lamb = makeLamb();
    const s0 = lambSpot(rng);
    lamb.group.position.set(s0.x, heightAt(s0.x, s0.z), s0.z);
    group.add(lamb.group);
    grazers.push({
      ...lamb, spot: lambSpot, speed: 0.72, stepFreq: 7, dip: 0.95,
      kind: 'lamb', name: 'Taleh', label: 'the lamb',
      mode: 'graze', until: 2 + rng() * 3, target: null, phase: 0,
    });
    for (const tone of [0x9C6B4A, 0x7E5A3C]) {
      const cow = makeCow(tone);
      const s1 = cowSpot(rng);
      cow.group.position.set(s1.x, heightAt(s1.x, s1.z), s1.z);
      cow.group.rotation.y = rng() * Math.PI * 2;
      group.add(cow.group);
      grazers.push({
        ...cow, spot: cowSpot, speed: 0.55, stepFreq: 5, dip: 0.7,
        kind: 'ox', name: 'Shor', label: 'the ox',
        mode: 'graze', until: 3 + rng() * 5, target: null, phase: 0,
      });
    }
  }

  // ── Fish ──────────────────────────────────────────────────
  // Five fish — one gold — in the wadable stretch west of the crossing.
  // Each swims a slow elongated loop that follows the river's meander,
  // staying inside the channel and well clear of the stepping stones
  // (anchors + half-lengths never reach past x ≈ 5), and rises now and
  // then so its back just breaks the rippling surface.
  const fishTones = [0x8FA8B8, 0x7C97A8, 0xA9BDC4, 0xD9B36A, 0x93A9A0];
  const fish = [];
  for (let i = 0; i < 5; i++) {
    const f = makeFish(fishTones[i]);
    const loop = {
      cx: -38 + i * 8.5 + rng() * 2.5,            // anchors spread along the stretch
      lx: 3.5 + rng() * 2.5,                      // half-length of the loop
      lz: 0.8 + rng() * 0.5,                      // half-width, inside the channel
      speed: (0.35 + rng() * 0.25) * (i % 2 ? -1 : 1),
      theta: rng() * Math.PI * 2,
      wig: rng() * Math.PI * 2,
      bob: rng() * Math.PI * 2,
    };
    const x0 = loop.cx + Math.cos(loop.theta) * loop.lx;
    f.group.position.set(x0, -0.8, riverZ(x0) + Math.sin(loop.theta) * loop.lz);
    group.add(f.group);
    // The golden fish (tone 0xD9B36A) alone bears a name of its own.
    const gold = i === 3;
    fish.push({
      ...f, loop,
      kind: 'fish',
      name: gold ? 'Zahav' : 'Dag',
      label: gold ? 'the golden fish' : 'the fish',
    });
  }

  // Glide a flyer toward a point; returns remaining distance.
  function glideToward(b, target, dt) {
    const p = b.group.position;
    const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
    const dist = Math.hypot(dx, dy, dz);
    const step = Math.min(dist, 7 * dt);
    if (dist > 1e-4) {
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      p.z += (dz / dist) * step;
      const yaw = Math.atan2(dx, dz);
      b.group.rotation.y += shortestAngle(b.group.rotation.y, yaw) * clamp(dt * 4, 0, 1);
    }
    return dist - step;
  }

  // ── The naming (Genesis 2:19-20) ──────────────────────────
  // Whatever the walker draws near is named. A short dwell keeps names from
  // strobing mid-stride; a touch of hysteresis lets a name linger while the
  // walker stands close by. Flyers count even overhead — a wing passing low
  // above the walker is a naming too.
  const NAME_DWELL = 0.35;
  let named = null;       // the creature whose name is presently given
  let candidate = null;   // the creature being dwelt toward
  let dwelt = 0;

  function nearestNamable(walker) {
    let best = null, bestD = Infinity;
    const consider = (c, reach, vLimit) => {
      const p = c.group.position;
      const d = Math.hypot(p.x - walker.x, p.z - walker.z);
      const keep = c === named ? reach + 0.8 : reach;   // linger once given
      if (d <= keep && Math.abs(p.y - walker.y) <= vLimit && d < bestD) {
        best = c;
        bestD = d;
      }
    };
    for (const b of flyers) consider(b, 2.4, 9);
    for (const G of grazers) consider(G, 2.6, 4);
    for (const f of fish) consider(f, 2.4, 4);
    return best;
  }

  let t = 0;
  const orbitPoint = new THREE.Vector3();
  function update(dt, night = 0, walker = null) {
    t += dt;

    if (walker) {
      const near = nearestNamable(walker);
      if (near !== candidate) {
        candidate = near;
        dwelt = 0;
      } else {
        dwelt += dt;
      }
      if (!candidate) named = null;
      else if (candidate !== named && dwelt >= NAME_DWELL) named = candidate;
    }

    for (const b of flyers) {
      const o = b.orbit;

      // Dusk calls every flyer home; morning sends them aloft again.
      if (night > 0.45 && b.mode !== 'roost' && b.mode !== 'toRoost') b.mode = 'toRoost';
      else if (night < 0.18 && b.mode === 'roost') b.mode = 'toFly';

      if (b.mode === 'fly') {
        o.theta += o.speed * dt;
        const x = o.cx + Math.cos(o.theta) * o.radius;
        const z = o.cz + Math.sin(o.theta) * o.radius;
        const y = o.height + Math.sin(o.theta * 2.3) * 0.8;
        b.group.position.set(x, y, z);
        // Face along the direction of travel (the orbit's tangent).
        const dir = Math.sign(o.speed);
        b.group.rotation.y = Math.atan2(-Math.sin(o.theta) * dir, Math.cos(o.theta) * dir);
        o.flap += dt * 9;
        const flap = Math.sin(o.flap) * 0.55 + 0.15;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
        if ((b.restIn -= dt) <= 0) {
          b.mode = 'toPerch';
          b.restFor = 8 + Math.abs(Math.sin(o.theta * 13)) * 9;
        }
      } else if (b.mode === 'toRoost' || b.mode === 'toPerch') {
        const left = glideToward(b, b.perch, dt);
        o.flap += dt * 5;                        // easier wingbeats on the glide
        const flap = Math.sin(o.flap) * 0.3 + 0.1;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
        if (left < 0.25) {
          b.group.position.copy(b.perch);
          b.mode = b.mode === 'toRoost' ? 'roost' : 'perched';
        }
      } else if (b.mode === 'roost' || b.mode === 'perched') {
        // Folded wings, the faintest breathing.
        const settle = 1.1 + Math.sin(t * 2.1 + o.flap) * 0.04;
        b.wingL.rotation.z = settle;
        b.wingR.rotation.z = -settle;
        if (b.mode === 'perched' && (b.restFor -= dt) <= 0) b.mode = 'toFly';
      }
      if (b.mode === 'toFly') {
        // Rejoin the circuit where the orbit now stands, then resume it.
        o.theta += o.speed * dt;
        orbitPoint.set(
          o.cx + Math.cos(o.theta) * o.radius,
          o.height + Math.sin(o.theta * 2.3) * 0.8,
          o.cz + Math.sin(o.theta) * o.radius,
        );
        const left = glideToward(b, orbitPoint, dt);
        o.flap += dt * 9;
        const flap = Math.sin(o.flap) * 0.55 + 0.15;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
        if (left < 0.6) {
          b.mode = 'fly';
          if (b.kind === 'dove') b.restIn = 18 + Math.abs(Math.cos(o.theta * 7)) * 26;
        }
      }
    }

    for (const f of fish) {
      const o = f.loop;
      o.theta += o.speed * dt;
      const nx = o.cx + Math.cos(o.theta) * o.lx;
      const nz = riverZ(nx) + Math.sin(o.theta) * o.lz;
      const p = f.group.position;

      // Face the way it moves — the frame-to-frame delta already folds the
      // meander in, so no derivative of the centreline is needed.
      const dx = nx - p.x, dz = nz - p.z;
      if (Math.hypot(dx, dz) > 1e-5) {
        const targetYaw = Math.atan2(dx, dz);
        f.group.rotation.y += shortestAngle(f.group.rotation.y, targetYaw) * clamp(dt * 6, 0, 1);
      }

      // Glide below the surface (-0.5), dipping toward the bed (-1.3) and
      // rising so the back just crests; never into the ground.
      const y = -0.78 + Math.sin(o.theta * 3 + o.bob) * 0.22;
      p.set(nx, Math.max(y, heightAt(nx, nz) + 0.12), nz);

      o.wig += dt * (6 + Math.abs(o.speed) * 4);
      f.tail.rotation.y = Math.sin(o.wig) * 0.6;
    }

    // Grazers: graze a while, wander to a new patch, graze again.
    for (const G of grazers) {
      G.until -= dt;
      if (G.mode === 'graze') {
        G.headPivot.rotation.x = Math.min(G.dip, G.headPivot.rotation.x + dt * 1.6);
        if (G.until <= 0) {
          G.mode = 'walk';
          G.target = G.spot(rng);
          G.until = 40;   // generous cap; arrival ends the walk
        }
      } else {
        G.headPivot.rotation.x = Math.max(0, G.headPivot.rotation.x - dt * 2.2);
        const p = G.group.position;
        const dx = G.target.x - p.x, dz = G.target.z - p.z;
        const dist = Math.hypot(dx, dz);
        const targetYaw = Math.atan2(dx, dz);
        G.group.rotation.y += shortestAngle(G.group.rotation.y, targetYaw) * clamp(dt * 4, 0, 1);
        const step = G.speed * dt;
        p.x += Math.sin(G.group.rotation.y) * step;
        p.z += Math.cos(G.group.rotation.y) * step;
        p.y = heightAt(p.x, p.z);
        G.phase += dt * G.stepFreq;
        for (let i = 0; i < 4; i++) {
          G.legs[i].rotation.x = Math.sin(G.phase + (i % 2) * Math.PI) * 0.45;
        }
        if (dist < 0.5 || G.until <= 0) {
          G.mode = 'graze';
          G.until = 2.5 + rng() * 4;
          for (const leg of G.legs) leg.rotation.x = 0;
        }
      }
    }
  }

  // A census for the debug state and the smoke suite. Grazers and fish
  // report where they presently stand, so a test can walk right up to one.
  function fauna() {
    return {
      flyers: flyers.map(b => ({ kind: b.kind, mode: b.mode })),
      grazers: grazers.map(G => ({ kind: G.kind, x: G.group.position.x, z: G.group.position.z })),
      shoal: fish.map(f => ({ name: f.name, x: f.group.position.x, z: f.group.position.z })),
      cattle: 2,
      lamb: 1,
      fish: fish.length,
    };
  }

  // The name presently given, if the walker stands near a creature.
  function namedNow() {
    return named ? { name: named.name, label: named.label, kind: named.kind } : null;
  }

  return { update, fauna, named: namedNow };
}
