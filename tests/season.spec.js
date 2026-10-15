// The season accent (assets/season.js): a glow in the day's liturgical colour
// and the season's name on the homepage and Ordo; the saint of the day as a
// link to Ordo; Ordo's saint bios from the API, with the bundled file as the
// fallback.
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
  '2026-01-21': {
    date: '2026-01-21', season: { key: 'ordinary', name: 'Ordinary Time', week: 2 },
    celebration: { name: 'Saint Agnes, Virgin and Martyr', rank: 'MEMORIAL', optional: false, color: 'red' }, color: 'red',
    saint: {
      feast: 'Saint Agnes, Virgin and Martyr',
      bio: 'From the database: a Roman girl of about thirteen.',
      bioSource: { title: "Summary based on Butler's Lives of the Saints (1894), via catholicsaints.info", url: 'https://catholicsaints.info/agnes/', license: 'Public domain (1894)' },
      people: [{
        name: 'Agnes of Rome', slug: 'agnes-of-rome', wikidata: 'Q229574',
        died: { year: 304, precision: 'year', century: 4 },
        patronages: ['girls', 'virgins'],
        factsSource: { title: 'Wikidata: Agnes of Rome', url: 'https://www.wikidata.org/wiki/Q229574', license: 'CC0' },
      }],
      from: 'database', publishedAt: '2026-10-14T10:30:00.000Z',
    },
  },
  // An optional memorial: the weekday stands, but the saint is still linked.
  '2026-10-14': {
    date: '2026-10-14', season: { key: 'ordinary', name: 'Ordinary Time', week: 28 },
    celebration: { name: 'Saint Callistus I, Pope and Martyr', rank: 'OPTIONAL MEMORIAL', optional: true, color: 'red' }, color: 'green',
    saint: { feast: 'Saint Callistus I, Pope and Martyr', bio: 'A pope.', bioSource: null, people: [], from: 'static', publishedAt: null },
  },
};

// Serve the repo as the live site and answer the season API from DAYS (or
// with `status` to simulate an outage). Returns the dates the page asked for.
async function liveSite(page, { today = '2026-10-13', status = 200 } = {}) {
  const asked = [];
  const files = [];
  const errors = [];
  page.on('console', m => {
    // A failed fetch is reported by the browser itself; the page must not add its own.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(`${today}T10:00:00`));

  await page.route(`${LIVE}/**`, route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname);
    files.push(rel);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, body: 'not found' });
    }
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.route(`${API}/**`, route => {
    const url = new URL(route.request().url());
    // Only the season API is stood in for here (Pray's prayers have their own
    // tests, tests/pray-audio.spec.js): anything else is "not found", and the
    // page falls back as it would.
    if (url.pathname !== '/api/season') return route.fulfill({ status: 404, body: '' });
    const date = url.searchParams.get('date');
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
  return { asked, errors, files };
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

const saintLink = page => page.locator('.hero [data-season-line] .mc-season-feast a');

test('the saint of the day links to Ordo, and the homepage still fits a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const { errors } = await liveSite(page, { today: '2026-01-21' });
  await page.goto(`${LIVE}/`);
  await expect(saintLink(page)).toHaveText('Saint Agnes ›');
  await expect(saintLink(page)).toHaveAttribute('href', '/ordo.html');
  await expect(saintLink(page)).toHaveAttribute('aria-label', /Saint Agnes, Virgin and Martyr/);
  const size = await saintLink(page).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(14);
  const box = await saintLink(page).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(32); // big enough to tap

  // No scrolling: the page is one screen, and the centred gate sits inside it.
  await page.waitForTimeout(1300); // the line fades in; the gallery settles
  const fit = await page.evaluate(() => ({
    scroll: document.scrollingElement.scrollHeight, height: innerHeight,
    gate: document.querySelector('.portal').getBoundingClientRect().bottom,
  }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.height);
  expect(fit.gate).toBeLessThanOrEqual(fit.height);
  expect(errors).toEqual([]);

  await saintLink(page).click();
  await expect(page).toHaveURL(`${LIVE}/ordo.html`);
  await expect(page.locator('.saint blockquote')).toContainText('From the database');
});

test('an optional memorial\'s saint is linked too', async ({ page }) => {
  await liveSite(page, { today: '2026-10-14' });
  await page.goto(`${LIVE}/`);
  await expect(line(page)).toContainText('Ordinary Time · Week 28');
  await expect(saintLink(page)).toHaveText('Saint Callistus I ›');
  await expect(page.locator('html')).toHaveAttribute('data-season-color', 'green');
});

test('Ordo shows the saint from the API, with sourced facts, without the bundled file', async ({ page }) => {
  const { files, errors } = await liveSite(page);
  await page.goto(`${LIVE}/ordo.html?date=2026-01-21`);
  await expect(page.locator('.saint blockquote')).toHaveText('From the database: a Roman girl of about thirteen.');
  await expect(page.locator('.saint .attribution a')).toHaveText('Butler’s Lives of the Saints (1894)');
  await expect(page.locator('.saint .attribution a')).toHaveAttribute('href', 'https://catholicsaints.info/agnes/');
  await expect(page.locator('.saint .facts')).toContainText('Died in 304 · patron of girls, virgins');
  await expect(page.locator('.saint .facts a')).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q229574');
  expect(files).not.toContain('/ordo/saints.json');
  expect(errors).toEqual([]);
});

test('if the API is down, Ordo uses the bundled bios', async ({ page }) => {
  const { files, errors } = await liveSite(page, { status: 503 });
  await page.goto(`${LIVE}/ordo.html?date=2026-01-21`);
  await expect(page.locator('.saint blockquote')).toContainText('Agnes was a Roman girl');
  await expect(page.locator('.saint .facts')).toHaveCount(0);
  expect(files).toContain('/ordo/saints.json');
  expect(errors).toEqual([]);
});

test('answers remembered or cached before the saint was added are not reused', async ({ page }) => {
  const { asked } = await liveSite(page, { today: '2026-01-21' });
  const urls = [];
  page.on('request', r => { if (r.url().startsWith(API)) urls.push(r.url()); });
  // An answer remembered under the old name, without a saint.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mc_season_2026-01-21', JSON.stringify({ date: '2026-01-21', season: { key: 'ordinary', name: 'Ordinary Time', week: 2 }, celebration: null, color: 'green' }));
    } catch {}
  });
  await page.goto(`${LIVE}/`);
  await expect(saintLink(page)).toHaveText('Saint Agnes ›');
  expect(asked).toEqual(['2026-01-21']);
  expect(urls[0]).toContain('&v=2'); // a new question for every cache on the way
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mc_season_')));
  expect(keys).toEqual(['mc_season_v2_2026-01-21']);
});
