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
import { createSpring } from './spring.js';
import { createFruit } from './fruit.js';
import { createFootprints } from './footprints.js';
import { createApron } from './apron.js';
import { createWealth } from './wealth.js';
import { createNests } from './nests.js';
import { createWaterTree } from './watertree.js';
import { createGrain } from './grain.js';
import { createStorks } from './storks.js';
import { createLocusts } from './locusts.js';
import { createPuddles } from './puddles.js';
import { createWildflowers } from './wildflowers.js';
import { createRainbow } from './rainbow.js';
import { windOf } from './wind.js';
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
  // Fruit in season (v10) picks a few of vegetation's own tree spots, so it
  // must come after planting and before creatures — creatures.js folds its
  // spots into the one naming candidate list. The Tree of Life's own fruit
  // (v11) joins that same list.
  const fruit = createFruit(scene, vegetation.treeSpots);
  // v12 (Psalm 1:3): a tree apart at the river's bank, always fruited, joins
  // the same one naming candidate list as every other fruit in the garden.
  const waterTree = createWaterTree(scene);
  // v13 (Psalm 104:17): the stork's own nest, high in her own fir tree,
  // joins the same list — built here so her spot is ready for it.
  const storks = createStorks(scene);
  const creatures = createCreatures(scene, rng, [...fruit.spots, vegetation.lifeFruitSpot, waterTree.spot, storks.spot]);
  const stones = createStones(scene);
  const mist = createMist(scene);
  await breathe();
  // The v8/v9 refinements each carry their own seeded stream, so building them
  // shifts nothing already planted from the shared `rng` above. Yield between
  // the clusters so their geometry-building doesn't block the main thread in
  // one stretch — that freeze is what made entering feel slow.
  const reeds = createReeds(scene);
  const gate = createGate(scene);
  await breathe();
  const presence = createPresence(scene);
  const reflections = createReflections(scene, vegetation.treeSpots);
  await breathe();
  const wake = createWake(scene);
  const petals = createPetals(scene, vegetation.treeSpots);
  const dew = createDew(scene);
  await breathe();
  // v10, each on its own seeded stream (spring) or none at all (footprints,
  // purely event-driven): the spring of Eden, and the walker's own steps.
  const spring = createSpring(scene);
  const footprints = createFootprints(scene);
  await breathe();
  // v11, each its own seeded stream (or none, apron — a fixed cluster needs
  // no per-frame update at all): the fig-leaf foreshadowing, the Pishon's
  // wealth, and the sacred trees' nests.
  const apron = createApron(scene);
  const wealth = createWealth(scene);
  const nests = createNests(scene);
  // v12 (Psalm 65:13): grain in two low valleys, still until the same
  // evening gust that already bows the trees reaches them.
  const grain = createGrain(scene);
  // v13 (Proverbs 30:27): locust bands drift the open meadow, no king over
  // any of them.
  const locusts = createLocusts(scene);
  // v14: low puddles glisten after a shower (Psalm 65:10), wildflowers dot
  // the meadow (Genesis 1:11 — no per-frame update at all, a fixed
  // dressing), and a rainbow eases in with the same clearing glow the sky
  // already carries once the rain has passed (Genesis 9:13).
  const puddles = createPuddles(scene);
  const wildflowers = createWildflowers(scene);
  const rainbow = createRainbow(scene);

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
  let windNow = 0;
  // `lure`: the seat of a still walker by the water, or null — passed on to
  // the creatures, who draw near it (see creatures.js).
  // `facing`: the walker's yaw, radians — footprints alone need it, to point
  // each print the way it was walking.
  function update(dt, playerPos, lure = null, facing = 0) {
    const hour = sky.update(dt, playerPos);   // the rain's drum rides with the walker
    // On the seventh day (v11, Genesis 2:2-3) the wind holds still and every
    // creature keeps a deeper rest — threaded through from the sky's own
    // day count rather than each module guessing at it independently.
    windNow = windOf(hour.t, hour.sabbath);
    water.update(dt, hour.night);
    reverence = vegetation.update(dt, hour.night, playerPos, hour.t, hour.sabbath);
    creatures.update(dt, hour.night, playerPos, lure, hour.sabbath);
    reeds.update(dt, playerPos, hour.t);
    gate.update(dt, hour.night, hour.t);
    presence.update(dt);
    reflections.update(dt, hour.night);
    wake.update(dt, playerPos);
    petals.update(dt, hour.t);
    dew.update(dt, hour.t);
    mist.update(dt, hour.t);
    spring.update(dt);
    footprints.update(dt, playerPos, facing);
    wealth.update(dt);
    nests.update(dt);
    waterTree.update(hour.t, hour.sabbath);
    grain.update(hour.t, hour.sabbath);
    storks.update(dt);
    locusts.update(dt);
    puddles.update(dt, hour.rain);
    rainbow.update(dt, hour.rain, hour.clearing, hour.sunElev, hour.sunAz);
    return hour;
  }

  return {
    update, heightAt, riverZ, radius: GARDEN_RADIUS, sacredMidpoint,
    setTime: sky.setTime,
    setRain: sky.setRain,
    setDay: sky.setDay,
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
    spring: spring.state,
    footprints: footprints.state,
    fruit: fruit.spots,
    wealth: wealth.count,
    nests: nests.state,
    waterTree: waterTree.spot,
    storks: storks.spot,
    locusts: locusts.state,
    puddles: puddles.state,
    wildflowers: wildflowers.count,
    rainbow: rainbow.state,
    get reverence() { return reverence; },
    get wind() { return windNow; },
  };
}
