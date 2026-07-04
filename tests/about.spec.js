// Smoke suite for the About wiki (hub + one page per experience), so the
// section can grow without its basic navigation silently breaking.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test.describe('about hub', () => {
  test('loads and links to both sub-pages', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/about.html');
    await expect(page.locator('h1')).toContainText('About');
    await expect(page.locator('a[href="about-camino.html"]')).toBeVisible();
    await expect(page.locator('a[href="about-eden.html"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the back link returns home', async ({ page }) => {
    await page.goto('/about.html');
    await page.locator('.back').click();
    await page.waitForURL('**/index.html');
  });
});

test.describe('about sub-pages', () => {
  test('about-camino loads cleanly and links to the game', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/about-camino.html');
    await expect(page.locator('h1')).toContainText('Camino');
    await expect(page.locator('a[href="game.html"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('about-eden loads cleanly and links to the world', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/about-eden.html');
    await expect(page.locator('h1')).toContainText('Eden');
    await expect(page.locator('a[href="world.html"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('about-eden renders the live manifest changelog', async ({ page, request }) => {
    const res = await request.get('/world-app/manifest.json');
    const manifest = await res.json();

    await page.goto('/about-eden.html');
    const entries = page.locator('#changelog-list .entry');
    await expect(entries).toHaveCount(manifest.log.length);

    const latest = [...manifest.log].reverse()[0];
    await expect(entries.first()).toContainText(latest.focus);
    await expect(entries.first()).toContainText(String(latest.version));
  });

  test('about-eden falls back gracefully when the manifest fails to load', async ({ page }) => {
    await page.route('**/world-app/manifest.json', route => route.abort());
    await page.goto('/about-eden.html');
    await expect(page.locator('#changelog-list .notice')).toBeVisible();
  });
});
