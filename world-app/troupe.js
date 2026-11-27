// The troupe (v46): many moving parts, drawn as one.
//
// A phone's graphics chip is told what to paint one object at a time, and
// each telling (a draw call) costs about the same however small the thing
// is. The garden's creatures were dozens of small moving parts — a lamb's
// body, its head, its four legs; a bird's body and its two wings — so they
// were dozens of draw calls, and the garden had come to stand at the edge
// of the 200 it may spend.
//
// A troupe is like one puppeteer working every puppet on a single set of
// strings. All the parts' shapes are laid into one shape, each corner
// marked with which part it belongs to; every frame, the troupe writes down
// where each part stands (its place, its turn, its size), its colour, and
// whether it is shown, in a small table (a texture of numbers), and the
// chip, painting the whole shape in one draw call, moves each corner to
// where its own part stands.
//
// Nothing about the creatures themselves changes. Every part stays where it
// always was in the scene, still moved by the same code; it is only set on
// a layer the camera does not draw, so that the troupe draws it instead.
// What a part shows — its place, its colour, whether it is hidden, how many
// of an instanced mesh's copies are out — is read from the part itself each
// frame, so a creature that walks, flaps, lies down, hides at night or
// changes colour does so in the troupe exactly as it did before.
//
// Only plain, solid parts are taken (one Lambert material, opaque, no
// glow, no texture, no shader of their own); anything else is left to draw
// itself as it always has.

import * as THREE from 'three';

const UNSEEN = 30;   // the layer the camera does not draw: where the parts stand in

// Whether this part can be drawn by a troupe at all.
function fits(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.isBatchedMesh) return false;
  const m = o.material;
  if (!m || Array.isArray(m) || !m.isMeshLambertMaterial) return false;
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.wireframe) return false;
  if (m.map || m.alphaMap || m.emissiveMap || m.lightMap || m.aoMap || m.envMap) return false;
  if (m.emissive && m.emissive.getHex() !== 0) return false;
  // A material or a part with its own hook into the drawing keeps it.
  if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) return false;
  if (Object.prototype.hasOwnProperty.call(o, 'onBeforeRender')) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position || !g.attributes.normal) return false;
  if (g.morphAttributes && Object.keys(g.morphAttributes).length) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  if (o.layers.mask !== 1) return false;
  return true;
}

// Parts that may share one troupe must be drawn the same way in all but colour.
const kindOf = m => [m.side, m.flatShading, m.fog, m.depthTest, m.depthWrite, m.colorWrite].join('|');

// What a troupe adds to the Lambert shader: each corner's part, looked up in
// the table, moves it into place, turns its normal, and tints its colour.
// The table has one row per part: four texels holding the columns of its
// place-turn-size matrix (xyz) and its colour (the w of the first three).
const PARS = /* glsl */ `
attribute float aPart;
uniform highp sampler2D uParts;
`;
const FETCH = /* glsl */ `
mat4 troupeM;
vec3 troupeTint;
{
  int row = int(aPart + 0.5);
  vec4 c0 = texelFetch(uParts, ivec2(0, row), 0);
  vec4 c1 = texelFetch(uParts, ivec2(1, row), 0);
  vec4 c2 = texelFetch(uParts, ivec2(2, row), 0);
  vec4 c3 = texelFetch(uParts, ivec2(3, row), 0);
  troupeM = mat4(vec4(c0.xyz, 0.0), vec4(c1.xyz, 0.0), vec4(c2.xyz, 0.0), vec4(c3.xyz, 1.0));
  troupeTint = vec3(c0.w, c1.w, c2.w);
}
#if defined( USE_COLOR )
  vColor.rgb *= troupeTint;
#endif
`;
// A normal is turned by the part's turn and unstretched by its size (the
// inverse transpose of a turn-and-size matrix, written out).
const NORMAL = /* glsl */ `
{
  mat3 tm = mat3(troupeM);
  vec3 s2 = max(vec3(dot(tm[0], tm[0]), dot(tm[1], tm[1]), dot(tm[2], tm[2])), vec3(1e-10));
  objectNormal = tm * (objectNormal / s2);
}
`;
const PLACE = /* glsl */ `
transformed = (troupeM * vec4(transformed, 1.0)).xyz;
`;

function troupeMaterial(like, table) {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: like.side,
    flatShading: like.flatShading,
    fog: like.fog,
    depthTest: like.depthTest,
    depthWrite: like.depthWrite,
    colorWrite: like.colorWrite,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uParts = { value: table };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <color_vertex>', '#include <color_vertex>\n' + FETCH)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + NORMAL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + PLACE);
  };
  m.customProgramCacheKey = () => 'troupe-1';
  return m;
}

const _m = new THREE.Matrix4();
const _inst = new THREE.Matrix4();
const _c = new THREE.Color();

