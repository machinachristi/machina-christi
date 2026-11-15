// The light pass (AB#130): the garden is first drawn to an off-screen
// picture, and that picture is then finished the way a film is graded after
// shooting — haze that thickens with distance and thins with height and
// warms toward the sun; a halo and shafts from the sun; a soft glow (bloom)
// on the brightest things; and a filmic grade with cool shadows and warm
// highlights. "And God saw the light, that it was good" (Genesis 1:4).
//
// It is an extra, never a need. On a software renderer (CI's test
// machines), on a graphics chip that cannot hold the off-screen picture,
// and on a device that cannot keep up, it steps aside and the garden is
// drawn plainly, exactly as it always was. `?light=on` and `?light=off`
// force it either way.
//
// Its settings are not set by the hour's name: they follow the sky's own
// continuous numbers (how deep the night is, how low the sun stands, how
// hard it rains), so nothing jumps as the day turns.
//
// What it costs is reported apart from the garden: `cost` holds the
// garden's own draw calls and triangles, taken straight after the garden
// is drawn and before the finishing steps, so the 200-draw budget still
// measures the garden.

import * as THREE from 'three';
import { clamp, smoothstep } from './util.js';

const SLOW_KEY = 'eden_light_slow';       // localStorage: when this device last could not keep up
const SLOW_FOR = 7 * 24 * 3600 * 1000;    // …and for how long that is believed (a week)
const SLOW_FPS = 28;                      // below this, averaged over a window, it steps aside
const SETTLE = 2.5;                       // seconds after arrival before frames are judged
const WINDOW = 3.0;                       // seconds of frames each judgement is made over

// The three airs the day moves between. Everything in between is a blend.
const AIRS = {
  day:   { haze: 0.0032, sunward: 0.45, halo: 0.22, wide: 0.03, disc: 1.5, skyGain: 0.96, mist: 0.0,
           exposure: 1.22, bloom: 0.22, rays: 0.25, contrast: 1.07, sat: 1.06, vignette: 0.26,
           shadow: [0.93, 0.98, 1.07], high: [1.04, 1.0, 0.94], threshold: 1.0 },
  gold:  { haze: 0.0038, sunward: 0.45, halo: 0.22, wide: 0.012, disc: 1.6, skyGain: 0.94, mist: 0.1,
           exposure: 1.2, bloom: 0.32, rays: 0.34, contrast: 1.1, sat: 1.1, vignette: 0.32,
           shadow: [0.9, 0.95, 1.1], high: [1.08, 1.0, 0.9], threshold: 0.9 },
  night: { haze: 0.0035, sunward: 0.3, halo: 0.14, wide: 0.006, disc: 1.0, skyGain: 1.0, mist: 0.22,
           exposure: 1.65, bloom: 0.36, rays: 0.2, contrast: 1.06, sat: 1.1, vignette: 0.4,
           shadow: [0.9, 0.96, 1.16], high: [1.05, 1.0, 0.94], threshold: 0.72 },
};
const NUMS = ['haze', 'sunward', 'halo', 'wide', 'disc', 'skyGain', 'mist', 'exposure', 'bloom', 'rays', 'contrast', 'sat', 'vignette', 'threshold'];

const QUAD_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fsMat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
  vertexShader: QUAD_VS, fragmentShader, uniforms, depthTest: false, depthWrite: false,
});

// Whether the graphics chip is a pretend one, drawn by the processor.
function softwareRenderer(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch (_) { return false; }
}

function slowRemembered() {
  try {
    const at = Number(localStorage.getItem(SLOW_KEY));
    return at > 0 && Date.now() - at < SLOW_FOR;
  } catch (_) { return false; }
}

