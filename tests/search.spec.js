// The search page (Phase 5). On the live site it asks /api/search; these
// tests serve the repo *as* the live site and stand in for the API, so
// nothing reaches Azure. Off the live site (and when the API can't answer)
// the page searches the site's own files, clearly labelled.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = 'https://machinachristi.com';
const API = 'https://api.machinachristi.com';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const P = ''; // never sent by the API; only here to prove they'd be shown as text

// Answers shaped like /api/search's.
const ANSWERS = {
  agnes: [{
    kind: 'saint', id: 'saint-saint-agnes-virgin-and-martyr', title: 'Saint Agnes, Virgin and Martyr', title_th: null,
    summary: 'Agnes was a Roman girl of about thirteen.', url: '/ordo.html?date=2027-01-21', date: '2027-01-21',
    snippet: { text: 'Agnes was a Roman girl of about thirteen.', marks: [[0, 5]], lang: 'en' },
  }],
  'พระบิดา': [{
    kind: 'prayer', id: 'prayer-our-father', title: 'The Our Father', title_th: 'บทข้าแต่พระบิดา',
    summary: 'the prayer Jesus taught us', url: '/prayer.html?p=our-father', date: null,
    snippet: { text: 'ข้าแต่พระบิดาของข้าพเจ้าทั้งหลาย', marks: [[6, 7]], lang: 'th' },
  }],
  evil: [{
    kind: 'page', id: 'page-x', title: '<img src=x onerror="window.__xss=1">', title_th: null, summary: null,
    url: 'javascript:window.__xss=2', date: null,
    snippet: { text: `<b onmouseover="window.__xss=3">bold</b>${P}`, marks: [[0, 9999], [-1, 3]], lang: 'en' },
  }],
};

