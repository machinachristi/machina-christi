// Suite for Pray: the prayer list, the bilingual prayer page, and its
// read-aloud controls. Headless Chromium has no real text-to-speech voices,
// so the page's speechSynthesis is swapped for a small stand-in that records
// every utterance and plays each one back as a short timed beat.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pray', 'prayers.json'), 'utf8'));
const byId = id => DATA.prayers.find(p => p.id === id);

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
function stubSpeech(page, { thai = true, none = false, beat = 1500 } = {}) {
  return page.addInitScript(({ thai, none, beat }) => {
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
      if (u.onstart) u.onstart({});
      timer = setTimeout(() => { current = null; if (u.onend) u.onend({}); next(); }, beat);
    }
    const synth = {
      get speaking() { return !!current; },
      get pending() { return queue.length > 0; },
      getVoices: () => voices,
      speak(u) {
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
  }, { thai, none, beat });
}

const spoken = page => page.evaluate(() => window.__spoken);

test.describe('prayer data', () => {
  test('every prayer is complete and uniquely named', () => {
    expect(DATA.prayers.length).toBeGreaterThanOrEqual(4);
    const ids = DATA.prayers.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of DATA.prayers) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.title, p.id).toBeTruthy();
      expect(p.title_th, p.id).toMatch(/[฀-๿]/);
      expect(p.source && p.source.url, p.id).toMatch(/^https:\/\//);
      expect(p.lines.length, p.id).toBeGreaterThan(0);
      for (const l of p.lines) {
        expect(l.th, p.id).toMatch(/[฀-๿]/);   // real Thai script
        expect(l.rom, p.id).toMatch(/^[^฀-๿]+$/); // romanization has no Thai script in it
        expect(l.en, p.id).toBeTruthy();
      }
    }
  });
});

test.describe('prayer list', () => {
  test('lists every prayer, linking to its page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/pray.html');
    await expect(page.locator('h1')).toContainText('Pray');
    const cards = page.locator('.card');
    await expect(cards).toHaveCount(DATA.prayers.length);
    for (const [i, p] of DATA.prayers.entries()) {
      await expect(cards.nth(i)).toHaveAttribute('href', `prayer.html?p=${p.id}`);
      await expect(cards.nth(i).locator('.th')).toHaveText(p.title_th);
    }
    expect(errors).toEqual([]);
  });

  test('a card opens its prayer, and the back links walk home', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/pray.html');
    await page.locator('.card', { hasText: 'Our Father' }).click();
    await page.waitForURL('**/prayer.html?p=our-father');
    await expect(page.locator('h1')).toHaveText('The Our Father');
    await page.locator('.back').click();
    await page.waitForURL('**/pray.html');
    await page.locator('.back').click();
    await page.waitForURL('**/index.html');
  });
});

test.describe('prayer page', () => {
  test('every prayer renders line by line in Thai, pronunciation, and English, with no sideways scroll', async ({ page }) => {
    const errors = watchErrors(page);
    await stubSpeech(page);
    for (const p of DATA.prayers) {
      await page.goto(`/prayer.html?p=${p.id}`);
      await expect(page.locator('#title-th')).toHaveText(p.title_th);
      await expect(page.locator('.line')).toHaveCount(p.lines.length);
      await expect(page.locator('.line .th[lang="th"]')).toHaveCount(p.lines.length);
      await expect(page.locator('.line .th').first()).toHaveText(p.lines[0].th);
      await expect(page.locator('.line .rom').first()).toHaveText(p.lines[0].rom);
      await expect(page.locator('.line .en').first()).toHaveText(p.lines[0].en);
      await expect(page.locator('#source a')).toHaveAttribute('href', p.source.url);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, p.id).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });

  test('Listen in Thai reads every line in a Thai voice, lighting each line, and Stop silences it', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/prayer.html?p=our-father');
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

  test('Listen in English reads the English lines and settles when it finishes', async ({ page }) => {
    await stubSpeech(page, { beat: 100 });
    await page.goto('/prayer.html?p=sign-of-the-cross');
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
    await page.goto('/prayer.html?p=hail-mary');
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
    await page.goto('/prayer.html?p=o-blood-and-water');
    await page.locator('#slow').click();
    await expect(page.locator('#slow')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.listen[data-lang="th"]').click();
    expect((await spoken(page)).every(s => s.rate === 0.7)).toBe(true);
    await page.reload();
    await expect(page.locator('#slow')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the pronunciation switch hides and shows the romanization, and is remembered', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/prayer.html?p=our-father');
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
    await page.goto('/prayer.html?p=our-father');
    await expect(page.locator('#voice-note')).toBeVisible();
    await expect(page.locator('#voice-note')).toContainText('Thai voice');
  });

  test('a Thai voice that is listed but silent is noticed, and the hint explains how to download one', async ({ page }) => {
    // Seen for real with macOS's Kanya: listed, but with no sound files it
    // "finishes" each line almost instantly. A 5ms beat per line models that.
    await stubSpeech(page, { beat: 5 });
    await page.goto('/prayer.html?p=our-father');
    await expect(page.locator('#voice-note')).toBeHidden();
    await page.locator('.listen[data-lang="th"]').click();
    await expect(page.locator('#voice-note')).toBeVisible();
    await expect(page.locator('#voice-note')).toContainText('almost instantly');
    await expect(page.locator('#voice-note')).toContainText('Spoken Content');
  });

  test('a browser that cannot speak still shows the whole prayer, without listen controls', async ({ page }) => {
    const errors = watchErrors(page);
    await stubSpeech(page, { none: true });
    await page.goto('/prayer.html?p=our-father');
    await expect(page.locator('.line')).toHaveCount(byId('our-father').lines.length);
    await expect(page.locator('button.line')).toHaveCount(0);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#voice-note')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('an unknown prayer shows a gentle way back', async ({ page }) => {
    await stubSpeech(page);
    await page.goto('/prayer.html?p=no-such-prayer');
    await expect(page.locator('#lines')).toContainText('isn’t here');
    await expect(page.locator('#lines a[href="pray.html"]')).toBeVisible();
    await expect(page.locator('#player')).toBeHidden();
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
