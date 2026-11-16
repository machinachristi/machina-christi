// Ordo as a daily page: the feast, the Gospel itself, the saint, and a prayer
// for the day.
//
// Two kinds of check live here. The first reads the bundled data straight off
// the disk (no browser): every day of every year has a Gospel, the words for
// it exist, and the committed table is exactly what the build script makes.
// The second opens the page on a phone-sized screen and reads it as a visitor
// would.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const ORDO = path.join(ROOT, 'ordo');
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const YEARS = fs.readdirSync(ORDO).map(f => (f.match(/^calendar-(\d{4})\.json$/) || [])[1]).filter(Boolean);

test.describe('the Gospel table', () => {
  test('every day of every bundled year has a Gospel whose words are bundled too', () => {
    expect(YEARS.length).toBeGreaterThan(0);
    for (const year of YEARS) {
      const calendar = json(path.join(ORDO, `calendar-${year}.json`));
      const gospels = json(path.join(ORDO, `gospel-${year}.json`));
      expect(Object.keys(gospels), year).toEqual(Object.keys(calendar));
      for (const [date, g] of Object.entries(gospels)) {
        expect(g.r, date).toMatch(/^(Matthew|Mark|Luke|John) \d+:\d+/);
        expect(g.s.length, date).toBeGreaterThan(0);
        for (const [chapter, from, to] of g.s) {
          const verses = json(path.join(ORDO, 'gospel', `${g.b}-${chapter}.json`));
          expect(from, date).toBeGreaterThanOrEqual(1);
          expect(to, date).toBeGreaterThanOrEqual(from);
          expect(to, date).toBeLessThanOrEqual(verses.length);
          expect(verses.slice(from - 1, to).join('').length, date).toBeGreaterThan(20);
        }
      }
    }
  });

  test('the committed table is exactly what the build script makes', async () => {
    const { buildYear } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'build-gospel-table.mjs')).href);
    for (const year of YEARS) {
      expect(buildYear(Number(year)), year).toEqual(json(path.join(ORDO, `gospel-${year}.json`)));
    }
  });

  // A handful of days checked by hand against a printed calendar, feasts and
  // awkward corners included, so a slip in the counting shows up by name.
  const KNOWN = {
    '2026-01-05': 'John 1:43–51',                 // before the Epiphany (6 January here)
    '2026-01-07': 'Matthew 4:12–17, 23–25',       // after it
    '2026-02-18': 'Matthew 6:1–6, 16–18',         // Ash Wednesday
    '2026-03-19': 'Matthew 1:16, 18–21, 24',      // Saint Joseph
    '2026-03-29': 'Matthew 26:14–27:66',          // Palm Sunday, year A
    '2026-04-05': 'John 20:1–9',                  // Easter Sunday
    '2026-04-27': 'John 10:11–18',                // a weekday that changes in year A
    '2026-05-24': 'John 20:19–23',                // Pentecost
    '2026-06-04': 'John 6:51–58',                 // Corpus Christi, on its Thursday
    '2026-08-15': 'Luke 1:39–56',                 // the Assumption
    '2026-09-15': 'John 19:25–27',                // a memorial with its own Gospel
    '2026-11-10': 'Luke 17:7–10',                 // a memorial that keeps the weekday's
    '2026-11-14': 'Luke 18:1–8',                  // a plain Saturday
    '2026-11-22': 'Matthew 25:31–46',             // Christ the King, year A
    '2026-11-29': 'Mark 13:33–37',                // Advent begins: year B
    '2026-12-17': 'Matthew 1:1–17',               // 17–24 December go by date
    '2026-12-25': 'John 1:1–18',                  // Christmas Day
    '2027-02-22': 'Matthew 16:13–19',             // a feast falling in Lent
    '2027-04-05': 'Luke 1:26–38',                 // the Annunciation, moved out of Holy Week
    '2027-04-19': 'John 10:1–10',                 // the same weekday as above, not year A
    '2027-11-29': 'Matthew 8:5–11',               // late November is Advent, not "29 December"
  };
  test('known days read what the printed calendar says', () => {
    for (const [date, ref] of Object.entries(KNOWN)) {
      expect(json(path.join(ORDO, `gospel-${date.slice(0, 4)}.json`))[date].r, date).toBe(ref);
    }
  });
});

