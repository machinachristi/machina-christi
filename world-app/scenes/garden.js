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
import { createCedars } from './cedars.js';
import { createWeb } from './web.js';
import { createWillows } from './willows.js';
import { createAnts } from './ants.js';
import { createShadows } from './shadows.js';
import { createVine } from './vine.js';
import { createLeaves } from './leaves.js';
import { createConies } from './conies.js';
import { createCranes } from './cranes.js';
import { createPalms } from './palms.js';
import { createAlmond } from './almond.js';
import { createFrankincense } from './frankincense.js';
import { createHyssop } from './hyssop.js';
import { createLilies } from './lilies.js';
import { createCamphire } from './camphire.js';
import { createFig } from './fig.js';
import { createVapours } from './vapours.js';
import { createMyrtle } from './myrtle.js';
import { createFoxes } from './foxes.js';
import { createSheaves } from './sheaves.js';
import { createHoarfrost } from './hoarfrost.js';
import { createOlive } from './olive.js';
import { createSprings } from './springs.js';
import { createMandrakes } from './mandrakes.js';
import { createBehemoth } from './behemoth.js';
import { createRays } from './rays.js';
import { createOwl } from './owl.js';
import { createDeeps } from './deeps.js';
import { createRam } from './ram.js';
import { createRods } from './rods.js';
import { createSeed } from './seed.js';
import { createWildVine } from './wildvine.js';
import { createRocks } from './rocks.js';
import { createSwallows } from './swallows.js';
import { createSpices } from './spices.js';
import { createStump } from './stump.js';
import { createCleft } from './cleft.js';
import { createHoney } from './honey.js';
import { createOstrich } from './ostrich.js';
import { createLightning } from './lightning.js';
import { createMustard } from './mustard.js';
import { createManna } from './manna.js';
import { createEyrie } from './eyrie.js';
import { createHind } from './hind.js';
import { createAcacia } from './acacia.js';
import { createTender } from './tender.js';
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
  const terrain = createTerrain(scene, rng);
  // v26 (Deuteronomy 32:2): the ground's own material answers the rain — the
  // grass stands greener for a while after a shower. No geometry, no draws,
  // no stream draws.
  const tender = createTender(terrain.mesh.material);
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
  // v15: the sacred trees' nests are built before the creatures now, not
  // after, so their keepers (Psalm 84:3) and the spiders at their webs
  // (Proverbs 30:28) can join that one naming list too. Both carry their own
  // seeded streams, so building them earlier shifts nothing already planted.
  const nests = createNests(scene);
  const web = createWeb(scene);
  // v16: the willows of the brook (Leviticus 23:40) and the ants' own road
  // (Proverbs 6:6-8) are built here too, before the creatures, so their
  // spots fold into the one naming list. Both carry their own seeded
  // streams, so building them here shifts nothing already planted.
  const willows = createWillows(scene);
  const ants = createAnts(scene);
  // v17: the vine (Micah 4:4) climbs one of vegetation's own planted trees,
  // and the conies (Proverbs 30:26) keep the goats' own rocky rim — both
  // built here too, before the creatures, so their spots fold into the one
  // naming list. Both carry their own seeded streams, so building them here
  // shifts nothing already planted.
  const vine = createVine(scene, vegetation.treeSpots);
  const conies = createConies(scene);
  // v18: the almond (Jeremiah 1:11) and frankincense (Song of Solomon 4:14)
  // stands, and the hyssop tucked among the rocky rim (1 Kings 4:33, the
  // freshly-generated idea this run) — built here too, before the
  // creatures, so their spots fold into the one naming list. Each carries
  // its own seeded stream, so building them here shifts nothing already
  // planted. The palms (v17, Psalm 92:12) move up alongside them: their
  // spots were built but never folded into this list — fixed now, on the
  // same idiom as everything else here.
  const almond = createAlmond(scene);
  const frankincense = createFrankincense(scene);
  const hyssop = createHyssop(scene);
  const palms = createPalms(scene);
  // v19: the lilies among their thorns (Song of Solomon 2:2), the camphire
  // orchard (Song of Solomon 4:13), and the one fig tree that keeps the long
  // year rather than the day (Matthew 24:32) — built here too, before the
  // creatures, so their spots fold into the one naming list. Each carries
  // its own seeded stream, so building them here shifts nothing already
  // planted.
  const lilies = createLilies(scene);
  const camphire = createCamphire(scene);
  const fig = createFig(scene);
  // v20: the myrtle and the fir come up beside the lilies' own thorn stands
  // (Isaiah 55:13), so they are built straight after them; the sheaves stand
  // at the edge of the grain (Genesis 37:7); and the little foxes keep to
  // the one vine (Song of Solomon 2:15). All three fold their spots into the
  // one naming list, and each carries its own seeded stream, so building
  // them here shifts nothing already planted.
  const myrtle = createMyrtle(scene, lilies.spots);
  const sheaves = createSheaves(scene);
  const foxes = createFoxes(scene, vine.spot.pos);
  // v21: the olive one dove goes to for a leaf (Genesis 8:11), the springs
  // broken out of the rim (Psalm 104:10), the mandrakes keeping the ground
  // under the vine (Song of Solomon 7:13 — so they come after it), and
  // behemoth lying on a bank the willows compass about (Job 40:21-22 — so
  // he comes after them). All four fold their spots into the one naming
  // list, and each carries its own seeded stream, so building them here
  // shifts nothing already planted.
  const olive = createOlive(scene);
  const springs = createSprings(scene);
  const mandrakes = createMandrakes(scene, vine.spot.pos);
  const behemoth = createBehemoth(scene, willows.spots);
  // v22: where the one rill that finds the great river runs into it, deep
  // calls to deep (Psalm 42:7 — so it comes after the springs); the ram held
  // by his horns on the eastern rim (Genesis 22:13); and the poplar, hazel
  // and chestnut standing over the watering place (Genesis 30:37). All three
  // fold their spots into the one naming list, and each carries its own
  // seeded stream, so building them here shifts nothing already planted.
  const deeps = createDeeps(scene, springs.mouths);
  const ram = createRam(scene);
  const rods = createRods(scene);
  // v23: the wild vine that ran out along open meadow with no one to plant
  // it (Psalm 80:8-9); the conies' own houses in the rock, worn pale at the
  // doorway (Proverbs 30:26 — so they come after the conies, and are set
  // from the homes those conies were already given); the bed of spices on
  // the warm south slope (Song of Solomon 4:16); and the cut stump that
  // sprouts again within the scent of water (Job 14:7-9, the freshly-
  // generated idea this run). All four fold their spots into the one naming
  // list, and each carries its own seeded stream, so building them here
  // shifts nothing already planted.
  const wildvine = createWildVine(scene);
  const rocks = createRocks(scene, conies.homes);
  const spices = createSpices(scene);
  const stump = createStump(scene);
  // v24: the dove in the clefts of the rock, in the secret places of the
  // stairs (Song of Solomon 2:14); the honey the same rock keeps in a hollow
  // of its far shoulder (Psalm 81:16, the freshly-generated idea this run —
  // so it comes after the rock, which says where the hollow is); and the
  // ostrich ranging the south with her eggs left in the dust behind her
  // (Job 39:13-16). All three fold their spots into the one naming list,
  // and each carries its own seeded stream, so building them here shifts
  // nothing already planted.
  const cleft = createCleft(scene);
  const honey = createHoney(scene, cleft.honey);
  const ostrich = createOstrich(scene);
  // v25: the mustard grown into a tree with the birds of the air lodging
  // in it (Matthew 13:31-32), and the manna found lying on the meadow as the
  // dew goes up (Exodus 16:14) — both built here, before the creatures, so
  // their spots fold into the one naming list. Each carries its own seeded
  // stream, so building them here shifts nothing already planted.
  const mustard = createMustard(scene);
  const manna = createManna(scene);
  // v26: the hind keeping the stair of ledges under the eagle's crag
  // (Habakkuk 3:19), and the shittah trees on the dry southern rim (Isaiah
  // 41:19, the freshly-generated idea this run — they keep clear of
  // vegetation's own tree spots, so they come after the planting). Both
  // fold their spots into the one naming list, and each carries its own
  // seeded stream, so building them here shifts nothing already planted.
  const hind = createHind(scene);
  const acacia = createAcacia(scene, vegetation.treeSpots);
  // The cedars move up here from further down (v22): the owl keeps her night
  // watch on their boughs, so the stand has to stand before she does. Their
  // own seeded stream means building them earlier shifts nothing planted.
  const cedars = createCedars(scene);
  const owl = createOwl(scene, cedars.spots);
  const creatures = createCreatures(scene, rng, [
    ...fruit.spots, vegetation.lifeFruitSpot, waterTree.spot, storks.spot,
    ...nests.spots, ...web.spots, ...willows.spots, ...ants.spots,
    vine.spot, ...conies.spots, ...palms.spots, ...almond.spots,
    ...frankincense.spots, ...hyssop.spots, ...lilies.spots,
    ...camphire.spots, fig.spot, ...myrtle.spots, ...sheaves.spots,
    ...foxes.spots, olive.spot, ...springs.spots, ...mandrakes.spots,
    ...behemoth.spots, ...deeps.spots, ...ram.spots, ...rods.spots,
    ...wildvine.spots, ...rocks.spots, ...spices.spots, ...stump.spots,
    ...cleft.spots, ...honey.spots, ...ostrich.spots,
    ...mustard.spots, ...manna.spots, ...hind.spots, ...acacia.spots,
  ]);
  // v25 (Deuteronomy 32:11): the crag under the eagle's nest, and her two
  // young in it. Built after the creatures because it answers to her — it
  // is told each frame whether she is stirring them up — and on its own
  // seeded stream, so nothing already planted shifts.
  const eyrie = createEyrie(scene);
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
  // no per-frame update at all): the fig-leaf foreshadowing and the Pishon's
  // wealth. (The nests themselves now build further up, with the creatures.)
  const apron = createApron(scene);
  const wealth = createWealth(scene);
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
  // v16 (Psalm 102:11): every tree's own shadow, drawn out long toward
  // evening and swinging round with the sun. Needs vegetation's tree spots,
  // so it comes after the planting.
  const shadows = createShadows(scene, vegetation.treeSpots);
  // v17: leaves scud before the same evening wind that already bows the
  // trees (Psalm 1:4), and a skein of cranes crosses at their own appointed
  // hour (Jeremiah 8:7) — cranes carry no per-frame dependency on anything
  // above, so they build here too. (Palms now build earlier, alongside
  // v18's own fixed plantings — see above.)
  const leaves = createLeaves(scene);
  const cranes = createCranes(scene);
  // v19 (Psalm 135:7, the freshly-generated idea this run): vapours ascend
  // off the water and the warm ground through the heat of the middle day —
  // the mist's own opposite number, and no dependency on anything above it.
  const vapours = createVapours(scene);
  // v20 (Psalm 147:16, the freshly-generated idea's neighbour in the
  // backlog): hoarfrost lies over the open grass on the coldest turn of the
  // long year, through the last watch of the night only — no dependency on
  // anything above it.
  const hoarfrost = createHoarfrost(scene);
  // v21 (Job 38:24, the freshly-generated idea this run): where a low sun
  // finds a gap in a crown the light comes through it and lies out across
  // the grass — shadows.js's other half, and it needs the same tree spots,
  // so it builds here beside it.
  const rays = createRays(scene, vegetation.treeSpots);
  // v22 (Genesis 1:11-12, the freshly-generated idea this run): the meadow
  // stands full of seed, and it is the walker brushing past a head — not the
  // hour and not the gust — that looses the down off it.
  const seed = createSeed(scene);
  // v23 (Psalm 84:3): at evening the swallows come down onto the river and
  // work it end to end, touching the water at the bottom of every beat. They
  // ride the course itself, so they need nothing built above them.
  const swallows = createSwallows(scene);
  // v24 (Job 38:25): lightning kindled far off in the heaviest of a shower,
  // and the thunder a while after it. It reads only the sky's own rain.
  const lightning = createLightning(scene);

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
    creatures.update(dt, hour.night, playerPos, lure, hour.sabbath, hour.t);
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
    grain.update(hour.t, hour.sabbath, hour.year);
    storks.update(dt);
    locusts.update(dt);
    puddles.update(dt, hour.rain);
    rainbow.update(dt, hour.rain, hour.clearing, hour.sunElev, hour.sunAz);
    web.update(dt, hour.t);
    ants.update(dt, hour.night);
    shadows.update(dt, hour.sunElev, hour.sunAz, hour.rain);
    conies.update(dt);
    leaves.update(dt, hour.t, hour.sabbath);
    cranes.update(dt, hour.t);
    camphire.update(hour.t, hour.sabbath);
    fig.update(hour.year);
    vapours.update(dt, hour.t, hour.rain);
    foxes.update(dt, hour.t);
    hoarfrost.update(dt, hour.year, hour.t);
    springs.update(dt, hour.rain);
    mandrakes.update(dt, hour.t);
    behemoth.update(dt, hour.night);
    rays.update(dt, hour.sunElev, hour.sunAz, hour.rain);
    owl.update(dt, hour.night);
    deeps.update(dt, hour.rain);
    ram.update(dt, hour.sabbath);
    seed.update(dt, playerPos, hour.t, hour.sabbath);
    swallows.update(dt, hour.t);
    spices.update(dt, hour.t);
    stump.update(hour.year);
    cleft.update(dt, playerPos);
    honey.update(dt, hour.night, hour.rain);
    ostrich.update(dt, hour.sabbath);
    lightning.update(dt, hour.rain);
    mustard.update(dt);
    manna.update(dt, hour.t, hour.sabbath);
    eyrie.update(dt, creatures.eagleMode());
    hind.update(dt, hour.sabbath);
    tender.update(dt, hour.rain);
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
    namedThing: creatures.namedThing,
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
    cedars: cedars.count,
    web: web.state,
    willows: willows.count,
    ants: ants.state,
    shadows: shadows.state,
    vine: vine.spot,
    conies: conies.state,
    leaves: leaves.state,
    cranes: cranes.state,
    palms: palms.count,
    almond: almond.count,
    frankincense: frankincense.count,
    hyssop: hyssop.count,
    lilies: lilies.count,
    camphire: camphire.count,
    fig: fig.state,
    vapours: vapours.state,
    myrtle: myrtle.count,
    sheaves: sheaves.count,
    foxes: foxes.state,
    hoarfrost: hoarfrost.state,
    olive: olive.pos,
    springs: springs.state,
    mandrakes: mandrakes.state,
    behemoth: behemoth.state,
    rays: rays.state,
    owl: owl.state,
    deeps: deeps.state,
    ram: ram.state,
    rods: rods.state,
    seed: seed.state,
    wildvine: wildvine.state,
    rocks: rocks.state,
    swallows: swallows.state,
    spices: spices.state,
    stump: stump.state,
    cleft: cleft.state,
    honey: honey.state,
    ostrich: ostrich.state,
    lightning: lightning.state,
    mustard: mustard.state,
    manna: manna.state,
    eyrie: eyrie.state,
    grain: grain.state,
    hind: hind.state,
    acacia: acacia.state,
    tender: tender.state,
    get reverence() { return reverence; },
    get wind() { return windNow; },
  };
}
