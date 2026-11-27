// Kinder to weak eyes and big thumbs (AB#145).
//
// Two promises, checked the way a visitor meets them:
//  - every small button answers a thumb anywhere within a 44px square around
//    its middle (the size phone makers recommend), even where the visible
//    shape is smaller: a tap 21px off-centre must still reach it;
//  - the words on the reading pages stand out from the near-black page by at
//    least 4.5 to 1 (the usual line for easy reading), measured as each text's
//    colour mixed over the page's own background.
const { test, expect } = require('@playwright/test');

// For each element: would a tap 21px left, right, above and below its middle
// still land on it (or something inside it)?
async function thumbMisses(page, selector) {
  return page.$$eval(selector, els => els.flatMap(el => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const name = el.getAttribute('aria-label') || el.textContent.trim() || el.id;
    return [[-21, 0], [21, 0], [0, -21], [0, 21]]
      .filter(([dx, dy]) => {
        const hit = document.elementFromPoint(cx + dx, cy + dy);
        return !(hit && (hit === el || el.contains(hit)));
      })
      .map(([dx, dy]) => `${name} misses a tap at ${dx},${dy}`);
  }));
}

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test.describe(`big thumbs at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test('the homepage dots', async ({ page }) => {
      await page.goto('/index.html');
      await expect(page.locator('.waymarks button')).toHaveCount(3);
      expect(await thumbMisses(page, '.waymarks button')).toEqual([]);
    });

    // The two signs in the door's top corners: About's book and Search's glass.
    test('the homepage corner buttons', async ({ page }) => {
      await page.goto('/index.html');
      await expect(page.locator('body')).toHaveClass(/lit/);
      await expect(page.locator('.about-link, .search-link')).toHaveCount(2);
      expect(await thumbMisses(page, '.about-link, .search-link')).toEqual([]);
    });

    test("Ordo's day arrows", async ({ page }) => {
      await page.goto('/ordo.html?date=2026-11-19');
      await expect(page.locator('#prev-day')).toBeVisible();
      expect(await thumbMisses(page, '#prev-day, #next-day')).toEqual([]);
    });

    test("the Workshop's tier lights", async ({ page }) => {
      await page.goto('/workshop.html');
      await expect(page.locator('.rail button').first()).toBeVisible();
      expect(await thumbMisses(page, '.rail button')).toEqual([]);
    });
  });
}

const READING = [
  '/about.html', '/about-eden.html', '/about-camino.html', '/about-ordo.html',
  '/about-pray.html', '/about-logos.html', '/about-workshop.html',
  '/ordo.html?date=2026-11-19', '/pray.html', '/pray/our-father.html', '/search.html',
  '/build.html',
];

for (const url of READING) {
  test(`weak eyes: every word on ${url} stands out at least 4.5 to 1`, async ({ page }) => {
    await page.goto(url);
    await page.waitForTimeout(800);   // let the page fill in its words
    const faint = await page.evaluate(() => {
      const rgb = s => (s.match(/rgba?\(([^)]+)\)/) || [, '0,0,0,0'])[1].split(',').map(Number);
      const lum = c => {
        const a = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      };
      const bg = rgb(getComputedStyle(document.body).backgroundColor);
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const words = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length > 1);
        const r = el.getBoundingClientRect();
        if (!words.length || !r.width || !r.height) continue;
        const c = rgb(cs.color), a = c.length > 3 ? c[3] : 1;
        const mixed = c.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
        const L1 = lum(mixed), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (ratio < 4.5) out.push(`${ratio.toFixed(1)}:1 "${words[0].textContent.trim().slice(0, 30)}"`);
      }
      return [...new Set(out)];
    });
    expect(faint).toEqual([]);
  });
}
