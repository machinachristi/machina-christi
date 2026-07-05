// Assembles the whole of Eden: heavens, land, river, vegetation, creatures.
// Everything Genesis 1–2 names has at least a simple presence from this first
// version — refinement passes deepen what is already here.

import * as THREE from 'three';
import { createSky, HORIZON } from './sky.js';
import { createTerrain, heightAt, riverZ, GARDEN_RADIUS } from './terrain.js';
import { createWater } from './water.js';
import { createVegetation, TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS } from './vegetation.js';
import { createCreatures } from './creatures.js';
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

  // Where the establishing shot gazes: between the two sacred trees.
  const sacredMidpoint = new THREE.Vector3()
    .addVectors(TREE_OF_LIFE_POS, TREE_OF_KNOWLEDGE_POS)
    .multiplyScalar(0.5);
  sacredMidpoint.y = heightAt(sacredMidpoint.x, sacredMidpoint.z);

  function update(dt) {
    sky.update(dt);
    water.update(dt);
    vegetation.update(dt);
    creatures.update(dt);
  }

  return { update, heightAt, riverZ, radius: GARDEN_RADIUS, sacredMidpoint };
}
