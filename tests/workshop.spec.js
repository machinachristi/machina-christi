// The Workshop: every technology the site uses, from workshop/glass.json, set
// as columns of light in a square after St Peter's (three.js), with a plain
// list kept in the page for keyboards and screen readers, and shown as the
// page where 3D cannot be drawn. These guard the data (every link points at a
// real pane), the square (every column reachable, the right neighbours light,
// what is chosen stays clear of the card, a tier's card fits a phone without
// scrolling) and the page (readable, one frame loop, safe fallbacks).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const glass = require('../workshop/glass.json');
const swaConfig = require('../staticwebapp.config.json');

// ── Does the map match what's built? ─────────────────────────────────────────
//
// glass.json is written by hand, and it once fell behind: Azure SQL, Cosmos
// DB and AI Speech still said "planned" weeks after Phases 2 and 4 put them
// to work. So each pane that stands for an Azure service is checked against
// the Bicep files in infra/: "live" exactly when infra/ creates that kind of
// resource. Every other pane must say here why it isn't checked, so a new
// pane can't slip past unclassified.

// Each resource block infra/ declares, comments removed. A block that only
// refers to a resource made elsewhere (`existing`) doesn't count: that one
// is counted where it's made.
function declaredResources() {
  const files = [];
  const walk = dir => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.bicep')) files.push(p);
    }
  };
  walk(path.join(__dirname, '..', 'infra'));
  const blocks = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1'); // `//` comments, not the `//` in 'https://…'
    for (const block of text.split(/^(?=resource\s)/m)) {
      const m = /^resource\s+\w+\s+'([^'@]+)@[^']+'\s*(existing)?/.exec(block);
      if (m && !m[2]) blocks.push({ type: m[1], kind: /^\s*kind:\s*'([^']+)'/m.exec(block)?.[1], file: path.relative(path.join(__dirname, '..'), file) });
    }
  }
  return blocks;
}

// Panes that stand for something infra/ creates: the resource type (and, for
// Azure AI services, which kind of account) whose presence means "live".
const BUILT_IN_INFRA = {
  functions: { types: ['Microsoft.Web/sites'] },
  identity: { types: ['Microsoft.ManagedIdentity/userAssignedIdentities'] },
  blob: { types: ['Microsoft.Storage/storageAccounts'] },
  sql: { types: ['Microsoft.Sql/servers'] },
  cosmos: { types: ['Microsoft.DocumentDB/databaseAccounts'] },
  search: { types: ['Microsoft.Search/searchServices'] },
  aispeech: { types: ['Microsoft.CognitiveServices/accounts'], kind: 'SpeechServices' },
  safety: { types: ['Microsoft.CognitiveServices/accounts'], kind: 'ContentSafety' },
  signalr: { types: ['Microsoft.SignalRService/signalR', 'Microsoft.SignalRService/webPubSub'] },
  appi: { types: ['Microsoft.Insights/components'] },
  logs: { types: ['Microsoft.OperationalInsights/workspaces'] },
  budget: { types: ['Microsoft.Consumption/budgets'] },
};

// Azure-backed, but switched on somewhere other than infra/.
const BUILT_ELSEWHERE = {
  // Phase 3's admin sign-in is the site's own login, set in its config.
  entra: { where: 'staticwebapp.config.json (auth.identityProviders.azureActiveDirectory)', built: () => Boolean(swaConfig.auth?.identityProviders?.azureActiveDirectory) },
};

// Not checked, and why.
const NOT_CHECKED = {
  threejs: 'a library that runs in the browser',
  canvas: 'part of the browser',
  webaudio: 'part of the browser',
  speech: "the device's own voices",
  cloudflare: "set up in Cloudflare's dashboard, not Azure",
  headers: 'staticwebapp.config.json, guarded by security-and-telemetry.spec.js',
  swa: 'created once by hand in Azure; the site deploys through its own workflow, not infra/',
  github: 'not Azure',
  actions: 'not Azure',
  bicep: 'the language infra/ is written in',
  playwright: 'these tests',
  devops: 'Azure DevOps boards: planning, not something the site runs on',
  claude: 'not Azure',
};

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Visible text under 14px. The unseen list is left out while the square stands.
async function smallText(page) {
  return page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter(e => e.getClientRects().length && getComputedStyle(e).opacity !== '0')
    .filter(e => !e.closest('.list') || document.documentElement.classList.contains('is-flat'))
    .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
    .filter(e => parseFloat(getComputedStyle(e).fontSize) < 14)
    .map(e => `${e.tagName}.${e.className}: ${getComputedStyle(e).fontSize}`));
}

