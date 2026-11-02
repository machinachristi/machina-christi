// The daily live-site check (AB#118). A robot visitor, phone-sized like the
// site's audience, walks every gate of https://machinachristi.com as it is
// right now and checks that each page opens cleanly and that the API behind
// it answers. The smoke tests check a change before it ships; this checks the
// live site afterwards, every day, whether or not anything changed: Azure,
// Cloudflare or a certificate can break it with no change of ours.
//
// The pages fall back to copies bundled with the site when the API doesn't
// answer, so a visitor still sees prayers and saints. That's kind to visitors
// but would hide an outage from a robot that only looked at the page, so it
// also watches the page's own requests to the API.
//
// It reads the expected pages, gates and prayers from this folder, so run it
// from a copy of main (what is deployed). And it stays out of the visitor
// numbers: it asks not to be tracked (Global Privacy Control, which
// assets/telemetry.js honours), and anything that would count it is answered
// here instead.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { gotoWorldReady } = require('../world-helpers');

const ROOT = path.join(__dirname, '..', '..');
const API = 'https://api.machinachristi.com';
const OWN = /^https:\/\/(www\.|api\.)?machinachristi\.com$/;
// A slow first answer while the API wakes is fine; no answer is not.
const API_WAIT = 45000;

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PRAYERS = JSON.parse(read('pray/prayers.json')).prayers;
const GATES = read('index.html').match(/class="portal portal--/g).length;
// Every page the sitemap offers search engines, and one prayer.
const PAGES = [...read('sitemap.xml').matchAll(/<loc>https:\/\/machinachristi\.com(\/[^<]*)<\/loc>/g)]
  .map(m => m[1])
  .concat('/prayer.html?p=our-father');

// Start a visit: no tracking, and a record of everything that goes wrong
// (script errors, console errors, blocked content, failed requests to the
// site or its API).
async function visit(page) {
  const seen = [];
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true });
    document.addEventListener('securitypolicyviolation', e => {
      console.error(`Content Security Policy blocked ${e.effectiveDirective}: ${e.blockedURI}`);
    });
  });
  // Cloudflare's own visitor counter loads as usual (it's sealed with an
  // integrity hash, so a stand-in would be refused); only its report is
  // answered here.
  const silent = route => route.fulfill({ status: 204, body: '' });
  await page.route(/\.in\.applicationinsights\.azure\.com\//, silent);
  await page.route(/\/cdn-cgi\/rum/, silent);

  page.on('pageerror', e => seen.push(`script error: ${e.message}`));
  // "Failed to load resource" repeats, without the address, what the two
  // request listeners below already record (minus refused prefetches).
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) seen.push(`console: ${m.text()}`);
  });
  page.on('response', r => {
    if (own(r.url()) && r.status() >= 400) seen.push(failed(r.request(), r.status()));
  });
  page.on('requestfailed', r => {
    if (own(r.url())) seen.push(failed(r, r.failure() && r.failure().errorText));
  });
  return { problems: async () => (await Promise.all(seen)).filter(Boolean) };
}

const own = url => OWN.test(new URL(url).origin);

async function failed(request, what) {
  // Cloudflare refuses prefetches (the browser fetching a page early, in
  // case it's opened next) with a 503, "prefetch refused: not eligible"; the
  // real visit asks again, so it isn't a fault.
  const headers = await request.allHeaders().catch(() => ({}));
  if (/prefetch/i.test(headers['sec-purpose'] || headers.purpose || '')) return null;
  return `${what}: ${request.url()}`;
}

// The page's own request to the API, as it went out.
const apiAnswer = (page, pathname) =>
  page.waitForResponse(r => new URL(r.url()).origin === API && new URL(r.url()).pathname === pathname, { timeout: API_WAIT });

test.describe('every page opens cleanly', () => {
  for (const p of PAGES) {
    test(p, async ({ page }) => {
      const v = await visit(page);
      const res = await page.goto(p);
      expect(res.status(), 'the page answered').toBe(200);
      expect(await page.title(), 'the page has a title').not.toBe('');
      // Late requests (today's season, fonts, the visitor counter) get two
      // seconds to report trouble.
      await page.waitForTimeout(2000);
      expect(await v.problems()).toEqual([]);
    });
  }
});

