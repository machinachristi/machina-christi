// The ground of heaven (AB#106), all in one draw: "a sea of glass like unto
// crystal" (Revelation 4:6) stretching away on every side into the light, and
// running up the middle of it toward the glory "a pure river of water of
// life, clear as crystal" (22:1), with "the street of the city … pure gold,
// as it were transparent glass" (21:21) along both its banks.
//
// It is one flat plane: the shader paints the glass, the slow light moving
// in it, the river's flow, the gold of the street, and the soft rim of cloud
// round the opening where the ladder comes up — and leaves that opening
// open, so the way down can be seen through it. Heaven's ground is flat, so
// the walker's height is simply 0 everywhere (heaven.js).
//
// v33: "a sea of glass mingled with fire" (Revelation 15:2). Each step he
// takes kindles fire in the glass (song.js says when): a ring of it running
// out round his foot and a glow where the foot fell, fading in a moment. The
// last few footfalls are handed to the same shader, so the fire costs no
// draw of its own.

import * as THREE from 'three';
import { GLORY, LADDER_HEAD, RIVER, STREET } from './layout.js';
import { HEAVEN_HORIZON } from './sky.js';

const RINGS = 8;               // footfalls burning at once, recycled oldest-first
const FIRE_LIFE = 2.4;         // seconds each burns
const FIRE_SPEED = 2.3;        // m/s its ring runs out through the glass

export function createSea(scene) {
  const rings = [];
  for (let i = 0; i < RINGS; i++) rings.push(new THREE.Vector4(0, 0, -1e6, 0));
  const u = {
    uTime: { value: 0 },
    uGlass: { value: new THREE.Color(0xDCE9EC) },
    uGlassFar: { value: new THREE.Color(0xF7F0DD) },
    uRiver: { value: new THREE.Color(0x9FDCE3) },
    uGold: { value: new THREE.Color(0xF1D795) },
    uFogColor: { value: HEAVEN_HORIZON.clone() },
    uFogNear: { value: 70 },
    uFogFar: { value: 260 },
    uHole: { value: new THREE.Vector4(LADDER_HEAD.x, LADDER_HEAD.z, LADDER_HEAD.r, 1.6) },
    uGlory: { value: new THREE.Vector2(GLORY.x, GLORY.z) },
    uRiverW: { value: RIVER.halfWidth },
    uRiverFrom: { value: RIVER.from },
    uStreetW: { value: STREET.halfWidth },
    uRings: { value: rings },
    uFire: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uGlass;
      uniform vec3 uGlassFar;
      uniform vec3 uRiver;
      uniform vec3 uGold;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec4 uHole;
      uniform vec2 uGlory;
      uniform float uRiverW;
      uniform float uRiverFrom;
      uniform float uStreetW;
      uniform vec4 uRings[${RINGS}];
      uniform float uFire;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec2 p = vWorld.xz;
        float dh = distance(p, uHole.xy);
        if (dh < uHole.z) discard;          // the opening where the ladder comes up

        // The glass, paling toward the glory.
        vec3 col = mix(uGlass, uGlassFar, smoothstep(-30.0, 80.0, p.y));
        // The glory's light lying along it toward whoever looks.
        float path = exp(-abs(p.x - uGlory.x) * 0.08) * smoothstep(-40.0, uGlory.y, p.y);
        col = mix(col, uGlassFar, path * 0.5);
        // Light moving slowly in the crystal, and its cut facets.
        float w = sin(p.x * 0.8 + uTime * 0.31) * sin(p.y * 0.62 - uTime * 0.23)
                + 0.6 * sin((p.x - p.y) * 0.37 + uTime * 0.17);
        col += vec3(0.11) * smoothstep(0.9, 1.5, w);
        vec2 g = abs(fract(p / 7.0) - 0.5);
        col += vec3(0.05) * (1.0 - smoothstep(0.0, 0.025, min(g.x, g.y)));

        // The street of gold on either bank, as it were transparent glass.
        float ax = abs(p.x - uGlory.x);
        float along = smoothstep(uRiverFrom - 4.0, uRiverFrom + 2.0, p.y);
        float street = (1.0 - smoothstep(uStreetW - 0.12, uStreetW, ax)) * along;
        vec3 gold = uGold + vec3(0.1) * smoothstep(0.9, 1.5, w);
        col = mix(col, gold, street * 0.7);

        // The river, clear as crystal, flowing down out of the glory.
        float river = (1.0 - smoothstep(uRiverW - 0.18, uRiverW, ax))
          * smoothstep(uRiverFrom, uRiverFrom + 5.0, p.y);
        float flow = 0.5 + 0.5 * sin(p.y * 1.15 + uTime * 2.1 + sin(p.x * 2.6 - uTime * 0.8) * 0.9);
        vec3 water = mix(uRiver, vec3(1.0), 0.25 + 0.35 * flow);
        col = mix(col, water, river);

        // Fire in the glass where he has stepped: a ring running out from each
        // footfall and a glow where the foot fell, both fading. Skipped
        // altogether while nothing burns.
        if (uFire > 0.5) {
          float fire = 0.0;
          for (int i = 0; i < ${RINGS}; i++) {
            vec4 r = uRings[i];
            float age = uTime - r.z;
            if (age < 0.0 || age > ${FIRE_LIFE.toFixed(2)}) continue;
            float d = distance(p, r.xy);
            float k = 1.0 - age / ${FIRE_LIFE.toFixed(2)};
            float rad = 0.2 + age * ${FIRE_SPEED.toFixed(2)};
            float band = (d - rad) / (0.1 + age * 0.16);
            fire += exp(-band * band) * k * k * r.w;
            fire += exp(-d * d * 5.0) * exp(-age * 2.2) * 0.7 * r.w;
          }
          fire = clamp(fire, 0.0, 1.0);
          vec3 flame = mix(vec3(1.0, 0.52, 0.16), vec3(1.0, 0.9, 0.55), fire * fire);
          col = mix(col, flame, fire * 0.78);
        }

        // The soft rim of cloud round the opening.
        float rim = 1.0 - smoothstep(uHole.z, uHole.z + uHole.w, dh);
        float ang = atan(p.y - uHole.y, p.x - uHole.x);
        col = mix(col, vec3(1.0), rim * (0.8 + 0.2 * sin(ang * 7.0 + uTime * 0.6)));

        float f = smoothstep(uFogNear, uFogFar, vDepth);
        gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(760, 760, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  scene.add(mesh);

  let next = 0;
  let lastKindled = -1e6;
  return {
    update(time) {
      u.uTime.value = time;
      u.uFire.value = time - lastKindled < FIRE_LIFE ? 1 : 0;
    },
    // A footfall at (x, z), at heaven's time `time`.
    kindle(x, z, time, power = 1) {
      rings[next].set(x, z, time, power);
      next = (next + 1) % RINGS;
      lastKindled = time;
    },
    // How many footfalls are burning in the glass at heaven's time `time`.
    rings(time) {
      let n = 0;
      for (const r of rings) if (time - r.z >= 0 && time - r.z <= FIRE_LIFE) n++;
      return n;
    },
  };
}
