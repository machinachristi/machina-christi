// The holy city's wall (v35): "and had a wall great and high, and had twelve
// gates, and at the gates twelve angels" (Revelation 21:12). "And the city
// lieth foursquare" (21:16), "the building of the wall of it was of jasper"
// (21:18), "the foundations of the wall of the city were garnished with all
// manner of precious stones" — jasper, sapphire, chalcedony, emerald,
// sardonyx, sardius, chrysolite, beryl, topaz, chrysoprasus, jacinth,
// amethyst (21:19-20) — "and the twelve gates were twelve pearls; every
// several gate was of one pearl" (21:21). "And the gates of it shall not be
// shut at all by day: for there shall be no night there" (21:25).
//
// The wall stands foursquare round all of heaven, out past where the walk
// can reach, its far sides fading into the gold air: twelve courses of
// precious stones at its foot, glinting, and above them clear jasper, with
// three open gates of pearl on every side, a light above each gate, and
// light pouring in through every one of them across the glass.
//
// And through every gate, the nations walk in the light of it (21:24, 26):
// a slow procession of small golden lights comes in at each gate and walks
// on into the city, toward the glory — and from the south side's middle
// gate, up the street to the Tree of Life ("that they may have right to the
// tree of life, and may enter in through the gates into the city", 22:14).
// Where the walker stands in their way, they part round him and close again
// behind. The middle gate on the south side is the one within his reach,
// behind the head of the ladder: stand on its threshold and the pearl
// brightens, the light over it swells, and the gate's word is given.
//
// Four draws: the wall and its foundations (one merged mesh), the twelve
// pearls (one merged mesh), the light in the gates and on the glass (one
// additive mesh), and the travellers with the twelve lights over the gates
// (one cloud of points, moved wholly in its shader — where each traveller
// is, is a pure function of heaven's clock).

import * as THREE from 'three';
import { mulberry32, damp } from '../util.js';
import { GLORY, TREE, RIVER, GREETING } from './layout.js';

// The wall's four sides, round the glory and the multitude: the south side
// just past the rim of the walk, behind the head of the ladder.
const SOUTH = -48.5;
const NORTH = 118;
const HALF = (NORTH - SOUTH) / 2;          // half a side: foursquare
const MIDZ = (NORTH + SOUTH) / 2;
const THICK = 3;
const COURSE = 0.72;                       // each foundation course's height
const FOUND_H = COURSE * 12;
const ARCH_SPRING = 12;                    // the wall is whole above this
const WALL_H = 17;
const COPING_H = 1.2;

// Each gate: one pearl, an arch 11 wide, with an arched way through it 6
// wide and 11.5 high; the pearl stands a little proud of the wall both ways.
const PEARL_W = 5.5, PEARL_SPRING = 11, PEARL_DEPTH = 4;
const WAY_W = 3, WAY_SPRING = 8.5;
const GATE_OFFSETS = [-HALF / 2, 0, HALF / 2];

// The foundations, first to twelfth, from the ground up (21:19-20).
const GEMS = [
  0x6FAE8C,  // jasper
  0x2E5CC8,  // sapphire
  0xB6C6D6,  // chalcedony
  0x1E9E64,  // emerald
  0xC9785E,  // sardonyx
  0xB8323C,  // sardius
  0xCBC447,  // chrysolite
  0x6CCBC2,  // beryl
  0xEDB234,  // topaz
  0x8DCB6E,  // chrysoprasus
  0xDD6A34,  // jacinth
  0x9558C4,  // amethyst
].map(c => new THREE.Color(c).lerp(new THREE.Color(0xF2EEE4), 0.12));
const JASPER = new THREE.Color(0xDCEDE4);
const GOLD = new THREE.Color(0xF0CF78);

// Each side: where its middle stands and which way it turns, so that a part
// built along +x with its inner face toward +z lands on that side facing in.
const SIDES = [
  { name: 'south', x: 0, z: SOUTH, rot: 0, half: HALF + THICK / 2 },
  { name: 'north', x: 0, z: NORTH, rot: Math.PI, half: HALF + THICK / 2 },
  { name: 'west', x: -HALF, z: MIDZ, rot: Math.PI / 2, half: HALF - THICK / 2 },
  { name: 'east', x: HALF, z: MIDZ, rot: -Math.PI / 2, half: HALF - THICK / 2 },
];

