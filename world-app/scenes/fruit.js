// Fruit in season (Genesis 1:29): a few of the planted trees bear ripening
// fruit — figs and pomegranates — hanging low enough to find. Each is named
// as the walker draws near, the very same way as any living thing in the
// garden: garden.js folds these spots into creatures.js's own naming
// candidates, so there is still only the one caption, the one dwell.

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mulberry32 } from '../util.js';

const PER_TREE = 5;
const TREES_PER_KIND = 3;
const KINDS = [
  { kind: 'fig', name: "Te'enah", label: 'the fig tree', colorA: 0xB8A24E, colorB: 0x8A5E8F, lift: 2.0 },
  { kind: 'pomegranate', name: 'Rimmon', label: 'the pomegranate tree', colorA: 0x8B2635, colorB: 0xA8455A, lift: 2.15 },
];

export function createFruit(scene, treeSpots) {
  // Own seeded stream: choosing which trees bear fruit shifts nothing
  // already planted.
  const rng = mulberry32(20260714);

  // A shuffled draw of tree indices, so the fruiting trees are a few of the
  // 38 already planted, spread through the garden rather than clustered.
  const order = treeSpots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const group = new THREE.Group();
  scene.add(group);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  const spots = [];   // for the naming: { pos: {x,y,z}, name, label, kind }
  let taken = 0;
  for (const def of KINDS) {
    const mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.11, 0),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      TREES_PER_KIND * PER_TREE,
    );
    const colorA = new THREE.Color(def.colorA);
    const colorB = new THREE.Color(def.colorB);
    let idx = 0;
    for (let k = 0; k < TREES_PER_KIND; k++) {
      const spot = treeSpots[order[taken++]];
      const groundY = heightAt(spot.x, spot.z);
      for (let f = 0; f < PER_TREE; f++) {
        // A wide ring, well clear of the canopy's own radius, so the fruit
        // hangs visibly at its edge rather than lost inside the foliage.
        const a = (f / PER_TREE) * Math.PI * 2 + rng() * 0.6;
        const r = 1.3 + rng() * 1.0;
        p.set(spot.x + Math.cos(a) * r, groundY + def.lift + (rng() - 0.5) * 1.4, spot.z + Math.sin(a) * r * 0.8);
        q.setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI));
        s.setScalar(1.0 + rng() * 0.6);
        m.compose(p, q, s);
        mesh.setMatrixAt(idx, m);
        c.copy(colorA).lerp(colorB, rng());
        mesh.setColorAt(idx, c);
        idx++;
      }
      spots.push({
        pos: { x: spot.x, y: groundY + def.lift, z: spot.z },
        name: def.name, label: def.label, kind: def.kind,
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  return { spots };
}
