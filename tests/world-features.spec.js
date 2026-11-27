// Feature checks for the Garden of Eden world — the EDITABLE half.
//
// Each test here pins one particular thing an earlier version built (the four
// rivers, the stepping stones, the gate of light, the dew…). They guard those
// features against accidental breakage. They are not sacred: when an update
// DELIBERATELY reshapes or retires a feature, it may update or remove that
// feature's test here — and must say so, test by test, in its PR. New features
// should add their own test here. The safety checks that protect every version
// of the garden live in world-core.spec.js, which is locked.
//
// House rule for anything that moves or fades: assert with expect.poll windows,
// never a single fixed-delay sample (CI's software renderer runs slow).
const { test, expect } = require('@playwright/test');
const { gotoWorldReady, appFrame, getState, dist2d, enterHeaven, expectInBudget, watchPageErrors } = require('./world-helpers');

test.describe('the garden\'s features', () => {
  test('the river parts into four heads east of the garden (Genesis 2:10)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);
    // Mid-fan (x=42) the inner pair of heads ride ~±4.4 either side of the
    // old centreline. Inside a head's channel the ground is a carved bed…
    const inHead = await frame.evaluate(() => window.__world.teleport(42, 25.0));
    expect(inHead.y).toBeLessThan(-0.9);
    // …while midway between two heads it rises back to walkable meadow —
    // the single course really has been parted, not merely widened.
    const between = await frame.evaluate(() => window.__world.teleport(42, 20.65));
    expect(between.y).toBeGreaterThan(0.2);
    // Upstream, in the garden itself, the course is still one undivided
    // river: its centreline is wet from bank to bank.
    const upstream = await frame.evaluate(() => window.__world.teleport(0, 14));
    expect(upstream.y).toBeLessThan(-0.9);
  });

  test('evening and morning — the sky keeps time (Genesis 1:5)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const meanBright = px => px.reduce((a, p) => a + Math.max(p[0], p[1], p[2]), 0) / px.length;

    // Every visit begins in morning light…
    const day = await frame.evaluate(() => ({
      time: window.__world.getState().time,
      px: window.__world.samplePixels(4),
    }));
    expect(day.time.phase).toBe('morning');
    expect(day.time.night).toBeLessThan(0.1);

    // …and the clock can be jumped to night: the same scene, truly darker,
    // still inside the render budget with stars and moon now in the sky.
    const night = await frame.evaluate(() => ({
      time: window.__world.setTime('night'),
      px: window.__world.samplePixels(4),
    }));
    expect(night.time.phase).toBe('night');
    expect(night.time.night).toBeGreaterThan(0.9);
    expect(meanBright(night.px)).toBeLessThan(meanBright(day.px) * 0.6);

    const s = await getState(page);
    expect(s.render.calls).toBeLessThan(200);
    expect(s.render.triangles).toBeLessThan(150000);
  });

  test('the four heads bear their names (Genesis 2:11–14)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const stones = await frame.evaluate(() => window.__world.getState().stones);
    expect(stones.map(s => s.name)).toEqual(['Pishon', 'Gihon', 'Tigris', 'Euphrates']);
    // Each stone stands on dry ground beside its own channel — on the bank,
    // never down in a carved riverbed.
    for (const stone of stones) {
      const pos = await frame.evaluate(
        ([x, z]) => window.__world.teleport(x, z),
        [stone.x, stone.z],
      );
      expect(pos.y).toBeGreaterThan(-0.4);
    }
  });

  test('stepping stones ford the river at the crossing', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const crossing = await frame.evaluate(() => window.__world.getState().crossing);
    expect(crossing.length).toBeGreaterThanOrEqual(5);
    // Every stone stands proud of the water (surface ≈ -0.5, ripples to -0.4)…
    for (const stone of crossing) {
      const pos = await frame.evaluate(
        ([x, z]) => window.__world.teleport(x, z),
        [stone.x, stone.z],
      );
      expect(pos.y).toBeGreaterThan(-0.42);
    }
    // …while beside the crossing the river is still a river.
    const wet = await frame.evaluate(() => window.__world.teleport(4, 15.9));
    expect(wet.y).toBeLessThan(-0.9);
  });

  test('signs in the night sky, and the flyers roost at dusk', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // The three figures the Scriptures name (Genesis 1:14; Job 9:9).
    const state = await getState(page);
    expect(state.constellations).toEqual(['the Bear', 'Orion', 'the Pleiades']);

    // The garden's census: birds and doves aloft, cattle and lamb at pasture.
    expect(state.fauna.flyers.length).toBe(5);
    expect(state.fauna.flyers.filter(f => f.kind === 'dove').length).toBe(2);
    expect(state.fauna.cattle).toBe(2);
    expect(state.fauna.fish).toBe(5);

    // When night falls, every flyer makes for the two trees to roost.
    await frame.evaluate(() => window.__world.setTime('night'));
    await expect.poll(async () => {
      const fauna = await frame.evaluate(() => window.__world.getState().fauna);
      return fauna.flyers.every(f => f.mode === 'toRoost' || f.mode === 'roost');
    }, { timeout: 5000 }).toBe(true);
  });

  test('weather: rain answers the call, and the signs wheel with the year', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // A fresh visit is dry — the shower clock keeps its distance at first.
    expect((await getState(page)).weather.rain).toBeLessThan(0.05);

    // Call the rain and watch it arrive (eased, so poll — never sample once).
    await frame.evaluate(() => window.__world.setRain(1));
    await expect.poll(async () => (await getState(page)).weather.rain)
      .toBeGreaterThan(0.8);

    // Raining, the world still renders inside its budget.
    const s = await getState(page);
    expect(s.render.calls).toBeLessThan(200);
    expect(s.render.triangles).toBeLessThan(150000);

    // Every cloud lays a shade on the land, and the shade drifts with its
    // cloud (poll for the motion — never a fixed-delay sample).
    expect(s.weather.shade.length).toBe(5);
    const shade0 = s.weather.shade[0];
    await expect.poll(async () => {
      const sh = (await getState(page)).weather.shade[0];
      return Math.abs(sh.x - shade0.x);
    }).toBeGreaterThan(0.01);

    // Send it away again: the shower passes.
    await frame.evaluate(() => window.__world.setRain(0));
    await expect.poll(async () => (await getState(page)).weather.rain)
      .toBeLessThan(0.1);

    // The firmament wheels through the long year — slowly, but measurably:
    // poll until the angle has visibly advanced from where it stood.
    const wheel0 = (await getState(page)).heavens.wheel;
    await expect.poll(async () => Math.abs((await getState(page)).heavens.wheel - wheel0))
      .toBeGreaterThan(1e-4);
  });

  test('small wings among the blossoms: butterflies and bees, named and homed', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // The census: six butterflies aloft by day, eight bees at two beds.
    const fauna = (await getState(page)).fauna;
    expect(fauna.butterflies.length).toBe(6);
    expect(fauna.butterflies.every(b => b.mode === 'flit')).toBe(true);
    expect(fauna.bees.count).toBe(8);
    expect(fauna.bees.mode).toBe('hum');
    expect(fauna.bees.patches.length).toBe(2);

    // Stand at the heart of a bee bed: the closest bee circles within reach,
    // and the naming gives Devorah (the dwell makes one poll never enough).
    const patch = fauna.bees.patches[0];
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z), [patch.x, patch.z]);
    await expect.poll(async () => {
      const naming = (await getState(page)).naming;
      return naming && naming.name;
    }, { timeout: 10000 }).toBe('Devorah');

    // Night sends the small wings home: bees out of sight, butterflies
    // folded into the grass.
    await frame.evaluate(() => window.__world.setTime('night'));
    await expect.poll(async () => {
      const f = (await getState(page)).fauna;
      return f.bees.mode === 'home' && f.butterflies.every(b => b.mode === 'rest');
    }, { timeout: 10000 }).toBe(true);
  });

  test('draw near a creature and its name is given (Genesis 2:19-20)', async ({ page }) => {
    // The world's clock is capped per frame, so a slow CI runner simulates slower
    // than real time: every wait below polls with a generous ceiling.
    test.setTimeout(120000);
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // Standing apart on the south-eastern meadow, no name is given.
    await frame.evaluate(() => window.__world.teleport(30, -30));
    await expect.poll(async () => (await getState(page)).naming, { timeout: 30000 }).toBe(null);

    // Draw near the lamb — wherever it now grazes. It wanders, so each
    // poll re-reads its place from the census and steps up beside it;
    // the short dwell before a name is given makes one poll never enough.
    await expect.poll(async () => {
      const lamb = (await getState(page)).fauna.grazers.find(g => g.kind === 'lamb');
      await frame.evaluate(([x, z]) => window.__world.teleport(x + 0.7, z + 0.7), [lamb.x, lamb.z]);
      const naming = (await getState(page)).naming;
      return naming && naming.name;
    }, { timeout: 40000 }).toBe('Taleh');

    // The caption stands in the world's own document, name and kind.
    await expect(frame.locator('.naming')).toHaveClass(/naming--shown/, { timeout: 30000 });
    await expect(frame.locator('.naming__label')).toHaveText('the lamb', { timeout: 30000 });

    // The golden fish alone bears a name of its own.
    await expect.poll(async () => {
      const gold = (await getState(page)).fauna.shoal.find(f => f.name === 'Zahav');
      await frame.evaluate(([x, z]) => window.__world.teleport(x + 0.4, z), [gold.x, gold.z]);
      const naming = (await getState(page)).naming;
      return naming && naming.name;
    }, { timeout: 40000 }).toBe('Zahav');

    // Walking away, the caption lets go and the garden falls quiet again.
    await frame.evaluate(() => window.__world.teleport(30, -30));
    await expect.poll(async () => (await getState(page)).naming, { timeout: 30000 }).toBe(null);
    // The caption itself is updated by the render loop, a frame or more later.
    await expect(frame.locator('.naming')).not.toHaveClass(/naming--shown/, { timeout: 40000 });
  });

  test('stillness by the water: the walker sits, and a fish draws near (v8)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // A fresh visit stands; no fish is drawn up out of the deep.
    const s0 = await getState(page);
    expect(s0.stillness.sitting).toBe(false);
    expect(s0.fauna.shoal.every(f => f.rise < 0.1)).toBe(true);

    // Rest by the river's edge. Sitting is invited by stillness near the
    // water and can also be asked for directly — use the deliberate form so
    // the test doesn't hinge on wall-clock timing.
    await frame.evaluate(() => window.__world.teleport(3, 13.6));
    await frame.evaluate(() => window.__world.sit(true));
    await expect.poll(async () => (await getState(page)).stillness.sitting, { timeout: 5000 }).toBe(true);

    // Seated, a fish forgets its wariness and rises to hang near the watcher
    // (rise eases in, so poll — never a single sample).
    await expect.poll(async () => {
      const shoal = (await getState(page)).fauna.shoal;
      return Math.max(...shoal.map(f => f.rise));
    }, { timeout: 10000 }).toBeGreaterThan(0.5);

    // Rise again and the garden returns to itself: the fish sinks back down.
    await frame.evaluate(() => window.__world.sit(false));
    await expect.poll(async () => (await getState(page)).stillness.sitting).toBe(false);
    await expect.poll(async () => {
      const shoal = (await getState(page)).fauna.shoal;
      return Math.max(...shoal.map(f => f.rise));
    }, { timeout: 10000 }).toBeLessThan(0.1);
  });

  test('a gate of light stands to the east, and reeds line the banks (v8)', async ({ page }) => {
    await gotoWorldReady(page);
    const s = await getState(page);

    // The gate stands far to the east, on the risen rim near the walk's edge.
    expect(s.gate.x).toBeGreaterThan(40);
    expect(Math.hypot(s.gate.x, s.gate.z)).toBeGreaterThan(45);

    // Reeds and rushes stand along the banks — a good stand of them.
    expect(s.reeds).toBeGreaterThan(40);

    // The east and its light, the reeds and their sway, all inside budget.
    expect(s.render.calls).toBeLessThan(200);
    expect(s.render.triangles).toBeLessThan(150000);
  });

  test('a subtle presence stirs the grass near the Tree of Knowledge (v8)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // It keeps to its own rare clock; a fresh visit shows no sign of it.
    expect((await getState(page)).presence.active).toBe(false);

    // Call it for a glimpse: it stirs the grass at the dark tree's foot.
    await frame.evaluate(() => window.__world.stir());
    await expect.poll(async () => (await getState(page)).presence.active, { timeout: 5000 }).toBe(true);

    // And it keeps close to the Tree of the Knowledge of Good and Evil
    // (at roughly x≈3.4, z≈0.8), never wandering off across the garden.
    const p = (await getState(page)).presence;
    expect(Math.hypot(p.x - 3.4, p.z - 0.8)).toBeLessThan(6);
  });

  test('the water answers: reflections lie on it, and a wading step rings (v9)', async ({ page }) => {
    // A ring lives 1.3 simulated seconds, and the world's clock is capped per
    // frame (0.05s) — on a slow CI runner that is far more than 1.3 real seconds.
    test.setTimeout(90000);
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // Bank trees lay their impressions on the surface (the seeded scatter
    // puts a deterministic handful of trees near enough the water).
    const s0 = await getState(page);
    expect(s0.reflections).toBeGreaterThanOrEqual(1);

    // Dry-footed, the water is unrung.
    expect(s0.wake.rings).toBe(0);

    // Step into the river's wadable stretch: rings widen where the step met
    // the water (they ease out over ~1.3s, so poll — never a single sample).
    await frame.evaluate(() => window.__world.teleport(-20, 6));
    await expect.poll(async () => (await getState(page)).wake.rings, { timeout: 5000 }).toBeGreaterThan(0);

    // Back on dry land the last rings widen away and the water settles. Wait
    // on the garden's own clock, not the wall's: the day's clock (time.t)
    // turns once every 420 simulated seconds (scenes/sky.js), so it tells how
    // much garden time has passed since the step out — and by 2 garden
    // seconds every ring (1.3s each, scenes/wake.js) must be spent.
    const leftAt = await frame.evaluate(() => {
      window.__world.teleport(30, -30);
      return window.__world.getState().time.t;
    });
    const gardenSecondsSince = t => ((((t - leftAt) % 1) + 1) % 1) * 420;
    let water;
    await expect.poll(async () => {
      water = await getState(page);
      return water.wake.rings === 0 || gardenSecondsSince(water.time.t) > 2;
    }, { timeout: 60000, message: 'the garden clock moves 2s on, or the water settles' }).toBe(true);
    expect(water.wake.rings, 'rings still widening 2 garden seconds after the step out').toBe(0);

    // The reflections, the wake, and all the rest still inside budget.
    expect(s0.render.calls).toBeLessThan(200);
    expect(s0.render.triangles).toBeLessThan(150000);
  });

  test('blossom rides the golden hours, and thins at plain noon (v9)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // The hour before sunset: the garden blooms hardest.
    await frame.evaluate(() => window.__world.setTime('evening'));
    await expect.poll(async () => (await getState(page)).petals.golden, { timeout: 5000 }).toBeGreaterThan(0.5);
    await expect.poll(async () => (await getState(page)).petals.drifting, { timeout: 10000 }).toBeGreaterThan(5);

    // Plain noon: the golden factor falls away (petals already loosed may
    // still be drifting down — only the hour's generosity is asserted).
    await frame.evaluate(() => window.__world.setTime('noon'));
    await expect.poll(async () => (await getState(page)).petals.golden, { timeout: 5000 }).toBeLessThan(0.1);
  });

  test('at first light the dew glints and the keeper is hinted; noon clears both (v9)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // Dawn: the meadow's beads catch the light, and above the eastern gate
    // the wing-like sweeps gather (never a figure, only a factor here).
    await frame.evaluate(() => window.__world.setTime('dawn'));
    await expect.poll(async () => (await getState(page)).dew.glint, { timeout: 5000 }).toBeGreaterThan(0.5);
    await expect.poll(async () => (await getState(page)).gate.keeper, { timeout: 5000 }).toBeGreaterThan(0.5);

    // By noon the dew has dried and the keeper has withdrawn.
    await frame.evaluate(() => window.__world.setTime('noon'));
    await expect.poll(async () => (await getState(page)).dew.glint, { timeout: 5000 }).toBeLessThan(0.05);
    await expect.poll(async () => (await getState(page)).gate.keeper, { timeout: 5000 }).toBeLessThan(0.05);

    // The dew is a real (seeded) field of beads, not an empty cloud.
    expect((await getState(page)).dew.beads).toBeGreaterThan(100);
  });

  test('the cool of the day, and the spring found to the west (v10, Genesis 3:8; 2:10)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // By day the garden is still.
    expect((await getState(page)).wind).toBeLessThan(0.05);

    // At evening a gust rises — the whole garden still renders inside budget.
    await frame.evaluate(() => window.__world.setTime('evening'));
    await expect.poll(async () => (await getState(page)).wind, { timeout: 5000 }).toBeGreaterThan(0.5);
    const s = await getState(page);
    expect(s.render.calls).toBeLessThan(200);
    expect(s.render.triangles).toBeLessThan(150000);

    // By noon it has passed again.
    await frame.evaluate(() => window.__world.setTime('noon'));
    await expect.poll(async () => (await getState(page)).wind, { timeout: 5000 }).toBeLessThan(0.05);

    // West of everything else, near the walk's own edge, the river is first found.
    const spring = (await getState(page)).spring;
    expect(spring.x).toBeLessThan(-40);
    expect(Math.hypot(spring.x, spring.z)).toBeLessThan(50);
  });

  test('a flock begun, and fruit in season, named like any living thing (v10)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // The lamb has two companions now.
    const fauna = (await getState(page)).fauna;
    expect(fauna.lamb).toBe(3);
    expect(fauna.grazers.filter(g => g.kind === 'lamb').length).toBe(3);

    // A few of the planted trees bear fruit — figs and pomegranates.
    const fruit = (await getState(page)).fruit;
    expect(fruit.filter(f => f.kind === 'fig').length).toBe(3);
    expect(fruit.filter(f => f.kind === 'pomegranate').length).toBe(3);

    // Draw near one and it is named, the same as any living thing in the garden.
    const pom = fruit.find(f => f.kind === 'pomegranate');
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z), [pom.pos.x, pom.pos.z]);
    await expect.poll(async () => {
      const naming = (await getState(page)).naming;
      return naming && naming.name;
    }, { timeout: 10000 }).toBe('Rimmon');
  });

  test('footprints linger a while on the sandy banks, then fade (v10, Genesis 2:15)', async ({ page }) => {
    // A print lingers LIFE = 7.5 simulated seconds, and the world's clock is capped
    // per frame (0.05s) — on a slow CI runner that is far more than 7.5 real seconds.
    test.setTimeout(150000);
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // A fresh visit shows no prints.
    expect((await getState(page)).footprints.prints).toBe(0);

    // Walk a stretch of the western bank — real sand, not the water itself
    // (wading leaves the wake's own rings instead, v9).
    await frame.evaluate(() => window.__world.teleport(-40, 11.22, Math.PI / 2));
    // Keep stepping along the bank until a print lands (prints are laid by frames
    // that see the walker move; a slow runner may need more steps than a fast one).
    let step = 0;
    await expect.poll(async () => {
      step++;
      await frame.evaluate((n) => window.__world.teleport(-40 + (n % 40) * 0.13, 11.22, Math.PI / 2), step);
      await page.waitForTimeout(80);
      return (await getState(page)).footprints.prints;
    }, { timeout: 30000 }).toBeGreaterThan(0);

    // Move well away; the bank forgets them after a while (poll — CI's
    // software renderer dilates simulated time well past real, per house rule).
    await frame.evaluate(() => window.__world.teleport(30, -30));
    await expect.poll(async () => (await getState(page)).footprints.prints, { timeout: 100000 }).toBe(0);
  });

  test('the ground blossoms where the walker goes, and round him when he stands still (v28, Isaiah 35:1-2)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);
    // Short steps across the open meadow south of the sacred trees — each
    // far under blossom.js's teleport threshold, so each one counts as
    // walking. Poll: a slow runner may need more steps than a fast one.
    await frame.evaluate(() => window.__world.teleport(-2, -12));
    const before = (await getState(page)).blossom.byWalker;
    let step = 0;
    await expect.poll(async () => {
      step++;
      await frame.evaluate((n) => window.__world.teleport(-2 - (n % 16) * 0.4, -12 - (n % 16) * 0.3), step);
      await page.waitForTimeout(60);
      return (await getState(page)).blossom.byWalker;
    }, { timeout: 30000 }).toBeGreaterThan(before + 6);
    // The flowers that came up under his own feet actually open.
    await expect.poll(async () => (await getState(page)).blossom.mine, { timeout: 20000 }).toBeGreaterThan(6);

    // Standing still, the blossoming spreads out round him without a step.
    const stood = (await getState(page)).blossom.byWalker;
    await expect.poll(async () => (await getState(page)).blossom.ringing, { timeout: 20000 }).toBe(true);
    await expect.poll(async () => (await getState(page)).blossom.byWalker, { timeout: 20000 }).toBeGreaterThan(stood + 4);
  });

  test('the fowls of the air: the great flock comes to a still walker, goes off at midday, roosts at night (v29, Matthew 6:26)', async ({ page }) => {
    test.setTimeout(120000);
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // Morning: the flock is up and dancing over the garden.
    const first = (await getState(page)).murmuration;
    expect(first.birds).toBeGreaterThan(1000);
    expect(first.visible).toBe(true);
    expect(['dance', 'before']).toContain(first.mode);

    // Stand still out on the south-western meadow: the flock leaves its own
    // wandering and comes to wheel close before him.
    await frame.evaluate(() => window.__world.teleport(-20, -25, 0));
    await expect.poll(async () => {
      const m = (await getState(page)).murmuration;
      return m.call > 0.6 && m.near !== null && m.near < 32;
    }, { timeout: 60000 }).toBe(true);
    expect((await getState(page)).murmuration.arrivals).toBeGreaterThan(0);

    // Through the heat of the day it is off beyond the rim, out of sight.
    await frame.evaluate(() => window.__world.setTime(0.38));
    await expect.poll(async () => {
      const m = (await getState(page)).murmuration;
      return m.mode === 'away' && !m.visible;
    }, { timeout: 20000 }).toBe(true);

    // At night it is down in the reeds; with the morning it is aloft again.
    await frame.evaluate(() => window.__world.setTime('night'));
    await expect.poll(async () => {
      const m = (await getState(page)).murmuration;
      return m.mode === 'roost' && !m.visible;
    }, { timeout: 20000 }).toBe(true);
    await frame.evaluate(() => window.__world.setTime('morning'));
    await expect.poll(async () => (await getState(page)).murmuration.visible, { timeout: 20000 }).toBe(true);
  });

  test('living water: the sun glitters on the river, and at night it lights where he wades (v30, Revelation 22:1)', async ({ page }) => {
    test.setTimeout(90000);
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // Morning: the glints lie over the river, and the sun can strike them.
    const day = (await getState(page)).living;
    expect(day.glints).toBeGreaterThan(1000);
    await expect.poll(async () => (await getState(page)).living.sun, { timeout: 15000 }).toBeGreaterThan(0.5);

    // Night: the water carries its own light; wade along it and the places
    // he has waded keep shining behind him, and its name is given.
    await frame.evaluate(() => window.__world.setTime('night'));
    await expect.poll(async () => (await getState(page)).living.glow, { timeout: 15000 }).toBeGreaterThan(0.5);
    await frame.evaluate(() => window.__world.teleport(-8, 14, Math.PI / 2));
    await frame.evaluate(() => window.__world.walkTo(4, 14.3));
    await expect.poll(async () => {
      const l = (await getState(page)).living;
      return l.stir > 0.5 && l.trail >= 3;
    }, { timeout: 30000 }).toBe(true);
    await expect.poll(async () => frame.locator('.naming__name').textContent(), { timeout: 30000 }).toBe('Mayim chayyim');
  });

  test('gathering: stand under a fruiting tree and a fruit is given into his hands, then eaten (v30, Genesis 2:16)', async ({ page }) => {
    test.setTimeout(90000);
    await gotoWorldReady(page);
    const frame = appFrame(page);

    const { trees, given } = (await getState(page)).gather;
    expect(trees.length).toBeGreaterThan(0);
    expect(given).toBe(0);
    // The fruiting tree nearest the heart of the garden; stand under it.
    const tree = [...trees].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z + 2.2, Math.PI), [tree.x, tree.z]);

    await expect.poll(async () => frame.locator('.naming__name').textContent(), { timeout: 30000 }).toBe('Akhol tokhel');
    await expect.poll(async () => (await getState(page)).gather.given, { timeout: 30000 }).toBeGreaterThan(0);
    // He eats it, and his hands are free again.
    await expect.poll(async () => {
      const g = (await getState(page)).gather;
      return g.eaten > 0 && g.stage === 'idle';
    }, { timeout: 30000 }).toBe(true);
  });

  test('the flock knows him: it follows where he leads, lies down round him, and rests at noon (v31, John 10:4; Psalm 23:2)', async ({ page }) => {
    test.setTimeout(150000);
    await gotoWorldReady(page);
    const frame = appFrame(page);

    // Three sheep — a ewe, a ram and their lamb — graze their own pasture, none yet following.
    const f0 = (await getState(page)).flock;
    expect(f0.count).toBe(3);
    expect(f0.following).toBe(0);
    for (const s of f0.sheep) expect(Math.hypot(s.x - f0.home.x, s.z - f0.home.z)).toBeLessThan(7);

    // Walk in among them and they fall in behind him, and the flock's name
    // is given.
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z, Math.PI / 2), [f0.home.x, f0.home.z]);
    await expect.poll(async () => (await getState(page)).flock.following, { timeout: 30000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(async () => frame.locator('.naming__name').textContent(), { timeout: 30000 }).toBe('Tson');

    // Lead them off across the meadow: they come after him, and stay with
    // him. (A tap-walk may stop a little short beside something it names on
    // the way, so this asks only that he has gone well on, not where he ends.)
    const to = { x: f0.home.x + 12, z: f0.home.z - 5 };
    await frame.evaluate(([x, z]) => window.__world.walkTo(x, z), [to.x, to.z]);
    await expect.poll(async () => {
      const s = await getState(page);
      if (Math.hypot(s.pos.x - f0.home.x, s.pos.z - f0.home.z) < 5) return false;
      const near = s.flock.sheep.filter(h => h.mode === 'follow' && Math.hypot(h.x - s.pos.x, h.z - s.pos.z) < 8);
      return near.length >= 2;
    }, { timeout: 45000 }).toBe(true);

    // He stands: his followers come round him and lie down, and the psalm's
    // word is given. Having lain down, they follow him no further.
    await expect.poll(async () => {
      const f = (await getState(page)).flock;
      return f.rests > 0 && f.following === 0 && f.sheep.filter(h => h.rested).length >= 2;
    }, { timeout: 45000 }).toBe(true);
    await expect.poll(async () => frame.locator('.naming__name').textContent(), { timeout: 30000 }).toBe('Yarbitseni');

    // While he stays beside them they stay lying down, not following.
    await page.waitForTimeout(1500);
    {
      const f = (await getState(page)).flock;
      expect(f.following).toBe(0);
      expect(f.sheep.filter(h => h.rested && h.lie > 0.6).length).toBeGreaterThanOrEqual(2);
    }
    // He walks a little way off: they do not come after him.
    const lay = (await getState(page)).pos;
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z), [lay.x + 8, lay.z]);
    await page.waitForTimeout(1500);
    expect((await getState(page)).flock.following).toBe(0);
    // He comes back among them: they know him again and follow.
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z), [lay.x, lay.z]);
    await expect.poll(async () => (await getState(page)).flock.following, { timeout: 30000 }).toBeGreaterThanOrEqual(2);

    // He goes far off: they let him go, and graze where he led them — the
    // pasture is now nearer the place he left them than the one they came from.
    const left = (await getState(page)).pos;
    await frame.evaluate(() => window.__world.teleport(30, -30));
    await expect.poll(async () => {
      const f = (await getState(page)).flock;
      const fromLeft = Math.hypot(f.home.x - left.x, f.home.z - left.z);
      const fromOld = Math.hypot(f.home.x - f0.home.x, f.home.z - f0.home.z);
      return f.following === 0 && fromLeft < fromOld;
    }, { timeout: 30000 }).toBe(true);

    // Through the heat of the middle day the grazing flock lies down.
    await frame.evaluate(() => window.__world.setTime('noon'));
    await expect.poll(async () => (await getState(page)).flock.lying, { timeout: 30000 }).toBeGreaterThanOrEqual(2);
  });

  test('consider the heavens: tap the sky and he lies back to look up — the flock wheels over him by day, and by night the stars come out and each sign is named (v34, Psalm 8:3; Genesis 15:5; Psalm 147:4)', async ({ page }) => {
    test.setTimeout(180000);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const vp = page.viewportSize();

    // A fresh visit stands, and the night's host of stars is not drawn.
    const s0 = await getState(page);
    expect(s0.consider.lying).toBe(false);
    expect(s0.consider.host.stars).toBeGreaterThan(3000);
    expect(s0.consider.host.shown).toBe(false);

    // Not in the river: he will not lie down in the water.
    await frame.evaluate(() => window.__world.teleport(-20, 6));
    expect(await frame.evaluate(() => window.__world.consider(true))).toBe(false);

    // Out on the open south-western meadow, a tap on the sky (the top of the
    // screen) lays him down. The very first touch only skips the opening
    // shot, so tap again if that one was taken for it.
    await frame.evaluate(() => window.__world.teleport(-20, -25, 0));
    await page.mouse.click(vp.width / 2, 24);
    await page.waitForTimeout(800);
    if (!(await getState(page)).consider.lying) await page.mouse.click(vp.width / 2, 24);
    await expect.poll(async () => (await getState(page)).consider.lying, { timeout: 10000 }).toBe(true);

    // He lies back, and the camera comes down beside his head and looks up.
    await expect.poll(async () => {
      const s = await getState(page);
      return s.consider.lie > 0.99 && s.consider.gaze > 0.95 && s.consider.up > 0.6
        && s.cam.y - s.pos.y < 1.2 && s.camDist < 2;
    }, { timeout: 30000 }).toBe(true);

    // By day the heavens' word is given, and the great flock comes to wheel
    // right over him, high up.
    await expect.poll(async () => (await getState(page)).consider.word, { timeout: 30000 }).toBe('Shamayim');
    await expect.poll(async () => {
      const s = await getState(page);
      const m = s.murmuration;
      return m.call > 0.6 && m.over > 0.9 && m.y - s.pos.y > 12 && Math.hypot(m.x - s.pos.x, m.z - s.pos.z) < 16;
    }, { timeout: 60000 }).toBe(true);

    // Any tap brings him up again, and the camera goes back behind him.
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await expect.poll(async () => {
      const s = await getState(page);
      return !s.consider.lying && s.consider.lie === 0 && s.camDist > 4;
    }, { timeout: 30000 }).toBe(true);

    // By night, lying back, his eyes grow used to the dark: the host of
    // stars and the Milky Way come out, a sign is gone to and named (the
    // Bear always stands high enough), and the stars in sight sing.
    await frame.evaluate(() => window.__world.setTime('night'));
    expect(await frame.evaluate(() => window.__world.consider(true))).toBe(true);
    await expect.poll(async () => {
      const h = (await getState(page)).consider.host;
      return h.shown && h.band && h.adapt > 0.6;
    }, { timeout: 60000 }).toBe(true);
    await expect.poll(async () => (await getState(page)).consider.word, { timeout: 30000 }).toBe('Kokhavim');
    let named;
    await expect.poll(async () => {
      named = (await getState(page)).caption;
      return !!named && ['Ash', 'Kesil', 'Kimah', 'Yareach'].includes(named.name);
    }, { timeout: 90000 }).toBe(true);
    await expect.poll(async () => (await getState(page)).consider.host.sung, { timeout: 60000 }).toBeGreaterThan(0);

    // Up again, the Milky Way is let go; the night sky is as it was, and
    // the whole of it stayed inside the budget.
    await frame.evaluate(() => window.__world.consider(false));
    await expect.poll(async () => (await getState(page)).consider.host.band, { timeout: 30000 }).toBe(false);
    const s1 = await getState(page);
    expect(s1.render.calls).toBeLessThan(200);
    expect(s1.render.triangles).toBeLessThan(150000);
  });

  test('angels go up and down Jacob\'s ladder (Genesis 28:12)', async ({ page }) => {
    await gotoWorldReady(page);
    const a0 = (await getState(page)).ladder.angels;
    expect(a0.length).toBeGreaterThanOrEqual(6);
    expect(a0.some(a => a.up > 0) && a0.some(a => a.up < 0)).toBe(true);
    // Some climbing and some coming down, each the way it is going.
    await expect.poll(async () => {
      const a1 = (await getState(page)).ladder.angels;
      const rose = a1.filter((a, i) => a.up > 0 && a.y > a0[i].y + 0.3).length;
      const fell = a1.filter((a, i) => a.up < 0 && a.y < a0[i].y - 0.3).length;
      return Math.min(rose, fell);
    }, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
  });

  test('in heaven, today\'s saint greets him at the head of the ladder, and each saint is named as he draws near (AB#106)', async ({ page }) => {
    test.setTimeout(300000);
    // 19 October 2026 keeps the North American martyrs, in red.
    await gotoWorldReady(page, '?day=2026-10-19');
    await enterHeaven(page);
    const frame = appFrame(page);
    let s = await getState(page);
    // Every saint in the site's records — St Joseph's two feasts are one man.
    expect(s.heaven.saints).toBe(161);
    expect(s.heaven.today).toEqual({
      name: 'Saints John de Brébeuf and Isaac Jogues', title: 'Priests, and Companions, Martyrs', color: 'red',
    });
    await expect.poll(async () => (await getState(page)).caption, { timeout: 20000 }).toEqual({
      name: 'Saints John de Brébeuf and Isaac Jogues', label: 'Priests, and Companions, Martyrs · today',
    });

    // Beside the first saint in the ranks, its name, title and feast day.
    const saint = s.heaven.saint;
    expect(saint.name).toBe('Saints Basil the Great and Gregory Nazianzen');
    await frame.evaluate(p => window.__world.teleport(p.x - Math.sign(p.x), p.z - 0.5), saint);
    await expect.poll(async () => (await getState(page)).caption, { timeout: 20000 }).toEqual({
      name: 'Saints Basil the Great and Gregory Nazianzen', label: 'Bishops and Doctors of the Church · 2 January',
    });
    s = await getState(page);
    expect(s.heaven.near).toBe(saint.name);
  });

  test('the new song in heaven: a still prayer rises as incense and is answered, his steps kindle the glass, leaves float down the river (v33, Revelation 8:4; 15:2; 19:6; 22:2)', async ({ page }) => {
    test.setTimeout(300000);
    await gotoWorldReady(page);
    await enterHeaven(page);
    const frame = appFrame(page);
    let s = await getState(page);
    // The leaves of the Tree of Life are carried down the river.
    expect(s.heaven.song.leaves).toBeGreaterThan(20);

    // Standing still where he came up, he lifts his hands and his prayer
    // rises as incense; kept still while it rises, the multitude answers and
    // the glory brightens with it.
    await expect.poll(async () => (await getState(page)).heaven.song.praying, { timeout: 60000 }).toBe(true);
    await expect.poll(async () => (await getState(page)).heaven.song.his, { timeout: 60000 }).toBeGreaterThan(10);
    await expect.poll(async () => (await getState(page)).heaven.song.answers, { timeout: 120000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => (await getState(page)).heaven.song.flare, { timeout: 30000 }).toBeGreaterThan(0.2);

    // Walking, every step kindles fire in the sea of glass and plucks a harp,
    // and the prayer ends.
    s = await getState(page);
    const steps0 = s.heaven.song.steps, notes0 = s.heaven.song.notes;
    await page.keyboard.down('ArrowUp');
    try {
      await expect.poll(async () => {
        const song = (await getState(page)).heaven.song;
        return song.steps >= steps0 + 4 && song.notes >= notes0 + 4 && song.rings > 0 && !song.praying;
      }, { timeout: 60000 }).toBe(true);
    } finally {
      await page.keyboard.up('ArrowUp');
    }
    // Standing again, the fire dies down.
    await expect.poll(async () => (await getState(page)).heaven.song.rings, { timeout: 30000 }).toBe(0);

    // Set down on the river as the leaves float by, a leaf's word is given
    // (each set-down is a fresh arrival there, before any prayer begins).
    let flip = 0;
    await expect.poll(async () => {
      flip = 1 - flip;
      await frame.evaluate(z => window.__world.teleport(0.3, z, Math.PI), flip ? 2 : 12);
      const c = (await getState(page)).caption;
      return c && c.name;
    }, { timeout: 60000 }).toBe('Aleh');
  });

  test('the holy city in heaven: a wall foursquare with twelve foundations and twelve open gates of pearl, the nations walking in, and the south gate\'s word at its threshold (v35, Revelation 21:12-25; 22:14)', async ({ page }) => {
    test.setTimeout(300000);
    await gotoWorldReady(page);
    await enterHeaven(page);
    const frame = appFrame(page);
    let s = await getState(page);
    // Twelve foundations, twelve gates, a light over every gate, and the
    // travellers coming in at all of them.
    expect(s.heaven.city.gates).toBe(12);
    expect(s.heaven.city.foundations).toBe(12);
    expect(s.heaven.city.lights).toBe(12);
    expect(s.heaven.city.travellers).toBeGreaterThanOrEqual(12 * 30);
    expect(s.heaven.city.atGate).toBe(false);
    // They walk: the south middle gate's first traveller moves on.
    const lead0 = s.heaven.city.lead;
    await expect.poll(async () => dist2d((await getState(page)).heaven.city.lead, lead0), { timeout: 30000 })
      .toBeGreaterThan(0.5);

    // Walked there from where he came up, the way runs clear of the head of
    // the ladder: he comes to the gate and is still in heaven.
    await frame.evaluate(() => window.__world.walkTo(12, -51));
    await expect.poll(async () => {
      const st = await getState(page);
      return st.realm.now !== 'heaven' || st.realm.passage ? 'left heaven' : st.heaven.city.atGate;
    }, { timeout: 120000 }).toBe(true);

    // Set down by the south middle gate, behind the head of the ladder and a
    // little east of the street: he stands at it, its word is given, and it
    // brightens.
    await frame.evaluate(() => window.__world.teleport(11, -43, Math.PI));
    await expect.poll(async () => (await getState(page)).caption, { timeout: 20000 }).toEqual({
      name: "Sha'ar", label: 'the gates of it shall not be shut at all by day',
    });
    expect((await getState(page)).heaven.city.atGate).toBe(true);
    await expect.poll(async () => (await getState(page)).heaven.city.gateGlow, { timeout: 30000 }).toBeGreaterThan(0.5);

    // Away from the gate again, it is his no longer, and it settles.
    await frame.evaluate(() => window.__world.teleport(-6, -20, 0));
    await expect.poll(async () => (await getState(page)).heaven.city.atGate, { timeout: 20000 }).toBe(false);
    await expect.poll(async () => (await getState(page)).heaven.city.gateGlow, { timeout: 30000 }).toBeLessThan(0.2);
  });

  test('the healing of the nations in heaven: leaves of the tree go out through every gate, and one comes down into his hand under the Tree of Life, to be carried out at the gate or let go (v37, Revelation 22:2; Ezekiel 47:12)', async ({ page }) => {
    test.setTimeout(300000);
    await gotoWorldReady(page);
    await enterHeaven(page);
    const frame = appFrame(page);
    let s = await getState(page);
    // Leaf-bearers bound for all twelve gates, and the month's fruit ripe.
    expect(s.heaven.healing.gates).toBe(12);
    expect(s.heaven.healing.bearers).toBeGreaterThanOrEqual(12 * 10);
    expect(s.heaven.healing.ripe).toBe(await frame.evaluate(() => new Date().getMonth()));
    expect(s.heaven.healing.stage).toBe('none');
    // They walk: the south middle gate's first bearer moves on.
    const lead0 = s.heaven.healing.lead;
    await expect.poll(async () => dist2d((await getState(page)).heaven.healing.lead, lead0), { timeout: 30000 })
      .toBeGreaterThan(0.5);

    // Standing still under the crown, a leaf comes down to him, its word is
    // given, and it is held in his hand; while he holds it he does not pray.
    await frame.evaluate(() => window.__world.teleport(0.6, 30.4, 0));
    await expect.poll(async () => (await getState(page)).caption, { timeout: 60000 }).toEqual({
      name: 'Aleh litrufah', label: 'and the leaf thereof for medicine',
    });
    await expect.poll(async () => (await getState(page)).heaven.healing.stage, { timeout: 60000 }).toBe('holding');
    s = await getState(page);
    expect(s.heaven.healing.received).toBe(1);
    expect(s.heaven.song.praying).toBe(false);

    // Carried to the south middle gate, it goes out of his hand through the
    // gate, its word is given, and the stream there brightens.
    await frame.evaluate(() => window.__world.teleport(11, -43, Math.PI));
    await expect.poll(async () => (await getState(page)).heaven.healing.given, { timeout: 30000 }).toBe(1);
    s = await getState(page);
    expect(s.heaven.healing.stage).toBe('none');
    expect(s.heaven.healing.out).toBe(true);
    expect(s.caption).toEqual({ name: 'Marpe', label: 'the leaves of the tree were for the healing of the nations' });
    await expect.poll(async () => (await getState(page)).heaven.healing.glow, { timeout: 60000 }).toBeGreaterThan(0.5);

    // Another, once the first has gone out, let go where he stands away from
    // the tree: it goes out over the city, and then, his hands free, he may
    // lift them in prayer.
    await expect.poll(async () => (await getState(page)).heaven.healing.out, { timeout: 120000 }).toBe(false);
    await frame.evaluate(() => window.__world.teleport(0.6, 30.4, 0));
    await expect.poll(async () => (await getState(page)).heaven.healing.stage, { timeout: 60000 }).toBe('holding');
    await frame.evaluate(() => window.__world.teleport(-8, 10, 0));
    await expect.poll(async () => (await getState(page)).heaven.healing.given, { timeout: 60000 }).toBe(2);
    await expect.poll(async () => (await getState(page)).heaven.song.praying, { timeout: 60000 }).toBe(true);
  });

  test('a great and high mountain: in heaven, a tap on the sky carries the view up to show the whole city, the golden reed measures its wall and gates, and a tap brings the view down to him again (v43, Revelation 21:10, 15-16)', async ({ page }) => {
    test.setTimeout(300000);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const vp = page.viewportSize();

    // In the garden the view is never carried up: there a tap on the sky
    // lays him down instead (v34).
    expect(await frame.evaluate(() => window.__world.behold(true))).toBe(false);
    expect((await getState(page)).behold.on).toBe(false);

    await enterHeaven(page);
    let s = await getState(page);
    expect(s.behold).toMatchObject({ on: false, k: 0, times: 0 });
    expect(s.heaven.reed).toMatchObject({ measuring: false, gates: 0, of: 12, rounds: 0, shown: 0, air: 0 });
    // A few words say the sky may be tapped.
    await expect(frame.locator('.howto', { hasText: 'Tap the sky' })).toHaveCount(1);
    const where = s.pos;

    // A tap on heaven's sky (the top of the screen). The very first touch
    // only skips the arrival's opening shot, so tap again if it was taken
    // for that.
    await page.mouse.click(vp.width / 2, 100);
    await page.waitForTimeout(800);
    if (!(await getState(page)).behold.on) await page.mouse.click(vp.width / 2, 100);
    await expect.poll(async () => (await getState(page)).behold.on, { timeout: 10000 }).toBe(true);

    // The view is carried up, high over the city and out beyond its south
    // wall, while he stays standing where he was; the air clears with it,
    // and the height's word is given.
    await expect.poll(async () => {
      const st = await getState(page);
      return st.behold.settled && st.cam.y > 100 && st.cam.z < -60 && st.camDist > 150
        && st.heaven.reed.air > 0.9 && dist2d(st.pos, where) < 0.5;
    }, { timeout: 90000 }).toBe(true);
    await expect.poll(async () => (await getState(page)).caption, { timeout: 20000 }).toEqual({
      name: 'Har gavoah', label: 'a great and high mountain: he shewed me that great city',
    });
    s = await getState(page);
    expect(s.behold.times).toBe(1);
    expect(s.realm).toMatchObject({ now: 'heaven', passage: null, failed: false });
    // The whole city in view costs no more than the budget allows.
    expectInBudget(s, 'shown the city from on high');

    // The golden reed's light sets out along the wall, and the gates stand
    // up in light one by one as it passes them.
    await expect.poll(async () => {
      const r = (await getState(page)).heaven.reed;
      return r.measuring && r.shown > 0.5 && r.measured > 0 && r.gates >= 2;
    }, { timeout: 120000 }).toBe(true);

    // A tap anywhere brings the view down to him again; the gold fades from
    // the wall, and the air closes in as it was.
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await expect.poll(async () => (await getState(page)).behold.on, { timeout: 10000 }).toBe(false);
    await expect.poll(async () => {
      const st = await getState(page);
      return st.behold.k === 0 && st.camDist < 20 && st.heaven.reed.air === 0 && !st.heaven.reed.measuring;
    }, { timeout: 60000 }).toBe(true);
    s = await getState(page);
    expect(s.realm).toMatchObject({ now: 'heaven', passage: null, failed: false });
    expect(dist2d(s.pos, where)).toBeLessThan(0.5);
  });

  test('the lamb carried: stand among the flock and he takes its lamb up in his arms, carries it on his shoulders as he walks, and sets it down beside its mother when he stands (v36, Isaiah 40:11; Luke 15:5)', async ({ page }) => {
    test.setTimeout(180000);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const f0 = (await getState(page)).flock;
    expect(f0.carry.stage).toBe('none');

    // Walk in among them and stand: they come round him, the lamb comes in
    // to his feet, and he stoops and takes it up into his arms.
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z, Math.PI / 2), [f0.home.x, f0.home.z]);
    await expect.poll(async () => (await getState(page)).flock.carry.stage, { timeout: 45000 }).toBe('held');
    {
      const s = await getState(page);
      const lamb = s.flock.sheep.find(h => h.lamb);
      expect(lamb.mode).toBe('carried');
      expect(lamb.up).toBeGreaterThan(0.9);
      expect(dist2d(lamb, s.pos)).toBeLessThan(0.9);   // in his arms, not on the grass
      expect(s.flock.carry.lifts).toBe(1);
    }
    await expect.poll(async () => frame.locator('.naming__name').textContent(), { timeout: 30000 }).toBe('Uvecheiko yissa');

    // He walks on with it: it rides up across his shoulders, and goes with
    // him. (Whether the ewe and the ram come too depends on whether they had
    // already lain down round him while he stood — v31's rule, unchanged.)
    const start = (await getState(page)).pos;
    await frame.evaluate(([x, z]) => window.__world.walkTo(x, z), [start.x + 12, start.z - 5]);
    await expect.poll(async () => (await getState(page)).flock.carry.shoulders, { timeout: 30000 }).toBe(true);
    await expect.poll(async () => {
      const s = await getState(page);
      const lamb = s.flock.sheep.find(h => h.lamb);
      return dist2d(s.pos, start) >= 5 && lamb.mode === 'carried' && dist2d(lamb, s.pos) < 0.9;
    }, { timeout: 45000 }).toBe(true);

    // He stands: it comes down into his arms again and onto the grass
    // beside him, and the word for it is given; it is on its own feet again.
    await expect.poll(async () => frame.locator('.naming__name').textContent(), { timeout: 45000 }).toBe('Alot yenahel');
    const down = await getState(page);
    {
      const lamb = down.flock.sheep.find(h => h.lamb);
      expect(down.flock.carry.setDowns).toBe(1);
      expect(lamb.mode === 'follow' || lamb.rested).toBe(true);
      expect(lamb.up).toBe(0);
      expect(down.flock.carry.bleats).toBeGreaterThanOrEqual(2);
    }
    // It skips about, and then lies down round him: the psalm's word again.
    await expect.poll(async () => (await getState(page)).flock.rests, { timeout: 45000 }).toBeGreaterThan(down.flock.rests);
  });

  test('doves by the rivers of waters: white doves wash in a shallow of the slow reach, dip and shake off the water, all wash at once when he comes among them, and are gone by night (v36, Song of Solomon 5:12)', async ({ page }) => {
    test.setTimeout(150000);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const d0 = (await getState(page)).doves;
    expect(d0.count).toBe(5);
    expect(d0.shown).toBe(true);
    // Every one stands in the water itself, at its edge.
    for (const d of d0.doves) expect(d.wet).toBe(true);

    // On their own they wash, now one and now another, and shake.
    await expect.poll(async () => (await getState(page)).doves.shakes, { timeout: 45000 }).toBeGreaterThan(0);

    // He comes in among them: they all wash and shake at once.
    const before = await getState(page);
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z - 2.5, 0), [d0.at.x, d0.at.z]);
    await expect.poll(async () => (await getState(page)).doves.joys, { timeout: 20000 }).toBeGreaterThan(before.doves.joys);
    await expect.poll(async () => (await getState(page)).doves.shakes, { timeout: 30000 })
      .toBeGreaterThanOrEqual(before.doves.shakes + 3);

    // Drawn near one, it is named (tried at each in turn, since a flag in
    // the same shallow may stand nearer to where he is set down).
    let named = false;
    for (const d of d0.doves) {
      await frame.evaluate(([x, z]) => window.__world.teleport(x, z - 0.9, 0), [d.x, d.z]);
      try {
        await expect.poll(async () => { const n = (await getState(page)).naming; return n && n.name; }, { timeout: 8000 }).toBe('Yonim');
        named = true;
        break;
      } catch (e) { /* the next one */ }
    }
    expect(named).toBe(true);

    // By night they are gone to roost.
    await frame.evaluate(() => window.__world.setTime('night'));
    await expect.poll(async () => (await getState(page)).doves.shown, { timeout: 30000 }).toBe(false);
  });

  test('praise him in the dance: tap him and he dances for joy where he stands, petals whirling up round him, and a tap elsewhere stops him; his companion and the lambs dance with him (v38, Psalm 150:4)', async ({ page }) => {
    test.setTimeout(240000);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const box = await page.locator('iframe').boundingBox();
    const tapHim = async () => {
      const at = await frame.evaluate(() => window.__world.whereIsHe());
      await page.mouse.click(box.x + at.x, box.y + at.y);
    };
    const s0 = await getState(page);
    expect(s0.dance.dancing).toBe(false);
    expect(s0.dance.petals).toBe(0);

    // The very first touch only skips the opening shot (whose camera may
    // not have him on the screen at all). Then, out on the open
    // south-western meadow with the camera settled behind him, a tap on him
    // sets him dancing (tapped again if the camera was still coming round).
    const vp = page.viewportSize();
    await page.mouse.click(12, vp.height - 12);
    await frame.evaluate(() => window.__world.teleport(-20, -25, 0));
    // (AB#127: the camera now settles about 11 m from him, where it was 7.)
    await expect.poll(async () => (await getState(page)).camDist, { timeout: 45000 }).toBeLessThan(11.5);
    await page.waitForTimeout(500);
    await tapHim();
    await page.waitForTimeout(800);
    if (!(await getState(page)).dance.dancing) await tapHim();
    await expect.poll(async () => (await getState(page)).dance.dancing, { timeout: 10000 }).toBe(true);
    const start = await getState(page);
    expect(start.dance.petals).toBeGreaterThan(300);
    expect(start.walk.target).toBe(null);
    await expect.poll(async () => { const c = (await getState(page)).caption; return c && c.name; }, { timeout: 10000 })
      .toBe('Betof umachol');

    // He dances to the timbrel and the harp, leaps once, and bows — and is
    // still where he began, within the budget all the while.
    let most = { calls: 0, triangles: 0 };
    await expect.poll(async () => {
      const s = await getState(page);
      most = { calls: Math.max(most.calls, s.render.calls), triangles: Math.max(most.triangles, s.render.triangles) };
      return !s.dance.dancing && s.dance.times === 1;
    }, { timeout: 90000 }).toBe(true);
    expectInBudget({ render: most }, 'while he dances');
    const done = await getState(page);
    expect(done.dance.beats).toBeGreaterThanOrEqual(12);
    expect(done.dance.notes).toBe(11);
    expect(done.dance.leaps).toBe(1);
    expect(dist2d(done.pos, start.pos)).toBeLessThan(0.3);
    // The petals drift down and are gone.
    await expect.poll(async () => (await getState(page)).dance.petals, { timeout: 60000 }).toBe(0);

    // Tapped again, he dances the other way round; a tap on the grass
    // away from him stops the dance and he walks there instead.
    await tapHim();
    await expect.poll(async () => (await getState(page)).dance.dancing, { timeout: 10000 }).toBe(true);
    expect((await getState(page)).dance.dir).toBe(-1);
    await page.mouse.click(vp.width * 0.15, vp.height * 0.78);
    await expect.poll(async () => {
      const s = await getState(page);
      return !s.dance.dancing && !!s.walk.target;
    }, { timeout: 10000 }).toBe(true);

    // Beside his companion, she turns to him and dances too. (Once she is
    // up out of the river, he is set down two strides from her, on her side
    // toward where every visit begins — never in the water, where he would
    // take some up in his hands.)
    let eve;
    await expect.poll(async () => { eve = (await getState(page)).companion.pos; return eve.y; }, { timeout: 60000 })
      .toBeGreaterThan(-0.3);
    const toStart = Math.hypot(0 - eve.x, -9.5 - eve.z) || 1;
    await frame.evaluate(([x, z]) => window.__world.teleport(x, z, 0),
      [eve.x + (0 - eve.x) / toStart * 2, eve.z + (-9.5 - eve.z) / toStart * 2]);
    expect(await frame.evaluate(() => window.__world.dance(true))).toBe(true);
    await expect.poll(async () => (await getState(page)).dance.companion, { timeout: 10000 }).toBe(true);
    await expect.poll(async () => (await getState(page)).dance.dancing, { timeout: 90000 }).toBe(false);

    // Among the flock, the lambs leap with him. (Set down a stride from a
    // lamb, on its side toward the flock's own pasture — sheep never wade —
    // and tried beside each lamb in turn.)
    const flock = (await getState(page)).flock;
    let leapt = false;
    for (const lamb of flock.sheep.filter(S => S.lamb)) {
      const toHome = Math.hypot(flock.home.x - lamb.x, flock.home.z - lamb.z) || 1;
      await frame.evaluate(([x, z]) => window.__world.teleport(x, z, 0),
        [lamb.x + (flock.home.x - lamb.x) / toHome * 1.2, lamb.z + (flock.home.z - lamb.z) / toHome * 1.2]);
      if (!(await frame.evaluate(() => window.__world.dance(true)))) continue;
      try {
        await expect.poll(async () => (await getState(page)).flock.leaps, { timeout: 15000 }).toBeGreaterThan(flock.leaps);
        leapt = true;
        break;
      } catch (e) { /* the next one */ }
      await frame.evaluate(() => window.__world.dance(false));
    }
    expect(leapt).toBe(true);
    await frame.evaluate(() => window.__world.dance(false));

    // Not in the river: he does not dance in the water.
    await frame.evaluate(() => window.__world.teleport(-20, 6));
    expect(await frame.evaluate(() => window.__world.dance(true))).toBe(false);
  });

  test('every thing that hath breath: stood still under the Tree of Life, its twelve fruits kindle, and a ring of light goes out from its root over the whole garden — the trees bow, the lambs leap, the creatures give voice and he lifts his hands — once for each time he comes under it (v44, Psalm 150:6; Isaiah 55:12)', async ({ page }) => {
    test.setTimeout(300000);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    // Where every visit begins, the tree waits, and nothing is drawn for it.
    const s0 = await getState(page);
    expect(s0.praise.stage).toBe('idle');
    expect(s0.praise.armed).toBe(true);
    expect(s0.praise.drawn).toBe(false);
    const leaps0 = s0.flock.leaps;

    // Set down under its boughs, a few strides from the trunk, and left to
    // stand: the fruit kindles, all twelve, one by one.
    await frame.evaluate(() => window.__world.teleport(-3.2, -4.0, 0));
    await expect.poll(async () => (await getState(page)).praise.stage, { timeout: 30000 }).not.toBe('idle');
    await expect.poll(async () => (await getState(page)).praise.lit, { timeout: 30000 }).toBe(12);
    // Then the ring sets out, and its word is given.
    await expect.poll(async () => { const c = (await getState(page)).caption; return c && c.name; }, { timeout: 30000 })
      .toBe('Kol hanneshamah');

    // It goes out to the rim and on into the haze, its motes drawn (one draw
    // call) only while it does, within the budget all the while; he stands
    // with his hands lifted as it goes.
    let most = { calls: 0, triangles: 0 };
    let praying = false, drawn = false, farthest = 0;
    await expect.poll(async () => {
      const s = await getState(page);
      most = { calls: Math.max(most.calls, s.render.calls), triangles: Math.max(most.triangles, s.render.triangles) };
      praying = praying || s.praise.praying;
      drawn = drawn || s.praise.drawn;
      farthest = Math.max(farthest, s.praise.radius);
      return s.praise.stage === 'idle';
    }, { timeout: 150000, intervals: [250] }).toBe(true);
    expectInBudget({ render: most }, 'while the garden praises');
    expect(praying).toBe(true);
    expect(drawn).toBe(true);
    expect(farthest).toBeGreaterThan(50);
    const done = await getState(page);
    expect(done.praise.times).toBe(1);
    expect(done.praise.drawn).toBe(false);
    expect(done.praise.praying).toBe(false);
    // Every planted tree has bowed to it, the creatures have answered one
    // after another, and the flock's lamb has leapt as it passed.
    expect(done.praise.trees).toBeGreaterThanOrEqual(30);
    expect(done.praise.voices).toBeGreaterThanOrEqual(10);
    expect(done.flock.leaps).toBeGreaterThan(leaps0);

    // Standing on under the tree, it does not go out again; walked out from
    // under it, the tree will answer him the next time he comes.
    expect(done.praise.armed).toBe(false);
    await frame.evaluate(() => window.__world.teleport(-3.2, -14, 0));
    await expect.poll(async () => (await getState(page)).praise.armed, { timeout: 20000 }).toBe(true);
    expect((await getState(page)).praise.stage).toBe('idle');
  });

  test('a small figure in a large place: the camera stands well back, looks out level past him, and sees as much as the screen\'s shape allows (AB#127)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const vp = page.viewportSize();
    // The first touch skips the opening shot; then, out on the open meadow,
    // the camera settles in behind him.
    await page.mouse.click(12, vp.height - 12);
    await frame.evaluate(() => window.__world.teleport(-20, -25, 0));
    await expect.poll(async () => (await getState(page)).camDist, { timeout: 45000 }).toBeLessThan(11.5);
    await page.waitForTimeout(800);
    let s = await getState(page);
    // A tall phone gets a tall view, from well back and a little above him…
    expect(s.camFov).toBeCloseTo(72, 0);
    expect(s.camDist).toBeGreaterThan(10);
    expect(s.cam.y - s.pos.y).toBeGreaterThan(3);
    // …looking out level over his head, not down at him: he stands in the
    // middle of the screen from side to side, low in it from top to bottom,
    // with the garden and its sky above him.
    const at = await frame.evaluate(() => window.__world.whereIsHe());
    expect(Math.abs(at.x / vp.width - 0.5)).toBeLessThan(0.1);
    expect(at.y / vp.height).toBeGreaterThan(0.6);
    expect(at.y / vp.height).toBeLessThan(0.8);

    // A wide screen is held to 90° across rather than stretched at the edges.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(async () => (await getState(page)).camFov, { timeout: 10000 }).toBeLessThan(66);
    s = await getState(page);
    const across = 2 * Math.atan(Math.tan(s.camFov * Math.PI / 360) * 1280 / 800) * 180 / Math.PI;
    expect(across).toBeGreaterThan(88);
    expect(across).toBeLessThan(90.5);
  });

  test('the light pass steps aside on a software renderer and when asked, and the garden is drawn plainly (AB#130)', async ({ page }) => {
    // These tests run on a software renderer, as CI does: there the light
    // pass must not run at all, and the garden must still be a real picture.
    await gotoWorldReady(page);
    let s = await getState(page);
    expect(s.light.on).toBe(false);
    expect(s.light.reason).toBe('software renderer');
    expectInBudget(s, 'with the light pass off');
    expect(s.render.calls).toBeGreaterThan(50);

    // ?light=off turns it off whatever the device.
    await gotoWorldReady(page, '?light=off');
    s = await getState(page);
    expect(s.light.on).toBe(false);
    expect(s.light.reason).toBe('asked off');
    const pixels = await appFrame(page).evaluate(() => window.__world.samplePixels(5));
    expect(new Set(pixels.map(p => p.slice(0, 3).join(','))).size).toBeGreaterThanOrEqual(6);
  });

  test('the light pass, forced on: the picture is finished off-screen, and the garden\'s cost is still the garden\'s own (AB#130)', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoWorldReady(page, '?light=on');
    const frame = appFrame(page);
    // It is on, and stays on (a forced pass is never judged too slow).
    await expect.poll(async () => (await getState(page)).light.on, { timeout: 30000 }).toBe(true);
    const s = await getState(page);
    expect(s.light.reason).toBe('asked on');
    // The cost reported is the garden's: far more than the one draw of a
    // finishing step, and inside the budget.
    expect(s.render.calls).toBeGreaterThan(50);
    expectInBudget(s, 'with the light pass on');
    // The finished picture reaches the screen: many colours, some bright.
    const pixels = await frame.evaluate(() => window.__world.samplePixels(5));
    expect(new Set(pixels.map(p => p.slice(0, 3).join(','))).size).toBeGreaterThanOrEqual(6);
    expect(pixels.filter(p => Math.max(p[0], p[1], p[2]) > 90).length).toBeGreaterThan(5);
    // Through the day's turning and a resize it keeps drawing.
    await frame.evaluate(() => window.__world.setTime('night'));
    await page.setViewportSize({ width: 600, height: 500 });
    await expect.poll(async () => {
      const g = await getState(page);
      return g.light.on && g.time.night > 0.9 && g.render.calls > 50;
    }, { timeout: 30000 }).toBe(true);
    expect((await getState(page)).light.on).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the companion wanders on its own', async ({ page }) => {
    await gotoWorldReady(page);
    const s0 = await getState(page);
    expect(s0.companion).toBeTruthy();
    expect(s0.companion.character).not.toBe(s0.character);

    // The companion pauses a few seconds before each stroll, and CI's
    // software renderer dilates simulated time (slow frames hit the dt
    // cap) — so watch patiently for the stroll instead of sampling once.
    await expect.poll(async () => {
      const s1 = await getState(page);
      return dist2d(s1.companion.pos, s0.companion.pos);
    }, { timeout: 15000 }).toBeGreaterThan(0.3);
  });

  test('dancing before the glory: in heaven, tap him and he dances; a ring of the multitude\'s lights comes down to dance round him, fire kindles in the glass at every step, the multitude sways, and heaven answers when he bows (v45, 2 Samuel 6:14)', async ({ page }) => {
    test.setTimeout(300000);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const box = await page.locator('iframe').boundingBox();
    const tapHim = async () => {
      const at = await frame.evaluate(() => window.__world.whereIsHe());
      await page.mouse.click(box.x + at.x, box.y + at.y);
    };

    await enterHeaven(page);
    let s = await getState(page);
    expect(s.heaven.chorus).toMatchObject({ dancing: false, out: 0, lights: 0, danced: 0, answers: 0, sway: 0 });

    // On the glass a little north of the ladder's head, facing the glory,
    // with the camera settled in behind him: a tap on him sets him dancing
    // (tapped again if the first touch was taken for the opening shot).
    await frame.evaluate(() => window.__world.teleport(0, -16, 0));
    await expect.poll(async () => (await getState(page)).camDist, { timeout: 60000 }).toBeLessThan(11.5);
    await page.waitForTimeout(500);
    await tapHim();
    await page.waitForTimeout(800);
    if (!(await getState(page)).dance.dancing) await tapHim();
    await expect.poll(async () => (await getState(page)).dance.dancing, { timeout: 10000 }).toBe(true);
    s = await getState(page);
    expect(s.realm.now).toBe('heaven');
    // The garden's petals stay in the garden.
    expect(s.dance.petals).toBe(0);
    await expect.poll(async () => { const c = (await getState(page)).caption; return c && c.name; }, { timeout: 10000 })
      .toBe('Mekharker bekhol oz');

    // The lights come down to dance round him, the multitude sways, the
    // glass burns at his feet; then he bows, the lights go home, and heaven
    // answers — all within the budget.
    let most = { calls: 0, triangles: 0 };
    let fullest = 0, swayed = 0, rings = 0, flare = 0;
    await expect.poll(async () => {
      const st = await getState(page);
      most = { calls: Math.max(most.calls, st.render.calls), triangles: Math.max(most.triangles, st.render.triangles) };
      const c = st.heaven.chorus;
      fullest = Math.max(fullest, c.out);
      swayed = Math.max(swayed, c.sway);
      rings = Math.max(rings, st.heaven.song.rings || 0);
      flare = Math.max(flare, st.heaven.song.flare || 0);
      return c.answers === 1 && !c.dancing;
    }, { timeout: 120000, intervals: [200] }).toBe(true);
    expectInBudget({ render: most }, 'while he dances before the glory');
    expect(fullest).toBeGreaterThan(0.9);
    expect(swayed).toBeGreaterThan(0.5);
    expect(rings).toBeGreaterThan(0);
    s = await getState(page);
    expect(s.heaven.chorus.danced).toBe(1);
    expect(s.dance.leaps).toBe(1);
    await expect.poll(async () => {
      const st = await getState(page);
      flare = Math.max(flare, st.heaven.song.flare || 0);
      return st.heaven.chorus.lights === 0 && st.heaven.chorus.sway === 0;
    }, { timeout: 60000, intervals: [200] }).toBe(true);
    expect(flare).toBeGreaterThan(0.2);

    // Danced again and let go part-way through (a tap on the glass away from
    // him), the lights go home quietly, without another answer.
    await tapHim();
    await expect.poll(async () => (await getState(page)).heaven.chorus.dancing, { timeout: 10000 }).toBe(true);
    await expect.poll(async () => (await getState(page)).heaven.chorus.out, { timeout: 30000 }).toBeGreaterThan(0.2);
    const vp = page.viewportSize();
    await page.mouse.click(vp.width / 2 + 60, vp.height - 40);
    await expect.poll(async () => (await getState(page)).heaven.chorus.lights, { timeout: 60000 }).toBe(0);
    s = await getState(page);
    expect(s.heaven.chorus).toMatchObject({ dancing: false, danced: 2, answers: 1 });
    expect(s.realm).toMatchObject({ now: 'heaven', passage: null, failed: false });
  });

  test('on eagles\' wings: stood still in the open, he sees a great eagle come down out of her wheel to the grass beside him; a tap on her and she bears him up over the garden, a tap in the air turns her for home, and she sets him down where he stood (v46, Exodus 19:4; Deuteronomy 32:11; Isaiah 40:31; Ezekiel 17:3)', async ({ page }) => {
    test.setTimeout(420000);
    const errors = watchPageErrors(page);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const box = await page.locator('iframe').boundingBox();
    const vp = page.viewportSize();

    // From the first she is up, wheeling high over the garden, and she and
    // the creatures are drawn by a handful of troupes, not part by part.
    const s0 = await getState(page);
    expect(s0.eagle).toMatchObject({ mode: 'soar', riding: false, hidden: false, rider: false, rides: 0 });
    expect(s0.eagle.y).toBeGreaterThan(18);
    expect(s0.troupes.parts).toBeGreaterThan(100);
    expect(s0.troupes.count).toBeLessThan(8);

    // The very first touch only skips the opening shot. Then, set down on
    // the open south-western meadow (far from the flock), facing on across
    // it, away from the Tree of Life, and left to stand, he sees her come
    // down out of her wheel to the grass a few strides off; her name is
    // given, and a word says what she is there for.
    await page.mouse.click(12, vp.height - 12);
    await frame.evaluate(() => window.__world.teleport(-12, -18, -2.4));
    await expect.poll(async () => (await getState(page)).eagle.mode, { timeout: 150000, intervals: [500] }).toBe('waiting');
    await expect(frame.locator('.howto', { hasText: 'great eagle' })).toHaveCount(1, { timeout: 5000 });
    await expect.poll(async () => { const c = (await getState(page)).caption; return c && c.name; }, { timeout: 15000 })
      .toBe('Hanesher hagadol');
    const waiting = await getState(page);
    const apart = dist2d(waiting.pos, waiting.eagle.landing);
    expect(apart).toBeGreaterThan(4);
    expect(apart).toBeLessThan(10);
    expect(waiting.eagle.y).toBeLessThan(waiting.pos.y + 2);   // on the grass, not in the air
    expect(await frame.evaluate(() => window.__world.eagle('where'))).not.toBe(null);

    // A tap on her walks him to her side, and up onto her back he goes
    // (tapped again if the tap was lost to a camera still settling).
    const tapHer = async () => {
      const at = await frame.evaluate(() => window.__world.eagle('where'));
      if (at) await page.mouse.click(box.x + at.x, box.y + at.y);
    };
    await tapHer();
    await page.waitForTimeout(800);
    let stood = null;
    await expect.poll(async () => {
      const s = await getState(page);
      if (s.eagle.riding) { stood = s.pos; return true; }
      if (s.eagle.mode === 'waiting' && !s.walk.target) await tapHer();
      return false;
    }, { timeout: 60000, intervals: [1000] }).toBe(true);
    const up = await getState(page);
    expect(up.eagle).toMatchObject({ riding: true, hidden: true, rider: true, rides: 1 });
    expect(await frame.evaluate(() => localStorage.getItem('camino_eagle'))).toBe('rode');

    // She rises with him over the garden, within the budget all the while,
    // and her word is given as she goes up.
    let most = { calls: 0, triangles: 0 };
    let height = 0;
    const words = new Set();
    const watch = async () => {
      const s = await getState(page);
      most = { calls: Math.max(most.calls, s.render.calls), triangles: Math.max(most.triangles, s.render.triangles) };
      if (s.eagle.mode === 'flying') height = Math.max(height, s.eagle.y - stood.y);
      if (s.caption) words.add(s.caption.name);
      return s;
    };
    await expect.poll(async () => {
      const s = await watch();
      return s.eagle.mode === 'flying' && s.eagle.progress > 0.04;
    }, { timeout: 60000, intervals: [250] }).toBe(true);

    // A tap in the air asks her to turn for home, and once she is well up
    // and away she does.
    await page.mouse.click(box.x + vp.width / 2, box.y + vp.height * 0.4);
    await expect.poll(async () => (await watch()).eagle.homeward, { timeout: 60000, intervals: [250] }).toBe(true);

    // She comes in to the place she rose from and he is set down on his own
    // feet exactly where he stood; then she goes up again, away to her wheel.
    await expect.poll(async () => ['parting', 'leaving', 'soar'].includes((await watch()).eagle.mode),
      { timeout: 150000, intervals: [250] }).toBe(true);
    expectInBudget({ render: most }, 'while he rides');
    expect(height).toBeGreaterThan(8);
    expect([...words]).toContain('Al kanfei nesharim');
    const down = await getState(page);
    expect(down.eagle).toMatchObject({ riding: false, hidden: false, rider: false, rides: 1, hurried: 1 });
    expect(dist2d(down.pos, stood)).toBeLessThan(0.3);
    expect(down.walk.target).toBe(null);
    await expect.poll(async () => {
      const e = (await getState(page)).eagle;
      return e.mode === 'soar' || (e.mode === 'leaving' && e.y > waiting.eagle.y + 4);
    }, { timeout: 90000, intervals: [250] }).toBe(true);
    expect(errors).toEqual([]);
  });
});

