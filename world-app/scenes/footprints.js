// Footprints on the banks (Genesis 2:15, "to work it and keep it"): the
// sandy verge takes the walker's steps for a little while — a shallow print
// at each stride, alternating left and right, before it is smoothed away
// again. Only the dry sand answers this way; a step into the water itself
// is the wake's to keep (scenes/wake.js).

import * as THREE from 'three';
import { riverEdgeDist, heightAt } from './terrain.js';
import { clamp, smoothstep } from '../util.js';

const POOL = 20;          // a full trail's worth, recycled
const LIFE = 7.5;         // seconds a print lingers before the bank forgets it
const STRIDE = 0.42;      // world units between alternating prints
const SIDE_OFFSET = 0.09; // how far a print sits from the stride's centre line

export function createFootprints(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false }),
    POOL,
  );
  mesh.frustumCulled = false;   // prints live wherever the walker has trodden the banks
  scene.add(mesh);

  const WET = new THREE.Color(0x8A7248);
  const SAND = new THREE.Color(0xD9C58C);
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  const prints = [];
  for (let i = 0; i < POOL; i++) prints.push({ age: LIFE, x: 0, y: 0, z: 0, yaw: 0 });

  let nextPrint = 0;
  let lastX = null;
  let lastZ = null;
  let side = 1;

  function spawn(x, z, yaw) {
    const pr = prints[nextPrint];
    nextPrint = (nextPrint + 1) % POOL;
    side = -side;   // alternate feet either side of the stride line
    pr.age = 0;
    pr.x = x + Math.cos(yaw) * SIDE_OFFSET * side;
    pr.z = z - Math.sin(yaw) * SIDE_OFFSET * side;
    pr.y = heightAt(pr.x, pr.z) + 0.015;   // the bank slopes; ride its true height
    pr.yaw = yaw;
  }

  // `walker`: {x,y,z}, the character's feet; `facing`: its yaw, radians —
  // together they let a print sit a little to one side of the stride and
  // point the way it was walking, the way a real footfall would.
  function update(dt, walker = null, facing = 0) {
    if (walker) {
      const edge = riverEdgeDist(walker.x, walker.z);
      const onBank = walker.y > -0.6 && edge > 0.05 && edge < 2.2;
      if (onBank && lastX !== null && Math.hypot(walker.x - lastX, walker.z - lastZ) > STRIDE) {
        spawn(walker.x, walker.z, facing);
        lastX = walker.x;
        lastZ = walker.z;
      } else if (!onBank || lastX === null) {
        lastX = walker.x;
        lastZ = walker.z;
      }
    }

    for (let i = 0; i < POOL; i++) {
      const pr = prints[i];
      pr.age += dt;
      const k = clamp(pr.age / LIFE, 0, 1);
      const shrink = 1 - smoothstep(0, 1, k);   // full at the footfall, smoothed away by k=1
      s.set(0.09 * shrink, 0.012 * shrink, 0.15 * shrink);
      q.setFromEuler(e.set(0, pr.yaw, 0));
      p.set(pr.x, pr.y, pr.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      c.copy(WET).lerp(SAND, k);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function state() {
    let live = 0;
    for (const pr of prints) if (pr.age < LIFE) live++;
    return { prints: live };
  }

  update(0);   // seat every matrix (all invisible) before the pre-ready warm-up frame
  return { update, state };
}
