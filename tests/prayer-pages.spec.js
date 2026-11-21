// Each prayer has a page of its own, pray/<id>.html, so that a shared link
// shows that prayer's name and picture and a search engine can list it.
// The pages are made from prayer.html by scripts/build-prayer-pages.mjs and
// their pictures by scripts/build-share-cards.mjs. These checks fail if
// someone edits prayer.html or pray/prayers.json and forgets to run them.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { prayers } = JSON.parse(fs.readFileSync(path.join(ROOT, 'pray', 'prayers.json'), 'utf8'));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const metaOf = (html, prop) => {
  const m = html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`));
  return m && m[1];
};

// Width and height from a JPEG's frame header, without any image library.
function jpegSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

test.describe('each prayer’s own page', () => {
  test('the pages and the sitemap are up to date with prayer.html and prayers.json', async () => {
    const { build } = await import('../scripts/build-prayer-pages.mjs');
    const stale = Object.entries(build(ROOT))
      .filter(([f, text]) => !fs.existsSync(path.join(ROOT, f)) || read(f) !== text)
      .map(([f]) => f);
    expect(stale, 'run: node scripts/build-prayer-pages.mjs').toEqual([]);
  });

  test('every prayer’s page names it, and its picture is there at the size previews use', () => {
    for (const p of prayers) {
      const html = read(`pray/${p.id}.html`);
      expect(html).toContain(`<title>${p.title} · Pray · Machina Christi</title>`);
      expect(metaOf(html, 'og:url')).toBe(`https://machinachristi.com/pray/${p.id}.html`);
      expect(html).toContain(`<link rel="canonical" href="https://machinachristi.com/pray/${p.id}.html" />`);
      expect(metaOf(html, 'og:description')).toContain(p.title_th);
      const img = metaOf(html, 'og:image');
      expect(img).toBe(`https://machinachristi.com/assets/share/${p.id}.jpg`);
      const file = path.join(ROOT, 'assets', 'share', `${p.id}.jpg`);
      expect(fs.existsSync(file), `missing ${p.id}.jpg: run node scripts/build-share-cards.mjs`).toBe(true);
      expect(jpegSize(file)).toEqual({ width: 1200, height: 630 });
    }
  });

  test('every page’s share picture exists; Eden keeps the garden, the rest show the site’s card', () => {
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
    for (const f of pages) {
      const img = metaOf(read(f), 'og:image');
      expect(img, `${f} has no og:image`).toBeTruthy();
      const local = img.replace('https://machinachristi.com/', '');
      expect(fs.existsSync(path.join(ROOT, local)), `${f}: ${local} is missing`).toBe(true);
      const eden = f === 'world.html' || f === 'about-eden.html';
      expect(local, f).toBe(eden ? 'assets/og.png' : 'assets/share/machina-christi.jpg');
    }
    expect(jpegSize(path.join(ROOT, 'assets', 'share', 'machina-christi.jpg'))).toEqual({ width: 1200, height: 630 });
  });

  test('the sitemap lists every prayer’s page, and robots.txt lets search engines in', () => {
    const map = read('sitemap.xml');
    for (const p of prayers) expect(map).toContain(`<loc>https://machinachristi.com/pray/${p.id}.html</loc>`);
    const robots = read('robots.txt');
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/\S/m);
    expect(robots).toContain('Sitemap: https://machinachristi.com/sitemap.xml');
  });

  test('a prayer’s own page shows that prayer and stays put', async ({ page }) => {
    await page.goto('/pray/memorare.html');
    await expect(page.locator('#title')).toHaveText('The Memorare');
    await expect(page.locator('.line').first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/pray/memorare.html');
    await page.locator('a.back').click();
    await page.waitForURL('**/pray.html');
  });

  test('an older link, prayer.html?p=…, moves on to the prayer’s own page, keeping the part', async ({ page }) => {
    await page.goto('/prayer.html?p=hail-mary');
    await page.waitForURL('**/pray/hail-mary.html');
    await expect(page.locator('#title')).toHaveText('The Hail Mary');
    await page.goto('/prayer.html?p=mass#part-lamb-of-god');
    await page.waitForURL('**/pray/mass.html#part-lamb-of-god');
    await expect(page.locator('#part-lamb-of-god')).toBeInViewport();
  });

  test('an older link to a prayer that isn’t there still says so', async ({ page }) => {
    await page.goto('/prayer.html?p=no-such-prayer');
    await expect(page.locator('#title')).toHaveText('Prayer not found');
    expect(new URL(page.url()).pathname).toBe('/prayer.html');
  });
});