// AB#164: how the touches are read (the default since the owner tried it on
// a phone; `?controls=old` is the earlier single drag). The lower part of the screen is his feet (a drawn thumb
// stick), the upper part his eyes (a sideways drag turns the view), and a
// tap near a creature is taken as meant for it.
test.describe('the new way of steering (AB#164)', () => {
  // The opening shot takes the first touch for itself; spend it, and let the
  // camera come down behind him.
  async function settle(page) {
    await page.mouse.click(195, 700);
    await expect.poll(async () => (await getState(page)).camDist, { timeout: 20000 }).toBeLessThan(13);
  }

  test('the new way is what a visitor gets; ?controls=old is the way back', async ({ page }) => {
    await gotoWorldReady(page);
    expect((await getState(page)).controls.scheme).toBe('new');
    await expect(appFrame(page).locator('.stick')).toHaveCount(1);

    await gotoWorldReady(page, '?controls=old');
    expect((await getState(page)).controls.scheme).toBe('old');
    await expect(appFrame(page).locator('.stick')).toHaveCount(0);
    await expect(appFrame(page).locator('.howto')).toHaveCount(0);
  });

  test('low on the screen, a short drag walks him and the stick is drawn', async ({ page }) => {
    await gotoWorldReady(page, '?controls=new');
    const frame = appFrame(page);
    expect((await getState(page)).controls.scheme).toBe('new');
    await expect(frame.locator('.howto')).toBeVisible();
    await settle(page);

    const s0 = await getState(page);
    await page.mouse.move(195, 640);
    await page.mouse.down();
    await page.mouse.move(195, 585, { steps: 6 });   // 55 px: a thumb's small reach
    await expect(frame.locator('.stick--shown')).toHaveCount(1);
    await expect.poll(async () => dist2d((await getState(page)).pos, s0.pos), { timeout: 15000 }).toBeGreaterThan(0.8);
    const s1 = await getState(page);
    const away = { x: s0.pos.x - s0.cam.x, z: s0.pos.z - s0.cam.z };
    const step = { x: s1.pos.x - s0.pos.x, z: s1.pos.z - s0.pos.z };
    const dot = (step.x * away.x + step.z * away.z) / (Math.hypot(away.x, away.z) * Math.hypot(step.x, step.z));
    expect(dot).toBeGreaterThan(0.5);
    expect(s1.controls.looked).toBe(0);
    await page.mouse.up();
    await expect(frame.locator('.stick--shown')).toHaveCount(0);
  });

  test('higher up, a sideways drag turns the view and he stays where he is', async ({ page }) => {
    await gotoWorldReady(page, '?controls=new');
    const frame = appFrame(page);
    await settle(page);
    await expect.poll(async () => (await getState(page)).walk.speed, { timeout: 15000 }).toBe(0);

    const s0 = await getState(page);
    // Two places either side of him: whichever stands to the right in the
    // picture should slide left as the view turns to the right.
    const spots = [{ x: s0.pos.x + 6, z: s0.pos.z + 8 }, { x: s0.pos.x - 6, z: s0.pos.z + 8 }];
    const before = await frame.evaluate(ps => ps.map(p => window.__world.screenOf(p.x, p.z, 0)), spots);
    const right = before[0] && (!before[1] || before[0].x > before[1].x) ? 0 : 1;

    await page.mouse.move(120, 220);
    await page.mouse.down();
    await page.mouse.move(250, 220, { steps: 8 });   // a third of the width: about 60°
    await page.mouse.up();

    await expect.poll(async () => {
      const s = await getState(page);
      return Math.abs(Math.atan2(Math.sin(s.controls.camYaw - s0.controls.camYaw), Math.cos(s.controls.camYaw - s0.controls.camYaw)));
    }, { timeout: 15000 }).toBeGreaterThan(0.6);
    const s1 = await getState(page);
    expect(s1.controls.looked).toBeGreaterThan(0.6);
    expect(dist2d(s1.pos, s0.pos)).toBeLessThan(0.3);
    expect(s1.walk.target).toBeNull();
    const after = await frame.evaluate(p => window.__world.screenOf(p.x, p.z, 0), spots[right]);
    if (after) expect(after.x).toBeLessThan(before[right].x);

    // He stands still: the view stays where it was put.
    await page.waitForTimeout(1200);
    const s2 = await getState(page);
    expect(Math.abs(Math.atan2(Math.sin(s2.controls.camYaw - s1.controls.camYaw), Math.cos(s2.controls.camYaw - s1.controls.camYaw)))).toBeLessThan(0.35);
  });

  test('a tap a little wide of a landmark is taken as meant for it', async ({ page }) => {
    await gotoWorldReady(page, '?controls=new');
    const frame = appFrame(page);
    await settle(page);
    // Let him and the camera come to rest where the visit begins: the two
    // trees stand ahead of him. (A tree, not a beast: a lamb wanders off
    // between the aiming and the tap on a slow machine.)
    await expect.poll(async () => {
      const a = await getState(page);
      await page.waitForTimeout(300);
      const b = await getState(page);
      return Math.hypot(b.cam.x - a.cam.x, b.cam.z - a.cam.z) + b.walk.speed;
    }, { timeout: 30000 }).toBeLessThan(0.05);

    // 30 px out from the Tree of Knowledge, on the side away from him: off
    // its trunk, well inside a thumb's width.
    const TREE = { x: 3.4, z: 0.8 };
    const aim = await frame.evaluate(T => {
      const at = window.__world.screenOf(T.x, T.z, 2.5);
      const x = at.x + (at.x < window.innerWidth / 2 ? -30 : 30);
      const hit = window.__world.snapFor(x, at.y);
      return { x, y: at.y, what: hit && hit.what };
    }, TREE);
    expect(aim.what).toBe('tree of knowledge');
    expect(aim.x).toBeGreaterThan(10);
    expect(aim.x).toBeLessThan(380);

    const before = (await getState(page)).pos;
    await page.mouse.click(aim.x, aim.y);
    // He sets out for the tree and comes to stand by it (3.5 m short).
    await expect.poll(async () => {
      const s = await getState(page);
      return Math.hypot(s.pos.x - TREE.x, s.pos.z - TREE.z);
    }, { timeout: 40000 }).toBeLessThan(Math.min(6, Math.hypot(before.x - TREE.x, before.z - TREE.z) - 2));
  });
});

