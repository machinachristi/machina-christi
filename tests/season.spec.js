// The season accent (assets/season.js): a glow in the day's liturgical colour
// and the season's name on the homepage and Ordo.
//
// season.js only runs on the live site (the API answers only
// machinachristi.com), so these tests serve the repo *as* the live site and
// stand in for the API: nothing reaches the real one.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = 'https://machinachristi.com';
const API = 'https://api.machinachristi.com';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const DAYS = {
  '2026-10-13': { date: '2026-10-13', season: { key: 'ordinary', name: 'Ordinary Time', week: 28 }, celebration: null, color: 'green' },
  '2026-11-30': {
    date: '2026-11-30', season: { key: 'advent', name: 'Advent', week: 1 },
    celebration: { name: 'Saint Andrew, Apostle', rank: 'FEAST', optional: false, color: 'red' }, color: 'red',
  },
  '2026-12-24': { date: '2026-12-24', season: { key: 'advent', name: 'Advent', week: 4 }, celebration: null, color: 'violet' },
};

// Serve the repo as the live site and answer the season API from DAYS (or
// with `status` to simulate an outage). Returns the dates the page asked for.
async function liveSite(page, { today = '2026-10-13', status = 200 } = {}) {
  const asked = [];
  const errors = [];
  page.on('console', m => {
    // A failed fetch is reported by the browser itself; the page must not add its own.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(`${today}T10:00:00`));

  await page.route(`${LIVE}/**`, route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, body: 'not found' });
    }
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.route(`${API}/**`, route => {
    const date = new URL(route.request().url()).searchParams.get('date');
    asked.push(date);
    if (status !== 200 || !DAYS[date]) return route.fulfill({ status: status === 200 ? 404 : status, body: '' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': LIVE },
      body: JSON.stringify(DAYS[date]),
    });
  });
  // Anything else off-site never leaves the test machine.
  await page.route(url => ![LIVE, API].includes(url.origin) && /^https?:/.test(url.protocol), route => route.abort());
  return { asked, errors };
}

const line = page => page.locator('.hero [data-season-line]');
const seasonRgb = page => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--season').trim());

test('the homepage shows today\'s season in its colour, in readable type', async ({ page }) => {
  const { asked, errors } = await liveSite(page);
  await page.goto(`${LIVE}/`);
  await expect(line(page)).toBeVisible();
  await expect(line(page)).toHaveText('Ordinary Time · Week 28');
  await expect(page.locator('html')).toHaveAttribute('data-season-color', 'green');
  expect(await seasonRgb(page)).toBe('120, 178, 116');
  await expect(page.locator('.mc-season-glow')).toHaveCSS('opacity', '1');
  const size = await line(page).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(14);
  expect(asked).toEqual(['2026-10-13']);
  expect(errors).toEqual([]);
});

test('a feast that replaces the day is named and sets the colour', async ({ page }) => {
  await liveSite(page, { today: '2026-11-30' });
  await page.goto(`${LIVE}/`);
  await expect(line(page)).toContainText('Advent · Week 1');
  await expect(line(page).locator('.mc-season-feast')).toHaveText('Saint Andrew, Apostle');
  await expect(page.locator('html')).toHaveAttribute('data-season-color', 'red');
});

test('a second page the same day uses the remembered answer', async ({ page }) => {
  const { asked } = await liveSite(page);
  await page.goto(`${LIVE}/`);
  await expect(line(page)).toBeVisible();
  await page.goto(`${LIVE}/pray.html`);
  await expect(page.locator('html')).toHaveAttribute('data-season', 'ordinary');
  expect(asked).toEqual(['2026-10-13']);
});

test('Ordo\'s accent follows the day on screen', async ({ page }) => {
  const { asked, errors } = await liveSite(page);
  await page.goto(`${LIVE}/ordo.html?date=2026-12-24`);
  const rule = () => page.locator('h1').evaluate(el => getComputedStyle(el, '::after').backgroundImage);
  await expect(page.locator('html')).toHaveAttribute('data-season-color', 'violet');
  await expect.poll(rule).toContain('rgba(156, 118, 206');
  await page.locator('#today-link').click();
  await expect(page.locator('html')).toHaveAttribute('data-season-color', 'green');
  await expect.poll(rule).toContain('rgba(120, 178, 116');
  expect(asked).toEqual(['2026-12-24', '2026-10-13']);
  expect(errors).toEqual([]);
});

test('if the API is down, the page looks exactly as before', async ({ page }) => {
  const { asked, errors } = await liveSite(page, { status: 503 });
  await page.goto(`${LIVE}/`);
  await expect.poll(() => asked.length).toBe(1);
  await page.waitForTimeout(300);
  await expect(line(page)).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-season', /.*/);
  await expect(page.locator('.mc-season-glow')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('off the live site, the API is never called', async ({ page }) => {
  const calls = [];
  page.on('request', r => { if (r.url().startsWith(API)) calls.push(r.url()); });
  await page.goto('/index.html');
  await page.waitForLoadState('load');
  await page.waitForTimeout(300);
  expect(calls).toEqual([]);
  await expect(line(page)).toBeHidden();
});