// The travellers: how many come in at each gate, how fast they walk, and
// how near the walker they part round him.
const PER_GATE = 36;
const PACE = 1.05;
const PART = 1.9;
const AT_GATE = 7;          // this near a gate's threshold, he stands at it

const GATE_WORD = { name: "Sha'ar", label: 'the gates of it shall not be shut at all by day' };

// Place a part built along +x (inner face toward +z) at `along` on a side.
function onSide(geo, side, along) {
  return geo.translate(along, 0, 0).rotateY(side.rot).translate(side.x, 0, side.z);
}
// A point at (along, y, inward) on a side, in the world.
function sidePoint(side, along, y, inward) {
  const c = Math.cos(side.rot), s = Math.sin(side.rot);
  return new THREE.Vector3(side.x + along * c + inward * s, y, side.z - along * s + inward * c);
}

// Merge non-indexed geometries, each with its own colour and glint, into one.
function mergeParts(parts) {
  let count = 0;
  for (const p of parts) count += p.geo.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const gl = new Float32Array(count);
  let v = 0;
  for (const { geo, color, glint } of parts) {
    const n = geo.attributes.position.count;
    pos.set(geo.attributes.position.array, v * 3);
    nor.set(geo.attributes.normal.array, v * 3);
    for (let i = 0; i < n; i++) {
      col[(v + i) * 3] = color.r; col[(v + i) * 3 + 1] = color.g; col[(v + i) * 3 + 2] = color.b;
      gl[v + i] = glint;
    }
    v += n;
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.setAttribute('aGlint', new THREE.BufferAttribute(gl, 1));
  return merged;
}

function box(len, h, thick, along, y0) {
  return new THREE.BoxGeometry(len, h, thick).toNonIndexed().translate(along, y0 + h / 2, 0);
}

// The pearl: one arch, with its way through it, drawn as a single outline
// (so the way can open right down to the ground) and given a soft rounded
// edge all round.
function pearlGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-PEARL_W, 0);
  s.lineTo(-PEARL_W, PEARL_SPRING);
  s.absarc(0, PEARL_SPRING, PEARL_W, Math.PI, 0, true);
  s.lineTo(PEARL_W, 0);
  s.lineTo(WAY_W, 0);
  s.lineTo(WAY_W, WAY_SPRING);
  s.absarc(0, WAY_SPRING, WAY_W, 0, Math.PI, false);
  s.lineTo(-WAY_W, 0);
  s.lineTo(-PEARL_W, 0);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: PEARL_DEPTH - 0.7, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3,
    bevelSegments: 3, curveSegments: 14,
  });
  geo.translate(0, 0, -(PEARL_DEPTH - 0.7) / 2);
  return geo.index ? geo.toNonIndexed() : geo;
}