// AB#165: stations — places in the garden he walks to that open something to
// play (world-app/stations.js). The first is the Camino game, at a waymarker
// beside the eastward gate. The game is laid over the paused garden as its own
// page in a frame; when it is over he stands where he stood.
//
// These aim at things that hold still: a clock that has stopped, a place that
// has not changed, a frame that is or is not there.
test.describe('stations: a game opened from the garden (AB#165)', () => {
  const MARK = { x: 46.6, z: 4.9 };
  const NEARBY = { x: 42.5, z: 3.6 };   // a few strides off, on dry ground

  // The way a visitor goes: set down a few strides short, then walked into
  // it. If anything stops him on the way, he is sent on again.
  async function walkIn(page) {
    const frame = appFrame(page);
    await frame.evaluate(p => window.__world.teleport(p.x, p.z, 1.3), NEARBY);
    await expect.poll(async () => {
      const s = await getState(page);
      if (!s.stations.phase && !s.walk.target) await frame.evaluate(m => window.__world.walkTo(m.x, m.z), MARK);
      return s.stations.open;
    }, { timeout: 60000, intervals: [400] }).toBe('camino');
  }
  const gameFrame = page => page.frames().find(f => /game\.html\?from=eden/.test(f.url()));
  const homeLink = page => page.evaluate(() => getComputedStyle(document.querySelector('.home')).visibility);

  test('a waymarker stands by the eastward gate: listed, named when he is near, one drawn thing, and a tap beside it is meant for it (Isaiah 35:8)', async ({ page }) => {
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const s0 = await getState(page);
    expect(s0.stations.phase).toBeNull();
    expect(s0.stations.list).toHaveLength(1);
    const camino = s0.stations.list[0];
    expect(camino).toMatchObject({ id: 'camino', verse: 'Isaiah 35:8', armed: true, failed: false });
    // On the garden's side of the gate, within the walkable rim.
    expect(dist2d(camino, { x: 49, z: 3 })).toBeLessThan(6);   // the gate stands at (49, 3)
    expect(Math.hypot(camino.x, camino.z)).toBeLessThan(49);

    // Set down near it (standing, so it does not open): its name is given,
    // and the garden is still inside its budget with the landmark in view.
    await frame.evaluate(p => window.__world.teleport(p.x, p.z, 1.3), NEARBY);
    await expect.poll(async () => (await getState(page)).caption, { timeout: 20000 })
      .toMatchObject({ name: 'Derekh', label: 'the pilgrim road' });
    const near = await getState(page);
    expectInBudget(near, 'beside the waymarker');
    expect(near.stations.phase).toBeNull();

    // A tap a little wide of the stone is taken as meant for the station.
    const hit = await frame.evaluate(m => {
      const at = window.__world.screenOf(m.x, m.z, 1.1);
      return at && window.__world.snapFor(at.x + 14, at.y - 10);
    }, MARK);
    expect(hit && hit.what).toBe('camino');
  });

  test('walking into the waymarker opens the game over the paused garden; the game\'s own way back, and the browser\'s back button, set him down where he stood', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoWorldReady(page);
    const frame = appFrame(page);

    await walkIn(page);
    // The game is its own page in a frame over the garden, told where it
    // was opened from; the "home" link of the page outside steps aside.
    const game = gameFrame(page);
    expect(game, 'the game frame').toBeTruthy();
    await expect(frame.locator('.station__frame')).toBeVisible();
    expect(await homeLink(page)).toBe('hidden');
    expect(await game.evaluate(() => HOME_LABEL)).toBe('Return to the garden');

    // The garden is paused, not gone: its clock stands still, and so does he.
    const held = await getState(page);
    await page.waitForTimeout(1200);
    const still = await getState(page);
    expect(still.time.t).toBe(held.time.t);
    expect(still.pos).toEqual(held.pos);
    expect(still.sound.resting).toBe(true);

    // The game's own way back (the pill on its opening screen).
    await expect.poll(() => game.evaluate(() => !!backButton), { timeout: 20000 }).toBe(true);
    const pill = await game.evaluate(() => backButton);
    await page.mouse.click(pill.x + pill.w / 2, pill.y + pill.h / 2);
    await expect.poll(async () => (await getState(page)).stations.phase, { timeout: 20000 }).toBeNull();

    // He stands where he stood; the frame is gone, the link is back, the
    // clock runs again, and the station waits until he has walked off.
    const back = await getState(page);
    expect(dist2d(back.pos, held.pos)).toBeLessThan(0.05);
    expect(back.stations.visits).toBe(1);
    expect(back.stations.list[0].armed).toBe(false);
    expect(back.sound.resting).toBe(false);
    await expect(frame.locator('.station__frame')).toHaveCount(0);
    expect(await homeLink(page)).toBe('visible');
    await expect.poll(async () => (await getState(page)).time.t, { timeout: 20000 }).not.toBe(back.time.t);
    // Standing beside it does not open it again.
    await page.waitForTimeout(800);
    expect((await getState(page)).stations.phase).toBeNull();

    // Once more, and this time the browser's back button: it closes the
    // game and leaves him in the garden, on the same page.
    await walkIn(page);
    const again = await getState(page);
    await page.evaluate(() => history.back());
    await expect.poll(async () => (await getState(page)).stations.phase, { timeout: 20000 }).toBeNull();
    expect(page.url()).toContain('world.html');
    const end = await getState(page);
    expect(dist2d(end.pos, again.pos)).toBeLessThan(0.05);
    expect(end.stations.visits).toBe(2);
    await expect(frame.locator('.station__frame')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the garden\'s sound rests under the game, wakes when he comes back, and keeps a choice made in the game (the setting is shared)', async ({ page }) => {
    test.setTimeout(120000);
    await gotoWorldReady(page, '', { sound: true });
    const sound = async () => (await getState(page)).sound;
    // The tap on "Enter" has let the sound begin.
    await expect.poll(async () => (await sound()).running, { timeout: 20000 }).toBe(true);

    await walkIn(page);
    await expect.poll(async () => { const a = await sound(); return a.resting && !a.running; }, { timeout: 20000 }).toBe(true);
    expect((await sound()).muted).toBe(false);          // resting, not switched off

    // Back by the browser's button: the ambience wakes by itself.
    await page.evaluate(() => history.back());
    await expect.poll(async () => (await getState(page)).stations.phase, { timeout: 20000 }).toBeNull();
    await expect.poll(async () => { const a = await sound(); return !a.resting && a.running; }, { timeout: 20000 }).toBe(true);

    // In again; sound is switched off there (as the game's own button
    // does, in the setting both share), and the garden keeps it off.
    await walkIn(page);
    await gameFrame(page).evaluate(() => localStorage.setItem('camino_sound', 'off'));
    await page.evaluate(() => history.back());
    await expect.poll(async () => (await getState(page)).stations.phase, { timeout: 20000 }).toBeNull();
    const after = await sound();
    expect(after.muted).toBe(true);
    expect(after.resting).toBe(false);
  });

  test('a game that never loads cannot take the garden down: the veil lifts, and the station rests for the visit', async ({ page }) => {
    test.setTimeout(120000);
    // The game's page is held back for good.
    await page.route(/game\.html\?from=eden/, () => {});
    await gotoWorldReady(page);
    const frame = appFrame(page);
    await frame.evaluate(p => window.__world.teleport(p.x, p.z, 1.3), NEARBY);
    await expect.poll(async () => {
      const s = await getState(page);
      if (!s.stations.phase && !s.walk.target && !s.stations.list[0].failed) {
        await frame.evaluate(m => window.__world.walkTo(m.x, m.z), MARK);
      }
      return s.stations.list[0].failed && s.stations.phase === null;
    }, { timeout: 90000, intervals: [500] }).toBe(true);
    const s = await getState(page);
    expect(s.stations.visits).toBe(0);
    await expect(frame.locator('.station__frame')).toHaveCount(0);
    // The garden goes on: its clock runs.
    await expect.poll(async () => (await getState(page)).time.t, { timeout: 20000 }).not.toBe(s.time.t);
  });

  test('a page that arrives in the game\'s place but is not the game (an error page) cannot keep him either: the veil only lifts when the game says it is ready', async ({ page }) => {
    test.setTimeout(120000);
    // Something loads, but it is not the game.
    await page.route(/game\.html\?from=eden/, r => r.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Not found</h1>' }));
    await gotoWorldReady(page);
    const frame = appFrame(page);
    await frame.evaluate(p => window.__world.teleport(p.x, p.z, 1.3), NEARBY);
    let sawOpen = false;
    await expect.poll(async () => {
      const s = await getState(page);
      if (s.stations.phase === 'open') sawOpen = true;
      if (!s.stations.phase && !s.walk.target && !s.stations.list[0].failed) {
        await frame.evaluate(m => window.__world.walkTo(m.x, m.z), MARK);
      }
      return s.stations.list[0].failed && s.stations.phase === null;
    }, { timeout: 90000, intervals: [500] }).toBe(true);
    // The veil never lifted on the broken page; he is back in the garden,
    // with the way home showing and the clock running.
    expect(sawOpen).toBe(false);
    const s = await getState(page);
    expect(s.stations.visits).toBe(0);
    await expect(frame.locator('.station__frame')).toHaveCount(0);
    expect(await homeLink(page)).toBe('visible');
    await expect.poll(async () => (await getState(page)).time.t, { timeout: 20000 }).not.toBe(s.time.t);
  });
});