const ready = page => expect(page.locator('.nave[data-ready]')).toBeAttached({ timeout: 20000 });
const tiers = glass.tiers.filter(t => glass.panes.some(p => p.tier === t.id));

test.describe('workshop data', () => {
  test('every pane is well formed and every link points at a real pane', () => {
    const ids = new Set(glass.panes.map(p => p.id));
    const tierIds = new Set(glass.tiers.map(t => t.id));
    expect(ids.size).toBe(glass.panes.length); // no duplicate ids
    for (const p of glass.panes) {
      expect(tierIds.has(p.tier), `${p.id}: unknown tier ${p.tier}`).toBe(true);
      expect(['live', 'planned']).toContain(p.status);
      if (p.status === 'planned') expect(p.phase, `${p.id}: planned without a phase`).toBeGreaterThan(0);
      expect(p.what && p.here, `${p.id}: needs what and here`).toBeTruthy();
      for (const t of p.touches || []) expect(ids.has(t), `${p.id} touches unknown ${t}`).toBe(true);
    }
  });

  test('every pane is either checked against what is built, or says why not', () => {
    const classified = { ...BUILT_IN_INFRA, ...BUILT_ELSEWHERE, ...NOT_CHECKED };
    const ids = glass.panes.map(p => p.id);
    expect(ids.filter(id => !(id in classified)), 'new pane: add it to BUILT_IN_INFRA, BUILT_ELSEWHERE or NOT_CHECKED').toEqual([]);
    expect(Object.keys(classified).filter(id => !ids.includes(id)), 'listed here but not in glass.json').toEqual([]);
    for (const list of [BUILT_IN_INFRA, BUILT_ELSEWHERE, NOT_CHECKED]) {
      for (const id of Object.keys(list)) {
        expect([BUILT_IN_INFRA, BUILT_ELSEWHERE, NOT_CHECKED].filter(l => id in l).length, `${id} is in more than one list`).toBe(1);
      }
    }
  });

  test('an Azure pane says "live" exactly when what it stands for is built', () => {
    const declared = declaredResources();
    expect(declared.length, 'no resources found in infra/: has the folder moved?').toBeGreaterThan(10);
    const wrong = [];
    for (const p of glass.panes) {
      let built, what;
      if (BUILT_IN_INFRA[p.id]) {
        const { types, kind } = BUILT_IN_INFRA[p.id];
        const found = declared.filter(r => types.includes(r.type) && (!kind || r.kind === kind));
        built = found.length > 0;
        what = `${types.join(' or ')}${kind ? ` (kind ${kind})` : ''}: ${built ? `declared in ${[...new Set(found.map(r => r.file))].join(', ')}` : 'not declared in infra/'}`;
      } else if (BUILT_ELSEWHERE[p.id]) {
        built = BUILT_ELSEWHERE[p.id].built();
        what = `${BUILT_ELSEWHERE[p.id].where}: ${built ? 'set' : 'not set'}`;
      } else continue;
      const want = built ? 'live' : 'planned';
      if (p.status !== want) wrong.push(`${p.id} says "${p.status}" but ${what}. Set "status": "${want}" in workshop/glass.json and rewrite its "here" text`);
    }
    expect(wrong).toEqual([]);
  });

  test('every tier has a story for its card', () => {
    for (const t of glass.tiers) expect(t.story, `${t.id}: needs a story`).toBeTruthy();
  });

  test('every tier has its colour in the page', async ({ page }) => {
    await page.goto('/workshop.html');
    const missing = await page.evaluate(ids => ids.filter(id =>
      !getComputedStyle(document.documentElement).getPropertyValue('--' + id).trim()), glass.tiers.map(t => t.id));
    expect(missing, 'add --<tier> to :root in workshop.html').toEqual([]);
  });
});

