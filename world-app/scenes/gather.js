// "And the LORD God commanded the man, saying, Of every tree of the garden
// thou mayest freely eat" (Genesis 2:16).
//
// The next of Adam's own work after the watering (v27): gathering. Come and
// stand under a fig or a pomegranate in fruit, and after a moment a ripe one
// lets go of the bough and drops, turning, into his cupped hands — freely
// given; he did not have to reach. He holds it a little while, looking at it,
// then eats it in three bites, and his hands are free again. One gesture —
// standing still under the tree — with no score, no counting, nothing to
// lose: walk out from under it and come back, and the tree gives again.
//
// One draw call, and only while a fruit is falling: the fruit in his hands
// belongs to the figure (character.js), which is handed its colour and how
// much of it is left. Nothing is placed at build time and nothing is drawn
// from any seeded stream, so the garden's planting is untouched.

import * as THREE from 'three';
import { clamp, damp, smoothstep } from '../util.js';

const REACH = 3.0;              // this near the trunk is under the tree
const LEAVE = 4.2;              // …and this far out is out from under it again
const STILL_SPEED = 0.25;       // m/s; slower than this he is standing
const GIVE_AFTER = 1.2;         // seconds standing under it before it gives
const FALL = 0.95;              // seconds from the bough to his hands
const HOLD_FOR = 2.2;           // seconds he holds it before he eats
const EAT = 1.8;                // seconds for the three bites
const AGAIN_AFTER = 14;         // or, standing on under it, the tree gives again
const CAPTION_FOR = 3.5;

const CAPTION = { name: 'Akhol tokhel', label: 'freely thou mayest eat' };
const COLORS = { fig: 0x8A5E8F, pomegranate: 0x9B2D3E };

// Where the fruit comes to in his raised hand (character.js: the torso at
// 0.9, the held fruit 0.56 above it, 0.6 before him and 0.19 to his left).
const HANDS_UP = 1.46;
const HANDS_OUT = 0.6;
const HANDS_SIDE = 0.19;

// trees: fruit.js's own spots — { pos: {x, y, z}, kind } — the trunk of each
// fruiting tree, and the height its fruit hangs at.
export function createGather(scene, trees) {
  const fruit = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.1, 0),
    new THREE.MeshLambertMaterial({ flatShading: true, color: COLORS.fig }),
  );
  fruit.visible = false;
  scene.add(fruit);

  const from = new THREE.Vector3();
  const hands = new THREE.Vector3();

  let stage = 'idle';             // idle | falling | holding | eating
  let stageT = 0;
  let tree = null;                // the tree that gave last
  let sinceGiven = Infinity;
  let still = 0;
  let speed = 0;
  let last = null;
  let given = 0;
  let eaten = 0;
  let color = COLORS.fig;
  let left = 0;                   // how much of the fruit in his hands is left
  let caption = null;
  let captionLeft = 0;
  let notes = 0;
  let note = 7;

  // Read every frame: reused objects, no allocation.
  const near = { tree: null, d: Infinity };
  const held = { color: COLORS.fig, left: 0 };
  const sung = { notes: 0, note: 7 };

  function nearestTree(w) {
    near.tree = null;
    near.d = Infinity;
    for (const t of trees) {
      const d = Math.hypot(t.pos.x - w.x, t.pos.z - w.z);
      if (d < near.d) { near.d = d; near.tree = t; }
    }
    return near;
  }

  function handsAt(w, facing) {
    // Forward is (sin, cos) of his facing; his left, +x of the figure, is (cos, -sin).
    return hands.set(
      w.x + Math.sin(facing) * HANDS_OUT + Math.cos(facing) * HANDS_SIDE,
      w.y + HANDS_UP,
      w.z + Math.cos(facing) * HANDS_OUT - Math.sin(facing) * HANDS_SIDE,
    );
  }

  function update(dt, walker, facing = 0) {
    if (!walker) return;
    if (last) speed = damp(speed, Math.hypot(walker.x - last.x, walker.z - last.z) / Math.max(dt, 1e-4), 10, dt);
    if (last && Math.hypot(walker.x - last.x, walker.z - last.z) > 3) speed = 0;   // a teleport is not a walk
    last = last || new THREE.Vector3();
    last.copy(walker);
    still = speed < STILL_SPEED ? still + dt : 0;
    sinceGiven += dt;

    nearestTree(walker);
    // Out from under the tree that last gave, it is ready to give again.
    if (tree && near.tree === tree && near.d > LEAVE) tree = null;
    if (tree && near.tree !== tree) tree = null;

    stageT += dt;
    if (stage === 'idle') {
      const ready = !tree || sinceGiven >= AGAIN_AFTER;
      if (ready && near.d < REACH && still >= GIVE_AFTER) {
        // A fruit lets go from the side of the tree he stands on, high in it.
        tree = near.tree;
        const t = tree.pos;
        const a = Math.atan2(walker.z - t.z, walker.x - t.x) + ((given * 0.618) % 1 - 0.5) * 0.8;
        from.set(t.x + Math.cos(a) * 1.5, Math.max(t.y, walker.y + HANDS_UP + 0.6), t.z + Math.sin(a) * 1.5 * 0.8);
        color = COLORS[tree.kind] || COLORS.fig;
        fruit.material.color.setHex(color);
        fruit.position.copy(from);
        fruit.scale.setScalar(1.3);
        fruit.visible = true;
        stage = 'falling';
        stageT = 0;
        sinceGiven = 0;
        given++;
      }
    } else if (stage === 'falling') {
      // Dropping as a fruit drops — slow, then quicker — with a little arc
      // out toward him, turning as it comes; it finds his hands wherever
      // they have got to.
      const k = clamp(stageT / FALL, 0, 1);
      const e = k * k;
      handsAt(walker, facing);
      fruit.position.lerpVectors(from, hands, e);
      fruit.position.y += Math.sin(Math.PI * k) * 0.3;
      fruit.rotation.set(k * 5.1, k * 3.7, 0);
      if (k >= 1) {
        fruit.visible = false;
        stage = 'holding';
        stageT = 0;
        left = 1;
        caption = CAPTION;
        captionLeft = CAPTION_FOR;
        note = 7;
        notes++;
      }
    } else if (stage === 'holding') {
      if (stageT >= HOLD_FOR) { stage = 'eating'; stageT = 0; }
    } else if (stage === 'eating') {
      // Three bites, each a little pause and then a little less of it.
      const k = clamp(stageT / EAT, 0, 1);
      const bites = Math.floor(k * 3) + smoothstep(0.55, 1, (k * 3) % 1);
      left = clamp(1 - bites / 3, 0, 1);
      if (k >= 1) {
        left = 0;
        stage = 'idle';
        stageT = 0;
        eaten++;
        note = 9;
        notes++;
      }
    }

    if (captionLeft > 0) {
      captionLeft -= dt;
      if (captionLeft <= 0) caption = null;
    }
  }

  return {
    update,
    caption: () => caption,
    song: () => { sung.notes = notes; sung.note = note; return sung; },
    // What he holds: its colour and how much is left, or null.
    holding: () => {
      if (!((stage === 'holding' || stage === 'eating') && left > 0)) return null;
      held.color = color;
      held.left = left;
      return held;
    },
    state: () => ({
      stage, given, eaten,
      trees: trees.map(t => ({ x: t.pos.x, z: t.pos.z, kind: t.kind })),
    }),
  };
}
