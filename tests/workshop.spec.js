// The Workshop: every technology the site uses, from workshop/glass.json,
// raised as a 3D nave of glass (three.js), with the 2D stained-glass window
// standing in for anyone who asks for reduced motion or whose browser can't
// draw it. These guard the data (every link points at a real pane), both
// views (every pane is reachable, the right neighbours light, the chosen one
// stays clear of the panel) and the page (readable on a phone).
const { test, expect } = require('@playwright/test');
const glass = require('../workshop/glass.json');

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function smallText(page) {
  return page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter(e => e.getClientRects().length && getComputedStyle(e).opacity !== '0')
    .filter(e => !e.closest('.window') || !document.documentElement.classList.contains('nave-on'))
    .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
    .filter(e => parseFloat(getComputedStyle(e).fontSize) < 14)
    .map(e => `${e.tagName}.${e.className}: ${getComputedStyle(e).fontSize}`));
}

const sideways = page => page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);

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

  test('the walk has its words: a prologue, an epilogue, and a story for every tier', () => {
    expect(glass.prologue && glass.epilogue).toBeTruthy();
    for (const t of glass.tiers) expect(t.story, `${t.id}: needs a story`).toBeTruthy();
  });

  test('every tier has its colour in the page', async ({ page }) => {
    await page.goto('/workshop.html');
    const missing = await page.evaluate(ids => ids.filter(id =>
      !getComputedStyle(document.documentElement).getPropertyValue('--' + id).trim()), glass.tiers.map(t => t.id));
    expect(missing, 'add --<tier> to :root in workshop.html').toEqual([]);
  });
});

