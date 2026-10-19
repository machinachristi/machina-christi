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

import * as THREE from 'three';
import { breathe } from '../util.js';
import { RADIUS, ARRIVAL, LADDER_HEAD, GLORY } from './layout.js';
import { createHeavenSky } from './sky.js';
import { createSea } from './sea.js';
import { createHead } from './head.js';
import { createTree } from './tree.js';
import { createGlory } from './glory.js';
import { createFigures } from './figures.js';

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

  let time = 0;
  // walker: his position, read for drawing near the saints.
  function update(dt, walker) {
    time += dt;
    sea.update(time);
    head.update(time);
    glory.update(time);
    tree.update(time);
    saints.update(dt, walker);
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
    // The caption line: the saint drawn near to, or null.
    caption: saints.caption,
    namedThing: saints.namedThing,
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
      };
    },
  };
}
