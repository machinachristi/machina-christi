// Core smoke suite for the Garden of Eden world — the LOCKED half.
//
// These checks protect any version of the garden, however much it changes:
// it loads, renders real content, stays inside the phone budget, can be
// walked, and — above all — a broken world cannot take the rest of the site
// down with it. The weekly automated update-world run may NEVER edit this file
// (or world-helpers.js). Checks that pin a particular feature of the garden
// (the four rivers, the gate, the dew…) live in world-features.spec.js instead,
// which the run may update when it deliberately reshapes that feature.
const { test, expect } = require('@playwright/test');
const { watchErrors, gotoWorldReady, appFrame, getState, dist2d, expectInBudget } = require('./world-helpers');

test.describe('the garden loads', () => {
  test('shows an explainer before loading; entering starts the world', async ({ page }) => {
    await page.goto('/world.html');
    expect(await page.getAttribute('body', 'data-world-state')).toBe('intro');
    await expect(page.locator('.intro')).toBeVisible();
    await expect(page.locator('.stage iframe')).toHaveCount(0);   // nothing loads yet

    await page.click('.intro__enter');
    await page.waitForSelector('body[data-world-state="ready"]', { timeout: 20000 });
    await expect(page.locator('.stage iframe')).toHaveCount(1);
  });

  test('reaches ready with zero console/page errors', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWorldReady(page);
    const s = await getState(page);
    expect(s.ready).toBe(true);
    expect(s.character).toBe('adam');
    await expect(page.locator('.stage iframe')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('renders a real scene, not a blank canvas', async ({ page }) => {
    await gotoWorldReady(page);
    const pixels = await appFrame(page).evaluate(() => window.__world.samplePixels(5));
    expect(pixels.length).toBe(25);
    const distinct = new Set(pixels.map(p => p.slice(0, 3).join(','))).size;
    expect(distinct).toBeGreaterThanOrEqual(6);          // sky/land/trees vary
    const bright = pixels.filter(p => Math.max(p[0], p[1], p[2]) > 90).length;
    expect(bright).toBeGreaterThan(5);                   // a daylight garden
  });

  test('stays inside the mobile performance budget', async ({ page }) => {
    await gotoWorldReady(page);
    const s = await getState(page);
    // Ceilings from the plan's mobile budget — a regression gate for every
    // future refinement pass, human or AI.
    expect(s.render.calls).toBeGreaterThan(0);
    expect(s.render.triangles).toBeGreaterThan(1000);
    expectInBudget(s, 'at spawn');
  });

  test('stays inside the budget at every hour, and in rain', async ({ page }) => {
    // The busiest moments (night skies, evening gusts, showers) must fit too —
    // whatever new things a future garden fills them with.
    await gotoWorldReady(page);
    const frame = appFrame(page);
    for (const hour of ['dawn', 'noon', 'evening', 'night']) {
      await frame.evaluate(h => window.__world.setTime(h), hour);
      await page.waitForTimeout(400);                      // let the new hour paint
      expectInBudget(await getState(page), `at ${hour}`);
    }
    // If the garden still has weather, a shower must fit as well.
    const hasRain = await frame.evaluate(() => typeof window.__world.setRain === 'function');
    if (hasRain) {
      await frame.evaluate(() => window.__world.setRain(1));
      await expect.poll(async () => {
        const w = (await getState(page)).weather;
        return w ? w.rain : 1;
      }).toBeGreaterThan(0.8);
      expectInBudget(await getState(page), 'in rain at night');
    }
  });

  test('manifest is served and matches the app version', async ({ page, request }) => {
    const res = await request.get('/world-app/manifest.json');
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.version).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(manifest.log)).toBe(true);

    await gotoWorldReady(page);
    await expect.poll(async () => (await getState(page)).version).toBe(manifest.version);
  });

  test('the ambience is on by default, and the toggle mutes it (a choice shared with Camino)', async ({ page }) => {
    await gotoWorldReady(page, '', { sound: true });
    const frame = appFrame(page);

    const s0 = await frame.evaluate(() => window.__world.getState().sound);
    expect(typeof s0.supported).toBe('boolean');
    expect(s0.muted).toBe(false);            // fresh visit: sound on, like Camino

    // The corner toggle exists, and muting persists for next visit.
    await expect(frame.locator('.sound')).toBeVisible();
    const s1 = await frame.evaluate(() => window.__world.setMuted(true));
    expect(s1.muted).toBe(true);
    expect(await frame.evaluate(() => localStorage.getItem('camino_sound'))).toBe('off');
  });

  test('?character=eve embodies Eve', async ({ page }) => {
    await gotoWorldReady(page, '?character=eve');
    expect((await getState(page)).character).toBe('eve');
  });

  test('world-app also works standalone (visited directly)', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/world-app/index.html');
    await page.waitForSelector('body[data-world-ready="1"]', { timeout: 20000 });
    await expect(page.locator('canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('walking the garden', () => {
  test('a drag walks the character away from the camera; release stops', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWorldReady(page);

    const s0 = await getState(page);

    // Drag up from mid-screen: "away from you" = away from the camera.
    await page.mouse.move(195, 560);
    await page.mouse.down();
    await page.mouse.move(195, 330, { steps: 10 });
    await page.waitForTimeout(800);

    const s1 = await getState(page);
    const moved = dist2d(s1.pos, s0.pos);
    expect(moved).toBeGreaterThan(0.8);

    // Direction check: displacement should point away from the camera.
    const away = { x: s0.pos.x - s0.cam.x, z: s0.pos.z - s0.cam.z };
    const awayLen = Math.hypot(away.x, away.z);
    const step = { x: s1.pos.x - s0.pos.x, z: s1.pos.z - s0.pos.z };
    const dot = (step.x * away.x + step.z * away.z) / (awayLen * moved);
    expect(dot).toBeGreaterThan(0.5);

    // Lift the finger: the character glides to rest. Watch 400ms windows
    // until one is still — CI's software renderer dilates simulated time,
    // so the glide takes longer there than on any real device.
    await page.mouse.up();
    await expect.poll(async () => {
      const a = await getState(page);
      await page.waitForTimeout(400);
      const b = await getState(page);
      return dist2d(b.pos, a.pos);
    }, { timeout: 10000 }).toBeLessThan(0.08);

    expect(errors).toEqual([]);
  });

  test('the camera follows the walk at a sensible distance', async ({ page }) => {
    await gotoWorldReady(page);

    await page.mouse.move(195, 560);
    await page.mouse.down();
    await page.mouse.move(260, 320, { steps: 10 });

    const samples = [];
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(300);
      samples.push(await getState(page));
    }
    await page.mouse.up();

    for (const s of samples) {
      expect(s.camDist).toBeGreaterThan(2.5);
      expect(s.camDist).toBeLessThan(14);
    }
    // The camera must actually travel with the character, not sit at spawn.
    const camTravel = dist2d(samples[3].cam, samples[0].cam);
    expect(camTravel).toBeGreaterThan(0.5);
  });

  test('arrow keys walk too (desktop courtesy)', async ({ page }) => {
    await gotoWorldReady(page);
    const s0 = await getState(page);
    // Hold the key until the walker has really moved. (A fixed 700ms hold meant
    // "however many frames fit" — on a slow software-rendered CI runner that is
    // too few, and the distance came up short.)
    await page.keyboard.down('ArrowUp');
    try {
      await expect.poll(async () => dist2d((await getState(page)).pos, s0.pos), { timeout: 30000 })
        .toBeGreaterThan(0.5);
    } finally {
      await page.keyboard.up('ArrowUp');
    }
  });
});

test.describe('isolation: a broken world cannot break the site', () => {
  test('return home overlays the world and stays clickable', async ({ page }) => {
    await gotoWorldReady(page);
    const home = page.locator('a.home');
    await expect(home).toBeVisible();

    // The link lives in the parent document, not inside the iframe…
    const inParent = await page.evaluate(() => !!document.querySelector('a.home'));
    expect(inParent).toBe(true);

    // …and it is the element that actually receives a tap at its location,
    // sitting above the iframe in the hit-testing order.
    const hit = await page.evaluate(() => {
      const a = document.querySelector('a.home');
      const r = a.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return el === a || a.contains(el);
    });
    expect(hit).toBe(true);

    await home.click();
    await page.waitForURL('**/index.html');
  });

  test('a crashing world shows the fallback; return home still works', async ({ page }) => {
    // NOTE: this test *expects* a page error inside the iframe — that's the point.
    await page.goto('/world.html?debug=forceError');
    await page.click('.intro__enter');
    await page.waitForSelector('body[data-world-state="failed"]', { timeout: 15000 });

    await expect(page.locator('.fallback p')).toBeVisible();
    await expect(page.locator('.fallback button')).toBeVisible();
    await expect(page.locator('.stage iframe')).toHaveCount(0);   // frame removed

    const home = page.locator('a.home');
    await expect(home).toBeVisible();
    await home.click();
    await page.waitForURL('**/index.html');
  });

  test('the iframe is sandboxed against top navigation', async ({ page }) => {
    await gotoWorldReady(page);
    const sandbox = await page.locator('.stage iframe').getAttribute('sandbox');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-top-navigation');
  });
});

test.describe('arrival and layout', () => {
  test('the Eden portal on the home page leads here', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/index.html');
    // Keyboard entry is deterministic regardless of which portal stands
    // centered; pointer entry on side portals is covered in home-and-doors.
    await page.locator('.portal--eden').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/world.html');
    await page.click('.intro__enter');
    await page.waitForSelector('body[data-world-state="ready"]', { timeout: 20000 });
    expect(errors).toEqual([]);
  });

  test('no overflow on a phone', async ({ page }) => {
    await gotoWorldReady(page);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  });

  test('no overflow on a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoWorldReady(page);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  });
});
