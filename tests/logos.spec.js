// Logos: the Thai cards. These check the card data against the workbook's
// shape (44 consonants in three classes, 32 vowels, five tones, every sound
// present), the page's three pages (Cards, Alphabet, Practice) and Listen &
// pick. The page's audio player and device voice are swapped for stand-ins
// that record what would have been heard, so nothing plays during a test.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'logos', 'thai.json'), 'utf8'));
const ALPHABET = 'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ';
const TONES = ['mid', 'low', 'falling', 'high', 'rising'];
const shown = form => form.replace(/-(?=[ัำ-ฺ็-๎])/g, '');

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

// Cards turn at once (no quarter turn) so a test needn't wait for it.
async function openLogos(page, hash = '') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubSound(page);
  await page.goto(`/logos.html${hash}`);
  await expect(page.locator('#sec-tones')).toBeAttached();
}

const played = page => page.evaluate(() => window.__played);
const lastPlayed = async page => (await played(page)).at(-1);
const url = file => `/logos/audio/${file}`;
const consonant = id => DATA.consonants.find(c => c.id === id);
const vowel = id => DATA.vowels.find(v => v.id === id);
// A syllable's tone from its romanization: the mark over its vowel (none = mid).
const toneOf = s => { const n = s.normalize('NFD'); return /̀/.test(n) ? 'low' : /̂/.test(n) ? 'falling' : /́/.test(n) ? 'high' : /̌/.test(n) ? 'rising' : 'mid'; };

