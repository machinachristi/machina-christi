// Suite for Pray: the prayer list, the bilingual prayer page, and its
// read-aloud controls. Headless Chromium has no real text-to-speech voices,
// so the page's speechSynthesis is swapped for a small stand-in that records
// every utterance and plays each one back as a short timed beat.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// The file as written (The Mass names its parts), and as the publisher sends
// it to the API (The Mass with its parts' lines), which is what pages draw.
const { expand } = require('../functions/src/lib/prayers.js');
const RAW = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pray', 'prayers.json'), 'utf8'));
const DATA = expand(RAW);
const byId = id => DATA.prayers.find(p => p.id === id);
// A part shown only inside The Mass ("listed": false) has no card on the list.
const LISTED = DATA.prayers.filter(p => p.listed !== false);
const MASS = byId('mass');

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Install a fake speechSynthesis before any page script runs. `thai: false`
// models a device with no Thai voice; `none: true` a browser with no speech.
// `beat` is how long each line takes to "say" — long by default so a test can
// act while a line is still being read, short where a test waits for the end.
// `dropStart` lists utterances (by the order they were queued) whose start
// event never fires, as iOS sometimes does for queued speech.
function stubSpeech(page, { thai = true, none = false, beat = 1500, dropStart = [] } = {}) {
  return page.addInitScript(({ thai, none, beat, dropStart }) => {
    if (none) {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: undefined, configurable: true });
      return;
    }
    window.__spoken = [];
    window.__cancels = 0;
    const voices = [
      { name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'Samantha' },
      ...(thai ? [{ name: 'Kanya', lang: 'th-TH', localService: true, default: false, voiceURI: 'Kanya' }] : []),
    ];
    let queue = [], current = null, timer = null;
    function next() {
      current = queue.shift() || null;
      if (!current) return;
      const u = current;
      if (u.onstart && !dropStart.includes(u.__n)) u.onstart({});
      timer = setTimeout(() => { current = null; if (u.onend) u.onend({}); next(); }, beat);
    }
    const synth = {
      get speaking() { return !!current; },
      get pending() { return queue.length > 0; },
      getVoices: () => voices,
      speak(u) {
        u.__n = window.__spoken.length;
        window.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice ? u.voice.name : null });
        queue.push(u);
        if (!current) next();
      },
      cancel() {
        window.__cancels++;
        clearTimeout(timer);
        const dropped = (current ? [current] : []).concat(queue);
        current = null; queue = [];
        dropped.forEach(u => { if (u.onerror) u.onerror({ error: 'canceled' }); });
      },
      addEventListener() {}, removeEventListener() {}, pause() {}, resume() {},
    };
    class FakeUtterance {
      constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = FakeUtterance;
  }, { thai, none, beat, dropStart });
}

const spoken = page => page.evaluate(() => window.__spoken);

test.describe('prayer data', () => {
  test('every prayer is complete and uniquely named', () => {
    expect(DATA.prayers.length).toBeGreaterThanOrEqual(4);
    const ids = RAW.prayers.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of DATA.prayers) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.title, p.id).toBeTruthy();
      expect(p.title_th, p.id).toMatch(/[฀-๿]/);
      // A prayer names its source; The Mass names each part's.
      for (const s of p.parts ? p.parts : [p]) expect(s.source && s.source.url, `${p.id}: ${s.id}`).toMatch(/^https:\/\//);
      expect(p.lines.length, p.id).toBeGreaterThan(0);
      for (const l of p.lines) {
        expect(l.th, p.id).toMatch(/[฀-๿]/);   // real Thai script
        expect(l.rom, p.id).toMatch(/^[^฀-๿]+$/); // romanization has no Thai script in it
        expect(l.en, p.id).toBeTruthy();
      }
    }
  });

  test('a prayer left off the list is said within The Mass', () => {
    const inMass = new Set(RAW.prayers.flatMap(p => (p.parts || []).map(x => (typeof x === 'string' ? x : x.id))));
    const unlisted = RAW.prayers.filter(p => p.listed === false).map(p => p.id);
    expect(unlisted.length).toBeGreaterThan(0);
    for (const id of unlisted) expect(inMass.has(id), id).toBe(true);
  });
});

