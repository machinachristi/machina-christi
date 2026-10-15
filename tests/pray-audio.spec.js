// Pray's recorded voices: on the live site the prayers come from the API
// (Cosmos DB), each with four recordings (Thai and English, normal and slow)
// and every line's start time. These tests serve the repo *as* the live site,
// stand in for the API, and swap the page's audio player for one whose clock
// the test moves by hand, so the highlight can be checked at exact moments.
// Nothing reaches the real API. Without the API, the pages fall back to the
// bundled prayers.json and the device's voice (tests/pray.spec.js).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = 'https://machinachristi.com';
const API = 'https://api.machinachristi.com';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'pray', 'prayers.json'), 'utf8'));

// A published document, as /api/prayers/{id} returns it: line i starts at 2i s.
function published(id) {
  const p = DATA.prayers.find(x => x.id === id);
  const starts = p.lines.map((_, i) => i * 2);
  const audio = {};
  for (const lang of ['th', 'en']) {
    audio[lang] = { voice: lang === 'th' ? 'th-TH-NiwatNeural' : 'en-US-AndrewNeural' };
    for (const speed of ['normal', 'slow']) {
      audio[lang][speed] = { file: `${id}/${lang}-${speed}-0123456789.mp3`, hash: '0123456789', starts, duration: starts.length * 2 };
    }
  }
  return { ...p, type: 'prayer', order: DATA.prayers.indexOf(p), audio };
}

