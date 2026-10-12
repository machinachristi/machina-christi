// The Workshop nave: the same glass as the 2D window (workshop/glass.json),
// raised as a city of light on a stepped ziggurat of dark stone, one step for
// each tier, from the workbench at its foot up to "in your hands" beside the
// cross. Each technology is a slender tower of dark glass whose windows burn
// in its tier's colour (taller the more it holds together); planned ones are
// clear crystal, outlined and waiting to be lit. Threads of gold join the
// towers that touch, a pillar of light rises from the heart of the steps to
// the cross, and ripples of light go out across the ground from its foot.
//
// Every surface is drawn by a small shader of its own and the brightest
// things bloom, the way light does at dusk. The look follows the lead of
// RepoSense (iLevyTate, MIT): unlit materials, a graded sky, real glow.
//
// It tells its story with the camera: an opening shot in which the light
// falls from the cross and wakes each step in turn, then shots the page asks
// for: a whole tier (the guided walk and the tier lights), one tower and its
// neighbours, or a chosen few (the road ahead).
//
// The page (workshop.html) owns the data, the selection, the walk and the
// card; this module only draws, and reports taps. It uses the three.js Eden
// already ships (world-app/vendor), so the Workshop downloads nothing new.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const CORE = 0.95;   // radius of the dais at the heart
const RING = 0.62;   // width of each step's open band
const RISE = 0.46;   // height of each step
const GOLD = new THREE.Color(0xf2d58a);

// How brightly each tower burns: dimmed, resting, lit by a neighbour,
// selected. Lit glass glows from its windows and crown; planned glass is a
// clear outline that only kindles a little when it is told.
const LOOK = {
  live:    { light: [0.1, 0.72, 1.0, 1.3], shell: [0.45, 1, 1, 1],    crown: [0.12, 1.3, 2.0, 3.2] },
  planned: { light: [0, 0, 0.1, 0.22],     shell: [0.3, 0.75, 1, 1.2], crown: [0, 0.1, 0.45, 0.9] },
};

const QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const HASH = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;
const OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export function createNave({ stage, canvas, tagHost, data, colourOf, onPick, bandOf, reducedMotion, onLost }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  renderer.setClearColor(0x06070c, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
  camera.layers.enable(1); // layer 1: the sky, stars and ground, which never bloom
  const time = { value: 0 };

  // A soft round glow, drawn once and shared by the motes and sparks.
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.3, 'rgba(255,255,255,0.4)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const background = o => { o.layers.set(1); scene.add(o); return o; };

  // ── The layout: steps, and a tower for every pane ─────────────────
  const panes = data.panes;
  const byId = Object.fromEntries(panes.map(p => [p.id, p]));
  const tiers = data.tiers.filter(t => panes.some(p => p.tier === t.id));
  const N = tiers.length;
  const stepTop = i => (N - 1 - i) * RISE;      // tier 0 (hands) is the highest
  const outer = i => CORE + RING * (i + 1);     // each step's edge
  const topY = stepTop(0);
  const maxR = outer(N - 1);
  const crossY = topY + 3.0;

  // How many panes each touches, either way: what it holds together.
  const degree = {};
  panes.forEach(p => { degree[p.id] = degree[p.id] || 0; (p.touches || []).forEach(t => {
    if (!byId[t]) return;
    degree[p.id] += 1;
    degree[t] = (degree[t] || 0) + 1;
  }); });

  // ── Sky: dusk over the city, deep above, a warm afterglow low on one side
  background(new THREE.Mesh(
    new THREE.SphereGeometry(150, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `${HASH}
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 col = mix(vec3(0.014, 0.017, 0.036), vec3(0.003, 0.005, 0.014), smoothstep(-0.02, 0.6, h));
          float glow = pow(max(dot(vDir, normalize(vec3(-0.55, 0.02, -0.83))), 0.0), 8.0);
          col += vec3(0.05, 0.026, 0.01) * glow * (1.0 - smoothstep(-0.05, 0.3, h));
          float cool = pow(max(dot(vDir, normalize(vec3(0.7, 0.25, 0.65))), 0.0), 4.0);
          col += vec3(0.008, 0.012, 0.03) * cool;
          col *= mix(0.35, 1.0, smoothstep(-0.35, 0.0, h));
          // A whisper of dither, so the long gradient never bands.
          col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
          ${OUT}
        }`,
    }),
  ));

  // Stars, faint and few, on the upper sky.
  {
    const COUNT = 900;
    const pos = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT);
    let s = 7;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < COUNT; i++) {
      const u = 0.06 + rand() * 0.94, a = rand() * TAU, r = 120;
      const c = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * c * r, u * r, Math.sin(a) * c * r], i * 3);
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    background(new THREE.Points(geo, new THREE.ShaderMaterial({
      ...additive,
      uniforms: { uTime: time, uRatio: { value: pixelRatio } },
      vertexShader: `
        attribute float aSeed; uniform float uTime, uRatio; varying float vA;
        void main() {
          vA = (0.35 + 0.65 * aSeed) * (0.7 + 0.3 * sin(uTime * (0.4 + aSeed) + aSeed * 40.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (aSeed > 0.94 ? 2.6 : 1.4) * uRatio;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.85, 0.88, 1.0) * vA * 0.55 * smoothstep(0.5, 0.0, d), 1.0);
        }`,
    })));
  }

  // The ground: still water, with ripples of light going out from the foot
  // of the steps, and a warm pool around them.
  background(new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2).translate(0, -0.26, 0),
    new THREE.ShaderMaterial({
      ...additive,
      uniforms: { uTime: time, uR: { value: maxR } },
      vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime, uR; varying vec3 vW;
        void main() {
          float r = length(vW.xz);
          float out_ = smoothstep(uR * 0.98, uR * 1.12, r);
          float fade = 1.0 - smoothstep(uR * 1.1, uR * 3.2, r);
          float w = r * 1.15 - uTime * 0.35;
          float aa = 1.0 - smoothstep(0.25, 1.2, fwidth(w));
          float ripple = pow(0.5 + 0.5 * cos(w), 40.0) * aa;
          float still = pow(0.5 + 0.5 * cos(r * 0.55), 160.0) * (1.0 - smoothstep(0.1, 0.6, fwidth(r * 0.55)));
          vec3 col = vec3(1.0, 0.8, 0.5) * (ripple * 0.05 + still * 0.035) * fade * out_;
          col += vec3(0.05, 0.036, 0.02) * exp(-pow(max(r - uR, 0.0) * 0.8, 2.0)) * out_;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  ));

  // ── The steps ────────────────────────────────────────────────────
  const stepVS = `
    varying vec3 vW; varying vec3 vN;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const stepFS = `
    uniform vec3 uRim; uniform float uGlow, uR, uInner, uTop, uReveal;
    varying vec3 vW; varying vec3 vN;
    void main() {
      float r = length(vW.xz);
      float top = step(0.5, vN.y);
      vec3 gold = vec3(1.0, 0.78, 0.42);
      // Polished dark stone, with the column's light pooled across it.
      vec3 col = vec3(0.016, 0.015, 0.022) + vec3(0.05, 0.036, 0.018) * exp(-r * 0.42) * top;
      // Tracery set into the open band, like the stone of a rose window.
      float band = step(uInner, r) * top;
      float a = atan(vW.z, vW.x);
      float spoke = abs(fract(a / 6.2831853 * 24.0) - 0.5) * 2.0;
      float spokeW = spoke * r * 6.2831853 / 24.0 * 0.5;
      col += gold * (1.0 - smoothstep(0.004, 0.012 + fwidth(spokeW), spokeW)) * 0.014 * band;
      float inner = abs(r - uInner - 0.05);
      col += gold * (1.0 - smoothstep(0.003, 0.008 + fwidth(r), inner)) * 0.06 * band;
      // A line of light along the edge of every step.
      float edge = abs(r - uR + 0.035);
      col += uRim * (1.0 - smoothstep(0.004, 0.012 + fwidth(r), edge)) * uGlow * top;
      // The walls: dark, catching a little of their own edge's light.
      float wall = 1.0 - top;
      col += uRim * wall * (0.02 + 0.22 * smoothstep(uTop - 0.12, uTop, vW.y)) * uGlow * 0.5;
      col *= uReveal;
      gl_FragColor = vec4(col, 1.0);
      ${OUT}
    }`;

  // ── Towers ───────────────────────────────────────────────────────
  const towerVS = `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vWall;
    void main() {
      vUv = uv;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - w.xyz);
      vWall = 1.0 - step(0.5, abs(normal.y));
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const towerFS = `${HASH}
    uniform vec3 uColor; uniform float uLight, uShell, uPlanned, uTime, uSeed, uRows, uReveal;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vWall;
    void main() {
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
      vec3 lamp = mix(uColor, vec3(1.0, 0.88, 0.68), 0.55);
      // Windows: two columns up each face, some lit, each breathing slowly.
      vec2 cell = vec2(vUv.x * 2.0, vUv.y * uRows);
      vec2 id = floor(cell), f = fract(cell), fw = fwidth(cell);
      vec2 m = smoothstep(0.26 - fw, 0.26 + fw, f) * (1.0 - smoothstep(0.74 - fw, 0.74 + fw, f));
      float pane = m.x * m.y * vWall;
      float on = step(0.32, hash(id + uSeed));
      float breathe = 0.8 + 0.2 * sin(uTime * (0.35 + hash(id + 3.1) * 0.5) + hash(id) * 6.2831);
      // From far away the grid melts into its average glow instead of shimmering.
      float far = smoothstep(0.3, 0.85, max(fw.x, fw.y));
      float lit = mix(pane * on * breathe, 0.3 * vWall, far);
      float foot = mix(0.55, 1.0, smoothstep(0.0, 0.3, vUv.y * vWall + (1.0 - vWall)));
      vec3 col; float alpha = 1.0;
      if (uPlanned < 0.5) {
        col = (uColor * 0.045 + vec3(0.01, 0.01, 0.018)) * uShell * foot
            + uColor * fres * 0.5 * uShell
            + lamp * lit * uLight * 1.9;
      } else {
        // Clear crystal: an outline of light and empty windows, waiting.
        col = uColor * (0.05 + fres * 0.65) * uShell + lamp * pane * 0.1 * uShell + lamp * lit * uLight * 1.6;
        alpha = clamp((0.14 + fres * 0.6) * uShell, 0.0, 1.0);
      }
      gl_FragColor = vec4(col * uReveal, alpha * mix(1.0, uReveal, uPlanned));
      ${OUT}
    }`;

  const prisms = new Map();
  const prismMeshes = [];
  const rims = new Map();
  const tierAt = new Map(); // tier id → { i, y, r }
  const W = 0.3;            // a tower's breadth

  tiers.forEach((t, i) => {
    const y = stepTop(i);
    const R = outer(i), inner = R - RING;
    const colour = new THREE.Color(`rgb(${colourOf(t.id)})`);
    const rimColour = colour.clone().lerp(GOLD, 0.45);

    const height = y + 0.26;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uRim: { value: rimColour }, uGlow: { value: 0 }, uR: { value: R }, uInner: { value: inner }, uTop: { value: y }, uReveal: { value: 1 } },
      vertexShader: stepVS,
      fragmentShader: stepFS,
    });
    const step = new THREE.Mesh(new THREE.CylinderGeometry(R, R, height, 128, 1), mat);
    step.position.y = y - height / 2;
    scene.add(step);
    rims.set(t.id, { mat, cur: 0 });
    tierAt.set(t.id, { i, y, r: R });

    const inTier = panes.filter(p => p.tier === t.id);
    const offset = i * 2.39996; // the golden angle, so no two steps line up
    const ringAt = inner + RING / 2;
    inTier.forEach((p, k) => {
      const a = offset + (k * TAU) / inTier.length;
      const kind = p.status === 'planned' ? 'planned' : 'live';
      const H = THREE.MathUtils.clamp(0.7 + (degree[p.id] || 0) * 0.13, 0.7, 2.1);
      const base = new THREE.Vector3(Math.sin(a) * ringAt, y, Math.cos(a) * ringAt);
      const geo = new THREE.BoxGeometry(W, H, W).translate(0, H / 2, 0);
      const look = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: colour }, uLight: { value: 0 }, uShell: { value: 0 }, uPlanned: { value: kind === 'planned' ? 1 : 0 },
          uTime: time, uSeed: { value: k * 7.3 + i * 1.7 }, uRows: { value: Math.round(H * 7) }, uReveal: { value: 1 },
        },
        vertexShader: towerVS,
        fragmentShader: towerFS,
        transparent: kind === 'planned',
        depthWrite: kind !== 'planned',
      });
      const mesh = new THREE.Mesh(geo, look);
      mesh.position.copy(base);
      mesh.rotation.y = a;
      mesh.userData.id = p.id;
      scene.add(mesh);
      prismMeshes.push(mesh);
      // The crown: a thin band of light at the top.
      const crownMat = new THREE.MeshBasicMaterial({ color: 0x000000, ...additive });
      const crown = new THREE.Mesh(new THREE.BoxGeometry(W * 1.08, 0.035, W * 1.08).translate(0, H + 0.01, 0), crownMat);
      mesh.add(crown);
      // Clear crystal keeps its edges, finely drawn.
      let lineMat = null;
      if (kind === 'planned') {
        lineMat = new THREE.LineBasicMaterial({ color: colour.clone().lerp(new THREE.Color(1, 1, 1), 0.45), transparent: true, opacity: 0, depthWrite: false });
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat));
      }
      const label = tag(p.name, 'tag', kind === 'planned' ? 'phase ' + p.phase : null, p.tier);
      const pos = base.clone().add(new THREE.Vector3(0, H / 2, 0));
      prisms.set(p.id, {
        id: p.id, tier: t.id, kind, mesh, look, crownMat, lineMat, colour, pos, angle: a, label,
        top: base.clone().add(new THREE.Vector3(0, H + 0.14, 0)),
        crownAt: base.clone().add(new THREE.Vector3(0, H + 0.03, 0)),
        cur: { light: 0, shell: 0, crown: 0, s: 1 },
      });
    });
  });

  // The heart: a dais, and a pillar of light rising from it to the cross.
  const daisH = topY + 0.4;
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(CORE, CORE, daisH, 96, 1), new THREE.ShaderMaterial({
    uniforms: { uRim: { value: GOLD.clone() }, uGlow: { value: 1.6 }, uR: { value: CORE }, uInner: { value: 99 }, uTop: { value: topY + 0.14 }, uReveal: { value: 1 } },
    vertexShader: stepVS,
    fragmentShader: stepFS,
  }));
  dais.position.y = topY + 0.14 - daisH / 2;
  scene.add(dais);

  const pillarBase = topY + 0.14;
  const pillarH = crossY - 0.42 - pillarBase;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.05, pillarH, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.6).multiplyScalar(2.4) }),
  );
  pillar.position.y = pillarBase + pillarH / 2;
  scene.add(pillar);
  // Its soft breath of light, wider and fading upward.
  {
    const geo = new THREE.CylinderGeometry(0.16, 0.28, pillarH, 24, 8, true);
    const p = geo.attributes.position, col = new Float32Array(p.count * 4);
    for (let v = 0; v < p.count; v++) {
      const u = p.getY(v) / pillarH + 0.5;
      col.set([1.0, 0.82, 0.5, 0.09 * (1 - u * 0.7)], v * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const breath = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...additive }));
    breath.position.copy(pillar.position);
    scene.add(breath);
  }

  const cross = new THREE.Group();
  const crossMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.82, 0.48).multiplyScalar(3.2) });
  cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.86, 0.07), crossMat));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), crossMat);
  arm.position.y = 0.16;
  cross.add(arm);
  cross.position.y = crossY;
  scene.add(cross);
  const crossHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xf6d88e, opacity: 0.35, ...additive }));
  crossHalo.scale.setScalar(2.6);
  crossHalo.position.y = crossY;
  scene.add(crossHalo);

  // Light falling from the cross, faint, over the whole of the steps.
  {
    const hgt = crossY + 0.3;
    const geo = new THREE.CylinderGeometry(0.2, maxR * 0.95, hgt, 64, 12, true);
    const p = geo.attributes.position, col = new Float32Array(p.count * 4);
    for (let v = 0; v < p.count; v++) {
      const u = p.getY(v) / hgt + 0.5;
      col.set([1.0, 0.84, 0.55, 0.05 * u * u], v * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const shaft = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...additive }));
    shaft.position.y = hgt / 2 - 0.3;
    shaft.layers.set(1);
    scene.add(shaft);
  }

  // Dust turning slowly in the light.
  const MOTES = 120;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTES * 3);
  for (let m = 0; m < MOTES; m++) {
    const y = Math.random() * (crossY + 0.4) - 0.4;
    const reach = 0.3 + (1 - y / crossY) * (maxR - 0.8);
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * reach;
    motePos.set([Math.sin(a) * d, y, Math.cos(a) * d], m * 3);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: glowTex, color: 0xf2d58a, size: 0.06, opacity: 0.45, ...additive }));
  motes.layers.set(1);
  scene.add(motes);

  // A ring of light at the foot of the chosen tower.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.33, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, ...additive, side: THREE.DoubleSide }),
  );
  marker.visible = false;
  scene.add(marker);

  // ── Threads of gold between the towers that touch ────────────────
  const threads = [];
  const seen = new Set();
  for (const p of panes) {
    for (const t of p.touches || []) {
      const key = [p.id, t].sort().join('|');
      if (!byId[t] || seen.has(key)) continue;
      seen.add(key);
      const a = prisms.get(p.id).crownAt, b = prisms.get(t).crownAt;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const out = new THREE.Vector3(mid.x, 0, mid.z);
      if (out.lengthSq() < 0.09) out.set(Math.sin(seen.size), 0, Math.cos(seen.size));
      out.normalize().multiplyScalar(0.25);
      const lift = 0.5 + a.distanceTo(b) * 0.16;
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid.add(out).add(new THREE.Vector3(0, lift, 0)), b.clone());
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000, ...additive });
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.009, 5, false), mat));
      threads.push({ a: p.id, b: t, ta: p.tier, tb: byId[t].tier, curve, mat, cur: 0 });
    }
  }
  // Sparks that run along the lit threads, outward from the chosen tower.
  const sparks = Array.from({ length: 12 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, 0.9, 0.7).multiplyScalar(2), opacity: 0.9, ...additive }));
    s.scale.setScalar(0.22);
    s.visible = false;
    scene.add(s);
    return { s, curve: null, fwd: true, phase: 0 };
  });

  // ── Glow: the brightest light blooms, as it does at dusk ──────────
  // The scene is drawn once more at half size into a float buffer, its
  // brightest parts kept and blurred at two scales, and the blur laid over
  // the finished picture. Drawn this way the picture keeps the canvas's own
  // smooth edges, and the glow can simply be left off on a slow device.
  const glow = (() => {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    const src = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const a = new THREE.WebGLRenderTarget(1, 1, opts), b = new THREE.WebGLRenderTarget(1, 1, opts);
    const c = new THREE.WebGLRenderTarget(1, 1, opts), d = new THREE.WebGLRenderTarget(1, 1, opts);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const pass = { depthTest: false, depthWrite: false };
    const bright = new THREE.ShaderMaterial({
      ...pass,
      uniforms: { tSrc: { value: null }, uThreshold: { value: 0.72 }, uKnee: { value: 0.4 } },
      vertexShader: QUAD_VS,
      fragmentShader: `
        uniform sampler2D tSrc; uniform float uThreshold, uKnee; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb;
          float l = max(c.r, max(c.g, c.b));
          float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
          soft = soft * soft / (4.0 * uKnee + 1e-4);
          gl_FragColor = vec4(c * max(soft, l - uThreshold) / max(l, 1e-4), 1.0);
        }`,
    });
    const blur = new THREE.ShaderMaterial({
      ...pass,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS,
      fragmentShader: `
        uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
          c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
          c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const blend = new THREE.ShaderMaterial({
      ...pass,
      transparent: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: { tNear: { value: a.texture }, tFar: { value: d.texture }, uStrength: { value: 0.9 } },
      vertexShader: QUAD_VS,
      fragmentShader: `
        uniform sampler2D tNear, tFar; uniform float uStrength; varying vec2 vUv;
        void main() {
          vec3 g = (texture2D(tNear, vUv).rgb * 0.6 + texture2D(tFar, vUv).rgb * 1.1) * uStrength;
          gl_FragColor = vec4(1.0 - exp(-g), 1.0);
        }`,
    });
    function run(mat, target) {
      quad.material = mat;
      renderer.setRenderTarget(target);
      renderer.render(quadScene, cam);
    }
    return {
      on: true,
      size(pw, ph) {
        const hw = Math.max(1, Math.round(pw / 2)), hh = Math.max(1, Math.round(ph / 2));
        const qw = Math.max(1, Math.round(pw / 4)), qh = Math.max(1, Math.round(ph / 4));
        src.setSize(hw, hh); a.setSize(hw, hh); b.setSize(hw, hh);
        c.setSize(qw, qh); d.setSize(qw, qh);
        this.hw = hw; this.hh = hh; this.qw = qw; this.qh = qh;
      },
      draw() {
        // The bright parts of the scene, without the sky, stars and ground.
        camera.layers.disable(1);
        renderer.setRenderTarget(src);
        renderer.clear();
        renderer.render(scene, camera);
        camera.layers.enable(1);
        bright.uniforms.tSrc.value = src.texture; run(bright, a);
        blur.uniforms.tSrc.value = a.texture; blur.uniforms.uDir.value.set(1 / this.hw, 0); run(blur, b);
        blur.uniforms.tSrc.value = b.texture; blur.uniforms.uDir.value.set(0, 1 / this.hh); run(blur, a);
        blur.uniforms.tSrc.value = a.texture; blur.uniforms.uDir.value.set(1.5 / this.qw, 0); run(blur, c);
        blur.uniforms.tSrc.value = c.texture; blur.uniforms.uDir.value.set(0, 1.5 / this.qh); run(blur, d);
        blur.uniforms.tSrc.value = d.texture; blur.uniforms.uDir.value.set(3 / this.qw, 0); run(blur, c);
        blur.uniforms.tSrc.value = c.texture; blur.uniforms.uDir.value.set(0, 3 / this.qh); run(blur, d);
      },
      over() { quad.material = blend; renderer.render(quadScene, cam); },
    };
  })();

  // ── Labels: real text, laid over the canvas ──────────────────────
  function tag(text, cls, extra, tier) {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    if (extra) {
      const em = document.createElement('em');
      em.textContent = extra;
      el.append(em);
    }
    el.style.setProperty('--c', colourOf(tier));
    tagHost.append(el);
    return el;
  }

  // ── State ────────────────────────────────────────────────────────
  // What the camera is telling: one tower (selected, with its lit
  // neighbours), one tier, a chosen set, or (all null) the whole city.
  const state = { selected: null, lit: new Set(), tier: null, set: null, hover: null, focus: null };
  const reveal = new Map([...tierAt.keys()].map(id => [id, 1]));
  let introT = null;                 // seconds into the opening shot, or null
  const INTRO = 4.6;
  // At rest the camera looks down on the whole of it from a little above, so
  // the steps read as rings, and stands back far enough for all of it.
  const REST_PHI = 1.0;
  const home = new THREE.Vector3(0, crossY * 0.42, 0);
  const view = { theta: 0.5, phi: REST_PHI, dist: 20, target: home.clone() };
  const goal = { theta: 0.5, phi: REST_PHI, dist: 20, target: home.clone() };
  let fit = 20, w = 1, h = 1, offY = 0, offX = 0, lastInput = performance.now();
  let active = true, onScreen = true, pageShown = !document.hidden, raf = 0, last = 0, ready = false, settled = false;
  const running = () => active && onScreen && pageShown;

  function nearestTurn(to) { return to + TAU * Math.round((goal.theta - to) / TAU); }

  function clearSparks() { sparks.forEach(s => { s.s.visible = false; s.curve = null; }); }

  function restShot() {
    goal.target.copy(home);
    goal.phi = REST_PHI;
    goal.dist = fit;
  }

  // A tier fills the frame: looking down a little onto its step.
  function tierShot(id) {
    const { y, r } = tierAt.get(id);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const half = r + 0.6;
    // Fit the part of the screen the card, the bars and the rail leave open,
    // with room to spare, never closer than half the rest view.
    const band = bandOf(h);
    const openH = band ? Math.max(0.3, (band.bottom - band.top) / h) : 1;
    const openW = band ? Math.max(0.4, (band.right - band.left) / w) : 1;
    goal.target.set(0, y + 0.55, 0);
    goal.phi = 0.88;
    goal.dist = Math.max(half / (t * camera.aspect * openW), (half * 0.75 + 1.2) / (t * openH)) * 1.15;
    goal.dist = THREE.MathUtils.clamp(goal.dist, fit * 0.5, fit);
  }

  function told() {
    endIntro();
    stage.classList.toggle('has-selection', !!(state.selected || state.tier || state.set));
    if (reducedMotion) snap();
    lastInput = performance.now();
    wake();
  }

  function showTier(id) {
    state.selected = null; state.lit = new Set(); state.set = null;
    state.tier = id && tierAt.has(id) ? id : null;
    clearSparks();
    if (state.tier) tierShot(state.tier); else restShot();
    told();
  }

  function showSet(ids) {
    state.selected = null; state.lit = new Set(); state.tier = null;
    state.set = ids && ids.length ? new Set(ids) : null;
    clearSparks();
    restShot();
    told();
  }

  function select(id, lit) {
    endIntro();
    state.selected = id;
    state.tier = null; state.set = null;
    state.lit = new Set(lit || []);
    if (id) {
      const p = prisms.get(id);
      goal.target.copy(p.pos);
      goal.theta = nearestTurn(p.angle);
      goal.phi = 1.05;
      goal.dist = Math.min(goal.dist, fit * 0.6);
      // Send a spark out along each lit thread.
      let n = 0;
      clearSparks();
      threads.forEach(t => {
        if (n >= sparks.length || (t.a !== id && t.b !== id)) return;
        Object.assign(sparks[n++], { curve: t.curve, fwd: t.a === id, phase: Math.random() });
      });
    } else {
      restShot();
      clearSparks();
    }
    told();
  }

  // The opening shot: the camera begins beside the cross and draws back down
  // the steps while the light wakes each one from the top. Any touch ends it
  // early, gliding straight to where it was going.
  function startIntro() {
    if (reducedMotion) return;
    introT = 0;
    reveal.forEach((_, id) => reveal.set(id, 0));
    stage.dataset.intro = 'playing';
  }
  function endIntro() {
    if (introT === null) return;
    introT = null;
    reveal.forEach((_, id) => reveal.set(id, 1));
    stage.dataset.intro = 'done';
    wake();
  }

  function focus(id) {
    state.focus = id;
    // Turn the city so a tower reached by keyboard faces the visitor.
    if (id) goal.theta = nearestTurn(prisms.get(id).angle);
    lastInput = performance.now();
    wake();
  }

  function snap() {
    view.theta = goal.theta; view.phi = goal.phi; view.dist = goal.dist;
    view.target.copy(goal.target);
  }

  // ── Sizing ───────────────────────────────────────────────────────
  function resize() {
    w = Math.max(1, canvas.clientWidth);
    h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    glow.size(Math.round(w * pixelRatio), Math.round(h * pixelRatio));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Far enough back that the whole of it, cross to widest step, fits
    // between the top bar and the dock with a little room on every side.
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const old = fit;
    const halfW = maxR + 0.3;
    const halfH = ((crossY + 0.8) / 2) * Math.sin(REST_PHI) + maxR * Math.cos(REST_PHI);
    const open = Math.max(0.5, (h - 150) / h); // the top bar and the dock
    fit = Math.max(halfH / (t * open), halfW / (t * camera.aspect)) * 1.1;
    goal.dist *= fit / old;
    view.dist *= fit / old;
    if (state.tier) tierShot(state.tier);
    wake();
  }
  new ResizeObserver(resize).observe(stage);

  // ── Input: drag to turn, pinch or wheel to draw near, tap to choose ─
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector3();

  function screenOf(id) {
    const r = canvas.getBoundingClientRect();
    v.copy(prisms.get(id).pos).project(camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  function pickAt(cx, cy, grace = true) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(prismMeshes, false)[0];
    if (hit) return hit.object.userData.id;
    if (!grace) return null;
    // A fingertip's grace: the nearest tower within reach of the tap.
    let best = null, bd = 30 * 30;
    for (const p of prisms.values()) {
      const s = screenOf(p.id);
      const d = (s.x - cx) ** 2 + (s.y - cy) ** 2;
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }

  // The nave fills the screen, so every gesture belongs to the camera: one
  // finger (or the mouse) turns the city any way, two fingers pinch to draw
  // near and drag to slide the view, the wheel zooms, a right-drag slides.
  const pts = new Map();
  let down = null, pinch0 = 0, dist0 = 0, mid0 = null, panning = false;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const midpoint = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const clampDist = d => THREE.MathUtils.clamp(d, fit * 0.2, fit * 1.5);
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  function slide(dx, dy) {
    // Move the point the camera circles, in the plane of the screen, then keep
    // it within the city's reach so the view can never be lost.
    const per = (2 * goal.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    goal.target.addScaledVector(right, -dx * per).addScaledVector(up, dy * per);
    goal.target.x = THREE.MathUtils.clamp(goal.target.x, -maxR, maxR);
    goal.target.z = THREE.MathUtils.clamp(goal.target.z, -maxR, maxR);
    goal.target.y = THREE.MathUtils.clamp(goal.target.y, -0.5, crossY);
  }

  canvas.addEventListener('pointerdown', e => {
    if (introT !== null) { endIntro(); return; }
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastInput = performance.now();
    if (pts.size === 1) { down = { x: e.clientX, y: e.clientY, t: lastInput, moved: 0 }; panning = e.button === 2 || e.shiftKey; }
    if (pts.size === 2) { pinch0 = spread(); dist0 = goal.dist; mid0 = midpoint(); down = null; }
    wake();
  });
  canvas.addEventListener('pointermove', e => {
    const prev = pts.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') {
        const id = pickAt(e.clientX, e.clientY, false);
        if (id !== state.hover) { state.hover = id; canvas.classList.toggle('is-pointing', !!id); wake(); }
      }
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastInput = performance.now();
    if (pts.size === 1 && down) {
      down.moved += Math.abs(dx) + Math.abs(dy);
      if (down.moved > 6) {
        if (panning) slide(dx, dy);
        else {
          goal.theta -= dx * 0.008;
          goal.phi = THREE.MathUtils.clamp(goal.phi - dy * 0.006, 0.35, 1.5);
        }
      }
    } else if (pts.size === 2) {
      goal.dist = clampDist(dist0 * (pinch0 / spread()));
      const m = midpoint();
      slide(m.x - mid0.x, m.y - mid0.y);
      mid0 = m;
    }
    wake();
  });
  const release = e => {
    if (!pts.has(e.pointerId)) return;
    const tap = e.type === 'pointerup' && down && pts.size === 1 && down.moved <= 8 && performance.now() - down.t < 600;
    pts.delete(e.pointerId);
    if (pts.size === 0) down = null;
    if (tap) onPick(pickAt(e.clientX, e.clientY));
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerleave', () => { if (state.hover) { state.hover = null; canvas.classList.remove('is-pointing'); wake(); } });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    endIntro();
    goal.dist = clampDist(goal.dist * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    lastInput = performance.now();
    wake();
  }, { passive: false });

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); onLost && onLost(); });

  // ── The frame ────────────────────────────────────────────────────
  const ease = (cur, to, k) => cur + (to - cur) * k;

  function level(p) {
    if (state.selected) return p.id === state.selected ? 3 : state.lit.has(p.id) ? 2 : 0;
    if (state.tier) return p.tier === state.tier ? 2 : 0;
    if (state.set) return state.set.has(p.id) ? 2 : 0;
    return 1;
  }
  const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

  function placeTag(el, x, y, show, cls = '') {
    if (show) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${cls}`;
    if (el._on !== show) { el._on = show; el.classList.toggle('on', show); }
  }

  // Quality steps down on a device that cannot keep up: first the glow,
  // then the sharpness. (?quality=high, or a test, can hold it.)
  let slow = 0, quick = 0;
  function adapt(dt) {
    if (window.__naveQuality === 'high') return;
    if (dt > 1 / 28) { slow++; quick = 0; } else { quick++; slow = 0; }
    if (slow > 50) {
      slow = 0;
      if (glow.on) glow.on = false;
      else if (pixelRatio > 1) { pixelRatio = 1; resize(); }
    }
  }

  const warmWhite = new THREE.Color(1, 0.9, 0.72);

  function frame(now) {
    raf = 0;
    // Left alone for a while, the city keeps breathing at a gentler pace.
    if (settled && now - lastInput > 20000 && last && now - last < 50) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    if (last) adapt((now - last) / 1000);
    last = now;
    time.value = now / 1000;
    const idle = now - lastInput > 5000;
    // The city turns slowly by itself, a little faster while a tier is told.
    if (!state.selected && !pts.size && !reducedMotion && (idle || state.tier)) goal.theta += dt * (state.tier ? 0.08 : 0.05);

    if (introT !== null) {
      introT += dt;
      for (const [id, { i }] of tierAt) reveal.set(id, smooth((introT - 0.7 - i * 0.4) / 0.8));
      const u = smooth(introT / (INTRO - 0.4));
      view.target.set(0, THREE.MathUtils.lerp(crossY - 0.3, home.y, u), 0);
      view.dist = THREE.MathUtils.lerp(fit * 0.28, goal.dist, u);
      view.phi = THREE.MathUtils.lerp(1.42, goal.phi, u);
      view.theta = goal.theta - (1 - u) * 1.2;
      if (introT >= INTRO) endIntro();
    } else {
      const kc = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.6);
      view.theta = ease(view.theta, goal.theta, kc);
      view.phi = ease(view.phi, goal.phi, kc);
      view.dist = ease(view.dist, goal.dist, kc);
      view.target.lerp(goal.target, kc);
    }
    const s = Math.sin(view.phi);
    camera.position.set(
      view.target.x + view.dist * s * Math.sin(view.theta),
      view.target.y + view.dist * Math.cos(view.phi),
      view.target.z + view.dist * s * Math.cos(view.theta),
    );
    camera.lookAt(view.target);

    // Keep what is told in the part of the screen the card and bars leave open.
    const band = state.selected || state.tier || state.set ? bandOf(h) : null;
    const want = band ? h / 2 - (band.top + band.bottom) / 2 : 0;
    const wantX = band ? w / 2 - (band.left + band.right) / 2 : 0;
    const ko = reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
    offY = ease(offY, want, ko);
    offX = ease(offX, wantX, ko);
    if (Math.abs(offY) > 0.5 || Math.abs(offX) > 0.5) camera.setViewOffset(w, h, offX, offY, w, h);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.updateMatrixWorld();

    const k = 1 - Math.exp(-dt * 6);
    let settling = introT !== null || Math.abs(goal.theta - view.theta) > 1e-3 || Math.abs(goal.dist - view.dist) > 1e-2 ||
      view.target.distanceToSquared(goal.target) > 1e-4 || Math.abs(want - offY) > 0.5 || Math.abs(wantX - offX) > 0.5;

    for (const p of prisms.values()) {
      const L = LOOK[p.kind], i = level(p);
      const near = p.id === state.hover || p.id === state.focus;
      const r = reveal.get(p.tier);
      const to = {
        light: (L.light[i] + (near ? 0.25 : 0)) * r,
        shell: L.shell[i] * (0.25 + 0.75 * r),
        crown: (L.crown[i] + (near ? 0.6 : 0)) * r,
        s: i === 3 ? 1.08 : 1,
      };
      for (const key in to) {
        const d = to[key] - p.cur[key];
        if (Math.abs(d) > 1e-3) { p.cur[key] += d * k; settling = true; }
      }
      p.look.uniforms.uLight.value = p.cur.light;
      p.look.uniforms.uShell.value = p.cur.shell;
      p.crownMat.color.copy(p.colour).lerp(warmWhite, 0.5).multiplyScalar(p.cur.crown);
      if (p.lineMat) p.lineMat.opacity = Math.min(1, p.cur.shell * 0.7);
      p.mesh.scale.set(1, p.cur.s, 1);
    }
    const woven = introT === null ? 1 : smooth((introT - 3.2) / 1);
    for (const t of threads) {
      let to;
      if (state.selected) to = t.a === state.selected || t.b === state.selected ? 1.5 : 0.02;
      else if (state.tier) to = t.ta === state.tier && t.tb === state.tier ? 0.9 : t.ta === state.tier || t.tb === state.tier ? 0.45 : 0.02;
      else if (state.set) to = 0.03;
      else to = 0.05 * woven;
      t.cur = ease(t.cur, to, k);
      t.mat.color.copy(GOLD).multiplyScalar(t.cur);
    }
    const selTier = state.selected ? byId[state.selected].tier : state.tier;
    for (const [id, r] of rims) {
      r.cur = ease(r.cur, (!selTier ? (state.set ? 0.5 : 1.1) : id === selTier ? 2.2 : 0.35) * reveal.get(id), k);
      r.mat.uniforms.uGlow.value = r.cur;
    }
    if (state.selected) {
      const p = prisms.get(state.selected);
      marker.visible = true;
      marker.position.set(p.pos.x, tierAt.get(p.tier).y + 0.01, p.pos.z);
      marker.material.color.copy(p.colour).lerp(warmWhite, 0.4).multiplyScalar(1.4 + 0.4 * Math.sin(now / 500));
    } else marker.visible = false;
    for (const sp of sparks) {
      if (!sp.curve) continue;
      const t = (now / 1000 * 0.35 + sp.phase) % 1;
      sp.curve.getPoint(sp.fwd ? t : 1 - t, sp.s.position);
      sp.s.material.opacity = Math.sin(t * Math.PI) * 0.95;
      sp.s.visible = true;
    }
    cross.rotation.y = view.theta;
    if (!reducedMotion) {
      const arr = moteGeo.attributes.position.array;
      for (let m = 1; m < arr.length; m += 3) { arr[m] += dt * 0.1; if (arr[m] > crossY) arr[m] = -0.4; }
      moteGeo.attributes.position.needsUpdate = true;
    }

    if (glow.on) glow.draw();
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    if (glow.on) glow.over();

    // Labels: whatever the camera is telling (one tower and its neighbours,
    // a tier, or a chosen few), and whatever is under the pointer or the
    // keyboard. The most important are placed first, and a label that would
    // overlap one already placed waits until the city turns and makes room.
    const placed = [];
    const queue = [];
    const sinT = Math.sin(view.theta), cosT = Math.cos(view.theta);
    for (const p of prisms.values()) {
      const show = introT === null && (p.id === state.hover || p.id === state.focus || level(p) >= 2);
      if (!show) { placeTag(p.label, 0, 0, false); continue; }
      v.copy(p.top).project(camera);
      const facing = p.pos.x * sinT + p.pos.z * cosT;
      const rank = p.id === state.selected ? 1e3 : (p.id === state.hover || p.id === state.focus) ? 500 : facing;
      queue.push({ p, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z, rank, facing });
    }
    queue.sort((a, b) => b.rank - a.rank);
    for (const t of queue) {
      const el = t.p.label;
      el.classList.toggle('is-sel', t.p.id === state.selected);
      el.classList.toggle('is-focus', t.p.id === state.focus);
      if (!el._w) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
      const left = Math.max(4, Math.min(t.x - el._w / 2, w - el._w - 4));
      const top = t.y - el._h;
      const box = { l: left - 3, r: left + el._w + 3, t: top - 2, b: top + el._h + 2 };
      const ok = t.z < 1 && t.y > el._h * 0.5 && t.y < h + 10 &&
        !placed.some(o => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
      if (ok) placed.push(box);
      // Towers on the far side of the city read a little fainter.
      el.style.setProperty('--fade', t.facing < -0.3 && t.rank < 500 ? '0.62' : '1');
      placeTag(el, left, top, ok);
    }

    if (!ready) { ready = true; stage.dataset.ready = '1'; }
    // The dust, the windows and the slow turn keep it alive; with reduced
    // motion asked for, it rests as soon as everything has settled.
    settled = !settling;
    if ((!reducedMotion || settling) && running()) raf = requestAnimationFrame(frame);
  }

  function wake() {
    settled = false;
    if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); }
  }

  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); }).observe(stage);
  document.addEventListener('visibilitychange', () => { pageShown = !document.hidden; wake(); });

  resize();
  goal.dist = view.dist = fit;
  stage.dataset.intro = 'done';
  wake();

  return {
    reset() { restShot(); goal.theta = nearestTurn(0.5); told(); },
    select,
    showTier,
    showSet,
    startIntro,
    endIntro,
    focus,
    setActive(on) { active = on; if (on) { resize(); wake(); } },
    // For the tests: where a tower stands on screen, and which tower a point hits.
    screenOf,
    pickAt,
  };
}