// Builds the off-screen pictures and the finishing steps. Kept apart so a
// failure here can be caught and the garden drawn plainly instead.
function build(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const W = Math.max(2, size.x), H = Math.max(2, size.y);
  const HF = THREE.HalfFloatType;
  const rtScene = new THREE.WebGLRenderTarget(W, H, { type: HF, samples: 4 });
  rtScene.depthTexture = new THREE.DepthTexture(W, H);
  const targets = [rtScene];
  const mk = s => {
    const t = new THREE.WebGLRenderTarget(Math.max(2, W >> s), Math.max(2, H >> s), { type: HF, depthBuffer: false });
    targets.push(t);
    return t;
  };
  const rtComp = mk(0), rtRays = mk(1), rtRays2 = mk(1);
  const b0 = mk(1), b1 = mk(1), b2 = mk(2), b3 = mk(2), b4 = mk(3), b5 = mk(3), b6 = mk(4), b7 = mk(4);

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene();
  qScene.add(quad);

  // Step 1, the air: haze by distance and height, the sun's halo in the sky.
  const comp = fsMat(/* glsl */ `
    precision highp float;
    uniform sampler2D tColor, tDepth;
    uniform mat4 uProjInv, uCamWorld;
    uniform vec3 uCamPos, uSunDir, uSunCol, uHazeCol, uMistCol;
    uniform float uHaze, uHazeFall, uMist, uMistTop, uHalo, uWide, uDisc, uSkyGain, uSunward;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tColor, vUv).rgb;
      float d = texture2D(tDepth, vUv).x;
      vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      v /= v.w;
      float dist = length(v.xyz);
      vec3 world = (uCamWorld * vec4(v.xyz, 1.0)).xyz;
      vec3 ray = normalize(world - uCamPos);
      float sunward = max(dot(ray, uSunDir), 0.0);
      float s2 = sunward * sunward, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s32 = s16 * s16;
      float isSky = smoothstep(170.0, 250.0, dist);
      // Haze thickens with distance and thins with height; toward the sun
      // it takes the sun's own colour.
      float midY = max(0.5 * (uCamPos.y + world.y), 0.0);
      float f = 1.0 - exp(-dist * uHaze * exp(-midY * uHazeFall));
      vec3 hazeCol = mix(uHazeCol, uSunCol, s4 * uSunward);
      vec3 ground = mix(col, hazeCol, f);
      float m = uMist * exp(-max(world.y + 0.6, 0.0) / max(uMistTop, 0.01)) * smoothstep(6.0, 60.0, dist);
      ground = mix(ground, uMistCol, clamp(m, 0.0, 1.0));
      float disc = smoothstep(0.9988, 0.9996, sunward);
      vec3 sky = col * uSkyGain + uSunCol * (disc * uDisc + s32 * uHalo + s2 * sunward * uWide);
      gl_FragColor = vec4(mix(ground, sky, isSky), isSky * s32 * s8);
    }`, {
    tColor: { value: rtScene.texture }, tDepth: { value: rtScene.depthTexture },
    uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
    uHazeCol: { value: new THREE.Color(0.8, 0.8, 0.8) }, uMistCol: { value: new THREE.Color(0.9, 0.9, 0.9) },
    uHaze: { value: 0.003 }, uHazeFall: { value: 0.05 }, uMist: { value: 0 }, uMistTop: { value: 1.2 },
    uHalo: { value: 0.2 }, uWide: { value: 0.03 }, uDisc: { value: 1.0 }, uSkyGain: { value: 1 }, uSunward: { value: 0.5 },
  });

  // Step 2, the shafts: the sky's brightness near the sun, smeared outward
  // from where the sun stands on the screen.
  const rays = fsMat(/* glsl */ `
    precision highp float;
    uniform sampler2D tSrc; uniform vec2 uSun; uniform float uOn;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 delta = (uSun - vUv) / 32.0 * 0.92;
      vec2 uv = vUv + delta * hash(vUv * 917.0);
      vec3 acc = vec3(0.0); float w = 1.0;
      for (int i = 0; i < 32; i++) {
        vec4 s = texture2D(tSrc, clamp(uv, 0.001, 0.999));
        acc += min(s.rgb, vec3(4.0)) * s.a * w;
        w *= 0.953; uv += delta;
      }
      gl_FragColor = vec4(acc / 21.0 * uOn, 1.0);
    }`, { tSrc: { value: rtComp.texture }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uOn: { value: 0 } });

  // Step 3, the glow: keep only what is brighter than the threshold…
  const bright = fsMat(/* glsl */ `
    precision highp float;
    uniform sampler2D tSrc; uniform float uThreshold, uKnee; varying vec2 vUv;
    void main() {
      vec3 c = min(texture2D(tSrc, vUv).rgb, vec3(12.0));
      float l = max(c.r, max(c.g, c.b));
      float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
      soft = soft * soft / (4.0 * uKnee + 1e-4);
      gl_FragColor = vec4(c * max(soft, l - uThreshold) / max(l, 1e-4), 1.0);
    }`, { tSrc: { value: rtComp.texture }, uThreshold: { value: 1.0 }, uKnee: { value: 0.3 } });

  // …and blur it, smaller and softer each time.
  const blur = fsMat(/* glsl */ `
    precision highp float;
    uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
      c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
      c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
      gl_FragColor = vec4(c, 1.0);
    }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });

  // Step 4, the grade: add glow and shafts, fold the bright range down the
  // way film does, tint shadows cool and highlights warm, darken the corners.
  const fin = fsMat(/* glsl */ `
    precision highp float;
    uniform sampler2D tComp, tRays, tB0, tB1, tB2, tB3;
    uniform float uExposure, uBloom, uRays, uContrast, uSat, uVignette;
    uniform vec3 uShadowTint, uHighTint;
    varying vec2 vUv;
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tComp, vUv).rgb;
      vec3 bloom = texture2D(tB0, vUv).rgb * 0.35 + texture2D(tB1, vUv).rgb * 0.55 + texture2D(tB2, vUv).rgb * 0.8 + texture2D(tB3, vUv).rgb;
      c += bloom * uBloom + texture2D(tRays, vUv).rgb * uRays;
      c = aces(max(c, vec3(0.0)) * uExposure);
      c = pow(c, vec3(1.0 / 2.2));
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.85, l));
      c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      vec2 q = (vUv - 0.5) * vec2(0.82, 1.0);
      c *= 1.0 - uVignette * smoothstep(0.32, 0.86, length(q) * 1.25);
      c += (hash(vUv * 1531.0) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`, {
    tComp: { value: rtComp.texture }, tRays: { value: rtRays2.texture },
    tB0: { value: b0.texture }, tB1: { value: b3.texture }, tB2: { value: b5.texture }, tB3: { value: b7.texture },
    uExposure: { value: 1.2 }, uBloom: { value: 0.3 }, uRays: { value: 0.3 }, uContrast: { value: 1.06 }, uSat: { value: 1.0 },
    uVignette: { value: 0.3 },
    uShadowTint: { value: new THREE.Color(0.94, 0.98, 1.08) }, uHighTint: { value: new THREE.Color(1.05, 1.0, 0.93) },
  });

  function pass(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(qScene, cam);
  }
  function blurTo(src, tmp, dst) {
    blur.uniforms.tSrc.value = src.texture;
    blur.uniforms.uDir.value.set(1 / tmp.width, 0);
    pass(blur, tmp);
    blur.uniforms.tSrc.value = tmp.texture;
    blur.uniforms.uDir.value.set(0, 1 / dst.height);
    pass(blur, dst);
  }

  const _v = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  return {
    comp: comp.uniforms, fin: fin.uniforms, bright: bright.uniforms, rays: rays.uniforms,
    width: W, height: H,
    // Draws the garden off-screen, notes what the garden itself cost, then
    // finishes the picture onto the screen.
    render(scene, camera, sunDir, shafts, cost) {
      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);
      cost.calls = renderer.info.render.calls;
      cost.triangles = renderer.info.render.triangles;
      const u = comp.uniforms;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      u.uSunDir.value.copy(sunDir);
      pass(comp, rtComp);
      // Where the sun stands on the screen: shafts only as it comes before us.
      _v.copy(u.uCamPos.value).addScaledVector(sunDir, 400).project(camera);
      const front = smoothstep(0.02, 0.3, sunDir.dot(camera.getWorldDirection(_fwd)));
      rays.uniforms.uSun.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
      rays.uniforms.uOn.value = front * shafts;
      pass(rays, rtRays);
      blurTo(rtRays, b1, rtRays2);
      pass(bright, b0);
      blurTo(b0, b1, b0);
      blurTo(b0, b2, b3);
      blurTo(b3, b4, b5);
      blurTo(b5, b6, b7);
      pass(fin, null);
    },
    dispose() {
      for (const t of targets) t.dispose();
      if (rtScene.depthTexture) rtScene.depthTexture.dispose();
      for (const m of [comp, rays, bright, blur, fin]) m.dispose();
      quad.geometry.dispose();
    },
  };
}

// `light`: the garden's one great light (the sun by day, the moon by night).
// `params`: the page's own query (?light=on|off). `onChange(on)`: told when
// the pass comes on or steps aside, so the garden can dress to match.
export function createLightPass({ renderer, scene, light, params, onChange = () => {} }) {
  const forced = params.get('light');           // 'on' | 'off' | null
  const cost = { calls: 0, triangles: 0 };
  const sunDir = new THREE.Vector3(0, 1, 0);
  const _white = new THREE.Color(1, 1, 1);
  const mix = {};                                // this frame's blended air
  let post = null;
  let on = false;
  let reason = 'off';
  let fps = 0;

  function decide() {
    if (forced === 'off') return 'asked off';
    const gl = renderer.getContext();
    const able = renderer.capabilities.isWebGL2
      && (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    if (!able) return 'not supported';
    if (forced === 'on') return null;
    if (softwareRenderer(gl)) return 'software renderer';
    if (slowRemembered()) return 'was slow here';
    return null;
  }

  function turnOff(why) {
    if (post) { post.dispose(); post = null; }
    renderer.setRenderTarget(null);
    on = false;
    reason = why;
    onChange(false);
  }

  function turnOn() {
    try {
      post = build(renderer);
      on = true;
      reason = forced === 'on' ? 'asked on' : 'on';
      onChange(true);
    } catch (err) {
      turnOff('could not start');
    }
  }

  {
    const why = decide();
    if (why) { reason = why; onChange(false); } else turnOn();
  }

  // The window's size changed: the off-screen pictures are made anew.
  function resize() {
    if (!on) return;
    post.dispose();
    try { post = build(renderer); } catch (err) { turnOff('could not start'); }
  }

  // Is the device keeping up? Judged on real time between frames, a window
  // at a time, once the arrival has settled; a hidden tab is not judged.
  let age = 0, winT = 0, winN = 0, last = 0;
  function judge() {
    const now = performance.now();
    const gap = last ? (now - last) / 1000 : 0;
    last = now;
    if (!gap || gap > 0.5 || document.hidden) { winT = 0; winN = 0; return; }
    age += gap;
    if (age < SETTLE) return;
    winT += gap; winN++;
    if (winT < WINDOW) return;
    fps = winN / winT;
    winT = 0; winN = 0;
    if (on && forced !== 'on' && fps < SLOW_FPS) {
      try { localStorage.setItem(SLOW_KEY, String(Date.now())); } catch (_) { /* private mode */ }
      turnOff('too slow here');
    }
  }

  // The air for this moment, from the sky's own numbers.
  function air(hour) {
    const night = clamp(hour.night || 0, 0, 1);
    const low = smoothstep(0.55, 0.12, hour.sunElev || 0);       // how low the sun stands
    const wn = night, wg = (1 - night) * low, wd = (1 - night) * (1 - low);
    for (const k of NUMS) mix[k] = AIRS.day[k] * wd + AIRS.gold[k] * wg + AIRS.night[k] * wn;
    const u = post, f = u.fin, c = u.comp;
    const tint = (key, i) => AIRS.day[key][i] * wd + AIRS.gold[key][i] * wg + AIRS.night[key][i] * wn;
    f.uShadowTint.value.setRGB(tint('shadow', 0), tint('shadow', 1), tint('shadow', 2));
    f.uHighTint.value.setRGB(tint('high', 0), tint('high', 1), tint('high', 2));
    // Rain hides the sun: its halo and shafts go, and the haze thickens.
    const clear = 1 - clamp(hour.rain || 0, 0, 1);
    // The great light pinches dim as it passes from sun to moon; so do
    // the halo and shafts, and the change of direction is never seen.
    const strength = clamp(light.intensity / 0.6, 0, 1) * clear;
    c.uHaze.value = mix.haze * (1 + 0.8 * (1 - clear));
    c.uSunward.value = mix.sunward * clear;
    c.uHalo.value = mix.halo * strength;
    c.uWide.value = mix.wide * strength;
    c.uDisc.value = mix.disc * strength * (1 - night);           // the moon keeps her own face
    c.uSkyGain.value = mix.skyGain;
    c.uMist.value = mix.mist;
    // The halo is as bright as the light that makes it: the moon's is a
    // faint ring, not a second sun.
    c.uSunCol.value.copy(light.color).multiplyScalar(Math.sqrt(clamp(light.intensity / 2.35, 0, 1)));
    if (scene.fog) c.uHazeCol.value.copy(scene.fog.color);
    c.uMistCol.value.copy(c.uHazeCol.value).lerp(_white, 0.25);
    f.uExposure.value = mix.exposure;
    f.uBloom.value = mix.bloom;
    f.uRays.value = mix.rays;
    f.uContrast.value = mix.contrast;
    f.uSat.value = mix.sat;
    f.uVignette.value = mix.vignette;
    u.bright.uThreshold.value = mix.threshold;
    return strength;
  }

  // Draws one frame. `fine` is false for a scene the pass is not for
  // (heaven keeps its own light), which is then drawn plainly.
  function render(target, camera, hour, fine = true) {
    judge();
    if (on && fine) {
      try {
        sunDir.copy(light.position).normalize();
        const shafts = air(hour);
        post.render(target, camera, sunDir, shafts, cost);
        return;
      } catch (err) {
        console.warn('light pass stepped aside:', err);
        turnOff('failed while drawing');
      }
    }
    renderer.render(target, camera);
    cost.calls = renderer.info.render.calls;
    cost.triangles = renderer.info.render.triangles;
  }

  return {
    render, resize, cost,
    get on() { return on; },
    state: () => ({ on, reason, fps: Math.round(fps) }),
  };
}