test.describe('the page', () => {
  const errorsOf = page => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    return errors;
  };

  test('a plain day shows the Gospel\'s opening, and the whole of it on request', async ({ page }) => {
    const errors = errorsOf(page);
    await page.goto('/ordo.html?date=2026-11-14');
    await expect(page.locator('.celebration').first()).toHaveText('Saturday of the 32nd Week of Ordinary Time');
    await expect(page.locator('.gospel-ref')).toHaveText('The Gospel · Luke 18:1–8');

    const text = page.locator('#gospel blockquote');
    await expect(text).toContainText('we ought always to pray and not to faint');
    await expect(text).toContainText(/…$/);
    await expect(text).not.toContainText('faith on earth');

    const more = page.locator('#gospel .more');
    await expect(more).toHaveText('Read the whole Gospel ›');
    await more.click();
    await expect(text).toContainText('shall he find, think you, faith on earth?');
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await more.click();
    await expect(text).not.toContainText('faith on earth');

    // The translation is named, and the modern readings are one tap away.
    await expect(page.locator('#gospel .attribution')).toContainText('Douay-Rheims Bible');
    await expect(page.locator('#gospel .attribution a[href*="bible.usccb.org/bible/readings/111426.cfm"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a reading that skips verses is set as separate paragraphs', async ({ page }) => {
    await page.goto('/ordo.html?date=2026-01-07');
    await expect(page.locator('.gospel-ref')).toHaveText('The Gospel · Matthew 4:12–17, 23–25');
    await page.locator('#gospel .more').click();
    await expect(page.locator('#gospel blockquote p')).toHaveCount(2);
    await expect(page.locator('#gospel blockquote p').nth(1)).toContainText('And Jesus went about all Galilee');
  });

  test('a feast shows its own Gospel, its note, and a prayer that fits it', async ({ page }) => {
    await page.goto('/ordo.html?date=2026-03-29');
    await expect(page.locator('.gospel-ref')).toHaveText('The Gospel · Matthew 26:14–27:66');
    await expect(page.locator('.gospel-note')).toHaveText('The Passion of the Lord');

    await page.goto('/ordo.html?date=2026-09-15');
    await expect(page.locator('.gospel-ref')).toHaveText('The Gospel · John 19:25–27');
    await expect(page.locator('#gospel blockquote')).toContainText('Woman, behold thy son');
    await expect(page.locator('.prayer-card')).toHaveAttribute('href', 'prayer.html?p=hail-holy-queen');
    await expect(page.locator('.prayer-why')).toContainText('A day of Our Lady');
  });

  test('the prayer card follows the day and leads to the prayer', async ({ page }) => {
    await page.goto('/ordo.html?date=2026-11-14');
    const card = page.locator('.prayer-card');
    await expect(page.locator('.prayer-label')).toHaveText('A prayer for the day');
    await expect(card).toHaveAttribute('href', 'prayer.html?p=hail-mary');
    await expect(card.locator('.prayer-title')).toHaveText('The Hail Mary');
    await expect(card.locator('.prayer-th')).toHaveText('บทวันทามารีย์');
    await expect(card.locator('.prayer-why')).toContainText('Saturday is Our Lady’s day');

    // Stepping a day changes all three: the day, its Gospel, its prayer.
    await page.locator('#next-day').click();
    await expect(page.locator('.gospel-ref')).toHaveText('The Gospel · Matthew 25:14–30');
    await expect(card).toHaveAttribute('href', 'prayer.html?p=glory-be');

    await card.click();
    await expect(page).toHaveURL(/prayer\.html\?p=glory-be$/);
    await expect(page.locator('h1')).toContainText('Glory Be');
  });

  test('the prayer rule names only prayers that exist, by their real titles', async ({ page }) => {
    await page.goto('/ordo.html?date=2026-11-14');
    await expect(page.locator('.prayer-card')).toBeVisible();
    const named = await page.evaluate(() => window.mcTodayPrayer.prayers);
    const real = Object.fromEntries(json(path.join(ROOT, 'pray', 'prayers.json')).prayers.map(p => [p.id, p]));
    for (const [id, [title, titleTh]] of Object.entries(named)) {
      expect(real[id], id).toBeTruthy();
      expect(real[id].listed, id).not.toBe(false);     // only prayers with a page of their own
      expect(title, id).toBe(real[id].title);
      expect(titleTh, id).toBe(real[id].title_th);
    }
    // Every day of the week lands on one of them; Saint Joseph, "Husband of
    // the Blessed Virgin Mary", is not mistaken for a feast of Our Lady.
    const picks = await page.evaluate(() => {
      const week = [...Array(7)].map((_, i) => window.mcTodayPrayer(new Date(2026, 10, 15 + i)).id);
      return {
        week,
        joseph: window.mcTodayPrayer(new Date(2026, 2, 19), 'Saint Joseph Husband of the Blessed Virgin Mary').id,
        assumption: window.mcTodayPrayer(new Date(2026, 7, 15), 'The Assumption of the Blessed Virgin Mary').id,
        angels: window.mcTodayPrayer(new Date(2026, 9, 2), 'The Holy Guardian Angels').id,
        mercy: window.mcTodayPrayer(new Date(2026, 3, 12), 'Second Sunday of Easter or Divine Mercy Sunday').id,
      };
    });
    expect(picks.week).toEqual(['glory-be', 'our-father', 'angel-of-god', 'apostles-creed', 'mass', 'o-blood-and-water', 'hail-mary']);
    expect(picks.joseph).toBe('mass');
    expect(picks.assumption).toBe('hail-holy-queen');
    expect(picks.angels).toBe('angel-of-god');
    expect(picks.mercy).toBe('o-blood-and-water');
  });

  test('the new words are big enough to read and the button big enough to tap', async ({ page }) => {
    await page.goto('/ordo.html?date=2026-11-14');
    await expect(page.locator('.prayer-card')).toBeVisible();
    await expect(page.locator('#gospel blockquote')).toBeVisible();
    const px = sel => page.locator(sel).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    for (const sel of ['.gospel-ref', '#gospel .attribution', '.prayer-label', '.prayer-title']) expect(await px(sel), sel).toBeGreaterThanOrEqual(13);
    for (const sel of ['#gospel blockquote', '#gospel .more', '.prayer-why', '.prayer-th']) expect(await px(sel), sel).toBeGreaterThanOrEqual(14);
    expect((await page.locator('#gospel .more').boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await page.locator('.prayer-card').boundingBox()).height).toBeGreaterThanOrEqual(44);
    // Nothing spills past the edge of a phone screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('if the Gospel table can\'t be had, the link out is still there', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/ordo/gospel-2026.json', route => route.abort());
    await page.goto('/ordo.html?date=2026-11-14');
    await expect(page.locator('#gospel a.enter')).toHaveAttribute('href', 'https://bible.usccb.org/bible/readings/111426.cfm');
    await expect(page.locator('.prayer-card')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('if only the words fail to load, the reference and a way to read it remain', async ({ page }) => {
    await page.route('**/ordo/gospel/lk-18.json', route => route.abort());
    await page.goto('/ordo.html?date=2026-11-14');
    await expect(page.locator('.gospel-ref')).toHaveText('The Gospel · Luke 18:1–8');
    await expect(page.locator('#gospel .notice a')).toHaveAttribute('href', 'https://bible.usccb.org/bible/readings/111426.cfm');
  });
});
