// The Build page (three gates, step 1, AB#172): the Workshop, and a Projects
// card with one line per side project (Camino, Logos). Until step 2 opens its
// gate on the front door it is reached by its address alone.
const { test, expect } = require('@playwright/test');

const ROOMS = [
  { name: 'Workshop', words: 'how it’s built', href: '/workshop.html', sel: '.card' },
  { name: 'Camino', words: 'the pilgrim road', href: '/game.html', sel: '.project' },
  { name: 'Logos', words: 'learning Thai, letter by letter', href: '/logos.html', sel: '.project' },
];

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// For each element: would a tap 21px left, right, above and below its middle
// still land on it? (The same thumb check as kind-to-eyes.spec.js.)
async function thumbMisses(page, selector) {
  return page.$$eval(selector, els => els.flatMap(el => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const name = el.textContent.trim().split(/\s+/)[0];
    return [[-21, 0], [21, 0], [0, -21], [0, 21]]
      .filter(([dx, dy]) => {
        const hit = document.elementFromPoint(cx + dx, cy + dy);
        return !(hit && (hit === el || el.contains(hit)));
      })
      .map(([dx, dy]) => `${name} misses a tap at ${dx},${dy}`);
  }));
}

// Visible words under 14px (the same rule as workshop.spec.js).
async function smallText(page) {
  return page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter(e => e.getClientRects().length && getComputedStyle(e).opacity !== '0')
    .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
    .filter(e => parseFloat(getComputedStyle(e).fontSize) < 14)
    .map(e => `${e.tagName}.${e.className}: ${getComputedStyle(e).fontSize}`));
}

test('lists the Workshop, then Camino and Logos under Projects', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/build.html');
  await expect(page.locator('h1')).toHaveText('Build');
  await expect(page.locator('.back')).toHaveAttribute('href', 'index.html');
  await expect(page.locator('.find')).toHaveAttribute('href', 'search.html');
  for (const r of ROOMS) {
    const link = page.locator(`${r.sel}[href="${r.href}"]`);
    await expect(link, r.name).toHaveCount(1);
    await expect(link).toContainText(r.name);
    await expect(link).toContainText(r.words);
  }
  // Camino and Logos sit together on the Projects card, in that order.
  await expect(page.locator('#projects-title')).toHaveText('Projects');
  await expect(page.locator('#projects .project')).toHaveCount(2);
  await expect(page.locator('#projects .project__name')).toHaveText(['Camino', 'Logos']);
  expect(errors).toEqual([]);
});

for (const r of ROOMS) {
  test(`${r.name} opens from the Build page`, async ({ page }) => {
    await page.goto('/build.html');
    await page.locator(`${r.sel}[href="${r.href}"]`).click();
    await page.waitForURL(`**${r.href}`);
  });
}

test('carries the hidden lines every page has, and keeps pinch-zoom off', async ({ page }) => {
  await page.goto('/build.html');
  const attr = (sel, a) => page.locator(sel).getAttribute(a);
  expect(await attr('meta[name="viewport"]', 'content')).toContain('user-scalable=no');
  expect(await attr('meta[name="viewport"]', 'content')).toContain('maximum-scale=1.0');
  expect(await attr('link[rel="apple-touch-icon"]', 'href')).toBe('/assets/apple-touch-icon.png');
  expect(await attr('meta[property="og:url"]', 'content')).toBe('https://machinachristi.com/build.html');
  expect(await attr('meta[property="og:title"]', 'content')).toBe('Build · Machina Christi');
  expect(await attr('meta[property="og:image"]', 'content')).toBe('https://machinachristi.com/assets/share/machina-christi.jpg');
  expect(await attr('meta[name="description"]', 'content')).toBeTruthy();
  await expect(page.locator('script[src="/assets/telemetry.js"]')).toHaveCount(1);
  await expect(page.locator('script[src^="/assets/season.js"]')).toHaveCount(1);
});

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test.describe(`on a phone at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test('every line answers a thumb, every word is 14px or more, and nothing scrolls sideways', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/build.html');
      await expect(page.locator('.project')).toHaveCount(2);
      for (const sel of ['.card', '.project', '.back', '.find']) {
        expect(await thumbMisses(page, sel), sel).toEqual([]);
      }
      // Each project line is at least 44px tall in its own right, too.
      for (const h of await page.locator('.project').evaluateAll(ls => ls.map(l => l.getBoundingClientRect().height))) {
        expect(h).toBeGreaterThanOrEqual(44);
      }
      expect(await smallText(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  });
}
