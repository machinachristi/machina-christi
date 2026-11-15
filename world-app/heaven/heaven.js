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
// v35, the holy city: city.js (the wall foursquare round it all, its twelve
// foundations and twelve gates of pearl, and the nations walking in).
// v37, the healing of the nations: healing.js (the leaves of the tree carried
// out through every gate, and one given into his hand to carry), and the
// tree's fruit of the month hanging ripe (tree.js).

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
import { createCity } from './city.js';
import { createHealing } from './healing.js';

// Near the head of the ladder the line under the screen names the way down
// (realm.js), so the new song keeps its words for the rest of heaven.
const HEAD_WORDS = 3.6;

// The month it is (0 = January), for the tree's fruit of the month — the
// day realm.js was asked for (?day=YYYY-MM-DD), or today.
function monthNow() {
  try {
    const day = new URLSearchParams(window.location.search).get('day');
    const m = day && /^\d{4}-(\d{2})-\d{2}$/.exec(day);
    if (m && +m[1] >= 1 && +m[1] <= 12) return +m[1] - 1;
  } catch (_) { /* today, then */ }
  return new Date().getMonth();
}

// scene: heaven's own (empty) scene. saintsData: what heaven/saints.js gave —
// { saints: [...], today: {...} | null }; with no saints, heaven still opens.
export async function createHeaven(scene, saintsData) {
  createHeavenSky(scene);
  await breathe();
  const sea = createSea(scene);
  const head = createHead(scene);
  await breathe();
  const tree = createTree(scene, monthNow());
  const glory = createGlory(scene);
  await breathe();
  const saints = createFigures(scene, saintsData);
  await breathe();
  const leaves = createLeaves(scene);
  const incense = createIncense(scene, saints.places);
  const song = createSong({ sea, incense, glory });
  await breathe();
  const city = createCity(scene);
  await breathe();
  const healing = createHealing(scene, city.ways, saints.places);
  await breathe();

  let time = 0;
  let lastWalker = null;
  // walker: his position, read for drawing near the saints, for his steps on
  // the glass and his stillness; pace and facing: how fast he is walking (or
  // trying to — against the rim he strides on the spot) and which way he faces.
  function update(dt, walker, pace = 0, facing = 0) {
    time += dt;
    lastWalker = walker || null;
    // (His prayer as it stood last frame: no leaf comes down into lifted hands.)
    healing.update(dt, time, walker, pace, facing, !!song.prayerWord());
    song.update(dt, time, walker, pace, facing, healing.busy());
    sea.update(time);
    head.update(time);
    glory.update(time);
    tree.update(time);
    leaves.update(time);
    saints.update(dt, walker);
    city.update(dt, time, walker);
  }

  // The line under the screen. Away from the ladder's head (whose own name
  // realm.js gives there): the multitude's answer for the few seconds it
  // sounds — it is rare, and the one moment heaven speaks — then the saint
  // drawn near to, then — standing in a gate of the city — its word, then his
  // prayer while it rises, then a leaf of the tree floating by him on the river.
  // A leaf of the tree given into his hand, or given by him (v37), comes
  // straight after the answer: it is his own doing, and brief.
  const LEAF_WORD = { name: 'Aleh', label: 'the leaves of the tree, for the healing of the nations' };
  function caption() {
    const w = lastWalker;
    const byHead = !!w && Math.hypot(w.x - LADDER_HEAD.x, w.z - LADDER_HEAD.z) < HEAD_WORDS;
    const answer = byHead ? null : song.answerWord();
    if (answer) return answer;
    const leaf = byHead ? null : healing.caption();
    if (leaf) return leaf;
    const named = saints.caption();
    if (named || byHead) return named;
    return city.caption() || song.prayerWord() || (leaves.near(w) ? LEAF_WORD : null);
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
    // For main.js, every frame: the harps' notes and heaven's answers, and
    // (v37) whether a leaf of the tree is in his hand and how many he has
    // been given and has given.
    song() {
      const sung = song.song();
      const c = healing.counts();
      sung.leaf = healing.holding();
      sung.received = c.received;
      sung.given = c.given;
      return sung;
    },
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
        // v35, the holy city (Revelation 21:12-26): its `gates` of pearl and
        // `foundations` of precious stones, the `travellers` walking in at its
        // gates and the `lights` over them, whether he stands `atGate`, how
        // the gate brightens (`gateGlow`), and where the south middle gate's
        // first traveller (`lead`) has walked to.
        city: city.state(),
        // v37, the healing of the nations (Revelation 22:2): the leaf-
        // `bearers` going out through all the `gates`; his own leaf's `stage`
        // (none | falling | holding), how many he has `received` and
        // `given`, whether one is `out` on its way, how bright its gate's
        // stream is (`glow`), and where the south middle gate's first bearer
        // (`lead`) has walked to; and the tree's `ripe` fruit, by month.
        healing: { ...healing.state(), ripe: tree.ripe },
      };
    },
  };
}