test.describe('each gate does its work', () => {
  test('home: every gate, and today in the Church year from the API', async ({ page }) => {
    const v = await visit(page);
    const season = apiAnswer(page, '/api/season');
    await page.goto('/');
    await expect(page.locator('.portal')).toHaveCount(GATES);
    expect((await season).status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('data-season', /\w/);
    expect(await v.problems()).toEqual([]);
  });

  test('Ordo: a saint\'s life, from the database', async ({ page }) => {
    const v = await visit(page);
    const season = apiAnswer(page, '/api/season');
    // St Agnes (21 January) always has a bio.
    await page.goto('/ordo.html?date=2027-01-21');
    const answer = await (await season).json();
    expect(answer.saint && answer.saint.from, 'the saint came from the database snapshot').toBe('database');
    await expect(page.locator('#saint blockquote')).toContainText('Agnes');
    expect(await v.problems()).toEqual([]);
  });

  test('Pray: every prayer, from the API', async ({ page }) => {
    const v = await visit(page);
    const list = apiAnswer(page, '/api/prayers');
    await page.goto('/pray.html');
    expect((await list).status()).toBe(200);
    await expect(page.locator('.card')).toHaveCount(PRAYERS.length);
    expect(await v.problems()).toEqual([]);
  });

  test('a prayer: its lines, from the API', async ({ page }) => {
    const v = await visit(page);
    const doc = apiAnswer(page, '/api/prayers/our-father');
    await page.goto('/prayer.html?p=our-father');
    const prayer = await (await doc).json();
    await expect(page.locator('.line')).toHaveCount(prayer.lines.length);
    expect(await v.problems()).toEqual([]);
  });

  test('Search: finds a saint by name', async ({ page }) => {
    const v = await visit(page);
    await page.goto('/search.html');
    const answer = apiAnswer(page, '/api/search');
    await page.locator('#q').pressSequentially('Agnes', { delay: 40 });
    expect((await answer).status()).toBe(200);
    await expect(page.locator('.result').first()).toContainText('Agnes');
    await expect(page.locator('#fallback'), 'search answered from the API, not the bundled copy').toBeHidden();
    expect(await v.problems()).toEqual([]);
  });

  test('Eden: the garden opens', async ({ page }) => {
    const v = await visit(page);
    await gotoWorldReady(page);
    expect(await v.problems()).toEqual([]);
  });

  test('Camino: the game draws', async ({ page }) => {
    const v = await visit(page);
    await page.goto('/game.html');
    await expect(page.locator('#gameCanvas')).toBeVisible();
    expect(await v.problems()).toEqual([]);
  });

  test('Logos: the letter cards', async ({ page }) => {
    const v = await visit(page);
    await page.goto('/logos.html');
    await expect(page.locator('#sec-middle')).toBeAttached();
    expect(await v.problems()).toEqual([]);
  });

  test('Workshop: the city of light is built', async ({ page }) => {
    const v = await visit(page);
    await page.goto('/workshop.html');
    await expect(page.locator('.nave[data-ready]')).toBeAttached({ timeout: 20000 });
    expect(await v.problems()).toEqual([]);
  });
});

// Straight to the API, as the pages ask it (through Cloudflare).
test.describe('the API answers', () => {
  test('health', async ({ request }) => {
    const r = await request.get(`${API}/api/health`, { timeout: API_WAIT });
    expect(r.status()).toBe(200);
    expect((await r.json()).status).toBe('ok');
  });

  test('a prayer found by its Thai words', async ({ request }) => {
    const r = await request.get(`${API}/api/search`, { params: { q: 'พระบิดา' }, timeout: API_WAIT });
    expect(r.status()).toBe(200);
    const prayers = (await r.json()).results.filter(x => x.kind === 'prayer');
    expect(prayers.length).toBeGreaterThan(0);
  });

  test('every prayer recording plays', async ({ request }) => {
    test.setTimeout(240000);
    const missing = [];
    for (const { id } of PRAYERS) {
      const doc = await request.get(`${API}/api/prayers/${id}`, { timeout: API_WAIT });
      if (!doc.ok()) { missing.push(`${id}: ${doc.status()}`); continue; }
      const { audio } = await doc.json();
      for (const lang of ['th', 'en']) {
        for (const speed of ['normal', 'slow']) {
          const file = audio && audio[lang] && audio[lang][speed] && audio[lang][speed].file;
          if (!file) { missing.push(`${id} ${lang} ${speed}: not published`); continue; }
          // The first kilobyte is enough to know it's there, the way a
          // player starts.
          const r = await request.get(`${API}/api/audio/${file}`, { headers: { Range: 'bytes=0-1023' }, timeout: API_WAIT });
          if (r.status() !== 206 || !/^audio\/mpeg/.test(r.headers()['content-type'] || '')) {
            missing.push(`${file}: ${r.status()} ${r.headers()['content-type'] || ''}`);
          }
          // Spaced out to stay well under Cloudflare's 20 requests per 10 s.
          await new Promise(done => setTimeout(done, 600));
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

// The padlock: each address's certificate proves the site is really ours.
// Cloudflare renews them about a month ahead; two weeks left means it didn't.
test('certificates are valid for more than two weeks', async () => {
  for (const host of ['machinachristi.com', 'api.machinachristi.com']) {
    const cert = await new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port: 443, servername: host, timeout: 20000 }, () => {
        resolve(socket.getPeerCertificate());
        socket.end();
      });
      socket.on('timeout', () => socket.destroy(new Error(`${host}: no answer`)));
      socket.on('error', reject);
    });
    const days = (new Date(cert.valid_to) - Date.now()) / 86400000;
    expect(days, `${host} certificate runs out ${cert.valid_to}`).toBeGreaterThan(14);
  }
});