test.describe('prayer list', () => {
  test('lists every prayer, linking to its page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/pray.html');
    await expect(page.locator('h1')).toContainText('Pray');
    const cards = page.locator('#prayers .card');
    await expect(cards).toHaveCount(LISTED.length);
    for (const [i, p] of LISTED.entries()) {
      await expect(cards.nth(i)).toHaveAttribute('href', `/pray/${p.id}.html`);
      await expect(cards.nth(i).locator('.th')).toHaveText(p.title_th);
    }
    expect(errors).toEqual([]);
  });

  test('The Mass has a card; the parts said only at Mass do not', async ({ page }) => {
    await page.goto('/pray.html');
    await expect(page.locator('.card[href="/pray/mass.html"]')).toHaveCount(1);
    for (const p of DATA.prayers.filter(p => p.listed === false)) {
      await expect(page.locator(`.card[href="/pray/${p.id}.html"]`)).toHaveCount(0);
    }
  });

  test('a card opens its prayer, and the back links walk home', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray.html');
    await page.locator('#prayers .card', { hasText: 'Our Father' }).click();
    await page.waitForURL('**/pray/our-father.html');
    await expect(page.locator('h1')).toHaveText('The Our Father');
    await page.locator('.back').click();
    await page.waitForURL('**/pray.html');
    await page.locator('.back').click();
    await page.waitForURL('**/index.html');
  });
});

// The Pray room's other door (three gates, step 1, AB#172): Ordo sits above
// the prayers. It is written into the page, not drawn by its script, so it
// is there before the prayers arrive, and even with scripts switched off.
test.describe('the Ordo card', () => {
  test('is there before the prayers load, and opens Ordo', async ({ page }) => {
    const errors = watchErrors(page);
    let release;
    const held = new Promise(r => { release = r; });
    await page.route('**/pray/prayers.json', async route => { await held; return route.continue(); });
    await page.goto('/pray.html');
    const ordo = page.locator('#rooms .card');
    await expect(ordo).toHaveCount(1);
    await expect(ordo).toHaveAttribute('href', '/ordo.html');
    await expect(ordo.locator('h2')).toHaveText('Ordo');
    await expect(ordo).toContainText('today in the Church');
    await expect(page.locator('#prayers .notice')).toHaveText(/Loading/); // the prayers are still on their way
    // Above the prayer list, and not one of the prayers.
    const top = l => l.evaluate(el => el.getBoundingClientRect().top);
    expect(await top(ordo)).toBeLessThan(await top(page.locator('#prayers')));
    release();
    await expect(page.locator('#prayers .card')).toHaveCount(LISTED.length);
    await expect(page.locator('#prayers .card[href="/ordo.html"]')).toHaveCount(0);
    await ordo.click();
    await page.waitForURL('**/ordo.html');
    await expect(page.locator('h1')).toHaveText('Ordo');
    expect(errors).toEqual([]);
  });

  test.describe('with scripts switched off', () => {
    test.use({ javaScriptEnabled: false });
    test('is still there', async ({ page }) => {
      await page.goto('/pray.html');
      await expect(page.locator('#rooms .card[href="/ordo.html"]')).toBeVisible();
    });
  });
});

