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
const { gotoWorldReady, appFrame, getState, dist2d, enterHeaven } = require('./world-helpers');

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
});
