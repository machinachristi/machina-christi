// "The spider taketh hold with her hands, and is in kings' palaces"
// (Proverbs 30:28) — a few small webs strung upright between the blades of
// the meadow grass. Bare thread is all but invisible; it is the dew that
// shows them, so each web keeps exactly the hours dew.js already keeps, and
// fades away with it once the morning dries.
//
// Every web's threads are baked into one merged line geometry at their world
// places — one draw call for the whole lot, plus one instanced mesh for the
// spiders themselves.

import * as THREE from 'three';
import { heightAt, riverEdgeDist } from './terrain.js';
import { mulberry32 } from '../util.js';
import { dewOf } from './dew.js';

const COUNT = 5;
const SPOKES = 8;
const RINGS = 3;
const LIFT = 0.44;   // the web's heart, above the ground — grass-blade height

export function createWeb(scene) {
  // Own seeded stream: a handful of webs shifts nothing already planted.
  const rng = mulberry32(20260732);

  const webs = [];
  let guard = 0;
  while (webs.length < COUNT && guard++ < COUNT * 40) {
    const a = rng() * Math.PI * 2;
    const r = 6 + Math.sqrt(rng()) * 32;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverEdgeDist(x, z) < 2.6) continue;   // meadow grass, not the banks
    webs.push({
      x, z,
      y: heightAt(x, z) + LIFT,
      radius: 0.3 + rng() * 0.16,
      yaw: rng() * Math.PI * 2,
      lean: (rng() - 0.5) * 0.5,   // few webs hang perfectly plumb
    });
  }

  // Spokes out from the heart, then a ring of thread between each pair of
  // neighbouring spokes — the whole web laid flat into one vertex buffer.
  const segments = webs.length * (SPOKES + RINGS * SPOKES);
  const pos = new Float32Array(segments * 2 * 3);
  let w = 0;
  const put = (X, Y, Z) => { pos[w++] = X; pos[w++] = Y; pos[w++] = Z; };

  for (const web of webs) {
    // The web's own plane: one axis swung round by its yaw, the other very
    // nearly upright, tipped by its lean.
    const ux = Math.cos(web.yaw), uz = Math.sin(web.yaw);
    const vy = Math.cos(web.lean), vx = -Math.sin(web.lean) * uz, vz = Math.sin(web.lean) * ux;
    const at = (rad, ang) => {
      const cu = Math.cos(ang) * rad, cv = Math.sin(ang) * rad;
      return [
        web.x + ux * cu + vx * cv,
        web.y + vy * cv,
        web.z + uz * cu + vz * cv,
      ];
    };

    for (let j = 0; j < SPOKES; j++) {
      const ang = (j / SPOKES) * Math.PI * 2;
      put(web.x, web.y, web.z);
      put(...at(web.radius, ang));
    }
    for (let k = 1; k <= RINGS; k++) {
      const rad = web.radius * (k / RINGS);
      for (let j = 0; j < SPOKES; j++) {
        put(...at(rad, (j / SPOKES) * Math.PI * 2));
        put(...at(rad, ((j + 1) / SPOKES) * Math.PI * 2));
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, w), 3));
  const threads = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xE8F4F8, transparent: true, opacity: 0, depthWrite: false, fog: true,
  }));
  threads.visible = false;
  scene.add(threads);

  // The spider herself, small and still at the heart of her own work.
  const spiders = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.035, 5, 4),
    new THREE.MeshLambertMaterial({ color: 0x2A2620, flatShading: true }),
    webs.length,
  );
  spiders.frustumCulled = false;
  spiders.visible = false;
  scene.add(spiders);
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < webs.length; i++) {
      m.setPosition(webs[i].x, webs[i].y, webs[i].z);
      spiders.setMatrixAt(i, m);
    }
    spiders.instanceMatrix.needsUpdate = true;
  }

  // Namable like any other living thing the walker draws near (Genesis
  // 2:19-20) — the nearest web's own keeper stands for them all.
  const spots = webs.map(web => ({
    pos: { x: web.x, y: web.y, z: web.z },
    name: 'Semamit', label: 'the spider', kind: 'spider',
  }));

  let t = 0;
  let glint = 0;
  function update(dt, cycleT = 0.1) {
    t += dt;
    glint = dewOf(cycleT);
    threads.visible = glint > 0.02;
    spiders.visible = threads.visible;
    if (threads.visible) {
      threads.material.opacity = glint * (0.5 + 0.16 * Math.sin(t * 1.9));
    }
  }

  function state() {
    return { glint, webs: webs.length };
  }

  return { update, state, spots };
}
