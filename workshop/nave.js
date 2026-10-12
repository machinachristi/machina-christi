// The Workshop nave: the same glass as the 2D window (workshop/glass.json),
// raised into a stepped tower of terraces, one for each tier, from the
// workbench at its foot up to "in your hands" nearest the light. Each
// technology is a prism of coloured glass; planned ones are clear, waiting to
// be lit. Golden threads join the panes that touch, and light falls from a
// cross above through every terrace.
//
// It tells its story with the camera: an opening shot in which the light
// falls from the cross and wakes each terrace in turn, then shots the page
// asks for: a whole tier (the guided walk and the tier rail), one pane and
// its neighbours, or a chosen few (the road ahead).
//
// The page (workshop.html) owns the data, the selection, the walk and the
// panel; this module only draws, and reports taps. It uses the three.js Eden already
// ships (world-app/vendor), so the Workshop downloads nothing new.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const STEP = 1.15;          // height between terraces
const PRISM_H = 0.95;
const GOLD = 0xf2d58a;

// How brightly each prism burns: dimmed, resting, lit by a neighbour,
// selected. Live glass glows in its tier's colour; planned glass is clear.
const LOOK = {
  live:    { e: [0.10, 0.55, 0.95, 1.6],  o: [0.35, 0.92, 0.96, 1],    g: [0.03, 0.30, 0.55, 0.95], l: [0.25, 0.6, 0.7, 0.8] },
  planned: { e: [0.02, 0.06, 0.30, 0.55], o: [0.08, 0.22, 0.32, 0.4],  g: [0, 0, 0.18, 0.4],        l: [0.2, 0.7, 0.95, 1] },
};

