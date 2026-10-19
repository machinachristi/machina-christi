// Jacob's ladder (Genesis 28:12): "behold a ladder set up on the earth, and
// the top of it reached to heaven: and behold the angels of God ascending and
// descending on it." It stands on the far bank, straight ahead of where the
// walker arrives, so it is in view from the first moment, rising between the
// two sacred trees and out of the top of the frame into light. At its foot
// stands the stone Jacob set up for a pillar and poured oil upon (Genesis
// 28:18). Walking into the foot carries him up to heaven (see realm.js); this
// module only builds what is seen and moves the angels.
//
// Four draws: the ladder (rails and rungs baked to one unlit mesh), the soft
// column of light it stands in (one shader cylinder), the stone, and the
// angels (one InstancedMesh). Its own seeded stream, drawn only here.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mergeColored, mulberry32, smoothstep } from '../util.js';

// Where its foot stands on the far bank, north of the river (+z is north).
export const LADDER_FOOT = { x: 0, z: 32 };
// It leans a little away from the garden's heart, so it stands off into
// the sky beyond rather than straight up over the bank.
export const LADDER_LEAN = 0.09;
const GROUND = heightAt(LADDER_FOOT.x, LADDER_FOOT.z);
const HEIGHT = 120;        // far above anything the follow camera ever shows
const HALF_W = 0.55;       // rails either side of the line he climbs
const RUNG = 0.42;         // the step between rungs
const ANGELS = 10;
const ANGEL_REACH = 46;    // they come and go over the lower part, where they are seen
// The stone set up for a pillar, a step to the west of the foot.
const STONE_AT = { x: LADDER_FOOT.x - 1.7, z: LADDER_FOOT.z - 0.6 };

const GOLD = new THREE.Color(0xD9AE4C);
const GOLD_PALE = new THREE.Color(0xF7E7B4);
const STONE = new THREE.Color(0x9C9283);
const STONE_WARM = new THREE.Color(0xB0A48E);
const OIL = new THREE.Color(0x8A6A2E);
const ROBE = new THREE.Color(0xFFFBF0);
const WING = new THREE.Color(0xF6DE9C);

// Where on the ladder's own line a point `s` metres up it stands: the line
// rises from the foot and leans north. (The walker climbs just in front of
// it, on the garden side — realm.js adds that.)
export function ladderPoint(s, out = { x: 0, y: 0, z: 0 }) {
  out.x = LADDER_FOOT.x;
  out.y = GROUND + s * Math.cos(LADDER_LEAN);
  out.z = LADDER_FOOT.z + s * Math.sin(LADDER_LEAN);
  return out;
}