export function createCity(scene) {
  const rng = mulberry32(20260862);

  // ── The wall, its foundations and its coping: one mesh.
  const parts = [];
  for (const side of SIDES) {
    // Below the arches, the wall stands in four lengths between the gates.
    const cuts = [-side.half];
    for (const g of GATE_OFFSETS) cuts.push(g - PEARL_W, g + PEARL_W);
    cuts.push(side.half);
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i], b = cuts[i + 1], len = b - a, mid = (a + b) / 2;
      for (let k = 0; k < 12; k++) {
        // Each course a little proud of the wall, the lowest the most.
        const t = THICK + 0.42 - k * 0.022;
        parts.push({ geo: onSide(box(len, COURSE, t, mid, k * COURSE), side, 0), color: GEMS[k], glint: 1 });
      }
      parts.push({ geo: onSide(box(len, ARCH_SPRING - FOUND_H, THICK, mid, FOUND_H), side, 0), color: JASPER, glint: 0.25 });
    }
    // Above them it is whole, over the gates too, and coped with gold.
    parts.push({ geo: onSide(box(side.half * 2, WALL_H - ARCH_SPRING, THICK, 0, ARCH_SPRING), side, 0), color: JASPER, glint: 0.25 });
    parts.push({ geo: onSide(box(side.half * 2 + 0.6, COPING_H, THICK + 0.6, 0, WALL_H), side, 0), color: GOLD, glint: 0.6 });
  }
  const wu = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]);
  const wall = new THREE.Mesh(mergeParts(parts), new THREE.ShaderMaterial({
    uniforms: wu,
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aGlint;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vGlint;
      #include <fog_pars_vertex>
      void main() {
        vColor = color;
        vGlint = aGlint;
        vNormal = normal;
        vWorld = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vGlint;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vNormal);
        float y = vWorld.y;
        float far = distance(cameraPosition, vWorld);
        // No shadows in heaven: an even light from all round, a little more
        // from the glory's quarter and from above.
        float lit = 0.8 + 0.16 * max(dot(n, normalize(vec3(0.0, 0.7, 0.7))), 0.0) + 0.06 * n.y;
        vec3 col = vColor * lit;
        // Clear as crystal: the jasper lightens toward its top, and every face
        // glows faintly from within.
        col += vColor * 0.12 * smoothstep(0.0, ${WALL_H.toFixed(1)}, y);
        if (abs(n.y) < 0.5 && y < ${WALL_H.toFixed(2)}) {
          // Laid in courses of dressed stones: in the foundations each course
          // a row of its own, and larger stones above them, each joint broken
          // over the one below.
          float along = abs(n.x) > 0.5 ? vWorld.z : vWorld.x;
          bool found = y < ${FOUND_H.toFixed(3)};
          float rowH = found ? ${COURSE.toFixed(2)} : 1.7;
          float y0 = found ? 0.0 : ${FOUND_H.toFixed(3)};
          float blockW = found ? 1.9 : 3.6;
          float v = (y - y0) / rowH;
          float row = floor(v);
          float u = along / blockW + 0.5 * mod(row, 2.0);
          float h = hash(vec2(floor(u), row + y0 * 7.0));
          // Each stone its own shade, catching the light slowly in its own
          // time, and a little brighter along its upper edge, as if polished.
          float shine = 0.9 + 0.12 * h + 0.07 * sin(uTime * (0.35 + 0.3 * h) + h * 40.0) * vGlint;
          col *= shine * (0.93 + 0.1 * fract(v));
          // The joints, and the gems' glints, only where they can be seen:
          // far off, the stones are enough.
          if (far < 70.0) {
            float jx = (0.5 - abs(fract(u) - 0.5)) * blockW;
            float jy = (0.5 - abs(fract(v) - 0.5)) * rowH;
            float joint = 1.0 - smoothstep(0.025, 0.07, min(jx, jy));
            col *= 1.0 - 0.14 * joint * (1.0 - smoothstep(25.0, 70.0, far));
          }
          if (far < 45.0 && vGlint > 0.0) {
            // A small bright point here and there on a stone, coming and going.
            vec2 g = vec2(along, y) * 2.2;
            vec2 cell = floor(g);
            float gh = hash(cell + 17.0);
            if (gh > 0.78) {
              vec2 at = vec2(fract(gh * 13.7), fract(gh * 71.3)) * 0.6 + 0.2;
              float d = length(fract(g) - at);
              float tw = pow(max(0.0, sin(uTime * (0.8 + gh * 1.1) + gh * 60.0)), 12.0);
              float star = (1.0 - smoothstep(0.0, 0.16, d)) * tw;
              col += vec3(1.0, 0.98, 0.93) * star * vGlint * (1.0 - smoothstep(18.0, 45.0, far));
            }
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  }));
  scene.add(wall);

  // ── The twelve pearls.
  const pearlBase = pearlGeometry();
  const pearlGeos = [];
  const gates = [];     // each gate's threshold, inside, on the glass
  for (const side of SIDES) {
    for (const g of GATE_OFFSETS) {
      pearlGeos.push(onSide(pearlBase.clone(), side, g));
      gates.push({ side, along: g, at: sidePoint(side, g, 0, THICK / 2 + 1.2) });
    }
  }
  pearlBase.dispose();
  const pearlGeo = new THREE.BufferGeometry();
  {
    let n = 0;
    for (const g of pearlGeos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let v = 0;
    for (const g of pearlGeos) {
      pos.set(g.attributes.position.array, v * 3);
      nor.set(g.attributes.normal.array, v * 3);
      v += g.attributes.position.count;
      g.dispose();
    }
    pearlGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pearlGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  }
  const pu = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uNear: { value: new THREE.Vector4(0, 0, 0, 0) },   // the gate he stands at, and how much
  }]);
  const pearls = new THREE.Mesh(pearlGeo, new THREE.ShaderMaterial({
    uniforms: pu,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vNormal = normal;
        vWorld = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec4 uNear;
      varying vec3 vNormal;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vWorld);
        float facing = clamp(dot(n, v), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.0);
        // Nacre: soft white, with rose, gold and sea-green playing over it
        // as the eye moves, and slowly of itself.
        float play = rim * 1.6 + vWorld.y * 0.05 + uTime * 0.04;
        vec3 nacre = 0.5 + 0.5 * cos(6.2832 * (play + vec3(0.0, 0.33, 0.67)));
        vec3 col = vec3(0.9, 0.88, 0.84) * (0.8 + 0.12 * n.y) * (0.9 + 0.1 * smoothstep(0.0, 16.0, vWorld.y));
        col = mix(col, nacre * 0.4 + vec3(0.6, 0.58, 0.56), 0.3 + 0.35 * rim);
        col += vec3(1.0, 0.98, 0.93) * (0.04 + 0.04 * sin(uTime * 0.7 + vWorld.x * 0.05 + vWorld.z * 0.05));
        // The gate he stands at brightens.
        float near = uNear.w * (1.0 - smoothstep(6.0, 13.0, distance(vWorld.xz, uNear.xz)));
        col += vec3(1.0, 0.95, 0.82) * near * 0.12;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  }));
  scene.add(pearls);

  // ── The light in the open gates, and poured in through them on the glass.
  const lightGeos = [];
  for (const gate of gates) {
    // In the way through the pearl: local (x, y), kind 0.
    const way = new THREE.PlaneGeometry(WAY_W * 2, WAY_SPRING + WAY_W, 1, 1).toNonIndexed();
    way.translate(0, (WAY_SPRING + WAY_W) / 2, 0);
    const wl = new Float32Array(way.attributes.position.count * 3);
    for (let i = 0; i < way.attributes.position.count; i++) {
      wl[i * 3] = way.attributes.position.getX(i);
      wl[i * 3 + 1] = way.attributes.position.getY(i);
      wl[i * 3 + 2] = 0;
    }
    way.setAttribute('aL', new THREE.BufferAttribute(wl, 3));
    lightGeos.push(onSide(way, gate.side, gate.along));
    // On the glass, reaching in from the threshold: local (across, along), kind 1.
    const RAY = 16;
    const ray = new THREE.PlaneGeometry(1, 1, 1, 1).toNonIndexed();
    const rp = ray.attributes.position;
    const rl = new Float32Array(rp.count * 3);
    for (let i = 0; i < rp.count; i++) {
      const u = rp.getY(i) + 0.5;                     // 0 at the gate, 1 at its far end
      const across = rp.getX(i) * (WAY_W * 2 + u * 4);
      rl[i * 3] = rp.getX(i) * 2;                     // -1 at one edge, 1 at the other
      rl[i * 3 + 1] = u;
      rl[i * 3 + 2] = 1;
      rp.setXYZ(i, across, 0.035, THICK / 2 + 0.4 + u * RAY);
    }
    ray.setAttribute('aL', new THREE.BufferAttribute(rl, 3));
    lightGeos.push(onSide(ray, gate.side, gate.along));
  }
  const lightGeo = new THREE.BufferGeometry();
  {
    let n = 0;
    for (const g of lightGeos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), l = new Float32Array(n * 3);
    let v = 0;
    for (const g of lightGeos) {
      pos.set(g.attributes.position.array, v * 3);
      l.set(g.attributes.aL.array, v * 3);
      v += g.attributes.position.count;
      g.dispose();
    }
    lightGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lightGeo.setAttribute('aL', new THREE.BufferAttribute(l, 3));
  }
  const lu = { uTime: { value: 0 }, uNear: pu.uNear };
  const light = new THREE.Mesh(lightGeo, new THREE.ShaderMaterial({
    uniforms: lu,
    vertexShader: /* glsl */ `
      attribute vec3 aL;
      varying vec3 vL;
      varying vec3 vWorld;
      void main() {
        vL = aL;
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec4 uNear;
      varying vec3 vL;
      varying vec3 vWorld;
      void main() {
        float a;
        if (vL.z < 0.5) {
          // The arched way: full light within it, softly edged, brightest low
          // in the middle where the travellers come through.
          vec2 p = vL.xy;
          float d = p.y < ${WAY_SPRING.toFixed(1)} ? abs(p.x) : length(p - vec2(0.0, ${WAY_SPRING.toFixed(1)}));
          a = (1.0 - smoothstep(${(WAY_W - 0.6).toFixed(2)}, ${WAY_W.toFixed(2)}, d)) * (0.55 + 0.3 * exp(-p.y * 0.15));
        } else {
          // On the glass: fading as it reaches in, and soft at its edges.
          a = (1.0 - smoothstep(0.0, 1.0, vL.y)) * (1.0 - smoothstep(0.35, 1.0, abs(vL.x))) * 0.3;
        }
        a *= 0.9 + 0.1 * sin(uTime * 0.6 + vWorld.x * 0.02 + vWorld.z * 0.02);
        float near = uNear.w * (1.0 - smoothstep(6.0, 16.0, distance(vWorld.xz, uNear.xz)));
        a *= 1.0 + 0.6 * near;
        // Far gates fade into the gold air like everything else.
        a *= 1.0 - 0.75 * smoothstep(70.0, 220.0, distance(cameraPosition, vWorld));
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.82) * a, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  light.renderOrder = 1;
  scene.add(light);

  // ── The travellers, and the twelve lights over the gates (21:12).
  const starts = [], ends = [], phases = [], paces = [], sizes = [], colors = [], sways = [];
  const WARM = new THREE.Color(0xFFD27A);
  const AMBER = new THREE.Color(0xFFB347);
  const ROSE = new THREE.Color(0xFFB09A);
  const c = new THREE.Color();
  const lanes = [];     // per gate: its line in, for state() to follow its first traveller
  gates.forEach(gate => {
    // The south side's middle gate opens on the street, behind the head of
    // the ladder: its travellers go up the street to the Tree of Life, half
    // on either bank of the river, wide enough of the ladder's opening.
    const street = gate.side.name === 'south' && gate.along === 0;
    for (let i = 0; i < PER_GATE; i++) {
      let from, to;
      if (street) {
        const bank = i % 2 ? 1 : -1;
        from = sidePoint(gate.side, bank * (1.9 + rng() * 0.9), 0, -0.5);
        to = new THREE.Vector3(bank * (RIVER.halfWidth + 0.75 + rng() * 0.6), 0, TREE.z - 4.5 - rng() * 2);
      } else {
        // In through the gate, a little either side of its middle, and on
        // to the light: to the front of the multitude round the glory.
        from = sidePoint(gate.side, gate.along + (rng() - 0.5) * WAY_W * 1.2, 0, -0.5);
        const dx = gate.at.x - GLORY.x, dz = gate.at.z - GLORY.z;
        const r = Math.hypot(dx, dz) || 1;
        const reach = 15.5 + rng() * 2.5;
        to = new THREE.Vector3(GLORY.x + dx / r * reach, 0, GLORY.z + dz / r * reach);
      }
      const len = from.distanceTo(to);
      const pace = PACE * (0.85 + rng() * 0.3);
      starts.push(from.x, 1.05 + rng() * 0.35, from.z);
      ends.push(to.x, to.z);
      phases.push((i + rng() * 0.8) / PER_GATE);
      paces.push(pace / len);
      sizes.push(0.6 + rng() * 0.3);
      sways.push(rng() * 6.2832);
      c.copy(WARM).lerp(rng() < 0.5 ? AMBER : ROSE, rng() * 0.7);
      colors.push(c.r, c.g, c.b);
      if (i === 0) lanes.push({ from, to, phase: phases[phases.length - 1], rate: paces[paces.length - 1] });
    }
  });
  const travellers = phases.length;
  for (const gate of gates) {
    const p = sidePoint(gate.side, gate.along, WALL_H + COPING_H + 2.2, 0);
    starts.push(p.x, p.y, p.z);
    ends.push(p.x, p.z);
    phases.push(0.5);
    paces.push(0);
    sizes.push(3.2);
    sways.push(rng() * 6.2832);
    colors.push(1, 0.97, 0.9);
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.Float32BufferAttribute(starts, 3));
  tgeo.setAttribute('aEnd', new THREE.Float32BufferAttribute(ends, 2));
  tgeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  tgeo.setAttribute('aRate', new THREE.Float32BufferAttribute(paces, 1));
  tgeo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  tgeo.setAttribute('aSway', new THREE.Float32BufferAttribute(sways, 1));
  tgeo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  const tu = {
    uTime: { value: 0 },
    uHalfH: { value: 400 },
    uWalker: { value: new THREE.Vector2(0, -1e4) },
    uGreeter: { value: new THREE.Vector2(GREETING.x, GREETING.z) },
    uNear: pu.uNear,
  };
  const procession = new THREE.Points(tgeo, new THREE.ShaderMaterial({
    uniforms: tu,
    vertexShader: /* glsl */ `
      attribute vec2 aEnd;
      attribute float aPhase;
      attribute float aRate;
      attribute float aSize;
      attribute float aSway;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uHalfH;
      uniform vec2 uWalker;
      uniform vec2 uGreeter;
      uniform vec4 uNear;
      varying vec3 vColor;
      varying float vAlpha;
      // Step aside from something standing at c, keeping r away from it.
      vec2 part(vec2 xz, vec2 c, float r, vec2 side) {
        vec2 off = xz - c;
        float d = length(off);
        if (d >= r) return xz;
        vec2 away = d > 0.001 ? off / d : side;
        return xz + away * (r - d) * (1.0 - 0.35 * d / r);
      }
      void main() {
        vec3 p;
        float alpha, size = aSize;
        if (aRate > 0.0) {
          // Walking in: along its line from the gate, swaying a little, and
          // coming out of the gate's light and going into the light ahead.
          float t = fract(aPhase + uTime * aRate);
          vec2 xz = mix(position.xz, aEnd, t);
          vec2 dir = normalize(aEnd - position.xz);
          vec2 side = vec2(-dir.y, dir.x);
          xz += side * sin(uTime * 0.5 + aSway) * 0.22;
          // Parting round the walker where he stands in the way, and round
          // the saint who greets him by the ladder.
          xz = part(xz, uWalker, ${PART.toFixed(2)}, side);
          xz = part(xz, uGreeter, 0.9, side);
          p = vec3(xz.x, position.y + sin(uTime * 1.6 + aSway * 3.0) * 0.06, xz.y);
          alpha = smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.9, 1.0, t));
        } else {
          // A light over a gate, breathing; the one over his gate swells.
          p = position;
          float near = uNear.w * (1.0 - smoothstep(8.0, 20.0, distance(position.xz, uNear.xz)));
          alpha = 0.8 + 0.2 * sin(uTime * 0.45 + aSway);
          size *= 1.0 + 0.1 * sin(uTime * 0.45 + aSway) + 0.5 * near;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vColor = aColor;
        vAlpha = alpha;
        gl_PointSize = clamp(size * projectionMatrix[1][1] * uHalfH / -mv.z, 1.5, 30.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d) * 4.0;
        if (r2 > 1.0) discard;
        float a = (exp(-r2 * 4.0) * 0.9 + 0.1 * (1.0 - r2)) * vAlpha;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  }));
  procession.frustumCulled = false;   // they are moved in the shader, not where the geometry says
  procession.renderOrder = 2;
  const _buf = new THREE.Vector2();
  procession.onBeforeRender = renderer => { tu.uHalfH.value = renderer.getDrawingBufferSize(_buf).y / 2; };
  scene.add(procession);

  let nearGate = null;
  let glow = 0;
  let clock = 0;
  function update(dt, time, walker) {
    clock = time;
    wu.uTime.value = time;
    pu.uTime.value = time;
    lu.uTime.value = time;
    tu.uTime.value = time;
    nearGate = null;
    if (walker) {
      tu.uWalker.value.set(walker.x, walker.z);
      for (const gate of gates) {
        if (Math.hypot(walker.x - gate.at.x, walker.z - gate.at.z) < AT_GATE) { nearGate = gate; break; }
      }
    }
    glow = damp(glow, nearGate ? 1 : 0, 1.6, dt);
    if (nearGate) pu.uNear.value.set(nearGate.at.x, 0, nearGate.at.z, glow);
    else pu.uNear.value.w = glow;
  }

  // Where a gate's first traveller is now — the same line its shader walks.
  function lead(i) {
    const l = lanes[i];
    const t = (((l.phase + clock * l.rate) % 1) + 1) % 1;
    return { x: l.from.x + (l.to.x - l.from.x) * t, z: l.from.z + (l.to.z - l.from.z) * t };
  }

  return {
    update,
    caption: () => (nearGate ? GATE_WORD : null),
    state() {
      const l = lead(1);   // the south side's middle gate
      return {
        gates: gates.length,
        foundations: GEMS.length,
        travellers,
        lights: gates.length,
        atGate: !!nearGate,
        gateGlow: glow,
        lead: { x: Math.round(l.x * 100) / 100, z: Math.round(l.z * 100) / 100 },
      };
    },
  };
}
