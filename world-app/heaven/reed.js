// The golden reed (v43): "And he that talked with me had a golden reed to
// measure the city, and the gates thereof, and the wall thereof. And the city
// lieth foursquare, and the length is as large as the breadth" (Revelation
// 21:15-16).
//
// While he is shown the city from on high (behold.js), a light of burnished
// gold sets out from the wall's south-west corner and runs the whole way
// round the top of the wall, measuring it: the wall behind it stays golden,
// and over each of the twelve gates, as it passes, a pillar of gold light
// stands up and a harp note sounds. When it comes round to where it began the
// city stands outlined foursquare, and heaven answers. When he comes down
// again the gold fades slowly from the wall, and is measured afresh the next
// time he is taken up.
//
// One draw, and nothing in it is random: the line along the wall is four flat
// quads, the running light and the twelve pillars are quads turned to face
// whoever looks (in the vertex shader), and how much of the wall is gold is a
// single number, `uHead`, the metres measured so far.

import * as THREE from 'three';
import { damp } from '../util.js';

const SPEED = 26.5;          // m/s the reed's light runs along the wall
const LINE_HALF = 4.6;       // half the width of the gold line on the wall's top
const PILLAR_H = 52;         // how high each gate's pillar of light stands
const PILLAR_HALF = 5.0;     // …and half its width
const FLARE = 26;            // the running light's radius, metres
const FLOURISH = 4;          // seconds the whole line brightens once it is measured
const FADE = 0.16;           // how quickly the gold leaves the wall afterwards (1/s)
// The harp's note for each gate in turn: three to a side, each side climbing
// a little higher than the last (audio.js harp() takes steps 0..10).
const GATE_NOTES = [0, 2, 4, 1, 3, 5, 4, 6, 8, 7, 9, 10];

const WORD_REED = { name: 'Qaneh', label: 'a golden reed to measure the city, and the gates thereof' };
const WORD_DONE = { name: 'Ravua', label: 'the city lieth foursquare: the length is as large as the breadth' };