test.describe('workshop nave (3D)', () => {
  test('raises the nave from the same glass, with the window kept for keyboards', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('html')).toHaveClass(/nave-on/);
    // The glass fills the screen; one small dock, and no card until something is chosen.
    await expect(page.locator('.dock')).toBeVisible();
    await expect(page.locator('.panel')).toBeHidden();
    const box = await page.locator('.nave canvas').boundingBox();
    expect(box.width).toBe(390);
    expect(box.height).toBe(780);
    // The window's panes stay in the page (visually set aside) for keyboards
    // and screen readers.
    await expect(page.locator('.pane')).toHaveCount(glass.panes.length);
    expect(await page.locator('.window').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('tapping a light explains it and keeps it above the panel', async ({ page }) => {
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.nave[data-intro="done"]')).toBeAttached({ timeout: 20000 });
    await page.locator('.nave').scrollIntoViewIfNeeded();
    // Tap whichever live light is in plain view (the tower may stand in front of others).
    const t = await page.evaluate(ids => {
      for (const id of ids) { const s = window.__nave.screenOf(id); if (window.__nave.pickAt(s.x, s.y, false) === id) return { id, ...s }; }
    }, glass.panes.filter(p => p.status === 'live').map(p => p.id));
    expect(t, 'some live light should be in plain view').toBeTruthy();
    await page.touchscreen.tap(t.x, t.y);
    const p = glass.panes.find(x => x.id === t.id);
    await expect(page.locator('.panel h2')).toHaveText(p.name);
    await expect(page.locator('.tag.is-sel')).toHaveText(p.name);
    expect(page.url()).toContain('#' + p.id);
    // The camera glides until the chosen light sits in the open part of the stage.
    await expect.poll(async () => page.evaluate(id => {
      const s = window.__nave.screenOf(id);
      const panel = document.querySelector('.panel').getBoundingClientRect();
      const stage = document.querySelector('.nave').getBoundingClientRect();
      return s.y > Math.max(stage.top, 0) && s.y < panel.top - 20;
    }, p.id), { timeout: 15000 }).toBe(true);
    expect(await smallText(page)).toEqual([]);
    expect(await sideways(page)).toBeLessThanOrEqual(1);
  });

  test('a keyboard walks the glass, and focus follows the panel', async ({ page }) => {
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    await page.locator('.pane[data-id="identity"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.panel h2')).toHaveText('Managed identity');
    await page.locator('.touches button', { hasText: 'Blob Storage' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.panel h2')).toHaveText('Blob Storage');
    // The panel was rebuilt; focus moved to the new pane rather than being lost.
    await expect(page.locator('.pane[data-id="blob"]')).toBeFocused();
    await page.locator('.touches button').first().focus();
    await page.keyboard.press('Escape');
    // In the nave nothing chosen means no card at all.
    await expect(page.locator('.panel')).toBeHidden();
    await expect(page.locator('.pane[data-id="blob"]')).toBeFocused();
  });

  test('opens with a shot down the tower, which a touch can skip', async ({ page }) => {
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-intro="playing"]')).toBeAttached({ timeout: 20000 });
    await page.locator('.nave canvas').click({ position: { x: 20, y: 200 } });
    await expect(page.locator('.nave[data-intro="done"]')).toBeAttached();
    await expect(page.locator('.dock .walk')).toBeVisible();
  });

  test('the tier rail tells one tier at a time', async ({ page }) => {
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.rail button')).toHaveCount(new Set(glass.panes.map(p => p.tier)).size);
    const i = glass.tiers.findIndex(t => t.id === 'house');
    const t = glass.tiers[i];
    await page.locator('.rail button[data-tier="house"]').click();
    await expect(page.locator('.panel h2')).toHaveText(t.name);
    await expect(page.locator('.panel .eyebrow')).toContainText(`Tier ${i + 1} of ${glass.tiers.length}`);
    await expect(page.locator('.panel .story')).toHaveText(t.story);
    const names = glass.panes.filter(p => p.tier === 'house').map(p => p.name);
    await expect(page.locator('.panel .touches button')).toHaveText(names);
    await expect(page.locator('.rail button[data-tier="house"]')).toHaveAttribute('aria-current', 'true');
    // A pane's panel names its tier, and that name leads back to the tier.
    await page.locator('.panel .touches button', { hasText: 'Functions' }).click();
    await expect(page.locator('.panel h2')).toHaveText('Functions');
    await page.locator('.panel button.eyebrow').click();
    await expect(page.locator('.panel h2')).toHaveText(t.name);
  });

  test('the walk tells the tower in captions, step by step', async ({ page }) => {
    await page.addInitScript(() => { window.__workshopDwell = 600000; }); // no step moves on by itself mid-test
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    const tiers = glass.tiers.filter(t => glass.panes.some(p => p.tier === t.id));
    const steps = tiers.length + 2;
    await page.locator('.dock .walk').click();
    // The HUD gives way to the caption and the walk's own controls.
    await expect(page.locator('.dock .walk')).toBeHidden();
    await expect(page.locator('.caption p')).toHaveText(glass.prologue);
    await expect(page.locator('.tour__step')).toHaveText(`1 of ${steps}`);
    await expect(page.locator('.tour [data-role="next"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.caption h2')).toHaveText(tiers[0].name);
    await expect(page.locator('.caption p')).toHaveText(tiers[0].story);
    // The keyboard stays on the controls as the step changes.
    await expect(page.locator('.tour [data-role="next"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.caption h2')).toHaveText(tiers[1].name);
    await page.locator('.tour [data-role="back"]').click();
    await expect(page.locator('.caption h2')).toHaveText(tiers[0].name);
    for (let i = 1; i < steps; i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('.caption p')).toHaveText(glass.epilogue);
    await expect(page.locator('.tour [data-role="next"]')).toBeDisabled();
    // Pause is a steady toggle.
    await page.locator('.tour [data-role="pause"]').click();
    await expect(page.locator('.tour [data-role="pause"]')).toHaveAttribute('aria-pressed', 'true');
    // Escape ends it, and the dock returns.
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour')).toBeHidden();
    await expect(page.locator('.dock .walk')).toBeVisible();
  });

  test('leaving the walk any way never strands its controls', async ({ page }) => {
    await page.addInitScript(() => { window.__workshopDwell = 600000; });
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    // A tap on empty sky during the walk.
    await page.locator('.dock .walk').click();
    await expect(page.locator('.tour')).toBeVisible();
    await page.locator('.nave canvas').click({ position: { x: 200, y: 110 } });
    await expect(page.locator('.tour')).toBeHidden();
    await expect(page.locator('.dock .walk')).toBeVisible();
    // The end button.
    await page.locator('.dock .walk').click();
    await page.locator('.tour [data-role="end"]').click();
    await expect(page.locator('.tour')).toBeHidden();
    // A pane chosen by keyboard ends it too.
    await page.locator('.dock .walk').click();
    await page.locator('.tour [data-role="next"]').click();
    await page.locator('.pane[data-id="blob"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.tour')).toBeHidden();
    await expect(page.locator('.panel h2')).toHaveText('Blob Storage');
  });

  test('the help sheet holds the words and the credit', async ({ page }) => {
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    await page.locator('.help-open').click();
    await expect(page.locator('.help')).toBeVisible();
    await expect(page.locator('.help')).toContainText('RepoSense');
    expect(await smallText(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.help')).toBeHidden();
  });

  test('if three.js cannot load, the window stands instead', async ({ page }) => {
    const errors = watchErrors(page);
    await page.route('**/three.module.min.js', r => r.abort());
    await page.goto('/workshop.html');
    await expect(page.locator('.pane[data-id="functions"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.nave')).toBeHidden();
    await expect(page.locator('.modes')).toBeHidden();
    await page.locator('.pane[data-id="functions"]').click();
    await expect(page.locator('.panel h2')).toHaveText('Functions');
    expect(errors.filter(e => !/three\.module|ERR_FAILED|Failed to load/.test(e))).toEqual([]);
  });

  test('if the graphics context is lost, the window takes over', async ({ page }) => {
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    await page.evaluate(() => document.querySelector('.nave canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await expect(page.locator('.nave')).toBeHidden();
    await expect(page.locator('.pane[data-id="functions"]')).toBeVisible();
  });

  test('the Window switch brings back the stained glass', async ({ page }) => {
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeVisible({ timeout: 20000 });
    await page.locator('.dock [data-mode="window"]').click();
    await expect(page.locator('.nave')).toBeHidden();
    await page.locator('.pane[data-id="functions"]').click();
    await expect(page.locator('.panel h2')).toHaveText('Functions');
  });
});

test.describe('workshop window (reduced motion)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('renders every pane, grouped by tier, without loading three.js', async ({ page }) => {
    const errors = watchErrors(page);
    const three = [];
    page.on('request', r => { if (r.url().includes('three.')) three.push(r.url()); });
    await page.goto('/workshop.html');
    await expect(page.locator('.pane')).toHaveCount(glass.panes.length);
    await expect(page.locator('.tier')).toHaveCount(new Set(glass.panes.map(p => p.tier)).size);
    const planned = glass.panes.filter(p => p.status === 'planned').length;
    await expect(page.locator('.pane[data-status="planned"]')).toHaveCount(planned);
    const someP = glass.panes.find(p => p.status === 'planned');
    if (someP) await expect(page.locator(`.pane[data-id="${someP.id}"] .pane__phase`)).toHaveText('phase ' + someP.phase);
    await expect(page.locator('.nave')).toBeHidden();
    await expect(page.locator('.dock .walk')).toBeHidden();
    expect(three).toEqual([]);
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

    await page.locator('.touches button', { hasText: 'Blob Storage' }).click();
    await expect(page.locator('.panel h2')).toHaveText('Blob Storage');
    await expect(page.locator('.pane[data-id="blob"]')).toHaveClass(/is-selected/);

    await page.keyboard.press('Escape');
    await expect(page.locator('.window')).not.toHaveClass(/has-selection/);
    await expect(page.locator('.panel .panel__hint')).toBeVisible();
  });

  test('on a phone the chosen pane stays clear of the panel', async ({ page }) => {
    await page.goto('/workshop.html');
    const last = glass.panes[glass.panes.length - 1];
    await page.locator(`.pane[data-id="${last.id}"]`).click();
    await expect(page.locator('.panel h2')).toHaveText(last.name);
    await expect.poll(() => page.evaluate(id => {
      const r = document.querySelector(`.pane[data-id="${id}"]`).getBoundingClientRect();
      return r.bottom <= document.querySelector('.panel').getBoundingClientRect().top;
    }, last.id)).toBe(true);
  });

  test('links open a pane; the address can change, or be nonsense', async ({ page }) => {
    const errors = watchErrors(page);
    const p = glass.panes.find(x => x.status === 'planned') || glass.panes[0];
    await page.goto('/workshop.html#' + p.id);
    await expect(page.locator('.panel h2')).toHaveText(p.name);
    await expect(page.locator('.panel .chip')).toHaveText(p.status === 'live' ? 'In use today' : 'Coming in phase ' + p.phase);
    await page.evaluate(() => { location.hash = '#blob'; });
    await expect(page.locator('.panel h2')).toHaveText('Blob Storage');
    await page.goto('/workshop.html#%E0%A4%A');
    await expect(page.locator('.pane')).toHaveCount(glass.panes.length);
    expect(errors).toEqual([]);
  });

  test('readable on a phone: no text under 14px, no sideways scroll', async ({ page }) => {
    await page.goto('/workshop.html');
    await page.locator('.pane[data-id="functions"]').click();
    expect(await smallText(page)).toEqual([]);
    expect(await sideways(page)).toBeLessThanOrEqual(1);
  });
});

test('the home Workshop gate leads here', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('.portal--workshop').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/workshop.html');
  await expect(page.locator('h1')).toHaveText('Workshop');
});