test.describe('logos data', () => {
  test('44 consonants in alphabet order, sorted into the workbook\'s three classes', () => {
    const C = DATA.consonants;
    expect(C.map(c => c.letter).join('')).toBe(ALPHABET);
    const letters = cls => C.filter(c => c.class === cls).map(c => c.letter).join('');
    expect(letters('middle')).toBe('กจฎฏดตบปอ');
    expect(letters('high')).toBe('ขฃฉฐถผฝศษสห');
    expect(letters('low')).toHaveLength(24);
    expect(new Set(C.map(c => c.id)).size).toBe(44);
    expect(C.filter(c => c.use === 'obsolete').map(c => c.letter).join('')).toBe('ฃฅ');
    expect(C.filter(c => c.use === 'seldom').map(c => c.letter).sort().join('')).toBe([...'ฎฏฐศษฌฑฬฮ'].sort().join(''));
  });

  test('every consonant is complete, spelled one consistent way (NFC), with a picture', () => {
    for (const c of DATA.consonants) {
      for (const k of ['id', 'letter', 'word', 'say', 'name_rom', 'word_rom', 'meaning', 'class', 'use']) expect(c[k], `${c.id}.${k}`).toBeTruthy();
      expect(['middle', 'high', 'low']).toContain(c.class);
      expect(['common', 'seldom', 'obsolete']).toContain(c.use);
      expect(c.id).toMatch(/^[a-z]+(-[a-z]+)+$/);
      // The name as spoken: the letter's own syllable (…อ), then the word.
      expect(c.say, c.id).toMatch(/^[ก-ฮ]อ [฀-๿]+$/);
      for (const s of [c.letter, c.word, c.say, c.name_rom, c.word_rom]) expect(s, c.id).toBe(s.normalize('NFC'));
      // The guide's spelling: tone marks and hyphens, no dots over short syllables.
      expect(c.name_rom + c.word_rom, c.id).not.toMatch(/̇/u);
      expect(Boolean(c.pic) !== Boolean(c.draw), `${c.id}: an emoji or a drawing`).toBe(true);
      if (c.draw) expect(fs.existsSync(path.join(ROOT, 'logos', 'pics', `${c.draw}.svg`)), c.draw).toBe(true);
    }
  });

  test('each consonant\'s tone rows hold every syllable of its name, marked with its tone', () => {
    for (const c of DATA.consonants) {
      const syllables = [c.name_rom, ...c.word_rom.split(/[ -]/)];
      const inRows = c.tones.flatMap(r => r.rom.split(', '));
      expect(inRows.slice().sort(), c.letter).toEqual(syllables.slice().sort());
      expect(new Set(c.tones.map(r => r.tone)).size, `${c.letter}: one row per tone`).toBe(c.tones.length);
      for (const r of c.tones) {
        expect(TONES).toContain(r.tone);
        expect(r.say, `${c.letter} ${r.rom}`).toMatch(/^[฀-๿]+( [฀-๿]+)*$/);
        for (const s of r.rom.split(', ')) expect(toneOf(s), `${c.letter} ${s}`).toBe(r.tone);
      }
    }
  });

  test('32 vowels: short and long partners, the special four, and a Thai school chart\'s order', () => {
    const V = DATA.vowels;
    expect(V).toHaveLength(32);
    expect(new Set(V.map(v => v.form)).size).toBe(32);
    expect(V.map(v => v.chart).sort((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    expect(V.filter(v => v.length === 'special').map(v => v.form)).toEqual(['-ำ', 'ใ-', 'ไ-', 'เ-า']);
    for (const v of V) {
      expect(v.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(['short', 'long', 'special']).toContain(v.length);
      expect(['common', 'rare', 'obsolete']).toContain(v.use);
      for (const s of [v.form, v.say, v.word, v.word_rom].filter(Boolean)) expect(s, v.id).toBe(s.normalize('NFC'));
      if (v.length === 'special') { expect(v.partner).toBeUndefined(); continue; }
      const p = vowel(v.partner);
      expect(p.partner, v.id).toBe(v.id);
      expect(p.sound, v.id).toBe(v.sound);
      expect(p.length, v.id).not.toBe(v.length);
    }
    // Each vowel is said with อ where the consonant goes; the old vowel letters are respelled for the voice.
    const respelled = { 'eu-long': 'อือ', 'reu-short': 'รึ', 'reu-long': 'รือ', 'leu-short': 'ลึ', 'leu-long': 'ลือ' };
    for (const v of V) expect(v.say, v.id).toBe(respelled[v.id] || v.form.replace('-', 'อ'));
    expect(V.filter(v => v.use === 'obsolete').map(v => v.form)).toEqual(['ฦ', 'ฦๅ']);
  });

  test('the five tones, in order, and all five said in a row', () => {
    expect(DATA.tones.map(t => t.id)).toEqual(TONES);
    expect(DATA.tones.map(t => t.mark).join(' ')).toBe('a à â á ǎ');
    for (const t of DATA.tones) expect(toneOf(t.rom), t.id).toBe(t.id);
    expect(DATA.tone_series.say).toBe(DATA.tones.map(t => t.say).join(' '));
    expect(DATA.tone_series.rom).toBe(DATA.tones.map(t => t.rom).join(' '));
  });

  // The whole project folder is published, so this covers the docs and the
  // tests too. The learner's lessons stay private: the site never mentions
  // whose workbook or voice it learned from. (This file is skipped: it has to
  // name what it looks for.)
  test('nothing published mentions whose lessons Logos learned from', () => {
    const MY = new RegExp(['my', 'teacher'].join('\\s+'), 'i');
    const THEIRS = new RegExp(`teacher(['’]s)?\\s+(workbook|recordings?|voice)`, 'i');
    const LOGOS = /teacher|อาจารย์|คุณครู/i;
    const logosFiles = new Set(['logos.html', 'about-logos.html', 'logos/thai.json', 'assets/logos.js', 'docs/explained/logos-thai-cards.md', 'docs/explained/logos-vowels-and-tones.md', 'functions/scripts/record-logos.js']);
    const found = [];
    const walk = dir => {
      for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, f.name);
        if (f.isDirectory()) { if (!['.git', 'node_modules', 'test-results', '.claude'].includes(f.name)) walk(rel); continue; }
        if (!/\.(html|js|json|md|xml|txt|svg)$/.test(f.name) || rel === path.join('tests', 'logos.spec.js')) continue;
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (MY.test(text) || THEIRS.test(text) || (logosFiles.has(rel) && LOGOS.test(text))) found.push(rel);
      }
    };
    walk('');
    expect(found).toEqual([]);
  });

  test('every sound is there, and no recording is left over', () => {
    const files = [
      DATA.tone_series.audio,
      ...DATA.tones.map(t => t.audio),
      ...DATA.consonants.flatMap(c => [c.audio, ...c.tones.map(r => r.audio)]),
      ...DATA.vowels.flatMap(v => [v.audio, ...(v.word ? [v.word_audio] : [])]),
    ];
    for (const f of files) {
      expect(f).toMatch(/^th\/[a-z0-9-]+-[0-9a-f]{10}\.mp3$/);
      expect(fs.existsSync(path.join(ROOT, 'logos', 'audio', f)), f).toBe(true);
    }
    const used = new Set(files);
    const onDisk = fs.readdirSync(path.join(ROOT, 'logos', 'audio', 'th')).map(f => `th/${f}`);
    expect(onDisk.filter(f => !used.has(f))).toEqual([]);
  });

  test('the old card trainer forwards to the Logos page', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'staticwebapp.config.json'), 'utf8'));
    expect(config.routes).toContainEqual({ route: '/cards.html', redirect: '/logos.html', statusCode: 301 });
    expect(fs.existsSync(path.join(ROOT, 'cards.html'))).toBe(false);
  });
});

