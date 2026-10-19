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

import * as THREE from 'three';
import { GLORY, LADDER_HEAD, RIVER, STREET } from './layout.js';
import { HEAVEN_HORIZON } from './sky.js';

export function createSea(scene) {
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

  return {
    update(time) { u.uTime.value = time; },
  };
}