async function liveSite(page, { api = true } = {}) {
  const asked = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(`${LIVE}/**`, route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.route(`${API}/**`, route => {
    const url = new URL(route.request().url());
    asked.push(url.pathname);
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': LIVE }, body: JSON.stringify(body) });
    if (!api) return route.fulfill({ status: 503, body: '' });
    if (url.pathname === '/api/prayers') return json(DATA.prayers.map(({ id, title, title_th, about }) => ({ id, title, title_th, about })));
    const m = /^\/api\/prayers\/([a-z0-9-]+)$/.exec(url.pathname);
    if (m && DATA.prayers.some(p => p.id === m[1])) return json(published(m[1]));
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route(url => ![LIVE, API].includes(url.origin) && /^https?:/.test(url.protocol), route => route.abort());
  return { asked, errors };
}

// The page's <audio>, replaced by a stand-in: it never loads anything, and its
// clock only moves when the test says so (__at). Device speech is stubbed too,
// so a fallback to it can be seen.
function stubMedia(page) {
  return page.addInitScript(() => {
    const st = window.__media = { src: '', t: 0, paused: true, plays: [], pauses: 0, el: null };
    const P = HTMLMediaElement.prototype;
    Object.defineProperty(P, 'src', { get() { return st.src; }, set(v) { st.src = v; }, configurable: true });
    Object.defineProperty(P, 'currentTime', { get() { return st.t; }, set(v) { st.t = v; }, configurable: true });
    Object.defineProperty(P, 'paused', { get() { return st.paused; }, configurable: true });
    P.play = function () { st.el = this; st.paused = false; st.plays.push({ src: st.src, from: st.t }); return Promise.resolve(); };
    P.pause = function () { st.paused = true; st.pauses++; };
    window.__at = t => { st.t = t; st.el.dispatchEvent(new Event('timeupdate')); };
    window.__end = () => { st.paused = true; st.el.dispatchEvent(new Event('ended')); };
    window.__fail = () => st.el.dispatchEvent(new Event('error'));

    window.__spoken = [];
    const voices = [{ name: 'Kanya', lang: 'th-TH', localService: true, default: false }, { name: 'Samantha', lang: 'en-US', localService: true, default: true }];
    const synth = {
      speaking: false, pending: false, getVoices: () => voices, cancel() {}, addEventListener() {}, removeEventListener() {},
      speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); },
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
}

const media = page => page.evaluate(() => ({ ...window.__media, el: undefined }));
const lit = page => page.locator('.line.is-speaking');
const at = (page, t) => page.evaluate(t => window.__at(t), t);

test.describe('recorded voices on the live site', () => {
  test.beforeEach(async ({ page }) => { await stubMedia(page); });

  test('the prayer comes from the API, and the voices are named as synthetic', async ({ page }) => {
    const { asked, errors } = await liveSite(page);
    await page.goto(`${LIVE}/prayer.html?p=our-father`);
    await expect(page.locator('h1')).toHaveText('The Our Father');
    expect(asked).toContain('/api/prayers/our-father');
    await expect(page.locator('#source')).toContainText('Recorded voices: Niwat (Thai) and Andrew (English), synthetic neural voices made with Azure AI Speech.');
    await expect(page.locator('#voice-note')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('Listen in Thai plays the Thai recording and the highlight follows its timings', async ({ page }) => {
    await liveSite(page);
    await page.goto(`${LIVE}/prayer.html?p=our-father`);
    await page.locator('.listen[data-lang="th"]').click();

    const m = await media(page);
    expect(m.plays).toHaveLength(1);
    expect(m.plays[0].src).toBe(`${API}/api/audio/our-father/th-normal-0123456789.mp3`);
    expect(await page.evaluate(() => window.__spoken.length)).toBe(0); // no device voice
    await expect(page.locator('.listen[data-lang="th"] .label')).toHaveText('Stop');
    await expect(lit(page)).toHaveAttribute('data-i', '0');

    await at(page, 4.2);  // line 3 starts at 4 s
    await expect(lit(page)).toHaveAttribute('data-i', '2');
    await at(page, 13.9); // the last of 10 lines starts at 18 s
    await expect(lit(page)).toHaveAttribute('data-i', '6');
    await page.evaluate(() => window.__end());
    await expect(lit(page)).toHaveCount(0);
    await expect(page.locator('.listen[data-lang="th"] .label')).toHaveText('Listen');
  });

  test('Stop pauses the recording and clears the highlight', async ({ page }) => {
    await liveSite(page);
    await page.goto(`${LIVE}/prayer.html?p=hail-mary`);
    const th = page.locator('.listen[data-lang="th"]');
    await th.click();
    await at(page, 2.5);
    await expect(lit(page)).toHaveAttribute('data-i', '1');
    await th.click();
    expect((await media(page)).paused).toBe(true);
    await expect(lit(page)).toHaveCount(0);
    await at(page, 6); // a late tick from the stopped recording changes nothing
    await expect(lit(page)).toHaveCount(0);
  });

  test('Slow voice plays the slow recording, and English the English one', async ({ page }) => {
    await liveSite(page);
    await page.goto(`${LIVE}/prayer.html?p=glory-be`);
    await page.locator('#slow').click();
    await page.locator('.listen[data-lang="th"]').click();
    await page.locator('.listen[data-lang="en"]').click();
    const plays = (await media(page)).plays.map(p => p.src.split('/').pop());
    expect(plays).toEqual(['th-slow-0123456789.mp3', 'en-slow-0123456789.mp3']);
  });

  test('tapping a line plays just that line, from its start until the next line begins', async ({ page }) => {
    await liveSite(page);
    await page.goto(`${LIVE}/prayer.html?p=our-father`);
    await page.locator('.line[data-i="3"]').click();
    const m = await media(page);
    expect(m.plays.at(-1).from).toBe(6);
    await expect(lit(page)).toHaveAttribute('data-i', '3');
    await at(page, 7.5);
    await expect(lit(page)).toHaveAttribute('data-i', '3');
    await at(page, 8); // line 5 begins: stop here
    await expect(lit(page)).toHaveCount(0);
    expect((await media(page)).paused).toBe(true);
  });

  test('a recording that won\'t play falls back to the device\'s voice', async ({ page }) => {
    await liveSite(page);
    await page.goto(`${LIVE}/prayer.html?p=sign-of-the-cross`);
    await page.locator('.listen[data-lang="th"]').click();
    await page.evaluate(() => window.__fail());
    await expect.poll(() => page.evaluate(() => window.__spoken.map(s => s.lang))).toEqual(['th-TH', 'th-TH', 'th-TH', 'th-TH']);
  });

  test('with the API down, both pages use the bundled prayers and the device\'s voice', async ({ page }) => {
    const { asked, errors } = await liveSite(page, { api: false });
    await page.goto(`${LIVE}/pray.html`);
    await expect(page.locator('.card')).toHaveCount(DATA.prayers.length);
    await page.goto(`${LIVE}/prayer.html?p=memorare`);
    await expect(page.locator('h1')).toHaveText('The Memorare');
    await expect(page.locator('#source')).not.toContainText('Recorded voices');
    await page.locator('.listen[data-lang="th"]').click();
    expect((await media(page)).plays).toHaveLength(0);
    await expect.poll(() => page.evaluate(() => window.__spoken.length)).toBeGreaterThan(0);
    expect(asked).toContain('/api/prayers/memorare');
    expect(errors).toEqual([]);
  });

  test('the list comes from the API on the live site', async ({ page }) => {
    const { asked } = await liveSite(page);
    await page.goto(`${LIVE}/pray.html`);
    await expect(page.locator('.card')).toHaveCount(DATA.prayers.length);
    await expect(page.locator('.card').first()).toContainText('The Sign of the Cross');
    expect(asked).toContain('/api/prayers');
  });
});
