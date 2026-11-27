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
  test('loads and links to every sub-page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/about.html');
    await expect(page.locator('h1')).toContainText('About');
    await expect(page.locator('a[href="about-camino.html"]')).toBeVisible();
    await expect(page.locator('a[href="about-eden.html"]')).toBeVisible();
    await expect(page.locator('a[href="about-ordo.html"]')).toBeVisible();
    await expect(page.locator('a[href="about-pray.html"]')).toBeVisible();
    await expect(page.locator('a[href="about-workshop.html"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  // The one place the whole map shows (AB#172): each story under the gate its
  // room stands behind on the front door.
  test('groups the stories under the three gates', async ({ page }) => {
    await page.goto('/about.html');
    const groups = await page.$$eval('.gate', gs => gs.map(g => [
      g.querySelector('.gate__name').textContent.trim(),
      [...g.querySelectorAll('.card')].map(c => c.getAttribute('href')),
    ]));
    expect(groups).toEqual([
      ['Pray', ['about-ordo.html', 'about-pray.html']],
      ['Wander', ['about-eden.html']],
      ['Build', ['about-workshop.html', 'about-camino.html', 'about-logos.html']],
    ]);
  });

  test('opens with John 15:12, naming its translation', async ({ page }) => {
    await page.goto('/about.html');
    await expect(page.locator('figure.verse blockquote')).toHaveText('This is my commandment, that you love one another, as I have loved you.');
    await expect(page.locator('figure.verse figcaption')).toContainText('John 15:12 (Douay-Rheims)');
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
    await expect(page.locator('a[href="world.html#enter"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('about-ordo loads cleanly and links to ordo', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/about-ordo.html');
    await expect(page.locator('h1')).toContainText('Ordo');
    await expect(page.locator('a[href="ordo.html"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('about-pray loads cleanly and links to the prayers', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/about-pray.html');
    await expect(page.locator('h1')).toContainText('Pray');
    await expect(page.locator('a[href="pray.html"]')).toBeVisible();
    await expect(page.locator('blockquote')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('about-workshop loads cleanly, links to the workshop, and credits RepoSense', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/about-workshop.html');
    await expect(page.locator('h1')).toContainText('Workshop');
    await expect(page.locator('a.enter[href="workshop.html"]')).toBeVisible();
    await expect(page.locator('a[href^="https://github.com/iLevyTate/reposense"]')).toBeVisible();
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
