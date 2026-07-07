// Assembles the whole of Eden: heavens, land, river, vegetation, creatures.
// Everything Genesis 1–2 names has at least a simple presence from this first
// version — refinement passes deepen what is already here.

import * as THREE from 'three';
import { createSky, HORIZON } from './sky.js';
import { createTerrain, heightAt, riverZ, GARDEN_RADIUS, CROSSING } from './terrain.js';
import { createWater } from './water.js';
import { createVegetation, TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { createCreatures } from './creatures.js';
import { createStones } from './stones.js';
import { createMist } from './mist.js';
import { createReeds } from './reeds.js';
import { createGate } from './gate.js';
import { createPresence } from './presence.js';
import { createReflections } from './reflections.js';
import { createWake } from './wake.js';
import { createPetals } from './petals.js';
import { createDew } from './dew.js';
import { breathe } from '../util.js';

// Async, with a breath between the heavy build steps: the iframe shares the
// parent page's main thread, so yielding here is what lets the veil's
// "entering…" line keep breathing while the garden takes shape behind it.
export async function createGarden(scene, rng) {
  // Fog shares the sky's horizon tone so the garden's edge dissolves into
  // light rather than ending — no walls, no visible boundary.
  scene.fog = new THREE.Fog(HORIZON.getHex(), 55, 115);

  const sky = createSky(scene);
  await breathe();
  createTerrain(scene, rng);
  await breathe();
  const water = createWater(scene);   // draws its own course from terrain's riverCourse()
  await breathe();
  const vegetation = createVegetation(scene, rng);
  await breathe();
  const creatures = createCreatures(scene, rng);
  const stones = createStones(scene);
  const mist = createMist(scene);
  // These three each carry their own seeded stream, so building them shifts
  // nothing already planted from the shared `rng` above.
  const reeds = createReeds(scene);
  const gate = createGate(scene);
  const presence = createPresence(scene);
  const reflections = createReflections(scene, vegetation.treeSpots);
  const wake = createWake(scene);
  const petals = createPetals(scene, vegetation.treeSpots);
  const dew = createDew(scene);

  // Where the establishing shot gazes: between the two sacred trees.
  const sacredMidpoint = new THREE.Vector3()
    .addVectors(TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS)
    .multiplyScalar(0.5);
  sacredMidpoint.y = heightAt(sacredMidpoint.x, sacredMidpoint.z);

  // The sky keeps the day's clock; its state (how deep into night, etc.)
  // flows to everything that keeps the hours — and back to the caller,
  // where the ambience listens to it too. The walker's position flows the
  // other way, so drawing near the sacred trees can be felt (reverence),
  // and drawing near a creature gives its name (the naming).
  let reverence = 0;
  // `lure`: the seat of a still walker by the water, or null — passed on to
  // the creatures, who draw near it (see creatures.js).
  function update(dt, playerPos, lure = null) {
    const hour = sky.update(dt, playerPos);   // the rain's drum rides with the walker
    water.update(dt, hour.night);
    reverence = vegetation.update(dt, hour.night, playerPos);
    creatures.update(dt, hour.night, playerPos, lure);
    reeds.update(dt, playerPos);
    gate.update(dt, hour.night, hour.t);
    presence.update(dt);
    reflections.update(dt, hour.night);
    wake.update(dt, playerPos);
    petals.update(dt, hour.t);
    dew.update(dt, hour.t);
    mist.update(dt, hour.t);
    return hour;
  }

  return {
    update, heightAt, riverZ, radius: GARDEN_RADIUS, sacredMidpoint,
    setTime: sky.setTime,
    setRain: sky.setRain,
    hour: sky.state,
    stones: stones.list,
    crossing: CROSSING,
    constellations: sky.constellations,
    fauna: creatures.fauna,
    named: creatures.named,
    gate: gate.state,
    reeds: reeds.count,
    presence: presence.state,
    stir: presence.stir,
    reflections: reflections.count,
    wake: wake.state,
    petals: petals.state,
    dew: dew.state,
    get reverence() { return reverence; },
  };
}
