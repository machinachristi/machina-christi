// The timing readout (AB#168): how long Eden took to open, step by step.
//
// It is the ruler for making the garden open faster, so these checks pin that
// it appears only when asked for (?timing=1), that its steps add up, and that
// a phone can read it. They never judge the numbers themselves: this machine
// draws the garden in software, so its times say nothing about a phone's.
//
// Its own project in playwright.config.js, run after the feature checks, so
// it never draws a garden alongside theirs (their timed checks need the
// machine to themselves). On its own: add --no-deps.
const { test, expect } = require('@playwright/test');
const { gotoWorldReady, appFrame } = require('./world-helpers');

const STEPS = ['scripts', 'garden', 'warm', 'picture', 'ready'];

test.describe('the timing readout', () => {
  test('with ?timing=1 it shows each step of opening, adding up and readable', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('camino_sound', 'off'));
    // Straight in, as from the homepage's gate: the clock starts with the page.
    await page.goto('/world.html?timing=1#enter');
    await page.waitForSelector('body[data-world-state="ready"]', { timeout: 20000 });

    const readout = page.locator('.timing');
    await expect(readout).toBeVisible();
    const text = (await readout.innerText()).replace(/\s+/g, ' ');
    const m = text.match(/tap → garden (\d+\.\d) s page (\d+\.\d) · scripts (\d+\.\d) · build (\d+\.\d) · first picture (\d+\.\d)/);
    expect(m, `readout says: ${text}`).not.toBeNull();

    // The steps follow one another, so together they make the whole: only
    // rounding and the hop of the message between the two pages are left over.
    const [total, ...steps] = m.slice(1).map(Number);
    const sum = steps.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(total - sum), `total ${total} vs steps ${steps.join(' + ')}`).toBeLessThan(0.5);

    // Readable on a phone (never under 14px), inside the screen, and it takes
    // no touch: walking works through it.
    const look = await readout.evaluate(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        font: parseFloat(cs.fontSize),
        touch: cs.pointerEvents,
        inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      };
    });
    expect(look.font).toBeGreaterThanOrEqual(14);
    expect(look.touch).toBe('none');
    expect(look.inside).toBe(true);

    // Pinch-to-zoom stays off, on both pages.
    expect(await page.getAttribute('meta[name="viewport"]', 'content')).toContain('user-scalable=no');
    expect(await appFrame(page).getAttribute('meta[name="viewport"]', 'content')).toContain('user-scalable=no');
  });

  test('without ?timing=1 there is no readout, though the steps are still marked', async ({ page }) => {
    await gotoWorldReady(page); // by the intro's button, as a visitor arriving from a search
    // The readout would be made in the same moment the garden is shown.
    await expect(page.locator('.timing')).toHaveCount(0);
    // …and not because the stopwatch was missing: every step was marked.
    const marked = await appFrame(page).evaluate(() =>
      performance.getEntriesByType('mark').map(m => m.name).filter(n => n.startsWith('eden:')));
    expect(marked).toEqual(STEPS.map(s => `eden:${s}`));
  });
});
