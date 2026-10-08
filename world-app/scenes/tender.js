// "My doctrine shall drop as the rain, my speech shall distil as the dew, as
// the small rain upon the tender herb, and as the showers upon the grass"
// (Deuteronomy 32:2).
//
// While a shower falls the meadow drinks it, and for a while after it has
// passed the grass stands greener and brighter than it did before, then
// slowly settles back to its ordinary colour as the ground dries. The sandy
// banks and the pale stone of the rim do not change — it is the herb that
// answers the rain.
//
// No geometry and no draw calls: the ground's own material is given one
// extra uniform, and a single line in its fragment shader lifts the green of
// the grassy faces by it. The faces are told apart by their own colour
// (grass is greener than it is red; sand and stone are not), which is the
// same per-face palette terrain.js already paints, so nothing is stored.

import * as THREE from 'three';
import { damp } from '../util.js';

const SOAK_LAMBDA = 0.5;     // the ground takes the rain quickly…
const DRY_LAMBDA = 0.022;    // …and the green stays on a good while after
// How the freshest grass is tinted, multiplying its own colour: greener and
// a touch brighter, never a different hue.
const FRESH = new THREE.Vector3(0.9, 1.16, 0.85);

export function createTender(groundMaterial) {
  const uFresh = { value: 0 };
  const uTint = { value: FRESH };

  groundMaterial.onBeforeCompile = shader => {
    shader.uniforms.uFresh = uFresh;
    shader.uniforms.uFreshTint = uTint;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFresh;\nuniform vec3 uFreshTint;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float grassy = smoothstep(0.0, 0.08, vColor.g - vColor.r);
          diffuseColor.rgb *= mix(vec3(1.0), uFreshTint, uFresh * grassy);
        }`,
      );
  };
  groundMaterial.needsUpdate = true;

  let fresh = 0;

  function update(dt, rainLevel = 0) {
    const wet = rainLevel > 0.12;
    fresh = damp(fresh, wet ? 1 : 0, wet ? SOAK_LAMBDA : DRY_LAMBDA, dt);
    if (!wet && fresh < 0.004) fresh = 0;
    uFresh.value = fresh;
  }

  function state() {
    return { fresh };
  }

  return { update, state };
}
