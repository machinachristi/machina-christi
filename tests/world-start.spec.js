// How Eden starts (AB#169): the first seconds between "take me in" and the
// garden coming alive. Three promises, none of which needs the garden itself
// to run (so these sit with the site's quick checks, not beside the two
// heavy garden suites):
//
//   1. The shopping list. world-app/index.html names every module the garden
//      needs with a <link rel="modulepreload"> line, so the browser fetches
//      them all at once instead of finding them one import at a time. A
//      module left off still works; it is just found late, a round trip or
//      two after the others, and nothing on screen says so. In November 2026
//      eight had slipped off. These checks read the files: every module
//      main.js reaches through static `import` lines is listed, and every
//      listed line is a module the garden really uses. A dynamic
//      `import('…')` is fetched on purpose later, so it may be absent.
//
//   2. No double asking. world.html's warm-up quietly fetches the garden's
//      heaviest files while a visitor reads the intro. Once the garden is
//      already on its way (arriving at #enter, or a quick tap on "enter the
//      garden"), the warm-up stays out of it.
//
//   3. Company while waiting. While the garden downloads, the tree, EDEN and
//      Genesis 2:8 stay on screen with "entering…" beneath; only the intro's
//      words and button step aside, and "return home" never does.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// ── 1. Every module preloaded ────────────────────────────────────────────────

const APP = path.join(__dirname, '..', 'world-app');
const INDEX = path.join(APP, 'index.html');

const rel = file => path.relative(APP, file).split(path.sep).join('/');

function readIndex() {
  const html = fs.readFileSync(INDEX, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  const imports = map ? JSON.parse(map[1]).imports || {} : {};
  const entry = html.match(/<script type="module" src="([^"]+)"/);
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map(m => m[1]);
  return { imports, entry: entry && entry[1], preloads };
}

// The specifiers of a module's static imports. An import starts a line or
// follows a `;`/`}` (the minified three.js files are one long line); a
// commented-out import starts with `//` or `*`, so it never matches. `(` is
// not allowed between `import` and the name, which leaves `import('…')` out.
function staticImports(source) {
  const re = /(?:^|[;}])\s*(?:import|export)\s*(?:[^'"`;()]*?\bfrom\s*)?(['"])([^'"]+)\1/gm;
  return [...source.matchAll(re)].map(m => m[2]);
}

// A bare name like 'three' is looked up in the import map, either exactly or
// by a prefix ending in '/' (how vendored addons are mapped, e.g.
// "three/addons/": "./vendor/addons/"; the longest prefix wins, as in browsers).
function resolve(spec, fromFile, imports) {
  if (spec.startsWith('./') || spec.startsWith('../')) return path.resolve(path.dirname(fromFile), spec);
  if (imports[spec]) return path.resolve(APP, imports[spec]);
  const prefix = Object.keys(imports)
    .filter(k => k.endsWith('/') && spec.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return path.resolve(APP, imports[prefix] + spec.slice(prefix.length));
  throw new Error(`${rel(fromFile)} imports "${spec}", which is neither a relative path nor in the import map`);
}

// Every module reachable from the entry, as paths relative to world-app/.
function moduleGraph() {
  const { imports, entry } = readIndex();
  const seen = new Set();
  const stack = [path.resolve(APP, entry)];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    expect(fs.existsSync(file), `${rel(file)} is imported but does not exist`).toBe(true);
    for (const spec of staticImports(fs.readFileSync(file, 'utf8'))) stack.push(resolve(spec, file, imports));
  }
  return new Set([...seen].map(rel));
}

test.describe('the garden names every module up front', () => {
  test('the walk sees the imports it should', () => {
    // A guard on the guard: if the pattern above stopped matching, the graph
    // would shrink to main.js alone and the checks below would pass quietly.
    const graph = moduleGraph();
    expect(graph.has('main.js')).toBe(true);
    expect(graph.has('vendor/three.module.min.js')).toBe(true); // via the import map
    expect(graph.has('vendor/three.core.min.js')).toBe(true);   // inside minified three.js
    expect(graph.has('scenes/waymarker.js')).toBe(true);        // two steps away: main → stations → waymarker
    expect(graph.size).toBeGreaterThan(100);
    expect(staticImports("const later = import('./later.js');")).toEqual([]);
    expect(staticImports("// import { old } from './old.js';")).toEqual([]);
    expect(staticImports("import {\n  a,\n  b,\n} from './multi.js';")).toEqual(['./multi.js']);
  });

  test('every module the garden imports is preloaded in world-app/index.html', () => {
    const graph = moduleGraph();
    const listed = new Set(readIndex().preloads);
    const missing = [...graph].filter(m => !listed.has(m)).sort();
    expect(
      missing,
      'Add these lines to world-app/index.html, beside the other modulepreload lines:\n' +
        missing.map(m => `  <link rel="modulepreload" href="${m}" />`).join('\n'),
    ).toEqual([]);
  });

  test('every preload line names a module the garden really imports, once', () => {
    const graph = moduleGraph();
    const { preloads } = readIndex();
    const stray = preloads.filter(p => !graph.has(p));
    expect(stray, 'These preload lines point at files main.js never imports (removed, renamed or misspelt?)').toEqual([]);
    const twice = preloads.filter((p, i) => preloads.indexOf(p) !== i);
    expect(twice, 'These modules are listed more than once').toEqual([]);
  });
});