export function createNave({ stage, canvas, tagHost, data, colourOf, onPick, coverOf, reducedMotion, onLost }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0a08, 20, 52);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 140);
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x1a140c, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.5);
  sun.position.set(3, 16, 7);
  scene.add(sun);

  // A soft round glow, drawn once and shared by every halo and mote.
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  // ── Terraces and prisms ──────────────────────────────────────────
  const panes = data.panes;
  const byId = Object.fromEntries(panes.map(p => [p.id, p]));
  const tiers = data.tiers.filter(t => panes.some(p => p.tier === t.id));
  const N = tiers.length;
  const topY = (N - 1) * STEP;
  const ringR = i => 1.3 + i * 0.6;
  const maxR = ringR(N - 1) + 0.65;

  const stone = new THREE.MeshStandardMaterial({ color: 0x241d14, roughness: 0.85, metalness: 0.05 });
  const prismGeo = new THREE.CylinderGeometry(0.3, 0.3, PRISM_H, 6);
  const edgeGeo = new THREE.EdgesGeometry(prismGeo);
  const prisms = new Map();
  const prismMeshes = [];
  const rims = new Map();
  const tierAt = new Map(); // tier id → { i, y, r }

  tiers.forEach((t, i) => {
    const y = topY - i * STEP;
    const r = ringR(i);
    const colour = new THREE.Color(`rgb(${colourOf(t.id)})`);

    const terrace = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.55, r + 0.65, 0.14, 72), stone);
    terrace.position.y = y - 0.07;
    scene.add(terrace);
    const rimMat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.64, 0.022, 6, 120), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y - 0.02;
    scene.add(rim);
    rims.set(t.id, { mat: rimMat, cur: 0 });
    tierAt.set(t.id, { i, y, r });

    const inTier = panes.filter(p => p.tier === t.id);
    const offset = i * 2.39996; // the golden angle, so no two terraces line up
    inTier.forEach((p, k) => {
      const a = offset + (k * TAU) / inTier.length;
      const pos = new THREE.Vector3(Math.sin(a) * r, y + 0.04 + PRISM_H / 2, Math.cos(a) * r);
      const kind = p.status === 'planned' ? 'planned' : 'live';
      const look = LOOK[kind];
      const mat = kind === 'live'
        ? new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: look.e[1], roughness: 0.3, transparent: true, opacity: look.o[1] })
        : new THREE.MeshStandardMaterial({ color: 0xf4ecd8, emissive: colour, emissiveIntensity: look.e[1], roughness: 0.1, transparent: true, opacity: look.o[1], depthWrite: false });
      const mesh = new THREE.Mesh(prismGeo, mat);
      mesh.position.copy(pos);
      mesh.rotation.y = a;
      mesh.userData.id = p.id;
      scene.add(mesh);
      prismMeshes.push(mesh);
      // Lead lines on lit glass; a coloured outline on clear glass.
      const lineMat = new THREE.LineBasicMaterial({ color: kind === 'live' ? 0x070605 : colour.clone().lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: look.l[1] });
      const lines = new THREE.LineSegments(edgeGeo, lineMat);
      mesh.add(lines);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: colour, opacity: look.g[1], ...additive }));
      halo.scale.setScalar(1.7);
      halo.position.copy(pos);
      scene.add(halo);
      const label = tag(p.name, 'tag', kind === 'planned' ? 'phase ' + p.phase : null, p.tier);
      prisms.set(p.id, {
        id: p.id, tier: t.id, kind, mesh, mat, lineMat, halo, pos, angle: a, label, on: false,
        top: pos.clone().add(new THREE.Vector3(0, PRISM_H / 2 + 0.12, 0)),
        cur: { e: 0, o: 0, g: 0, l: 0, s: 1 },
      });
    });
  });

  // The spine the terraces hang on, and the cross the light falls from.
  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, topY + 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0x6b5520, emissive: 0x2a2008, roughness: 0.5, metalness: 0.4 }),
  );
  spine.position.y = (topY + 1.6) / 2 - 0.3;
  scene.add(spine);

  const crossY = topY + 2.1;
  const cross = new THREE.Group();
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8c25a });
  const upright = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9, 0.09), crossMat);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.09), crossMat);
  beam.position.y = 0.17;
  cross.add(upright, beam);
  cross.position.y = crossY;
  scene.add(cross);
  const crossGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xf2d58a, opacity: 0.5, ...additive }));
  crossGlow.scale.setScalar(3);
  crossGlow.position.y = crossY;
  scene.add(crossGlow);

  // Light falling from the cross, brightest above and fading toward the foot.
  {
    const h = crossY + 0.6;
    const geo = new THREE.CylinderGeometry(0.3, maxR + 0.4, h, 48, 10, true);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 4);
    const gold = new THREE.Color(GOLD);
    for (let v = 0; v < pos.count; v++) {
      const t = pos.getY(v) / h + 0.5; // 0 at the foot, 1 at the cross
      col.set([gold.r, gold.g, gold.b, 0.09 * t * t], v * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const shaft = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...additive }));
    shaft.position.y = h / 2 - 0.6;
    scene.add(shaft);
  }

  // Dust turning slowly in the light.
  const MOTES = 140;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTES * 3);
  for (let m = 0; m < MOTES; m++) {
    const y = Math.random() * (crossY + 0.4) - 0.4;
    const reach = 0.4 + (1 - y / crossY) * (maxR - 0.6);
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * reach;
    motePos.set([Math.sin(a) * d, y, Math.cos(a) * d], m * 3);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: glowTex, color: GOLD, size: 0.09, opacity: 0.5, ...additive }));
  scene.add(motes);

  // ── Threads between the panes that touch ─────────────────────────
  const threads = [];
  const seen = new Set();
  for (const p of panes) {
    for (const t of p.touches || []) {
      const key = [p.id, t].sort().join('|');
      if (!byId[t] || seen.has(key)) continue;
      seen.add(key);
      const a = prisms.get(p.id).pos, b = prisms.get(t).pos;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const out = new THREE.Vector3(mid.x, 0, mid.z);
      if (out.lengthSq() < 0.09) out.set(Math.sin(seen.size), 0, Math.cos(seen.size));
      out.normalize().multiplyScalar(0.8 + a.distanceTo(b) * 0.12);
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid.add(out).add(new THREE.Vector3(0, 0.5, 0)), b.clone());
      const mat = new THREE.MeshBasicMaterial({ color: GOLD, opacity: 0, ...additive });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.016, 5, false), mat);
      scene.add(mesh);
      threads.push({ a: p.id, b: t, ta: p.tier, tb: byId[t].tier, curve, mat, cur: 0 });
    }
  }
  // Sparks that run along the lit threads, outward from the chosen pane.
  const sparks = Array.from({ length: 10 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c8, opacity: 0.9, ...additive }));
    s.scale.setScalar(0.34);
    s.visible = false;
    scene.add(s);
    return { s, curve: null, fwd: true, phase: 0 };
  });

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
  // What the camera is telling: one pane (selected, with its lit
  // neighbours), one tier, a chosen set, or (all null) the whole tower.
  const state = { selected: null, lit: new Set(), tier: null, set: null, hover: null, focus: null };
  const reveal = new Map([...tierAt.keys()].map(id => [id, 1]));
  let introT = null;                 // seconds into the opening shot, or null
  const INTRO = 4.2;
  const home = new THREE.Vector3(0, topY / 2 + 0.3, 0);
  const view = { theta: 0.5, phi: 1.1, dist: 20, target: home.clone() };
  const goal = { theta: 0.5, phi: 1.1, dist: 20, target: home.clone() };
  let fit = 20, w = 1, h = 1, offY = 0, lastInput = performance.now();
  let active = true, onScreen = true, pageShown = !document.hidden, raf = 0, last = 0, ready = false, settled = false;
  const running = () => active && onScreen && pageShown;

  function nearestTurn(to) { return to + TAU * Math.round((goal.theta - to) / TAU); }

  function clearSparks() { sparks.forEach(s => { s.s.visible = false; s.curve = null; }); }

  function restShot() {
    goal.target.copy(home);
    goal.phi = 1.1;
    goal.dist = fit;
  }

  // A tier fills the frame: looking down a little onto its terrace.
  function tierShot(id) {
    const { y, r } = tierAt.get(id);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const half = r + 1.1;
    goal.target.set(0, y + 0.3, 0);
    goal.phi = 0.8;
    goal.dist = Math.max(half / (t * camera.aspect), (half * 0.7 + 1.4) / t, 7);
  }

  function told() {
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
      goal.phi = 1.12;
      goal.dist = Math.min(goal.dist, fit * 0.62);
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
  // the tower while the light wakes each terrace from the top. Any touch
  // ends it early, gliding straight to where it was going.
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
    // Turn the tower so a light reached by keyboard faces the visitor.
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
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Far enough back that the whole tower fits, letting a narrow phone
    // crop the widest terrace a little rather than shrink everything.
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const old = fit;
    fit = Math.max((topY / 2 + 2.4) / t, (maxR / (t * camera.aspect)) * 0.86);
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
    // A fingertip's grace: the nearest light within reach of the tap.
    let best = null, bd = 30 * 30;
    for (const p of prisms.values()) {
      const s = screenOf(p.id);
      const d = (s.x - cx) ** 2 + (s.y - cy) ** 2;
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }

  const pts = new Map();
  let down = null, pinch0 = 0, dist0 = 0;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const clampDist = d => THREE.MathUtils.clamp(d, fit * 0.28, fit * 1.35);

  canvas.addEventListener('pointerdown', e => {
    if (introT !== null) { endIntro(); return; }
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastInput = performance.now();
    if (pts.size === 1) down = { x: e.clientX, y: e.clientY, t: lastInput, moved: 0 };
    if (pts.size === 2) { pinch0 = spread(); dist0 = goal.dist; down = null; }
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
        goal.theta -= dx * 0.008;
        if (e.pointerType === 'mouse') goal.phi = THREE.MathUtils.clamp(goal.phi - dy * 0.006, 0.5, 1.45);
      }
    } else if (pts.size === 2) {
      goal.dist = clampDist(dist0 * (pinch0 / spread()));
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
  canvas.addEventListener('pointerleave', () => { if (state.hover) { state.hover = null; canvas.classList.remove('is-pointing'); wake(); } });
  // The wheel scrolls the page as usual; only a pinch on a trackpad (which
  // arrives as ctrl+wheel) or ctrl/cmd+wheel draws near.
  canvas.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    endIntro();
    goal.dist = clampDist(goal.dist * Math.exp(e.deltaY * 0.004));
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

  function frame(now) {
    raf = 0;
    // Left alone for a while, the nave keeps breathing at a gentler pace.
    if (settled && now - lastInput > 20000 && last && now - last < 50) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const idle = now - lastInput > 5000;
    // The tower turns slowly by itself, a little faster while a tier is told.
    if (!state.selected && !pts.size && !reducedMotion && (idle || state.tier)) goal.theta += dt * (state.tier ? 0.1 : 0.07);

    if (introT !== null) {
      introT += dt;
      const tiersIn = [...tierAt.entries()];
      for (const [id, { i }] of tiersIn) reveal.set(id, smooth((introT - 0.6 - i * 0.38) / 0.7));
      const u = smooth(introT / (INTRO - 0.4));
      view.target.set(0, THREE.MathUtils.lerp(crossY - 0.4, home.y, u), 0);
      view.dist = THREE.MathUtils.lerp(fit * 0.3, goal.dist, u);
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

    // Keep the chosen light in the part of the stage the panel leaves open.
    const want = state.selected || state.tier || state.set ? coverOf(h) : 0;
    offY = ease(offY, want, reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
    if (Math.abs(offY) > 0.5) camera.setViewOffset(w, h, 0, offY, w, h);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.updateMatrixWorld();

    const k = 1 - Math.exp(-dt * 6);
    let settling = introT !== null || Math.abs(goal.theta - view.theta) > 1e-3 || Math.abs(goal.dist - view.dist) > 1e-2 ||
      view.target.distanceToSquared(goal.target) > 1e-4 || Math.abs(want - offY) > 0.5;

    for (const p of prisms.values()) {
      const L = LOOK[p.kind], i = level(p);
      const near = p.id === state.hover || p.id === state.focus;
      const r = reveal.get(p.tier);
      const to = { e: (L.e[i] + (near ? 0.3 : 0)) * r, o: L.o[i] * r, g: (L.g[i] + (near ? 0.15 : 0)) * r, l: L.l[i] * r, s: i === 3 ? 1.18 : near ? 1.08 : 1 };
      for (const key in to) {
        const d = to[key] - p.cur[key];
        if (Math.abs(d) > 1e-3) { p.cur[key] += d * k; settling = true; }
      }
      p.mat.emissiveIntensity = p.cur.e;
      p.mat.opacity = p.cur.o;
      p.halo.material.opacity = p.cur.g;
      p.lineMat.opacity = p.cur.l;
      p.mesh.scale.setScalar(p.cur.s);
    }
    const woven = introT === null ? 1 : smooth((introT - 3) / 1);
    for (const t of threads) {
      let to;
      if (state.selected) to = t.a === state.selected || t.b === state.selected ? 0.85 : 0.03;
      else if (state.tier) to = t.ta === state.tier && t.tb === state.tier ? 0.6 : t.ta === state.tier || t.tb === state.tier ? 0.28 : 0.02;
      else if (state.set) to = 0.03;
      else to = 0.1 * woven;
      t.cur = ease(t.cur, to, k);
      t.mat.opacity = t.cur;
    }
    const selTier = state.selected ? byId[state.selected].tier : state.tier;
    for (const [id, r] of rims) {
      r.cur = ease(r.cur, (!selTier ? (state.set ? 0.25 : 0.45) : id === selTier ? 0.9 : 0.15) * reveal.get(id), k);
      r.mat.opacity = r.cur;
    }
    for (const sp of sparks) {
      if (!sp.curve) continue;
      const t = (now / 1000 * 0.4 + sp.phase) % 1;
      sp.curve.getPoint(sp.fwd ? t : 1 - t, sp.s.position);
      sp.s.material.opacity = Math.sin(t * Math.PI) * 0.9;
      sp.s.visible = true;
    }
    cross.rotation.y = view.theta;
    if (!reducedMotion) {
      const arr = moteGeo.attributes.position.array;
      for (let m = 1; m < arr.length; m += 3) { arr[m] += dt * 0.12; if (arr[m] > crossY) arr[m] = -0.4; }
      moteGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);

    // Labels: whatever the camera is telling (one light and its neighbours,
    // a tier, or a chosen few), and whatever is under the pointer or the
    // keyboard. The most important are placed first, and a label that would
    // overlap one already placed waits until the tower turns and makes room.
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
      // Lights on the far side of the tower read a little fainter.
      el.style.setProperty('--fade', t.facing < -0.3 && t.rank < 500 ? '0.62' : '1');
      placeTag(el, left, top, ok);
    }
    if (!ready) { ready = true; stage.dataset.ready = '1'; }
    // The dust and the slow turn keep it alive; with reduced motion asked
    // for, it rests as soon as everything has settled, to spare the battery.
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
    select,
    showTier,
    showSet,
    startIntro,
    endIntro,
    focus,
    setActive(on) { active = on; if (on) { resize(); wake(); } },
    // For the tests: where a light sits on screen, and which light a point hits.
    screenOf,
    pickAt,
  };
}