test.describe('workshop square (3D)', () => {
  test('raises the square from the data, nothing on screen but it and its lights', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/workshop.html');
    await ready(page);
    const box = await page.locator('.nave canvas').boundingBox();
    expect([box.width, box.height]).toEqual([390, 780]);
    await expect(page.locator('.rail button')).toHaveCount(tiers.length);
    // No card until something is chosen; no dock, no window, no help sheet.
    await expect(page.locator('.panel')).toBeHidden();
    await expect(page.locator('.dock, .window, dialog')).toHaveCount(0);
    // The plain list is in the page for keyboards, out of sight.
    await expect(page.locator('.list button[data-id]')).toHaveCount(glass.panes.length);
    expect(await page.locator('.list').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('tapping a column explains it and keeps it above the card', async ({ page }) => {
    await page.goto('/workshop.html');
    await ready(page);
    await expect(page.locator('.nave[data-intro="done"]')).toBeAttached({ timeout: 20000 });
    // Tap whichever live column is in plain view.
    const t = await page.evaluate(ids => {
      for (const id of ids) { const s = window.__nave.screenOf(id); if (window.__nave.pickAt(s.x, s.y, false) === id) return { id, ...s }; }
    }, glass.panes.filter(p => p.status === 'live').map(p => p.id));
    expect(t, 'some live column should be in plain view').toBeTruthy();
    await page.touchscreen.tap(t.x, t.y);
    const p = glass.panes.find(x => x.id === t.id);
    await expect(page.locator('.panel h2')).toHaveText(p.name);
    await expect(page.locator('.tag.is-sel')).toContainText(p.name);
    expect(page.url()).toContain('#' + p.id);
    // The camera glides until the chosen column stands in the open part of the screen.
    await expect.poll(async () => page.evaluate(id => {
      const s = window.__nave.screenOf(id);
      return s.y > 0 && s.y < document.querySelector('.panel').getBoundingClientRect().top - 20;
    }, p.id), { timeout: 15000 }).toBe(true);
    expect(await smallText(page)).toEqual([]);
  });

  test('a keyboard walks the columns, and focus follows the card', async ({ page }) => {
    await page.goto('/workshop.html');
    await ready(page);
    await page.locator('.list button[data-id="identity"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.panel h2')).toHaveText('Managed identity');
    await page.locator('.touches button', { hasText: 'Blob Storage' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.panel h2')).toHaveText('Blob Storage');
    // The card was rebuilt; focus moved to the new column rather than being lost.
    await expect(page.locator('.list button[data-id="blob"]')).toBeFocused();
    await page.locator('.touches button').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.panel')).toBeHidden();
    await expect(page.locator('.list button[data-id="blob"]')).toBeFocused();
  });

  test('opens with a shot down from the cross, which a touch can skip', async ({ page }) => {
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-intro="playing"]')).toBeAttached({ timeout: 20000 });
    await page.locator('.nave canvas').click({ position: { x: 200, y: 300 } });
    // Skipped, not merely finished: it ends at once rather than after its ~4.6s.
    await expect(page.locator('.nave[data-intro="done"]')).toBeAttached({ timeout: 1200 });
  });

  test('a tier light tells its tier, and a column leads back to its tier', async ({ page }) => {
    await page.goto('/workshop.html');
    await ready(page);
    const i = glass.tiers.findIndex(t => t.id === 'house');
    const t = glass.tiers[i];
    await page.locator('.rail button[data-tier="house"]').click();
    await expect(page.locator('.panel h2')).toHaveText(t.name);
    await expect(page.locator('.panel .eyebrow')).toContainText(`Tier ${i + 1} of ${glass.tiers.length}`);
    await expect(page.locator('.panel p')).toHaveText(t.story);
    await expect(page.locator('.panel .touches button')).toHaveText(glass.panes.filter(p => p.tier === 'house').map(p => p.name));
    await expect(page.locator('.rail button[data-tier="house"]')).toHaveAttribute('aria-current', 'true');
    await page.locator('.panel .touches button', { hasText: 'Functions' }).click();
    await expect(page.locator('.panel h2')).toHaveText('Functions');
    await page.locator('.panel button.eyebrow').click();
    await expect(page.locator('.panel h2')).toHaveText(t.name);
    // The same light again puts it all back.
    await page.locator('.rail button[data-tier="house"]').click();
    await expect(page.locator('.panel')).toBeHidden();
  });

  // Once a card is open, reading it is the point: no card ever scrolls.
  for (const [w, h] of [[390, 844], [375, 667]]) {
    test(`every card, tier and column, fits a ${w}x${h} phone without scrolling`, async ({ page }) => {
      // The card's layout owes nothing to the 3D square; checking all of them
      // without drawing it keeps this quick, and spares a slow runner.
      await page.route('**/three.module.min.js', r => r.abort());
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/workshop.html');
      await expect(page.locator('html')).toHaveClass(/is-flat/, { timeout: 15000 });
      const over = () => page.locator('.panel').evaluate(e => e.scrollHeight - e.clientHeight);
      for (const t of tiers) {
        await page.locator(`.list .tier-open[data-tier="${t.id}"]`).click();
        await expect(page.locator('.panel h2')).toHaveText(t.name);
        expect(await over(), `${t.id} card scrolls`).toBeLessThanOrEqual(1);
      }
      for (const p of glass.panes) {
        await page.evaluate(id => { location.hash = '#' + id; }, p.id);
        await expect(page.locator('.panel h2')).toHaveText(p.name);
        expect(await over(), `${p.id} card scrolls`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('draws one frame per tick, never two loops at once', async ({ page }) => {
    await page.addInitScript(() => {
      // Count every frame asked for, against the browser's own ticks.
      const ask = window.requestAnimationFrame.bind(window);
      let asked = 0, ticks = 0;
      window.requestAnimationFrame = cb => { asked++; return ask(cb); };
      const tick = () => { ticks++; ask(tick); };
      ask(tick);
      window.__frames = () => ({ asked, ticks });
    });
    await page.goto('/workshop.html');
    await ready(page);
    await page.locator('.nave canvas').click({ position: { x: 200, y: 300 } }); // skip the opening
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => window.__frames());
    await page.waitForTimeout(1500);
    const b = await page.evaluate(() => window.__frames());
    expect((b.asked - a.asked) / Math.max(1, b.ticks - a.ticks)).toBeLessThan(1.4);
  });

  for (const [w, h, name] of [[844, 390, 'a phone on its side']]) {
    test(`fills the screen and keeps the card clear of the lights on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/workshop.html#functions');
      await ready(page);
      const box = await page.locator('.nave canvas').boundingBox();
      expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, w, h]);
      await expect(page.locator('.panel h2')).toHaveText('Functions');
      const covered = await page.evaluate(() => {
        const card = document.querySelector('.panel').getBoundingClientRect();
        const hit = r => r.left < card.right && r.right > card.left && r.top < card.bottom && r.bottom > card.top;
        return [...document.querySelectorAll('.rail button')].filter(b => hit(b.getBoundingClientRect())).map(b => b.dataset.tier);
      });
      expect(covered).toEqual([]);
      expect(await smallText(page)).toEqual([]);
    });
  }

  test('with reduced motion asked for, the square stands still but works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/workshop.html');
    await ready(page);
    await expect(page.locator('.nave[data-intro="done"]')).toBeAttached();
    await page.locator('.rail button[data-tier="store"]').click();
    await expect(page.locator('.panel h2')).toHaveText(glass.tiers.find(t => t.id === 'store').name);
  });

  test('links open a column; the address can change, or be nonsense', async ({ page }) => {
    const errors = watchErrors(page);
    const p = glass.panes.find(x => x.status === 'planned') || glass.panes[0];
    await page.goto('/workshop.html#' + p.id);
    await expect(page.locator('.panel h2')).toHaveText(p.name);
    await expect(page.locator('.panel .chip')).toHaveText(p.status === 'live' ? 'In use today' : 'Coming in phase ' + p.phase);
    await page.evaluate(() => { location.hash = '#blob'; });
    await expect(page.locator('.panel h2')).toHaveText('Blob Storage');
    await page.goto('/workshop.html#%E0%A4%A');
    await ready(page);
    expect(errors).toEqual([]);
  });

  test('if three.js cannot load, the plain list is the page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.route('**/three.module.min.js', r => r.abort());
    await page.goto('/workshop.html');
    await expect(page.locator('html')).toHaveClass(/is-flat/, { timeout: 15000 });
    await expect(page.locator('.list button[data-id="functions"]')).toBeVisible();
    await page.locator('.list button[data-id="functions"]').click();
    await expect(page.locator('.panel h2')).toHaveText('Functions');
    expect(await smallText(page)).toEqual([]);
    expect(errors.filter(e => !/three\.module|ERR_FAILED|Failed to load/.test(e))).toEqual([]);
  });

  test('if the graphics context is lost, the plain list takes over', async ({ page }) => {
    await page.goto('/workshop.html');
    await ready(page);
    await page.evaluate(() => document.querySelector('.nave canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await expect(page.locator('html')).toHaveClass(/is-flat/);
    await expect(page.locator('.list button[data-id="functions"]')).toBeVisible();
  });
});

test('the home Workshop gate leads here', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('.portal--workshop').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/workshop.html');
  await expect(page.locator('h1')).toHaveText('Workshop');
});
