const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { easter, seasonFor } = require('../src/lib/season');
const { season } = require('../src/functions/season');

const iso = d => d.toISOString().slice(0, 10);

// The handler only reads request.query, a URLSearchParams.
const get = qs => season({ query: new URLSearchParams(qs) });

test('Easter falls on the known dates, including the earliest and latest possible', () => {
  const known = {
    2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28',
    2000: '2000-04-23', 1818: '1818-03-22', 2285: '2285-03-22', 2038: '2038-04-25',
  };
  for (const [year, date] of Object.entries(known)) assert.equal(iso(easter(Number(year))), date, year);
});

test('season boundaries land on the right days', () => {
  const cases = [
    ['2025-11-29', 'ordinary', 34], ['2025-11-30', 'advent', 1],
    ['2025-12-24', 'advent', 4], ['2025-12-25', 'christmas', null],
    ['2026-01-11', 'christmas', null], ['2026-01-12', 'ordinary', 1], ['2026-01-18', 'ordinary', 2],
    ['2026-02-17', 'ordinary', 6], ['2026-02-18', 'lent', 0], ['2026-02-22', 'lent', 1],
    ['2026-04-01', 'lent', 6], ['2026-04-02', 'triduum', null], ['2026-04-04', 'triduum', null],
    ['2026-04-05', 'easter', 1], ['2026-05-24', 'easter', 8], ['2026-05-25', 'ordinary', 8],
    ['2026-11-22', 'ordinary', 34], ['2026-11-29', 'advent', 1],
    // A year when Epiphany is a Sunday: the Baptism is the following Sunday.
    ['2030-01-13', 'christmas', null], ['2030-01-14', 'ordinary', 1],
  ];
  for (const [date, key, week] of cases) {
    const s = seasonFor(date);
    assert.deepEqual([s.key, s.week], [key, week], date);
  }
});

test('rose, red and white days within the seasons', () => {
  assert.equal(seasonFor('2025-12-14').color, 'rose'); // Gaudete
  assert.equal(seasonFor('2026-03-15').color, 'rose'); // Laetare
  assert.equal(seasonFor('2026-04-03').color, 'red'); // Good Friday
  assert.equal(seasonFor('2026-05-24').color, 'red'); // Pentecost
  assert.equal(seasonFor('2026-04-05').color, 'white');
  assert.equal(seasonFor('2026-10-13').color, 'green');
  assert.equal(seasonFor('2026-12-01').color, 'violet');
});

// The answer key: litcal's own season label and weekday names for every day
// the Ordo calendar covers (ordo/calendar-*.json, see scripts/fetch-calendar.mjs).
const LITCAL_SEASON = {
  ADVENT: 'advent', CHRISTMAS: 'christmas', LENT: 'lent',
  EASTER_TRIDUUM: 'triduum', EASTER: 'easter', ORDINARY_TIME: 'ordinary',
};
const ORDINALS = { First: 1, Second: 2, Third: 3, Fourth: 4, Fifth: 5, Sixth: 6, Seventh: 7 };
const ordo = path.join(__dirname, '..', '..', 'ordo');
const calendarFiles = fs.readdirSync(ordo).filter(f => /^calendar-\d{4}\.json$/.test(f));

test('the season matches litcal on every day of every Ordo calendar year', () => {
  assert.ok(calendarFiles.length >= 2, 'expected the Ordo calendar files');
  let checked = 0;
  for (const f of calendarFiles) {
    const days = JSON.parse(fs.readFileSync(path.join(ordo, f), 'utf8'));
    for (const [date, day] of Object.entries(days)) {
      // Holy Thursday's top entry is the morning Chrism Mass, which litcal
      // files under Lent; the API counts the whole day as the Triduum.
      if (day.name === 'Chrism Mass') {
        assert.equal(seasonFor(date).key, 'triduum', date);
        continue;
      }
      assert.equal(seasonFor(date).key, LITCAL_SEASON[day.season], `${date} ${day.name}`);
      checked++;
    }
  }
  assert.ok(checked >= 700, `checked ${checked} days`);
});

test('the week number matches every weekday and Sunday litcal names', () => {
  let checked = 0;
  for (const f of calendarFiles) {
    const days = JSON.parse(fs.readFileSync(path.join(ordo, f), 'utf8'));
    for (const [date, day] of Object.entries(days)) {
      for (const name of [day.name, day.weekday_name]) {
        // "Tuesday of the 28th Week of Ordinary Time", "Monday of Holy Week"...
        let m = name && name.match(/of the (\d+)\w* Week of (Advent|Lent|Easter|Ordinary Time)/);
        // ..."28th Sunday of Ordinary Time", "Third Sunday of Advent (Gaudete)"
        m ??= name && name.match(/^(\d+)\w* Sunday of (Advent|Lent|Easter|Ordinary Time)/);
        const word = name && name.match(/^(First|Second|Third|Fourth|Fifth|Sixth|Seventh) Sunday of (Advent|Lent|Easter)/);
        const week = m ? Number(m[1]) : word ? ORDINALS[word[1]] : null;
        if (week === null) continue;
        // litcal numbers Easter Sundays from the 2nd (Easter Day itself is
        // the 1st), which is the same count as the week of the season.
        assert.equal(seasonFor(date).week, week, `${date} ${name}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 300, `checked ${checked} named days`);
});

test('/api/season: an ordinary weekday', async () => {
  const res = await get('date=2026-10-13');
  assert.equal(res.status, 200);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=86400');
  assert.deepEqual(res.jsonBody, {
    date: '2026-10-13',
    season: { key: 'ordinary', name: 'Ordinary Time', week: 28 },
    celebration: null,
    color: 'green',
  });
});

test('/api/season: a feast takes over the day and its colour', async () => {
  const { jsonBody } = await get('date=2026-10-15'); // St Teresa of Ávila, memorial
  assert.match(jsonBody.celebration.name, /Teresa of Jesus/);
  assert.equal(jsonBody.celebration.optional, false);
  assert.equal(jsonBody.color, 'white');
  assert.equal((await get('date=2026-11-30')).jsonBody.color, 'red'); // St Andrew in Advent
  assert.equal((await get('date=2026-03-29')).jsonBody.color, 'red'); // Palm Sunday
});

test('/api/season: an optional memorial leaves the season colour', async () => {
  const { jsonBody } = await get('date=2026-01-03'); // Most Holy Name of Jesus
  assert.equal(jsonBody.celebration.optional, true);
  assert.equal(jsonBody.color, 'white'); // Christmas season
  const lent = (await get('date=2026-03-17')).jsonBody; // St Patrick, a commemoration in Lent
  assert.equal(lent.celebration.optional, true);
  assert.equal(lent.color, 'violet');
});

test('/api/season: a year without calendar data still gets its season', async () => {
  const { status, jsonBody } = await get('date=2040-12-25');
  assert.equal(status, 200);
  assert.equal(jsonBody.celebration, null);
  assert.deepEqual([jsonBody.season.key, jsonBody.color], ['christmas', 'white']);
});

test('/api/season: no date means today (UTC), kept only briefly', async () => {
  const res = await get('');
  assert.equal(res.status, 200);
  assert.equal(res.jsonBody.date, new Date().toISOString().slice(0, 10));
  assert.equal(res.headers['Cache-Control'], 'public, max-age=300');
});

test('/api/season: rejects anything that is not a real date', async () => {
  for (const bad of ['2026-02-30', '2026-13-01', '26-10-13', '2026-10-13T00:00', 'today', '1200-01-01', '<script>']) {
    const res = await get(`date=${encodeURIComponent(bad)}`);
    assert.equal(res.status, 400, bad);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});