// On the live site the Pray pages also ask the API, which sleeps when nobody
// calls and can take seconds to wake. The bundled copy answers first, so a
// visitor never waits for it. Here the API's answer is held back until the
// test lets it go.
test.describe('the bundled prayers answer first on the live site', () => {
  const { LIVE, API, serveLiveCopy, apiJson } = require('./live-copy');
  const cardsOf = prayers => prayers.map(({ id, title, title_th, about, listed }) => ({ id, title, title_th, about, listed: listed !== false }));

  // The API, held: each call waits until release(answer) is called.
  async function heldApi(page) {
    let release;
    const answer = new Promise(r => { release = r; });
    const asked = [];
    await serveLiveCopy(page);
    await page.route(`${API}/**`, async route => {
      asked.push(new URL(route.request().url()).pathname);
      const body = await answer;
      return body === null ? route.fulfill({ status: 503, body: '' }) : apiJson(route, body);
    });
    return { release, asked };
  }

  test('with the API asleep, the list is there within a second', async ({ page }) => {
    const errors = watchErrors(page);
    const { release, asked } = await heldApi(page);
    await page.goto(`${LIVE}/pray.html`);
    await expect(page.locator('#prayers .card')).toHaveCount(LISTED.length, { timeout: 1000 });
    expect(asked).toContain('/api/prayers');
    release(null);
    expect(errors).toEqual([]);
  });

  test('the same list from the API leaves the page alone; a different one replaces it', async ({ page }) => {
    const { release } = await heldApi(page);
    await page.goto(`${LIVE}/pray.html`);
    await expect(page.locator('#prayers .card')).toHaveCount(LISTED.length);
    await page.locator('#prayers .card').first().evaluate(el => { el.dataset.first = 'kept'; });
    const answered = page.waitForResponse(`${API}/api/prayers`);
    release(cardsOf(DATA.prayers));
    await answered;
    await page.waitForTimeout(200);
    await expect(page.locator('#prayers .card').first()).toHaveAttribute('data-first', 'kept'); // not redrawn

    const { release: releaseNew } = await heldApi(page);
    await page.reload();
    await expect(page.locator('#prayers .card')).toHaveCount(LISTED.length);
    releaseNew([...cardsOf(DATA.prayers), { id: 'angelus', title: 'The Angelus', title_th: 'ทูตสวรรค์แจ้งข่าว', about: '', listed: true }]);
    await expect(page.locator('#prayers .card')).toHaveCount(LISTED.length + 1);
    await expect(page.locator('#prayers .card').last()).toContainText('The Angelus');
  });

  test('an API from before the list could leave prayers off still never shows the parts said only at Mass', async ({ page }) => {
    // For a few minutes after a deploy the pages and the API can be from
    // different days: an older API says nothing about `listed`.
    const { release } = await heldApi(page);
    await page.goto(`${LIVE}/pray.html`);
    await expect(page.locator('#prayers .card')).toHaveCount(LISTED.length);
    await page.locator('#prayers .card').first().evaluate(el => { el.dataset.first = 'kept'; });
    const answered = page.waitForResponse(`${API}/api/prayers`);
    release(DATA.prayers.map(({ id, title, title_th, about }) => ({ id, title, title_th, about })));
    await answered;
    await page.waitForTimeout(200);
    await expect(page.locator('#prayers .card')).toHaveCount(LISTED.length);
    await expect(page.locator('#prayers .card').first()).toHaveAttribute('data-first', 'kept'); // the same list: not redrawn
  });

  test('a prayer\'s words show at once, and its recordings follow from the API', async ({ page }) => {
    await stubSpeech(page);
    const { release } = await heldApi(page);
    await page.goto(`${LIVE}/pray/glory-be.html`);
    await expect(page.locator('h1')).toHaveText(byId('glory-be').title, { timeout: 1000 });
    await expect(page.locator('.line')).toHaveCount(byId('glory-be').lines.length);
    await expect(page.locator('#source')).not.toContainText('Recorded voices');
    const take = (voice) => ({ voice, normal: { file: 'glory-be/x.mp3', starts: [0], duration: 2 }, slow: { file: 'glory-be/y.mp3', starts: [0], duration: 3 } });
    release({ ...byId('glory-be'), audio: { th: take('th-TH-NiwatNeural'), en: take('en-US-AndrewNeural') } });
    await expect(page.locator('#source')).toContainText('Recorded voices: Niwat (Thai) and Andrew (English)');
    await expect(page.locator('.line')).toHaveCount(byId('glory-be').lines.length);
  });
});