// wall: { south, north, half, top } — the wall's four sides and the height of
// its top (city.js). gateSpots: [{x, z}] where each gate stands.
export function createReed(scene, wall, gateSpots) {
  const side = wall.half * 2;
  const PERIM = side * 4;
  const top = wall.top;

  // Where the point `s` metres round the wall stands: from the south-west
  // corner east along the south side, north up the east side, west along the
  // north side, and south down the west side home.
  function at(s, out) {
    const u = ((s % PERIM) + PERIM) % PERIM;
    if (u < side) out.set(-wall.half + u, top, wall.south);
    else if (u < side * 2) out.set(wall.half, top, wall.south + (u - side));
    else if (u < side * 3) out.set(wall.half - (u - side * 2), top, wall.north);
    else out.set(-wall.half, top, wall.north - (u - side * 3));
    return out;
  }
  // …and how far round the wall the nearest point of it to (x, z) is.
  function along(x, z) {
    const d = [Math.abs(z - wall.south), Math.abs(x - wall.half), Math.abs(z - wall.north), Math.abs(x + wall.half)];
    const i = d.indexOf(Math.min(...d));
    if (i === 0) return x + wall.half;
    if (i === 1) return side + (z - wall.south);
    if (i === 2) return side * 2 + (wall.half - x);
    return side * 3 + (wall.north - z);
  }

  const gates = (gateSpots || []).map(g => along(g.x, g.z)).sort((a, b) => a - b);

  // ── The geometry: every vertex carries where it is anchored (position),
  // its corner of its quad (aCorner), what it is (aKind: 0 the line, 1 the
  // running light, 2 a pillar) and how far round the wall it lies (aS).
  const pos = [], corner = [], kind = [], ss = [];
  const quad = (pts, corners, k, s) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(pts[i].x, pts[i].y, pts[i].z);
      corner.push(corners[i][0], corners[i][1]);
      kind.push(k);
      ss.push(s[i]);
    }
  };
  const SQUARE = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    at(i * side, a);
    at(i * side + side - 1e-3, b);
    const dir = b.clone().sub(a).normalize();
    const out = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(LINE_HALF);   // outward of the city
    const lift = new THREE.Vector3(0, 0.08, 0);
    const p0 = a.clone().sub(out).add(lift), p1 = b.clone().sub(out).add(lift);
    const p2 = b.clone().add(out).add(lift), p3 = a.clone().add(out).add(lift);
    quad([p0, p1, p2, p3], [[0, -1], [0, -1], [0, 1], [0, 1]], 0, [i * side, (i + 1) * side, (i + 1) * side, i * side]);
  }
  const origin = new THREE.Vector3(0, top, 0);
  quad([origin, origin, origin, origin], SQUARE, 1, [0, 0, 0, 0]);
  for (const s of gates) {
    const p = at(s, new THREE.Vector3());
    quad([p, p, p, p], SQUARE, 2, [s, s, s, s]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  geo.setAttribute('aS', new THREE.Float32BufferAttribute(ss, 1));

  const u = {
    uHead: { value: 0 },
    uHeadPos: { value: new THREE.Vector3(-wall.half, top + 1.5, wall.south) },
    uShow: { value: 0 },
    uRun: { value: 0 },          // 1 while the light is running, 0 once it is home
    uDone: { value: 0 },         // the flourish as it comes home, 1 → 0
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aCorner;
      attribute float aKind;
      attribute float aS;
      uniform vec3 uHeadPos;
      varying vec2 vCorner;
      varying float vKind;
      varying float vS;
      void main() {
        vCorner = aCorner;
        vKind = aKind;
        vS = aS;
        vec4 mv;
        if (aKind < 0.5) {
          mv = viewMatrix * vec4(position, 1.0);
        } else if (aKind < 1.5) {
          // The running light: a disc facing whoever looks.
          mv = viewMatrix * vec4(uHeadPos, 1.0);
          mv.xy += aCorner * ${FLARE.toFixed(1)};
        } else {
          // A pillar: standing upright, turned about its own height to face.
          // (The camera's right-hand way, in the world: the view matrix's first row.)
          vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
          vec3 w = position + right * (aCorner.x * ${PILLAR_HALF.toFixed(1)})
            + vec3(0.0, (aCorner.y * 0.5 + 0.5) * ${PILLAR_H.toFixed(1)}, 0.0);
          mv = viewMatrix * vec4(w, 1.0);
        }
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uHead;
      uniform float uShow;
      uniform float uRun;
      uniform float uDone;
      uniform float uTime;
      varying vec2 vCorner;
      varying float vKind;
      varying float vS;
      void main() {
        // Burnished gold, going to fire where it is brightest: on heaven's
        // pale light only a deep colour shows at all.
        vec3 gold = vec3(1.0, 0.42, 0.03);
        vec3 fire = vec3(1.0, 0.93, 0.62);
        vec3 col = gold;
        float alpha = 0.0;
        float behind = uHead - vS;              // metres since the light passed here
        if (vKind < 0.5) {
          float measured = smoothstep(0.0, 5.0, behind);
          float tail = exp(-max(behind, 0.0) / 42.0) * measured * uRun;
          // A white-gold heart down the middle of the wall's top, with deep
          // gold spilling over both its edges: the wall's own coping is pale
          // gold, and the measured wall must not be mistaken for it.
          float across = 1.0 - abs(vCorner.y);
          float edge = smoothstep(0.0, 0.5, across);
          float heart = smoothstep(0.45, 0.9, across);
          float shimmer = 0.85 + 0.15 * sin(vS * 0.5 - uTime * 2.4);
          alpha = (0.8 * shimmer + 0.2 * tail + 0.2 * uDone) * measured * edge;
          col = mix(gold, fire, clamp(heart * (0.75 + 0.25 * shimmer) + tail * 0.3 + uDone * 0.4, 0.0, 1.0));
        } else if (vKind < 1.5) {
          float r = length(vCorner);
          float glow = exp(-r * r * 4.5);
          float core = exp(-r * r * 60.0);
          alpha = (glow + core) * uRun * (1.0 - smoothstep(0.8, 1.0, r));
          col = mix(gold, vec3(1.0, 0.97, 0.85), clamp(core + glow * 0.5, 0.0, 1.0));
        } else {
          float lit = smoothstep(0.0, 9.0, behind);
          float fresh = exp(-max(behind, 0.0) / 60.0) * uRun;
          float across = 1.0 - abs(vCorner.x);
          float h = vCorner.y * 0.5 + 0.5;
          float up = 1.0 - h;
          alpha = lit * across * sqrt(up) * (0.8 + 0.2 * fresh + 0.2 * uDone);
          col = mix(gold, fire, clamp(across * across * across * 0.9 + fresh * 0.3, 0.0, 1.0));
        }
        alpha = clamp(alpha * uShow, 0.0, 1.0);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;      // its quads are placed in the shader
  mesh.renderOrder = 4;            // over the wall and the glass it lies on
  mesh.visible = false;
  scene.add(mesh);

  let head = 0;             // metres measured so far
  let show = 0;             // 0..1 how much of the gold is to be seen
  let done = false;         // the light has come home
  let doneAt = -1e6;
  let lit = 0;              // gates passed
  let notes = 0;            // harp notes asked for, and the last one's step
  let note = 0;
  let rounds = 0;           // times the whole city has been measured
  let watching = false;
  const headPos = u.uHeadPos.value;
  const sung = { notes: 0, note: 0, rounds: 0 };

  // watched: he is on high, looking (behold.js says so through heaven.js).
  // Returns true on the frame the measuring is finished.
  function update(dt, time, watched) {
    // Taken up again after the city was measured, it is measured afresh,
    // even if the old gold has not yet left the wall.
    if (watched && !watching && done) {
      head = 0;
      lit = 0;
      done = false;
    }
    watching = !!watched;
    let finished = false;
    if (watching) {
      show = damp(show, 1, 1.6, dt);
      if (!done) {
        head = Math.min(PERIM, head + SPEED * dt);
        while (lit < gates.length && gates[lit] <= head) {
          note = GATE_NOTES[lit % GATE_NOTES.length];
          notes++;
          lit++;
        }
        if (head >= PERIM) {
          done = true;
          doneAt = time;
          rounds++;
          finished = true;
        }
      }
    } else if (show > 0) {
      // Come down again, the gold leaves the wall slowly; once it is gone,
      // the next looking measures the city afresh.
      show = damp(show, 0, FADE, dt);
      if (show < 0.02) {
        show = 0;
        head = 0;
        lit = 0;
        done = false;
      }
    }
    mesh.visible = show > 0;
    if (!mesh.visible) return finished;
    at(head, headPos);
    headPos.y = top + 1.5;
    u.uHead.value = head;
    u.uShow.value = show;
    // The running light itself is only there while it runs and he looks.
    u.uRun.value = done || !watching ? 0 : 1;
    u.uDone.value = done ? Math.max(0, 1 - (time - doneAt) / FLOURISH) : 0;
    u.uTime.value = time;
    return finished;
  }

  return {
    update,
    // The line under the screen while he looks: the reed's word while it
    // measures, and the city's once it is measured.
    caption() {
      if (!watching || head <= 0) return null;
      return done ? WORD_DONE : WORD_REED;
    },
    song() {
      sung.notes = notes;
      sung.note = note;
      sung.rounds = rounds;
      return sung;
    },
    state() {
      return {
        measuring: watching && !done,
        measured: +(head / PERIM).toFixed(3),
        gates: lit,
        of: gates.length,
        rounds,
        shown: +show.toFixed(3),
      };
    },
  };
}