test.describe('logos cards', () => {
  test('the five tones, each class and the vowels, closed until opened', async ({ page }) => {
    const errors = watchErrors(page);
    await openLogos(page);
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText('Cards');
    const folds = page.locator('#p-cards .fold');
    await expect(folds).toHaveCount(5);
    await expect(page.locator('#p-cards .fold[open]')).toHaveCount(0);
    await expect(folds.locator('.ftitle')).toHaveText(['The five tones', 'Middle class9 letters', 'High class11 letters', 'Low class24 letters', 'Vowels32 vowels']);
    await expect(page.locator('#sec-middle .letters')).toHaveText('ก จ ฎ ฏ ด ต บ ป อ');

    // Open, the section's title bar is pinned to the top while its cards scroll.
    await page.locator('#sec-middle > summary').click();
    await expect(page.locator('#sec-middle')).toHaveAttribute('open', '');
    await expect(page.locator('#sec-middle .item')).toHaveCount(9);
    expect(await page.locator('#sec-middle > summary').evaluate(e => getComputedStyle(e).position)).toBe('sticky');
    expect(errors).toEqual([]);
  });

  test('a consonant turns over to its word, and its name and tones play', async ({ page }) => {
    const errors = watchErrors(page);
    await openLogos(page);
    const ko = consonant('ko-kai');
    await page.locator('#sec-middle > summary').click();
    const item = page.locator('#sec-middle .item').first();
    await expect(item.locator('.front .symbol')).toHaveText('ก');
    await expect(item.locator('.front .meta')).toContainText('1 / 9');
    await expect(item.locator('.extras')).toBeHidden();

    await item.locator('.card').click();
    const back = item.locator('.back');
    await expect(back).toBeVisible();
    for (const text of ['Middle class', 'gaw', 'ไก่', 'gài', 'chicken']) await expect(back).toContainText(text);
    await expect(item.locator('.card')).toHaveAttribute('aria-pressed', 'true');

    const extras = item.locator('.extras');
    await expect(extras).toBeVisible();
    await expect(extras.locator('.sayrow')).toContainText('ก ไก่');
    await extras.locator('.sayrow .play').click();
    await expect.poll(() => lastPlayed(page)).toBe(url(ko.audio));
    await expect(extras.locator('.tone')).toHaveCount(2);
    await expect(extras.locator('.tone').nth(0)).toContainText('Mid');
    await expect(extras.locator('.tone').nth(1)).toContainText('Low');
    await expect(extras.locator('.tone').nth(1)).toContainText('gài');
    await extras.locator('.tone').nth(1).locator('.play').click();
    await expect.poll(() => lastPlayed(page)).toBe(url(ko.tones[1].audio));

    await extras.locator('.back-link').click();
    await expect(item.locator('.front')).toBeVisible();
    await expect(extras).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the five tones: all in a row, then one by one', async ({ page }) => {
    await openLogos(page);
    await page.locator('#sec-tones > summary').click();
    const rows = page.locator('#sec-tones .tone');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText('Mid');
    await expect(rows.nth(0)).toContainText('สามัญ');
    await expect(rows.nth(4)).toContainText('Rising');
    await page.locator('#sec-tones .series .play').click();
    await expect.poll(() => lastPlayed(page)).toBe(url(DATA.tone_series.audio));
    for (let i = 0; i < 5; i++) {
      await rows.nth(i).locator('.play').click();
      await expect.poll(() => lastPlayed(page)).toBe(url(DATA.tones[i].audio));
    }
  });

  test('a vowel turns over to its sound, length, partner and word', async ({ page }) => {
    await openLogos(page);
    await page.locator('#sec-vowels > summary').click();
    const items = page.locator('#sec-vowels .item');
    await expect(items).toHaveCount(32);
    await expect(items.nth(0).locator('.front .symbol')).toHaveText('-ะ');
    // A mark that sits on the consonant is shown without the dash.
    await expect(items.nth(2).locator('.front .symbol')).toHaveText('ิ');

    const a = vowel('ah-short');
    await items.nth(0).locator('.card').click();
    const back = items.nth(0).locator('.back');
    for (const text of ['Short vowel', 'ah', 'short', '-า', 'จะ', 'jà', 'will']) await expect(back).toContainText(text);
    const rows = items.nth(0).locator('.extras .sayrow');
    await expect(rows).toHaveCount(2);
    await rows.nth(0).locator('.play').click();
    await expect.poll(() => lastPlayed(page)).toBe(url(a.audio));
    await rows.nth(1).locator('.play').click();
    await expect.poll(() => lastPlayed(page)).toBe(url(a.word_audio));

    const am = DATA.vowels.findIndex(v => v.id === 'am');
    await items.nth(am).locator('.card').click();
    await expect(items.nth(am).locator('.back')).toContainText('sounds short · counts as long');
  });

  test('without a recording, the device voice says the words', async ({ page }) => {
    await page.route('**/logos/thai.json', async route => {
      const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'logos', 'thai.json'), 'utf8'));
      for (const c of data.consonants) delete c.audio;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await openLogos(page);
    await page.locator('#sec-middle > summary').click();
    await page.locator('#sec-middle .card').first().click();
    await page.locator('#sec-middle .extras .sayrow .play').first().click();
    await expect.poll(() => page.evaluate(() => window.__said)).toEqual(['กอ ไก่']);
  });
});