test.describe('prayer page', () => {
  test('every prayer renders line by line in Thai, pronunciation, and English, with no sideways scroll', async ({ page }) => {
    const errors = watchErrors(page);
    await stubSpeech(page);
    for (const p of DATA.prayers) {
      await page.goto(`/pray/${p.id}.html`);
      await expect(page.locator('#title-th')).toHaveText(p.title_th);
      await expect(page.locator('.line')).toHaveCount(p.lines.length);
      await expect(page.locator('.line .th[lang="th"]')).toHaveCount(p.lines.length);
      await expect(page.locator('.line .th').first()).toHaveText(p.lines[0].th);
      await expect(page.locator('.line .rom').first()).toHaveText(p.lines[0].rom);
      await expect(page.locator('.line .en').first()).toHaveText(p.lines[0].en);
      if (p.parts) {
        // The Mass: each part names its own source, under it.
        await expect(page.locator('.part')).toHaveCount(p.parts.length);
        for (const part of p.parts) await expect(page.locator(`#part-${part.id} .part__source a`)).toHaveAttribute('href', part.source.url);
      } else {
        await expect(page.locator('#source a')).toHaveAttribute('href', p.source.url);
      }
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, p.id).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });

  test('Listen in Thai reads every line in a Thai voice, lighting each line, and Stop silences it', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/our-father.html');
    const th = page.locator('.listen[data-lang="th"]');
    await th.click();

    const said = await spoken(page);
    const p = byId('our-father');
    expect(said.map(s => s.text)).toEqual(p.lines.map(l => l.th));
    expect(said.every(s => s.lang === 'th-TH' && s.voice === 'Kanya' && s.rate === 1)).toBe(true);
    await expect(th).toHaveClass(/is-playing/);
    await expect(th.locator('.label')).toHaveText('Stop');
    await expect(page.locator('.line.is-speaking')).toHaveCount(1);

    await th.click();   // now a Stop button
    await expect(th).not.toHaveClass(/is-playing/);
    await expect(th.locator('.label')).toHaveText('Listen');
    await expect(page.locator('.line.is-speaking')).toHaveCount(0);
    expect(await page.evaluate(() => window.__cancels)).toBeGreaterThan(0);
  });

  test('the highlight keeps following the voice even when a line never reports starting', async ({ page }) => {
    // iOS sometimes skips the start event of queued lines; the highlight
    // used to wait for it and stay stuck while the voice read on.
    await stubSpeech(page, { beat: 300, dropStart: [1, 2] });
    await page.goto('/pray/our-father.html');
    // The lines arrive after the page loads; watch them only once they're there.
    await expect(page.locator('.line')).toHaveCount(byId('our-father').lines.length);
    // Record every line the highlight lands on, in order.
    await page.evaluate(() => {
      window.__lit = [];
      const lines = [...document.querySelectorAll('.line')];
      new MutationObserver(() => {
        const i = lines.findIndex(el => el.classList.contains('is-speaking'));
        if (window.__lit[window.__lit.length - 1] !== i) window.__lit.push(i);
      }).observe(document.getElementById('lines'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    const th = page.locator('.listen[data-lang="th"]');
    await th.click();
    await expect(th).not.toHaveClass(/is-playing/, { timeout: 15000 });
    const n = byId('our-father').lines.length;
    expect(await page.evaluate(() => window.__lit)).toEqual([...Array(n).keys(), -1]);
  });

  test('Listen in English reads the English lines and settles when it finishes', async ({ page }) => {
    await stubSpeech(page, { beat: 100 });
    await page.goto('/pray/sign-of-the-cross.html');
    const en = page.locator('.listen[data-lang="en"]');
    await en.click();
    const said = await spoken(page);
    expect(said.map(s => s.text)).toEqual(byId('sign-of-the-cross').lines.map(l => l.en));
    expect(said.every(s => s.lang === 'en-US' && s.voice === 'Samantha')).toBe(true);
    // Four short beats, then the bar returns to rest on its own.
    await expect(en).not.toHaveClass(/is-playing/, { timeout: 5000 });
    await expect(page.locator('.line.is-speaking')).toHaveCount(0);
  });

  test('tapping a line reads just that line in Thai; tapping it again stops', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/hail-mary.html');
    const line = page.locator('.line').nth(2);
    await line.click();
    const said = await spoken(page);
    expect(said).toHaveLength(1);
    expect(said[0].text).toBe(byId('hail-mary').lines[2].th);
    expect(said[0].lang).toBe('th-TH');
    await expect(line).toHaveClass(/is-speaking/);
    // A single line doesn't turn the whole-prayer button into Stop.
    await expect(page.locator('.listen[data-lang="th"]')).not.toHaveClass(/is-playing/);
    await line.click();
    await expect(line).not.toHaveClass(/is-speaking/);
    expect(await spoken(page)).toHaveLength(1);
  });

  test('Slow voice reads at a gentler rate and is remembered', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/o-blood-and-water.html');
    await page.locator('#slow').click();
    await expect(page.locator('#slow')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.listen[data-lang="th"]').click();
    expect((await spoken(page)).every(s => s.rate === 0.7)).toBe(true);
    await page.reload();
    await expect(page.locator('#slow')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the pronunciation switch hides and shows the romanization, and is remembered', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/our-father.html');
    const rom = page.locator('.line .rom').first();
    await expect(rom).toBeVisible();
    await page.locator('#rom').click();
    await expect(rom).toBeHidden();
    await expect(page.locator('#guide')).toBeHidden();
    await page.reload();
    await expect(page.locator('.line .rom').first()).toBeHidden();
    await page.locator('#rom').click();
    await expect(page.locator('.line .rom').first()).toBeVisible();
  });

  test('a device without a Thai voice is told how to add one', async ({ page }) => {
    await stubSpeech(page, { thai: false });
    await page.goto('/pray/our-father.html');
    await expect(page.locator('#voice-note')).toBeVisible();
    await expect(page.locator('#voice-note')).toContainText('Thai voice');
  });

  test('a Thai voice that is listed but silent is noticed, and the hint explains how to download one', async ({ page }) => {
    // Seen for real with macOS's Kanya: listed, but with no sound files it
    // "finishes" each line almost instantly. A 5ms beat per line models that.
    await stubSpeech(page, { beat: 5 });
    await page.goto('/pray/our-father.html');
    await expect(page.locator('#voice-note')).toBeHidden();
    await page.locator('.listen[data-lang="th"]').click();
    await expect(page.locator('#voice-note')).toBeVisible();
    await expect(page.locator('#voice-note')).toContainText('almost instantly');
    await expect(page.locator('#voice-note')).toContainText('Spoken Content');
  });

  test('a browser that cannot speak still shows the whole prayer, without listen controls', async ({ page }) => {
    const errors = watchErrors(page);
    await stubSpeech(page, { none: true });
    await page.goto('/pray/our-father.html');
    await expect(page.locator('.line')).toHaveCount(byId('our-father').lines.length);
    await expect(page.locator('button.line')).toHaveCount(0);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#voice-note')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the English names its source: a credit where the text has one, the traditional wording elsewhere', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/nicene-creed.html');
    await expect(page.locator('#source')).toContainText(`English: ${byId('nicene-creed').source_en.notice}`);
    await page.goto('/pray/our-father.html');
    await expect(page.locator('#source')).toContainText('English: the traditional wording.');
  });

  test('an unknown prayer shows a gentle way back', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/prayer.html?p=no-such-prayer');
    await expect(page.locator('#lines')).toContainText('isn’t here');
    await expect(page.locator('#lines a[href="/pray.html"]')).toBeVisible();
    await expect(page.locator('#player')).toBeHidden();
  });
});

// The Mass is one prayer made of others: one page, a heading where each part
// begins, and one Listen that reads straight through.
test.describe('The Mass', () => {
  const endOf = n => (n + 1 < MASS.parts.length ? MASS.parts[n + 1].start : MASS.lines.length);

  test('each part has its own heading, in order, with its own lines; the Our Father has no Amen here', async ({ page }) => {
    const errors = watchErrors(page);
    await stubSpeech(page);
    await page.goto('/pray/mass.html');
    await expect(page.locator('h1')).toHaveText(MASS.title);
    const parts = page.locator('.part');
    await expect(parts).toHaveCount(MASS.parts.length);
    for (const [n, part] of MASS.parts.entries()) {
      const section = parts.nth(n);
      await expect(section).toHaveAttribute('id', `part-${part.id}`);
      await expect(section.locator('h2')).toHaveText(part.title);
      await expect(section.locator('.part__th')).toHaveText(part.title_th);
      await expect(section.locator('.line .th')).toHaveText(MASS.lines.slice(part.start, endOf(n)).map(l => l.th));
    }
    const ourFather = byId('our-father').lines;
    await expect(page.locator('#part-our-father .line')).toHaveCount(ourFather.length - 1);
    await expect(page.locator('#part-our-father .line .th').last()).toHaveText(ourFather.at(-2).th);
    // Its own page keeps the Amen.
    await page.goto('/pray/our-father.html');
    await expect(page.locator('.line .th').last()).toHaveText(ourFather.at(-1).th);
    expect(errors).toEqual([]);
  });

  test('Listen reads the whole Mass, and the highlight walks on into each new part', async ({ page }) => {
    await stubSpeech(page, { beat: 80 });
    await page.goto('/pray/mass.html');
    await expect(page.locator('.line')).toHaveCount(MASS.lines.length);
    await page.evaluate(() => {
      window.__lit = [];
      const lines = [...document.querySelectorAll('.line')];
      new MutationObserver(() => {
        const i = lines.findIndex(el => el.classList.contains('is-speaking'));
        if (window.__lit[window.__lit.length - 1] !== i) window.__lit.push(i);
      }).observe(document.getElementById('lines'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    const th = page.locator('#player .listen[data-lang="th"]');
    await th.click();
    expect((await spoken(page)).map(s => s.text)).toEqual(MASS.lines.map(l => l.th));
    await expect(th).not.toHaveClass(/is-playing/, { timeout: 20000 });
    expect(await page.evaluate(() => window.__lit)).toEqual([...MASS.lines.keys(), -1]);
  });

  test('each part has its own Listen, which reads just that prayer, in Thai or English', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/mass.html');
    await expect(page.locator('.part__listen')).toHaveCount(MASS.parts.length);
    for (const h of await page.locator('.part__listen .listen').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height))) {
      expect(h).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('#part-nicene-creed .listen[data-lang="th"]')).toHaveText('ไทย', { useInnerText: true }); // compact: "▶ ไทย"
    const n = MASS.parts.findIndex(p => p.id === 'nicene-creed');
    const creed = MASS.lines.slice(MASS.parts[n].start, endOf(n));
    const th = page.locator('#part-nicene-creed .listen[data-lang="th"]');
    await expect(th).toHaveAttribute('aria-label', 'Listen to The Nicene Creed in Thai');
    await th.click();
    expect((await spoken(page)).map(s => s.text)).toEqual(creed.map(l => l.th));
    await expect(th.locator('.label')).toHaveText('Stop');
    await expect(th).toHaveAttribute('aria-label', 'Stop');
    await expect(page.locator('.line.is-speaking')).toHaveAttribute('data-i', String(MASS.parts[n].start));
    // Only this part's button turns to Stop: not the bar's, not the English.
    await expect(page.locator('#player .listen.is-playing, #part-nicene-creed .listen[data-lang="en"].is-playing')).toHaveCount(0);
    await th.click();
    await expect(th.locator('.label')).toHaveText('Listen');
    await expect(th).toHaveAttribute('aria-label', 'Listen to The Nicene Creed in Thai');
    await expect(page.locator('.line.is-speaking')).toHaveCount(0);

    // In English, the Our Father as said at Mass: without its Amen.
    const m = MASS.parts.findIndex(p => p.id === 'our-father');
    await page.locator('#part-our-father .listen[data-lang="en"]').click();
    const said = (await spoken(page)).slice(creed.length);
    expect(said.map(s => s.text)).toEqual(MASS.lines.slice(MASS.parts[m].start, endOf(m)).map(l => l.en));
    expect(said.every(s => s.lang === 'en-US')).toBe(true);
  });

  test('a part read to its end settles on its own, and the highlight stays inside the part', async ({ page }) => {
    await stubSpeech(page, { beat: 80 });
    await page.goto('/pray/mass.html');
    await expect(page.locator('.line')).toHaveCount(MASS.lines.length);
    await page.evaluate(() => {
      window.__lit = [];
      const lines = [...document.querySelectorAll('.line')];
      new MutationObserver(() => {
        const i = lines.findIndex(el => el.classList.contains('is-speaking'));
        if (window.__lit[window.__lit.length - 1] !== i) window.__lit.push(i);
      }).observe(document.getElementById('lines'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    const n = MASS.parts.findIndex(p => p.id === 'lamb-of-god');
    const th = page.locator('#part-lamb-of-god .listen[data-lang="th"]');
    await th.click();
    await expect(th).not.toHaveClass(/is-playing/, { timeout: 5000 });
    const within = [...Array(endOf(n) - MASS.parts[n].start).keys()].map(k => MASS.parts[n].start + k);
    expect(await page.evaluate(() => window.__lit)).toEqual([...within, -1]);
  });

  test('tapping a line in a later part reads that very line', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/mass.html');
    const line = page.locator('#part-lamb-of-god .line').nth(1);
    await line.click();
    expect((await spoken(page)).map(s => s.text)).toEqual([byId('lamb-of-god').lines[1].th]);
    await expect(line).toHaveClass(/is-speaking/);
    await expect(page.locator('.line.is-speaking')).toHaveCount(1);
  });

  test('the numbered list at the top names every part and goes straight to it', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/mass.html');
    const links = page.locator('.parts-nav a');
    await expect(links).toHaveText(MASS.parts.map((p, n) => `${n + 1} · ${p.title}`));
    for (const [n, p] of MASS.parts.entries()) await expect(links.nth(n)).toHaveAttribute('href', `#part-${p.id}`);
    for (const box of await links.evaluateAll(as => as.map(a => a.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
    await links.nth(4).click();
    await expect(page.locator('#part-lamb-of-god h2')).toBeInViewport();
    expect(new URL(page.url()).hash).toBe('#part-lamb-of-god');
  });

  test('a link to a part opens The Mass at that part', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray/mass.html#part-lamb-of-god');
    await expect(page.locator('#part-lamb-of-god h2')).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  });

  test('the page puts The Mass together exactly as the publisher does', async ({ page }) => {
    await page.goto('/pray.html');
    const fromPage = await page.evaluate(raw => JSON.parse(JSON.stringify(window.mcPray.expand(raw))), RAW);
    expect(fromPage).toEqual(JSON.parse(JSON.stringify(DATA)));
  });

  test('readable on a small phone: no sideways scroll, every word 14px or more', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await stubSpeech(page);
    await page.goto('/pray/mass.html');
    await expect(page.locator('.part')).toHaveCount(MASS.parts.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const size = sel => page.locator(sel).first().evaluate(n => parseFloat(getComputedStyle(n).fontSize));
    // Each prayer's two Listen buttons sit side by side, even playing.
    const tops = () => page.locator('#part-nicene-creed .listen').evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().top)));
    expect(new Set(await tops()).size).toBe(1);
    await page.locator('#part-nicene-creed .listen[data-lang="th"]').click();
    expect(new Set(await tops()).size).toBe(1);
    for (const sel of ['.parts-nav__label', '.parts-nav a', '.part__listen .listen', '.part__title', '.part__th', '.part__when', '.part__source', '.line .en', '#source']) {
      expect(await size(sel), sel).toBeGreaterThanOrEqual(14);
    }
  });
});

test.describe('home page gate', () => {
  test('the Pray gate opens the prayer list', async ({ page }) => {
    await page.goto('/index.html');
    // Keyboard entry walks through the focused gate regardless of which
    // one stands centered — pointer behavior is covered in home-and-doors.
    await page.locator('.portal--pray').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/pray.html');
  });
});
