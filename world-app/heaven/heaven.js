// Heaven (AB#106): the realm above the garden, reached by Jacob's ladder
// (Genesis 28:12). It is its own scene, built only when the walker first
// heads for the ladder (realm.js decides when, and keeps him safe if any of
// this ever fails), and drawn only while he is in it — so it costs the
// garden nothing.
//
// This first heaven is a foundation. It has no night (Revelation 22:5); God
// is shown only as light (21:23), never as a figure; the river of the water
// of life runs up the middle of the street of gold to the Tree of Life
// (22:1-2); a multitude no man could number stands as lights round the glory
// (7:9); and the saints of the site's own calendar stand on both banks, today's
// saint greeting him at the head of the ladder. The weekly update-world
// routine furnishes it further, week by week — but who the saints are comes
// only from heaven/saints.js, which it may never change.
//
// The heaven modules: layout.js (where everything stands), sky.js, sea.js
// (the floor, river and street), head.js (the ladder's head), tree.js,
// glory.js (the glory and the multitude) and figures.js (the saints).
// v33, the new song: song.js (his steps, his stillness, and heaven's answer
// to them), incense.js (the prayers rising) and leaves.js (the Tree of Life's
// leaves carried down the river).

import * as THREE from 'three';
import { breathe } from '../util.js';
import { RADIUS, ARRIVAL, LADDER_HEAD, GLORY } from './layout.js';
import { createHeavenSky } from './sky.js';
import { createSea } from './sea.js';
import { createHead } from './head.js';
import { createTree } from './tree.js';
import { createGlory } from './glory.js';
import { createFigures } from './figures.js';
import { createIncense } from './incense.js';
import { createLeaves } from './leaves.js';
import { createSong } from './song.js';

// Near the head of the ladder the line under the screen names the way down
// (realm.js), so the new song keeps its words for the rest of heaven.
const HEAD_WORDS = 3.6;

// scene: heaven's own (empty) scene. saintsData: what heaven/saints.js gave —
// { saints: [...], today: {...} | null }; with no saints, heaven still opens.
export async function createHeaven(scene, saintsData) {
  createHeavenSky(scene);
  await breathe();
  const sea = createSea(scene);
  const head = createHead(scene);
  await breathe();
  const tree = createTree(scene);
  const glory = createGlory(scene);
  await breathe();
  const saints = createFigures(scene, saintsData);
  await breathe();
  const leaves = createLeaves(scene);
  const incense = createIncense(scene, saints.places);
  const song = createSong({ sea, incense, glory });
  await breathe();

  let time = 0;
  let lastWalker = null;
  // walker: his position, read for drawing near the saints, for his steps on
  // the glass and his stillness; pace and facing: how fast he is walking (or
  // trying to — against the rim he strides on the spot) and which way he faces.
  function update(dt, walker, pace = 0, facing = 0) {
    time += dt;
    lastWalker = walker || null;
    song.update(dt, time, walker, pace, facing);
    sea.update(time);
    head.update(time);
    glory.update(time);
    tree.update(time);
    leaves.update(time);
    saints.update(dt, walker);
  }

  // The line under the screen. Away from the ladder's head (whose own name
  // realm.js gives there): the multitude's answer for the few seconds it
  // sounds — it is rare, and the one moment heaven speaks — then the saint
  // drawn near to, then his prayer while it rises, then a leaf of the tree
  // floating by him on the river.
  const LEAF_WORD = { name: 'Aleh', label: 'the leaves of the tree, for the healing of the nations' };
  function caption() {
    const w = lastWalker;
    const byHead = !!w && Math.hypot(w.x - LADDER_HEAD.x, w.z - LADDER_HEAD.z) < HEAD_WORDS;
    const answer = byHead ? null : song.answerWord();
    if (answer) return answer;
    const named = saints.caption();
    if (named || byHead) return named;
    return song.prayerWord() || (leaves.near(w) ? LEAF_WORD : null);
  }

  return {
    update,
    // The ground is a flat sea of glass: his height is the same everywhere.
    heightAt: () => 0,
    radius: RADIUS,
    solids: tree.solids,
    arrival: ARRIVAL,
    ladderHead: LADDER_HEAD,
    // Where the arriving camera first looks: the glory.
    focus: new THREE.Vector3(GLORY.x, GLORY.y, GLORY.z),
    // The caption line: the saint drawn near to, the new song's word, a
    // leaf's, or null.
    caption,
    namedThing: saints.namedThing,
    // For main.js, every frame: the harps' notes and heaven's answers.
    song: song.song,
    state() {
      return {
        saints: saints.count,
        figures: saints.figures,
        multitude: glory.count,
        fruits: tree.fruits,
        today: saints.today(),
        near: saints.near(),
        saint: saints.sample(),
        arrival: { x: ARRIVAL.x, z: ARRIVAL.z },
        ladderHead: { x: LADDER_HEAD.x, z: LADDER_HEAD.z },
        // v33, the new song (Revelation 14:2-3; 15:2; 19:6): `steps` taken
        // on the glass and `rings` of fire burning in it now, `notes` the
        // harps have played, `praying` while his hands are lifted, `prayers`
        // begun, `incense` puffs rising (`his` own among them), `answers`
        // the multitude has given (`answering` while it does, `flare` how
        // bright the glory is with it), and `leaves` floating on the river.
        song: (() => {
          const st = song.state();
          const inc = incense.state();
          return {
            ...st, incense: inc.rising, his: inc.his, flare: glory.flare(), leaves: leaves.floating(),
          };
        })(),
      };
    },
  };
}