test.describe('logos alphabet', () => {
  test('consonants in ก–ฮ order, vowels in chart order, no sounds', async ({ page }) => {
    await openLogos(page);
    await page.getByRole('tab', { name: 'Alphabet' }).click();
    await expect(page).toHaveURL(/#alphabet$/);
    const consonants = page.locator('#abc-c .front .symbol');
    await expect(consonants).toHaveCount(44);
    expect((await consonants.allTextContents()).join('')).toBe(ALPHABET);
    await expect(page.locator('#p-abc .play')).toHaveCount(0);

    await page.locator('[data-abc="v"]').click();
    await expect(page.locator('#abc-c')).toBeHidden();
    const vowels = page.locator('#abc-v .front .symbol');
    await expect(vowels).toHaveCount(32);
    const byChart = DATA.vowels.slice().sort((a, b) => a.chart - b.chart).map(v => shown(v.form));
    expect(await vowels.allTextContents()).toEqual(byChart);
    await page.locator('#abc-v .card').first().click();
    await expect(page.locator('#abc-v .back').first()).toContainText('ah');
  });
});

test.describe('logos practice', () => {
  test('Know it and Revisit, round by round, to the finish; marks are kept', async ({ page }) => {
    const errors = watchErrors(page);
    await openLogos(page, '#practice');
    await expect(page.locator('[data-mode="flip"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-deck="c"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-filter="middle"]').click();
    const stats = page.locator('.pstats');
    await expect(stats.locator('.pround')).toHaveText('Round 1 of 4');
    await expect(stats).toContainText('New9');

    // The first card is revisited; the other eight are known.
    const first = await page.locator('.pc').getAttribute('data-id');
    await page.locator('[data-mark="again"]').click();
    for (let i = 0; i < 8; i++) {
      await expect(page.locator('.pc')).not.toHaveAttribute('data-id', first);
      await page.locator('[data-mark="known"]').click();
    }
    await expect(stats.locator('.pround')).toHaveText('Round 2 of 4');
    await expect(page.locator('.pc')).toHaveAttribute('data-id', first);
    for (const round of [3, 4]) {
      await page.locator('[data-mark="again"]').click();
      await expect(stats.locator('.pround')).toHaveText(`Round ${round} of 4`);
    }
    await page.locator('[data-mark="again"]').click();
    await expect(stats.locator('.pround')).toHaveText('Finished');
    await expect(stats).toContainText('Known8');
    await expect(stats).toContainText('Revisit1');
    await expect(page.locator('.pdone')).toContainText('You’ve been through every card.');
    await expect(page.locator('.pdone .lc')).toHaveText(consonant(first).letter);

    // Kept on this device: still finished after a reload.
    await page.reload();
    await expect(page.locator('[data-filter="middle"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pstats .pround')).toHaveText('Finished');
    await page.locator('[data-filter="all"]').click();
    await expect(page.locator('.pstats')).toContainText('New35');

    // The vowels keep their own marks.
    await page.locator('[data-deck="v"]').click();
    await expect(page.locator('#pfilters')).toBeHidden();
    await expect(page.locator('.pstats')).toContainText('New32');
    await page.locator('[data-mark="known"]').click();
    await page.locator('[data-deck="c"]').click();

    // Reset asks first, then clears this deck only.
    await page.locator('#resetq').click();
    await expect(page.locator('#confirm')).toContainText('Erase your marks?');
    await page.locator('#reset-no').click();
    await expect(page.locator('.pstats')).toContainText('New35');
    await page.locator('#resetq').click();
    await page.locator('#reset-yes').click();
    await expect(page.locator('.pstats')).toContainText('New44');
    await page.locator('[data-deck="v"]').click();
    await expect(page.locator('.pstats')).toContainText('New31');
    expect(errors).toEqual([]);
  });

  test('a turned practice card plays its sound', async ({ page }) => {
    await openLogos(page, '#practice');
    const id = await page.locator('.pc').getAttribute('data-id');
    await expect(page.locator('.pextra')).toBeHidden();
    await page.locator('.pin').click();
    await expect(page.locator('.pextra')).toBeVisible();
    await page.locator('.pextra .play').click();
    await expect.poll(() => lastPlayed(page)).toBe(url(consonant(id).audio));
  });

  test('Listen & pick: hear a sound, pick what says it; ten questions, then a score', async ({ page }) => {
    const errors = watchErrors(page);
    await openLogos(page, '#practice');
    await page.locator('[data-mode="pick"]').click();
    await expect(page.locator('#pstage .status')).toHaveText('10 questions');
    await page.locator('#pick-start').click();
    for (let q = 1; q <= 10; q++) {
      await expect(page.locator('#pick-said')).toHaveText(`Question ${q} of 10`);
      await expect(page.locator('.choice')).toHaveCount(4);
      await expect.poll(async () => (await played(page)).length).toBe(q);
      const heard = await lastPlayed(page);
      const answer = DATA.consonants.find(c => url(c.audio) === heard);
      expect(answer, `played ${heard}`).toBeTruthy();
      expect(answer.use).not.toBe('obsolete');
      await page.locator(`.choice[data-id="${answer.id}"]`).click();
      await expect(page.locator(`.choice[data-id="${answer.id}"]`)).toHaveClass(/right/);
      await expect(page.locator('#pick-said')).toContainText(answer.word);
      await page.locator('#pick-next').click();
    }
    await expect(page.locator('.pscore')).toHaveText('10 of 10 right');
    expect(errors).toEqual([]);
  });

  test('Listen & pick with vowels always offers the short or long partner', async ({ page }) => {
    await openLogos(page, '#practice');
    await page.locator('[data-mode="pick"]').click();
    await page.locator('[data-deck="v"]').click();
    await page.locator('#pick-start').click();
    for (let q = 1; q <= 3; q++) {
      await expect.poll(async () => (await played(page)).length).toBe(q);
      const heard = await lastPlayed(page);
      const answer = DATA.vowels.find(v => url(v.audio) === heard);
      expect(answer, `played ${heard}`).toBeTruthy();
      const ids = await page.locator('.choice').evaluateAll(els => els.map(e => e.dataset.id));
      if (answer.partner && vowel(answer.partner).use !== 'obsolete') expect(ids).toContain(answer.partner);
      await page.locator(`.choice[data-id="${answer.id}"]`).click();
      await page.locator('#pick-next').click();
    }
  });
});

test.describe('logos layout', () => {
  // Thai letters reach below the line (ฎ ฏ ฐ ญ) and words carry marks above
  // it (ผู้หญิง), further than an ordinary line of text allows for. The ink
  // each letter really covers, measured in the page's own font, must stay
  // inside its card and clear of the text under it, on both faces.
  test('no letter, vowel or word is drawn over the text beneath it', async ({ page }) => {
    await openLogos(page, '#alphabet');
    const clashes = await page.evaluate(() => {
      const ink = (el, below, card) => {
        const cs = getComputedStyle(el);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = ctx.measureText(el.textContent);
        const box = el.getBoundingClientRect();
        const baseline = box.top + (parseFloat(cs.lineHeight) - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
        const top = baseline - m.actualBoundingBoxAscent, bottom = baseline + m.actualBoundingBoxDescent;
        const next = below.getBoundingClientRect().top, edge = card.getBoundingClientRect().top;
        return bottom > next || top < edge ? `${el.textContent}: ink ${top.toFixed(0)}–${bottom.toFixed(0)}, next at ${next.toFixed(0)}` : null;
      };
      const out = [];
      for (const item of document.querySelectorAll('#p-abc .item')) {
        const card = item.querySelector('.card');
        const front = item.querySelector('.front'), back = item.querySelector('.back');
        item.closest('ol').hidden = false;
        front.hidden = false; back.hidden = true;
        out.push(ink(front.querySelector('.symbol'), front.querySelector('.hint'), front));
        front.hidden = true; back.hidden = false;
        const word = back.querySelector('.th');
        if (word) out.push(ink(word, back.querySelector('.wr'), back));
        const form = back.querySelector('.vsym');
        if (form) out.push(ink(form, back.querySelector('.roman'), back));
        front.hidden = false; back.hidden = true;
        void card.offsetHeight;
      }
      return out.filter(Boolean);
    });
    expect(clashes).toEqual([]);
  });

  test('text stays readable on a phone (14px and up), and nothing spills sideways', async ({ page }) => {
    await openLogos(page);
    const small = () => page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
      .filter(e => parseFloat(getComputedStyle(e).fontSize) < 14)
      .map(e => `${e.tagName}.${e.className}: ${getComputedStyle(e).fontSize}`));
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const width of [320, 375, 390, 440]) {
      await page.setViewportSize({ width, height: 780 });
      await page.getByRole('tab', { name: 'Cards' }).click();
      for (const id of ['tones', 'middle', 'vowels']) {
        const fold = page.locator(`#sec-${id}`);
        if (!(await fold.evaluate(d => d.open))) await fold.locator('> summary').click();
      }
      await page.locator('#sec-middle .card').first().click();
      await page.locator('#sec-vowels .card').nth(20).click();
      expect(await small(), `cards at ${width}`).toEqual([]);
      expect(await overflow(), `cards at ${width}`).toBeLessThanOrEqual(1);
      await page.getByRole('tab', { name: 'Practice' }).click();
      await page.locator('.pin').click();
      expect(await small(), `practice at ${width}`).toEqual([]);
      expect(await overflow(), `practice at ${width}`).toBeLessThanOrEqual(1);
      await page.locator('[data-mode="pick"]').click();
      await page.locator('#pick-start').click();
      expect(await overflow(), `listen & pick at ${width}`).toBeLessThanOrEqual(1);
      await page.locator('[data-mode="flip"]').click();
    }
    await page.goto('/about-logos.html');
    expect(await small(), 'about').toEqual([]);
  });
});