// Whether a part would be drawn: it and everything it hangs from shown, all
// the way up to the scene itself.
function shown(o, scene) {
  for (let p = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === scene) return true;
  }
  return false;
}

// Builds one troupe for each way of drawing found among the parts under
// `roots`, and adds them to `scene`. Returns { count, parts, troupes } —
// how many troupes, how many parts they took, and the troupe meshes.
export function gatherTroupes(scene, roots) {
  const kinds = new Map();
  for (const root of roots) {
    root.traverse((o) => {
      if (!fits(o)) return;
      const k = kindOf(o.material);
      if (!kinds.has(k)) kinds.set(k, []);
      kinds.get(k).push(o);
    });
  }
  const troupes = [];
  let parts = 0;
  for (const meshes of kinds.values()) {
    // One part alone gains nothing from a troupe.
    const copies = meshes.reduce((n, o) => n + (o.isInstancedMesh ? o.instanceMatrix.count : 1), 0);
    if (copies < 2) continue;
    troupes.push(makeTroupe(scene, meshes));
    parts += copies;
  }
  return { count: troupes.length, parts, troupes: troupes.map(t => t.mesh) };
}

function makeTroupe(scene, meshes) {
  // One entry per part drawn: a mesh, or one copy of an instanced mesh.
  const entries = [];
  for (const o of meshes) {
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.instanceMatrix.count; i++) entries.push({ o, i });
    } else entries.push({ o, i: -1 });
  }
  const rows = entries.length;

  // The one shape: every part's corners, laid end to end, each marked with
  // its row. Corners are kept apart (no shared index), as flat shading needs.
  const flat = new Map();
  const flatOf = (g) => {
    if (!flat.has(g)) flat.set(g, g.index ? g.toNonIndexed() : g);
    return flat.get(g);
  };
  let total = 0;
  for (const e of entries) total += flatOf(e.o.geometry).attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const part = new Float32Array(total);
  let at = 0;
  entries.forEach((e, row) => {
    const g = flatOf(e.o.geometry);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = e.o.material.vertexColors ? g.attributes.color : null;
    for (let v = 0; v < p.count; v++, at++) {
      pos[at * 3] = p.getX(v); pos[at * 3 + 1] = p.getY(v); pos[at * 3 + 2] = p.getZ(v);
      nor[at * 3] = n.getX(v); nor[at * 3 + 1] = n.getY(v); nor[at * 3 + 2] = n.getZ(v);
      if (c) { col[at * 3] = c.getX(v); col[at * 3 + 1] = c.getY(v); col[at * 3 + 2] = c.getZ(v); }
      else { col[at * 3] = 1; col[at * 3 + 1] = 1; col[at * 3 + 2] = 1; }
      part[at] = row;
    }
  });
  for (const [src, g] of flat) if (g !== src) g.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));

  const data = new Float32Array(rows * 16);
  const table = new THREE.DataTexture(data, 4, rows, THREE.RGBAFormat, THREE.FloatType);
  table.magFilter = table.minFilter = THREE.NearestFilter;
  table.generateMipmaps = false;
  table.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, troupeMaterial(meshes[0].material, table));
  mesh.name = 'troupe';
  mesh.frustumCulled = false;      // its parts are everywhere; it is always drawn
  mesh.matrixAutoUpdate = false;   // it stands at the origin: the table places everything

  // Each frame, just before it is drawn (after the scene has worked out
  // where everything stands), the table is written from the parts.
  function sync() {
    for (let row = 0; row < rows; row++) {
      const { o, i } = entries[row];
      const k = row * 16;
      const out = o.material.visible && shown(o, scene) && (i < 0 || i < o.count);
      if (!out) { data.fill(0, k, k + 16); continue; }   // a part not shown shrinks to nothing
      let m = o.matrixWorld;
      _c.copy(o.material.color);
      if (i >= 0) {
        o.getMatrixAt(i, _inst);
        m = _m.multiplyMatrices(o.matrixWorld, _inst);
        if (o.instanceColor) { o.getColorAt(i, _c); _c.multiply(o.material.color); }
      }
      const e = m.elements;
      data[k] = e[0]; data[k + 1] = e[1]; data[k + 2] = e[2]; data[k + 3] = _c.r;
      data[k + 4] = e[4]; data[k + 5] = e[5]; data[k + 6] = e[6]; data[k + 7] = _c.g;
      data[k + 8] = e[8]; data[k + 9] = e[9]; data[k + 10] = e[10]; data[k + 11] = _c.b;
      data[k + 12] = e[12]; data[k + 13] = e[13]; data[k + 14] = e[14]; data[k + 15] = 1;
    }
    table.needsUpdate = true;
  }
  mesh.onBeforeRender = sync;

  // The parts themselves stand in, unseen.
  for (const o of meshes) o.layers.set(UNSEEN);
  scene.add(mesh);
  return { mesh, sync };
}