// ── 2 & 3. world.html while the garden is on its way ─────────────────────────

// The garden's own page is asked for but never answered, so world.html stays
// in its "entering…" state for these checks (its own 25 s clock is far off),
// and no garden runs to slow the other tests down. The page's load event
// waits on that frame, so pages are opened at DOMContentLoaded.
async function holdTheGarden(page) {
  await page.route('**/world-app/**', () => {});
}

// The warm-up waits for an idle moment; here that moment is caught instead,
// so each check decides when (or whether) it comes, without any timing.
async function catchTheIdleMoment(page) {
  await page.addInitScript(() => {
    window.__idle = [];
    window.requestIdleCallback = cb => { window.__idle.push(cb); return window.__idle.length; };
  });
}
const idleComes = page => page.evaluate(() => window.__idle.splice(0).forEach(cb => cb({ didTimeout: true, timeRemaining: () => 0 })));
const prefetches = page => page.$$eval('link[rel="prefetch"]', ls => ls.map(l => l.getAttribute('href')));

test.describe('the warm-up only runs while the intro is being read', () => {
  test.beforeEach(async ({ page }) => {
    await holdTheGarden(page);
    await catchTheIdleMoment(page);
  });

  test('reading the intro: the heavy files are fetched ahead', async ({ page }) => {
    await page.goto('/world.html', { waitUntil: 'domcontentloaded' });
    expect(await page.getAttribute('body', 'data-world-state')).toBe('intro');
    await idleComes(page);
    expect(await prefetches(page)).toEqual([
      'world-app/index.html',
      'world-app/vendor/three.module.min.js',
      'world-app/vendor/three.core.min.js',
      'world-app/main.js',
    ]);
  });

  test('arriving at #enter: no head start, the garden is already loading', async ({ page }) => {
    await page.goto('/world.html#enter', { waitUntil: 'domcontentloaded' });
    expect(await page.getAttribute('body', 'data-world-state')).toBe('loading');
    expect(await page.evaluate(() => window.__idle.length)).toBe(0); // never even scheduled
    await idleComes(page);
    expect(await prefetches(page)).toEqual([]);
  });

  test('a quick tap on "enter the garden" before the idle moment: no head start either', async ({ page }) => {
    await page.goto('/world.html', { waitUntil: 'domcontentloaded' });
    await page.click('.intro__enter');
    expect(await page.getAttribute('body', 'data-world-state')).toBe('loading');
    await idleComes(page);
    expect(await prefetches(page)).toEqual([]);
  });
});

async function expectTheTitleCard(page) {
  expect(await page.getAttribute('body', 'data-world-state')).toBe('loading');
  for (const sel of ['.veil .glyph', '.veil h1', '.veil .verse', '.veil .status', '.home']) {
    await expect(page.locator(sel), `${sel} stays on screen while entering`).toBeVisible();
  }
  // Visible to Playwright includes "faded to nothing", so the card's own
  // opacity is checked too: that fade is exactly what used to happen here.
  for (const sel of ['.veil .glyph', '.veil h1', '.veil .verse']) {
    await expect(page.locator(sel), `${sel} is not faded out`).toHaveCSS('opacity', '1');
  }
  await expect(page.locator('.veil h1')).toHaveText('EDEN');
  await expect(page.locator('.veil .verse')).toContainText('GENESIS 2 : 8');
  await expect(page.locator('.veil .status')).toHaveText('entering…');
  await expect(page.locator('.intro__enter')).toBeHidden();
  await expect(page.locator('.intro')).toBeHidden();
  // Kind to the eyes: every word on the card at least 14px.
  const sizes = await page.$$eval('.veil h1, .veil .verse, .veil .verse small, .veil .status, .home',
    els => els.map(el => [el.className || el.tagName, parseFloat(getComputedStyle(el).fontSize)]));
  for (const [name, px] of sizes) expect(px, `${name} text size`).toBeGreaterThanOrEqual(14);
  // And the page never lets a pinch zoom it (the owner's rule for Eden).
  expect(await page.getAttribute('meta[name="viewport"]', 'content')).toContain('user-scalable=no');
}

test.describe('the title card stays while the garden downloads', () => {
  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 800 }]) {
    test.describe(`at ${size.width}×${size.height}`, () => {
      test.use({ viewport: size });

      test('arriving from the Eden gate (#enter)', async ({ page }) => {
        await holdTheGarden(page);
        await page.goto('/world.html#enter', { waitUntil: 'domcontentloaded' });
        await expectTheTitleCard(page);
      });

      test('after tapping "enter the garden"', async ({ page }) => {
        await holdTheGarden(page);
        await page.goto('/world.html', { waitUntil: 'domcontentloaded' });
        await page.click('.intro__enter');
        await expectTheTitleCard(page);
      });
    });
  }

  test.describe('for a visitor who asked for less motion', () => {
    test('the card holds still: "entering…" does not breathe, nothing fades', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await holdTheGarden(page);
      await page.goto('/world.html#enter', { waitUntil: 'domcontentloaded' });
      await expectTheTitleCard(page);
      await expect(page.locator('.veil .status')).toHaveCSS('animation-name', 'none');
      await expect(page.locator('.veil .status')).toHaveCSS('opacity', '1');
    });
  });
});
