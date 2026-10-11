// The Workshop: a stained-glass window of every technology the site uses,
// built from workshop/glass.json. These guard the data (every link points at
// a real pane, every planned pane names its phase) and the page (it renders
// every pane, lights the right neighbours, stays readable on a phone).
const { test, expect } = require('@playwright/test');
const glass = require('../workshop/glass.json');

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test.describe('workshop data', () => {
  test('every pane is well formed and every link points at a real pane', () => {
    const ids = new Set(glass.panes.map(p => p.id));
    const tiers = new Set(glass.tiers.map(t => t.id));
    expect(ids.size).toBe(glass.panes.length); // no duplicate ids
    for (const p of glass.panes) {
      expect(tiers.has(p.tier), `${p.id}: unknown tier ${p.tier}`).toBe(true);
      expect(['live', 'planned']).toContain(p.status);
      if (p.status === 'planned') expect(p.phase, `${p.id}: planned without a phase`).toBeGreaterThan(0);
      expect(p.what && p.here, `${p.id}: needs what and here`).toBeTruthy();
      for (const t of p.touches || []) expect(ids.has(t), `${p.id} touches unknown ${t}`).toBe(true);
    }
  });
});

test.describe('workshop page', () => {
  test('renders every pane, grouped by tier, with planned glass marked', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/workshop.html');
    await expect(page.locator('.pane')).toHaveCount(glass.panes.length);
    await expect(page.locator('.tier')).toHaveCount(new Set(glass.panes.map(p => p.tier)).size);
    const planned = glass.panes.filter(p => p.status === 'planned').length;
    await expect(page.locator('.pane[data-status="planned"]')).toHaveCount(planned);
    const someP = glass.panes.find(p => p.status === 'planned');
    if (someP) await expect(page.locator(`.pane[data-id="${someP.id}"] .pane__phase`)).toHaveText('phase ' + someP.phase);
    expect(errors).toEqual([]);
  });

  test('tapping a pane lights it and its neighbours, and explains it', async ({ page }) => {
    await page.goto('/workshop.html');
    await page.locator('.pane[data-id="identity"]').click();
    await expect(page.locator('.window')).toHaveClass(/has-selection/);
    await expect(page.locator('.pane[data-id="identity"]')).toHaveClass(/is-selected/);
    await expect(page.locator('.pane[data-id="identity"]')).toHaveAttribute('aria-pressed', 'true');
    // Neighbours both ways: identity names blob; functions names identity.
    await expect(page.locator('.pane[data-id="blob"]')).toHaveClass(/is-lit/);
    await expect(page.locator('.pane[data-id="functions"]')).toHaveClass(/is-lit/);
    await expect(page.locator('.pane[data-id="threejs"]')).not.toHaveClass(/is-lit/);
    await expect(page.locator('.panel h2')).toHaveText('Managed identity');
    await expect(page.locator('.panel .chip')).toHaveText('In use today');
    expect(page.url()).toContain('#identity');

    // Following a link in the panel moves the light.
    await page.locator('.touches button', { hasText: 'Blob Storage' }).click();
    await expect(page.locator('.panel h2')).toHaveText('Blob Storage');
    await expect(page.locator('.pane[data-id="blob"]')).toHaveClass(/is-selected/);

    // Tapping the selected pane again (or Escape) puts the window back.
    await page.keyboard.press('Escape');
    await expect(page.locator('.window')).not.toHaveClass(/has-selection/);
    await expect(page.locator('.panel .panel__hint')).toBeVisible();
  });

  test('a link to a pane opens with it selected', async ({ page }) => {
    const p = glass.panes.find(x => x.status === 'planned') || glass.panes[0];
    await page.goto('/workshop.html#' + p.id);
    await expect(page.locator('.panel h2')).toHaveText(p.name);
    await expect(page.locator('.panel .chip')).toHaveText(p.status === 'live' ? 'In use today' : 'Coming in phase ' + p.phase);
  });

  test('readable on a phone: no text under 14px, no sideways scroll', async ({ page }) => {
    await page.goto('/workshop.html');
    await page.locator('.pane[data-id="functions"]').click();
    const small = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
      .filter(e => parseFloat(getComputedStyle(e).fontSize) < 14)
      .map(e => `${e.tagName}.${e.className}: ${getComputedStyle(e).fontSize}`));
    expect(small).toEqual([]);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the home Workshop gate leads here', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.portal--workshop').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/workshop.html');
    await expect(page.locator('h1')).toHaveText('Workshop');
  });
});
