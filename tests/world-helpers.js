// Shared helpers for the Garden of Eden world's two test files:
//   world-core.spec.js     — the locked safety checks (no automated run may edit them)
//   world-features.spec.js — checks that pin particular features of the garden
// Not a spec itself (no .spec in the name), so Playwright never runs it directly.
const { expect } = require('@playwright/test');

// Collect console errors + uncaught page errors (both documents: Playwright's
// page-level listeners hear the iframe too).
function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Uncaught page errors only — for checks where the browser itself logs a
// console error that isn't the world's (a fetch the test deliberately blocks).
function watchPageErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function gotoWorldReady(page, query = '', { sound = false } = {}) {
  // Eden's sound is on by default (shared with Camino). These tests measure
  // frame-rate-sensitive things — distance walked, fades, timings — and a full
  // audio graph on a slow, software-rendered CI runner skews them, so they run
  // muted. Only the ambience test opts in to the real default.
  if (!sound) await page.addInitScript(() => localStorage.setItem('camino_sound', 'off'));
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

// The mobile render budget — the one ceiling every version of the garden lives under.
function expectInBudget(s, label = '') {
  expect(s.render.calls, `draw calls ${label}`).toBeLessThan(200);
  expect(s.render.triangles, `triangles ${label}`).toBeLessThan(150000);
}

// Up Jacob's ladder to heaven (AB#106) the way a visitor goes: set down a few
// strides short of its foot on the far bank, then walked into it. If anything
// on the way stops him short, he is sent on again. Resolves once he is in
// heaven — and, unless `settled` is false, once the veil has lifted.
async function enterHeaven(page, { settled = true, timeout = 120000 } = {}) {
  const frame = appFrame(page);
  const foot = (await getState(page)).ladder.foot;
  await frame.evaluate(f => window.__world.teleport(f.x, f.z - 8, 0), foot);
  await expect.poll(async () => {
    const s = await getState(page);
    if (s.realm.now === 'eden' && !s.realm.passage && !s.walk.target) {
      await frame.evaluate(f => window.__world.walkTo(f.x, f.z), foot);
    }
    return s.realm.now === 'heaven' && (!settled || s.realm.passage === null);
  }, { timeout, intervals: [500] }).toBe(true);
}

// Back down: walked to the head of the ladder in heaven, and on down it into
// the garden. Resolves once he has stepped off it in Eden.
async function leaveHeaven(page, { timeout = 120000 } = {}) {
  const frame = appFrame(page);
  await expect.poll(async () => {
    const s = await getState(page);
    if (s.realm.now === 'heaven' && !s.realm.passage && !s.walk.target) {
      await frame.evaluate(h => window.__world.walkTo(h.x, h.z), s.heaven.ladderHead);
    }
    return s.realm.now === 'eden' && s.realm.passage === null;
  }, { timeout, intervals: [500] }).toBe(true);
}

module.exports = {
  watchErrors, watchPageErrors, gotoWorldReady, appFrame, getState, dist2d, expectInBudget,
  enterHeaven, leaveHeaven,
};
