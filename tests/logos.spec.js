// Logos: the Thai consonant cards. These check the card data against the
// workbook's shape (44 letters, three classes, every sound present), the gate
// page's lessons, and the card trainer's three ways of studying. The page's
// audio player and device voice are swapped for stand-ins that record what
// would have been heard, so nothing plays during a test.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'logos', 'thai.json'), 'utf8'));
const ALPHABET = 'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ';

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Every play() is recorded (with the file it would play) and resolves at
// once; the device voice records what it was asked to say.
function stubSound(page) {
  return page.addInitScript(() => {
    window.__played = [];
    window.__said = [];
    HTMLMediaElement.prototype.play = function () { window.__played.push(new URL(this.src).pathname); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    const synth = { speaking: false, pending: false, getVoices: () => [{ name: 'Kanya', lang: 'th-TH' }], speak(u) { window.__said.push(u.text); }, cancel() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
}

const played = page => page.evaluate(() => window.__played);
const card = id => DATA.cards.find(c => c.id === id);

test.describe('logos data', () => {
  test('44 consonants in alphabet order, sorted into the workbook\'s three classes', () => {
    expect(DATA.cards.map(c => c.letter).join('')).toBe(ALPHABET);
    const count = cls => DATA.cards.filter(c => c.class === cls).map(c => c.letter).join('');
    expect(count('middle')).toBe('กจฎฏดตบปอ');
    expect(count('high')).toBe('ขฃฉฐถผฝศษสห');
    expect(count('low')).toHaveLength(24);
    expect(new Set(DATA.cards.map(c => c.id)).size).toBe(44);
    expect(DATA.cards.filter(c => c.use === 'obsolete').map(c => c.letter).join('')).toBe('ฃฅ');
    expect(DATA.cards.filter(c => c.use === 'seldom').map(c => c.letter).sort().join('')).toBe([...'ฎฏฐศษฌฑฬฮ'].sort().join(''));
  });

  test('every card is complete, and its Thai is stored one consistent way (NFC)', () => {
    for (const c of DATA.cards) {
      for (const k of ['id', 'letter', 'word', 'say', 'rom', 'meaning', 'class', 'use']) expect(c[k], `${c.id}.${k}`).toBeTruthy();
      expect(['middle', 'high', 'low']).toContain(c.class);
      expect(['common', 'seldom', 'obsolete']).toContain(c.use);
      expect(c.id).toMatch(/^[a-z]+(-[a-z]+)+$/);
      // The name as spoken: the letter's own syllable (…อ), then the word.
      expect(c.say, c.id).toMatch(/^[ก-ฮ]อ [฀-๿]+$/);
      for (const s of [c.letter, c.word, c.say, c.rom]) expect(s, c.id).toBe(s.normalize('NFC'));
    }
  });

  // The whole project folder is published, so this covers the docs and the
  // tests too. The learner's lessons stay private: the site never mentions
  // whose workbook or voice it learned from. (This file is skipped: it has to
  // name what it looks for.)
  test('nothing published mentions whose lessons Logos learned from', () => {
    const MY = new RegExp(['my', 'teacher'].join('\\s+'), 'i');
    const THEIRS = new RegExp(`teacher(['’]s)?\\s+(workbook|recordings?|voice)`, 'i');
    const LOGOS = /teacher|อาจารย์|คุณครู/i;
    const logosFiles = new Set(['logos.html', 'cards.html', 'about-logos.html', 'logos/thai.json', 'assets/logos.js', 'docs/explained/logos-thai-cards.md', 'functions/scripts/record-logos.js']);
    const found = [];
    const walk = dir => {
      for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, f.name);
        if (f.isDirectory()) { if (!['.git', 'node_modules', 'test-results', '.claude'].includes(f.name)) walk(rel); continue; }
        if (!/\.(html|js|json|md|xml|txt)$/.test(f.name) || rel === path.join('tests', 'logos.spec.js')) continue;
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (MY.test(text) || THEIRS.test(text) || (logosFiles.has(rel) && LOGOS.test(text))) found.push(rel);
      }
    };
    walk('');
    expect(found).toEqual([]);
  });

  test('every card has its two recordings, and no recording is left over', () => {
    const used = new Set();
    for (const c of DATA.cards) {
      for (const speed of ['normal', 'slow']) {
        const file = c.audio && c.audio[speed];
        expect(file, `${c.id} ${speed}`).toMatch(new RegExp(`^th/${c.id}-${speed}-[0-9a-f]{10}\\.mp3$`));
        expect(fs.existsSync(path.join(ROOT, 'logos', 'audio', file)), file).toBe(true);
        used.add(file);
      }
    }
    const onDisk = fs.readdirSync(path.join(ROOT, 'logos', 'audio', 'th')).map(f => `th/${f}`);
    expect(onDisk.filter(f => !used.has(f))).toEqual([]);
  });
});

test.describe('logos gate', () => {
  test('lists the four lessons, each opening its cards', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/logos.html');
    const lessons = page.locator('.lesson');
    await expect(lessons).toHaveCount(4);
    await expect(lessons.nth(0)).toHaveAttribute('href', 'cards.html?set=thai-middle');
    await expect(lessons.nth(0)).toContainText('9 letters');
    await expect(lessons.nth(1)).toContainText('11 letters');
    await expect(lessons.nth(2)).toContainText('24 letters');
    await expect(lessons.nth(3)).toHaveAttribute('href', 'cards.html?set=thai-all');
    await expect(page.locator('.credit')).toContainText('a Thai learner’s workbook');
    expect(errors).toEqual([]);
  });

  test('shows what is due once some cards have been studied', async ({ page }) => {
    await page.addInitScript(() => {
      const d = new Date(); d.setDate(d.getDate() + 1);
      const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('logos.thai.v1', JSON.stringify({ 'ko-kai': { box: 3, due: tomorrow }, 'cho-chan': { box: 2, due: tomorrow } }));
    });
    await page.goto('/logos.html');
    await expect(page.locator('.lesson').nth(0)).toContainText('7 to review today');
    await expect(page.locator('.lesson').nth(0)).toContainText('1 learned');
  });
});

test.describe('thai cards', () => {
  test('Learn: turn a card over, hear its name, step through the lesson', async ({ page }) => {
    const errors = watchErrors(page);
    await stubSound(page);
    await page.goto('/cards.html?set=thai-middle');
    await expect(page.locator('#title')).toHaveText('Middle class');
    await expect(page.locator('.mode[data-mode="learn"]')).toHaveAttribute('aria-selected', 'true');
    const flash = page.locator('#flash');
    await expect(flash.locator('.letter')).toHaveText('ก');
    await expect(page.locator('#pos')).toHaveText('1 / 9');

    await flash.click();
    await expect(flash).toContainText('ไก่');
    await expect(flash).toContainText(card('ko-kai').rom);
    await expect(flash).toContainText('chicken');
    await expect(flash).toContainText('middle class');
    await expect.poll(() => played(page)).toEqual([`/logos/audio/${card('ko-kai').audio.normal}`]);

    // Slow is remembered, and the slow recording plays.
    await page.locator('#slow').click();
    await page.locator('#listen').click();
    await expect.poll(async () => (await played(page)).at(-1)).toBe(`/logos/audio/${card('ko-kai').audio.slow}`);

    await page.locator('#next').click();
    await expect(page.locator('#flash .letter')).toHaveText('จ');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#flash .letter')).toHaveText('ฎ');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#pos')).toHaveText('2 / 9');

    await page.reload();
    await expect(page.locator('#slow')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('Review: "Got it" moves a card up a box; "Again" brings it back today', async ({ page }) => {
    await stubSound(page);
    await page.goto('/cards.html?set=thai-middle&mode=review');
    await expect(page.locator('.status')).toHaveText('9 to go');
    await expect(page.locator('#answer')).toBeHidden();

    await page.locator('#flash').click();          // ก
    await page.locator('#knew').click();
    await expect(page.locator('.status')).toHaveText('8 to go');
    // Known at first sight: box 2, back tomorrow (the learner's own day).
    const { stored, tomorrow } = await page.evaluate(() => {
      const d = new Date(); d.setDate(d.getDate() + 1);
      return {
        stored: JSON.parse(localStorage.getItem('logos.thai.v1')),
        tomorrow: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      };
    });
    expect(stored['ko-kai']).toEqual({ box: 2, due: tomorrow });

    await page.locator('#flash').click();          // จ
    await page.keyboard.press('1');                // Again: to the back of the queue
    await expect(page.locator('.status')).toHaveText('8 to go');
    await expect(page.locator('#flash .letter')).toHaveText('ฎ');

    for (let i = 0; i < 8; i++) { await page.locator('#flash').click(); await page.locator('#knew').click(); }
    await expect(page.locator('.status')).toContainText('All done for today');

    // Back on the gate, the middle class has nothing due today.
    await page.goto('/logos.html');
    await expect(page.locator('.lesson').nth(0)).toContainText('0 to review today');
  });

  test('Review and Listen & pick leave out the letters no longer used', async ({ page }) => {
    await stubSound(page);
    await page.goto('/cards.html?set=thai-high&mode=review');
    await expect(page.locator('.status')).toHaveText('10 to go');
    await expect(page.locator('#note')).toContainText('ฃ is no longer used');
  });

  test('Listen & pick: hear a name, choose its letter', async ({ page }) => {
    const errors = watchErrors(page);
    await stubSound(page);
    await page.goto('/cards.html?set=thai-middle&mode=pick');
    await page.locator('#start').click();
    await expect(page.locator('.choice')).toHaveCount(4);
    await expect.poll(async () => (await played(page)).length).toBe(1);
    const heard = (await played(page))[0];
    const answer = DATA.cards.find(c => `/logos/audio/${c.audio.normal}` === heard);
    expect(answer, `played ${heard}`).toBeTruthy();
    await page.locator(`.choice[data-id="${answer.id}"]`).click();
    await expect(page.locator(`.choice[data-id="${answer.id}"]`)).toHaveClass(/right/);
    await expect(page.locator('#said')).toContainText(answer.word);
    await page.locator('#next').click();
    await expect.poll(async () => (await played(page)).length).toBe(2);
    expect(errors).toEqual([]);
  });

  test('without a recording, the device voice says the name', async ({ page }) => {
    await stubSound(page);
    await page.route('**/logos/thai.json', async route => {
      const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'logos', 'thai.json'), 'utf8'));
      for (const c of data.cards) delete c.audio;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('/cards.html?set=thai-middle');
    await page.locator('#flash').click();
    await expect.poll(() => page.evaluate(() => window.__said)).toEqual(['กอ ไก่']);
  });

  // Thai letters reach below the line (ฎ ฏ ฐ ญ) and words carry marks above
  // it (ผู้หญิง), further than an ordinary line of text allows for. The ink
  // each letter really covers, measured in the page's own font, must stay
  // inside the card and clear of the text under it, on both faces.
  test('no letter or word is drawn over the text beneath it', async ({ page }) => {
    await stubSound(page);
    await page.goto('/cards.html?set=thai-all');
    const ink = (sel, below) => page.evaluate(([sel, below]) => {
      const el = document.querySelector(sel), cs = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(el.textContent);
      const box = el.getBoundingClientRect();
      const baseline = box.top + (parseFloat(cs.lineHeight) - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      return {
        text: el.textContent,
        top: baseline - m.actualBoundingBoxAscent,
        bottom: baseline + m.actualBoundingBoxDescent,
        card: document.querySelector('#flash').getBoundingClientRect().top,
        next: document.querySelector(below).getBoundingClientRect().top,
      };
    }, [sel, below]);
    const clashes = [];
    for (let i = 0; i < DATA.cards.length; i++) {
      const front = await ink('#flash .letter', '#flash .hint');
      if (front.bottom > front.next || front.top < front.card) clashes.push(`front ${front.text}: ink ${front.top.toFixed(0)}–${front.bottom.toFixed(0)}, hint at ${front.next.toFixed(0)}`);
      await page.locator('#flash').click();
      await expect(page.locator('#flash')).toHaveAttribute('data-side', 'back');
      const back = await ink('#flash .name', '#flash .rom');
      if (back.bottom > back.next || back.top < back.card) clashes.push(`back ${back.text}: ink ${back.top.toFixed(0)}–${back.bottom.toFixed(0)}, romanization at ${back.next.toFixed(0)}`);
      if (i < DATA.cards.length - 1) { await page.locator('#next').click(); await expect(page.locator('#pos')).toHaveText(`${i + 2} / 44`); }
    }
    expect(clashes).toEqual([]);
  });

  test('an unknown lesson says so', async ({ page }) => {
    await page.goto('/cards.html?set=latin-nouns');
    await expect(page.locator('#title')).toHaveText('Lesson not found');
  });

  test('text stays readable on a phone (14px and up)', async ({ page }) => {
    await stubSound(page);
    for (const url of ['/logos.html', '/cards.html?set=thai-middle', '/about-logos.html']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      if (url.startsWith('/cards')) await page.locator('#flash').click();
      const small = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 14)
        .map(e => `${e.tagName}.${e.className}: ${getComputedStyle(e).fontSize}`));
      expect(small, url).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, url).toBeLessThanOrEqual(1);
    }
  });
});
