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
const {
  watchErrors, watchPageErrors, gotoWorldReady, appFrame, getState, dist2d, expectInBudget,
  enterHeaven, leaveHeaven,
} = require('./world-helpers');

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

// Jacob's ladder and heaven (AB#106). Heaven is a second realm the weekly
// routine furnishes week by week, so these checks hold for any heaven it
// builds: the way up and back always works, heaven fits the same budget as
// the garden, and nothing that goes wrong up there can take the world down —
// he is always brought safely home to Eden instead. (Long: a climb on CI's
// software renderer takes a while, so each allows minutes, not seconds.)
test.describe('the ladder and heaven', () => {
  test('walking into the ladder carries him up to heaven, within budget, and back down again', async ({ page }) => {
    test.setTimeout(300000);
    const errors = watchPageErrors(page);
    await gotoWorldReady(page);
    const frame = appFrame(page);
    const s0 = await getState(page);
    expect(s0.realm.now).toBe('eden');
    const foot = s0.ladder.foot;

    // Up, and through the arrival — the widest view of heaven, as the camera
    // first looks out to the glory — every frame sampled against the budget.
    await enterHeaven(page, { settled: false });
    const peak = await frame.evaluate(() => new Promise(resolve => {
      const t0 = performance.now();
      const most = { calls: 0, triangles: 0, frames: 0 };
      (function sample() {
        const r = window.__world.getState().render;
        most.calls = Math.max(most.calls, r.calls);
        most.triangles = Math.max(most.triangles, r.triangles);
        most.frames++;
        if (performance.now() - t0 < 3000) requestAnimationFrame(sample);
        else resolve(most);
      })();
    }));
    expect(peak.frames).toBeGreaterThan(3);
    expect(peak.calls).toBeGreaterThan(0);
    expectInBudget({ render: peak }, 'in heaven');

    await expect.poll(async () => (await getState(page)).realm.passage, { timeout: 60000 }).toBe(null);
    let s = await getState(page);
    expect(s.realm.now).toBe('heaven');
    expect(s.realm.failed).toBe(false);

    // He can walk in heaven.
    const p0 = s.pos;
    await page.keyboard.down('ArrowUp');
    try {
      await expect.poll(async () => dist2d((await getState(page)).pos, p0), { timeout: 30000 })
        .toBeGreaterThan(0.5);
    } finally {
      await page.keyboard.up('ArrowUp');
    }

    // And back down: home in the garden, beside the ladder's foot.
    await leaveHeaven(page);
    s = await getState(page);
    expect(s.realm.now).toBe('eden');
    expect(dist2d(s.pos, foot)).toBeLessThan(4);

    // The garden draws again.
    const pixels = await frame.evaluate(() => window.__world.samplePixels(5));
    expect(new Set(pixels.map(p => p.slice(0, 3).join(','))).size).toBeGreaterThanOrEqual(6);
    expect(pixels.filter(p => Math.max(p[0], p[1], p[2]) > 90).length).toBeGreaterThan(5);
    expect(await page.getAttribute('body', 'data-world-state')).toBe('ready');
    expect(errors).toEqual([]);
  });

  test('if heaven cannot be built, he stays safe in Eden and the world lives on', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWorldReady(page, '?debug=heavenError');
    const frame = appFrame(page);
    const foot = (await getState(page)).ladder.foot;
    await frame.evaluate(f => window.__world.teleport(f.x, f.z - 8, 0), foot);
    await frame.evaluate(f => window.__world.walkTo(f.x, f.z), foot);
    await expect.poll(async () => (await getState(page)).realm.failed, { timeout: 60000 }).toBe(true);
    // He walks right up to the foot, and the ladder rests.
    await expect.poll(async () => dist2d((await getState(page)).pos, foot), { timeout: 60000 }).toBeLessThan(1.5);
    const s = await getState(page);
    expect(s.realm.now).toBe('eden');
    expect(s.realm.passage).toBe(null);
    expect(await page.getAttribute('body', 'data-world-state')).toBe('ready');
    await expect(page.locator('.stage iframe')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a fault inside heaven brings him home to Eden, and the world lives on', async ({ page }) => {
    test.setTimeout(300000);
    const errors = watchPageErrors(page);
    await gotoWorldReady(page, '?debug=heavenFault');
    const foot = (await getState(page)).ladder.foot;
    await enterHeaven(page, { settled: false });
    await expect.poll(async () => {
      const s = await getState(page);
      return s.realm.failed && s.realm.now === 'eden' && s.realm.passage === null;
    }, { timeout: 120000 }).toBe(true);
    const s = await getState(page);
    expect(dist2d(s.pos, foot)).toBeLessThan(4);
    expect(await page.getAttribute('body', 'data-world-state')).toBe('ready');
    await expect(page.locator('.stage iframe')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('with the saints\' records missing, heaven still opens, with the multitude', async ({ page }) => {
    test.setTimeout(300000);
    // The browser logs the blocked request as a console error itself, so only
    // uncaught page errors count here.
    const errors = watchPageErrors(page);
    await page.route('**/ordo/saints.json', route => route.abort());
    await gotoWorldReady(page);
    await enterHeaven(page);
    const s = await getState(page);
    expect(s.realm.now).toBe('heaven');
    expect(s.realm.failed).toBe(false);
    expect(s.heaven.saints).toBe(0);
    expect(s.heaven.multitude).toBeGreaterThan(1000);
    expect(errors).toEqual([]);
  });
});
