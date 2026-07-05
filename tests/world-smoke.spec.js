// Smoke suite for the Garden of Eden world. This is the automated gate that
// AI-authored world updates must pass before deploying: it proves the world
// loads, renders real content, moves, and — above all — that a broken world
// cannot take the rest of the site down with it.
const { test, expect } = require('@playwright/test');

// Collect console errors + uncaught page errors (both documents: Playwright's
// page-level listeners hear the iframe too).
function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function gotoWorldReady(page, query = '') {
  await page.goto('/world.html' + query);
  // The intro explainer gates everything else — nothing loads until it's dismissed.
  await page.click('.intro__enter');
  await page.waitForSelector('body[data-world-state="ready"]', { timeout: 20000 });
}

function appFrame(page) {
  const frame = page.frames().find(f => f.url().includes('world-app'));
  if (!frame) throw new Error('world-app frame not found');
  return frame;
}

const getState = page => appFrame(page).evaluate(() => window.__world.getState());

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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
    expect(s.render.calls).toBeLessThan(200);
    expect(s.render.triangles).toBeGreaterThan(1000);
    expect(s.render.triangles).toBeLessThan(150000);
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

    // Lift the finger: the character comes to rest.
    await page.mouse.up();
    await page.waitForTimeout(500);
    const s2 = await getState(page);
    await page.waitForTimeout(400);
    const s3 = await getState(page);
    expect(dist2d(s3.pos, s2.pos)).toBeLessThan(0.08);

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
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(700);
    await page.keyboard.up('ArrowUp');
    const s1 = await getState(page);
    expect(dist2d(s1.pos, s0.pos)).toBeGreaterThan(0.5);
  });

  test('the companion wanders on its own', async ({ page }) => {
    await gotoWorldReady(page);
    const s0 = await getState(page);
    expect(s0.companion).toBeTruthy();
    expect(s0.companion.character).not.toBe(s0.character);

    await page.waitForTimeout(3000);
    const s1 = await getState(page);
    expect(dist2d(s1.companion.pos, s0.companion.pos)).toBeGreaterThan(0.3);
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