async function liveSite(page, { api = 'ok', host = LIVE } = {}) {
  const asked = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(`${host}/**`, route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.route(`${API}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/search') return route.fulfill({ status: 404, body: '' });
    const q = url.searchParams.get('q');
    asked.push(q);
    if (api === 'down') return route.fulfill({ status: 503, body: '' });
    const results = ANSWERS[q] || [];
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': host },
      body: JSON.stringify({ q, step: results.length ? 'exact' : null, indexedAt: '2026-10-17T05:00:00.000Z', results }),
    });
  });
  await page.route(url => ![host, API].includes(url.origin) && /^https?:/.test(url.protocol), route => route.abort());
  return { asked, errors };
}

test.describe('search page', () => {
  test('typing asks once, after the pause, and shows the result with its words marked', async ({ page }) => {
    const { asked, errors } = await liveSite(page);
    await page.goto(`${LIVE}/search.html`);
    await page.locator('#q').pressSequentially('Agnes', { delay: 40 });
    const result = page.locator('.result').first();
    await expect(result).toBeVisible();
    expect(asked).toEqual(['agnes']); // one request, the tidied query
    await expect(result).toHaveAttribute('href', '/ordo.html?date=2027-01-21');
    await expect(result.locator('.kind')).toHaveText(/Saint · 21 January 2027/);
    await expect(result.locator('mark')).toHaveText('Agnes');
    await expect(page.locator('#status')).toHaveText('1 result');
    await expect(page.locator('#fallback')).toBeHidden();
    expect(new URL(page.url()).searchParams.get('q')).toBe('agnes');
    expect(await page.title()).toBe('Search · Machina Christi'); // never the words
    expect(errors).toEqual([]);
  });

  test('Thai: the query and the snippet stay Thai, and the snippet is marked as Thai', async ({ page }) => {
    const { asked } = await liveSite(page);
    await page.goto(`${LIVE}/search.html`);
    await page.locator('#q').fill('พระบิดา');
    const result = page.locator('.result').first();
    await expect(result).toHaveAttribute('href', '/prayer.html?p=our-father');
    expect(asked).toEqual(['พระบิดา']);
    await expect(result.locator('.title-th')).toHaveAttribute('lang', 'th');
    await expect(result.locator('.snippet')).toHaveAttribute('lang', 'th');
    await expect(result.locator('mark')).toHaveText('พระบิดา');
  });

  test('anything in an answer is shown as text: no HTML runs, no javascript: links, bad ranges ignored', async ({ page }) => {
    await liveSite(page);
    await page.goto(`${LIVE}/search.html?q=evil`);
    const result = page.locator('.result').first();
    await expect(result.locator('.title')).toHaveText('<img src=x onerror="window.__xss=1">');
    await expect(result).toHaveAttribute('href', '/');
    await expect(result.locator('.snippet')).toContainText('<b onmouseover=');
    await expect(page.locator('.results img, .results b')).toHaveCount(0);
    await result.hover();
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('a shared search (?q=) fills the box and searches at once; no search, no request', async ({ page }) => {
    const first = await liveSite(page);
    await page.goto(`${LIVE}/search.html`);
    await page.waitForTimeout(500);
    expect(first.asked).toEqual([]);
    await page.goto(`${LIVE}/search.html?q=Agnes`);
    await expect(page.locator('#q')).toHaveValue('Agnes');
    await expect(page.locator('.result')).toHaveCount(1);
  });

  test('nothing found says so', async ({ page }) => {
    await liveSite(page);
    await page.goto(`${LIVE}/search.html`);
    await page.locator('#q').fill('zzqx');
    await expect(page.locator('#status')).toHaveText(/Nothing found/);
    await expect(page.locator('.result')).toHaveCount(0);
  });

  test('when the API is down, the simple search answers from the site\'s files, and says so', async ({ page }) => {
    await liveSite(page, { api: 'down' });
    await page.goto(`${LIVE}/search.html`);
    await page.locator('#q').fill('ave maria');
    const result = page.locator('.result').first();
    await expect(result).toHaveAttribute('href', '/prayer.html?p=hail-mary'); // found by its other name (aka)
    await expect(page.locator('#fallback')).toBeVisible();
  });

  test('off the live site no API is asked; saints open the Ordo day of their feast', async ({ page }) => {
    const local = 'https://localhost.test';
    const { asked } = await liveSite(page, { host: local });
    await page.goto(`${local}/search.html`);
    await page.locator('#q').fill('agnes');
    const result = page.locator('.result').filter({ hasText: 'Saint Agnes' });
    await expect(result).toHaveAttribute('href', /^\/ordo\.html\?date=\d{4}-01-21$/);
    await expect(page.locator('#fallback')).toBeVisible();
    expect(asked).toEqual([]);
  });

  test('readable on a phone: box text 16px or more (no zoom on tap), result text 14px or more', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await liveSite(page);
    await page.goto(`${LIVE}/search.html?q=agnes`);
    await expect(page.locator('.result')).toHaveCount(1);
    const size = sel => page.locator(sel).first().evaluate(n => parseFloat(getComputedStyle(n).fontSize));
    expect(await size('#q')).toBeGreaterThanOrEqual(16);
    for (const sel of ['.kind', '.title', '.snippet', '#status']) expect(await size(sel)).toBeGreaterThanOrEqual(14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe('ways in', () => {
  test('the homepage has a search link that is not one of its gates', async ({ page }) => {
    await liveSite(page);
    await page.goto(`${LIVE}/`);
    const link = page.locator('a.search-link');
    await expect(link).toHaveAttribute('href', 'search.html');
    await expect(link).toHaveAttribute('aria-label', /search/i);
    const box = await link.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.portal.search-link, .portal a.search-link').count()).toBe(0);
  });

  for (const p of ['/ordo.html', '/pray.html', '/prayer.html?p=hail-mary']) {
    test(`${p} links to search`, async ({ page }) => {
      await liveSite(page, { api: 'down' });
      await page.goto(LIVE + p);
      await expect(page.locator('a.find')).toHaveAttribute('href', 'search.html');
    });
  }
});