export function createLadder(scene) {
  const rng = mulberry32(20260854);

  // ── The ladder: rails and rungs, gold at the foot paling toward the light.
  // Built standing at the origin, then leaned and set on the bank, so the
  // lean pivots about the foot.
  const parts = [];
  const tone = h => GOLD.clone().lerp(GOLD_PALE, smoothstep(12, 110, h));
  const SEG = 6;   // rails in lengths, so their colour can pale as they rise
  for (let h = 0; h < HEIGHT; h += SEG) {
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.075, SEG, 0.075).toNonIndexed();
      g.translate(side * HALF_W, h + SEG / 2, 0);
      parts.push({ geo: g, color: tone(h + SEG / 2) });
    }
  }
  for (let h = RUNG; h < HEIGHT; h += RUNG) {
    const g = new THREE.BoxGeometry(HALF_W * 2, 0.05, 0.055).toNonIndexed();
    g.translate(0, h, 0);
    parts.push({ geo: g, color: tone(h) });
  }
  const ladderGeo = mergeColored(parts);
  ladderGeo.rotateX(LADDER_LEAN);
  ladderGeo.translate(LADDER_FOOT.x, GROUND, LADDER_FOOT.z);
  // Unlit and untouched by the fog: it is light, and stays gold all the way up.
  const ladder = new THREE.Mesh(ladderGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  scene.add(ladder);

  // ── The column of light it stands in.
  const beam = lightColumn({
    x: LADDER_FOOT.x, z: LADDER_FOOT.z, ground: GROUND, height: HEIGHT + 20, radius: 1.5,
    lean: LADDER_LEAN, strength: 0.3,
  });
  scene.add(beam.mesh);

  // ── Jacob's stone, set up for a pillar, oil poured on its top (Genesis
  // 28:18) — a standing stone a little taller than it is wide, the oil a
  // darker gold on its crown.
  const stoneParts = [];
  const body = new THREE.CylinderGeometry(0.3, 0.38, 1.25, 7, 2).toNonIndexed();
  roughen(body, 0.18);
  body.translate(0, 0.62, 0);
  stoneParts.push({ geo: body, color: STONE });
  const shoulder = new THREE.CylinderGeometry(0.22, 0.3, 0.2, 7, 1).toNonIndexed();
  roughen(shoulder, 0.12);
  shoulder.translate(0, 1.33, 0);
  stoneParts.push({ geo: shoulder, color: STONE_WARM });
  const oil = new THREE.CylinderGeometry(0.16, 0.22, 0.05, 7, 1).toNonIndexed();
  oil.translate(0, 1.45, 0);
  stoneParts.push({ geo: oil, color: OIL });
  const stoneGeo = mergeColored(stoneParts);
  stoneGeo.rotateY(0.4);
  stoneGeo.translate(STONE_AT.x, heightAt(STONE_AT.x, STONE_AT.z) - 0.05, STONE_AT.z);
  const stone = new THREE.Mesh(stoneGeo, new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true,
  }));
  scene.add(stone);

  // ── The angels ascending and descending (Genesis 28:12; John 1:51):
  // small robed figures of light with their wings spread, some going up the
  // ladder and some coming down, each fading in where it begins and out
  // into the light where it ends, over the part of the ladder that is seen.
  const robe = new THREE.ConeGeometry(0.17, 0.56, 7).toNonIndexed();
  robe.translate(0, 0.28, 0);
  const head = new THREE.IcosahedronGeometry(0.085, 1);
  head.translate(0, 0.64, 0);
  const wings = new THREE.BufferGeometry();
  // Two swept wings from the shoulders, each a fan of three feathers.
  const w = [];
  for (const side of [-1, 1]) {
    const root = [side * 0.05, 0.47, -0.04];
    const tips = [[side * 0.5, 0.82, -0.12], [side * 0.56, 0.6, -0.14], [side * 0.42, 0.36, -0.1]];
    for (let k = 0; k < tips.length - 1; k++) w.push(...root, ...tips[k], ...tips[k + 1]);
    w.push(...root, ...tips[2], side * 0.12, 0.3, -0.06);
  }
  wings.setAttribute('position', new THREE.Float32BufferAttribute(w, 3));
  const angelGeo = mergeColored([
    { geo: robe, color: ROBE },
    { geo: head, color: ROBE },
    { geo: wings, color: WING },
  ]);
  const angelMesh = new THREE.InstancedMesh(angelGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: false,
  }), ANGELS);
  angelMesh.frustumCulled = false;   // spread up the ladder, far from the base geometry's bounds
  scene.add(angelMesh);

  const angels = [];
  for (let i = 0; i < ANGELS; i++) {
    angels.push({
      s: (i + rng() * 0.6) * (ANGEL_REACH / ANGELS),   // how far up the ladder
      up: i % 2 === 0 ? 1 : -1,                        // ascending or descending
      speed: 1.1 + rng() * 0.9,
      side: (rng() - 0.5) * 0.5,                         // across the rungs
      phase: rng() * Math.PI * 2,
    });
  }

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _e = new THREE.Euler();
  const _pt = { x: 0, y: 0, z: 0 };
  let time = 0;

  function update(dt) {
    time += dt;
    beam.update(time);
    for (let i = 0; i < ANGELS; i++) {
      const a = angels[i];
      a.s += a.up * a.speed * dt;
      if (a.s > ANGEL_REACH) a.s -= ANGEL_REACH;
      if (a.s < 0) a.s += ANGEL_REACH;
      // Fade in where each begins and out into the light where it ends.
      const show = smoothstep(0, 2.5, a.s) * (1 - smoothstep(ANGEL_REACH - 9, ANGEL_REACH, a.s));
      ladderPoint(a.s, _pt);
      _p.set(_pt.x + a.side, _pt.y + Math.sin(time * 1.3 + a.phase) * 0.08, _pt.z - 0.32);
      // Facing out toward the garden, leaning with the ladder, and turned a
      // touch the way each one is going.
      _e.set(-LADDER_LEAN * 0.6, Math.sin(time * 0.5 + a.phase) * 0.35, a.up * 0.05);
      _q.setFromEuler(_e);
      // The wings breathe: spread and gathered a little, each in its own time.
      const spread = 1 + 0.12 * Math.sin(time * 2.4 + a.phase);
      _s.set(spread * show, show, show);
      _m.compose(_p, _q, _s);
      angelMesh.setMatrixAt(i, _m);
    }
    angelMesh.instanceMatrix.needsUpdate = true;
  }
  update(0);

  function state() {
    return {
      foot: { x: LADDER_FOOT.x, z: LADDER_FOOT.z, y: GROUND },
      angels: angels.map(a => {
        ladderPoint(a.s, _pt);
        return { y: Math.round(_pt.y * 100) / 100, up: a.up };
      }),
    };
  }

  return {
    update, state,
    // The stone is solid ground to go round (footing.js), like the garden's
    // other rock.
    solid: { x: STONE_AT.x, z: STONE_AT.z, r: 0.45 },
  };
}

// A soft column of light standing up out of the ground: brightest down the
// middle of what is seen and fading to nothing at its edges, from whatever
// side it is looked at, rising out of the ground over its first few metres.
// Over the ladder's foot here, and over its head in heaven (heaven/head.js).
export function lightColumn({ x, z, ground, height, radius, lean = 0, strength = 0.3, color = 0xFFE9B0 }) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 18, 1, true);
  geo.translate(0, height / 2, 0);
  geo.rotateX(lean);
  geo.translate(x, ground, z);
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uGround: { value: ground },
    uStrength: { value: strength },
    uTime: { value: 0 },
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vY = wp.y;
        vec4 mv = viewMatrix * wp;
        vView = normalize(-mv.xyz);
        vNormal = normalize(mat3(viewMatrix) * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uGround;
      uniform float uStrength;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vY;
      void main() {
        float face = abs(dot(normalize(vNormal), normalize(vView)));
        float core = pow(face, 4.0);
        float rise = smoothstep(uGround + 0.5, uGround + 9.0, vY);
        float breath = 0.85 + 0.15 * sin(uTime * 0.7 + vY * 0.05);
        gl_FragColor = vec4(uColor * core * rise * breath * uStrength, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  }));
  mesh.renderOrder = 3;
  return { mesh, update(time) { uniforms.uTime.value = time; } };
}

// Push a stone's corners in and out a little by a fixed function of where
// each stands (eyrie.js's roughPrism idiom), so it reads as hewn, not turned.
function roughen(g, amt) {
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
    const f = n - Math.floor(n);
    const k = 1 + (f - 0.5) * amt;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
}

