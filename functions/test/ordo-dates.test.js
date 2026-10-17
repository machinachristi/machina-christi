const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { feastDates, bundledFeastDates, ordoDayFor } = require('../src/lib/ordo-dates');

const dates = feastDates([
  { '2026-10-04': { name: 'Twenty-seventh Sunday in Ordinary Time' }, '2026-01-21': { name: 'Saint Agnes, Virgin and Martyr' } },
  { '2027-10-04': { name: 'Saint Francis of Assisi' }, '2027-01-21': { name: 'Saint Agnes, Virgin and Martyr' } },
]);

test('the next date the feast is celebrated, from today on', () => {
  assert.deepEqual(ordoDayFor('Saint Agnes, Virgin and Martyr', '2026-01-21', dates), { date: '2026-01-21', url: '/ordo.html?date=2026-01-21' });
  assert.equal(ordoDayFor('Saint Agnes, Virgin and Martyr', '2026-10-17', dates).date, '2027-01-21');
});

test('a feast outranked this year (a Sunday) points to the year it is kept', () => {
  assert.equal(ordoDayFor('Saint Francis of Assisi', '2026-10-01', dates).date, '2027-10-04');
});

test('when every date has passed, the latest one; an unknown feast, nothing', () => {
  assert.equal(ordoDayFor('Saint Agnes, Virgin and Martyr', '2028-06-01', dates).date, '2027-01-21');
  assert.equal(ordoDayFor('Saint Nobody', '2026-10-17', dates), null);
});

// With the real calendars the API ships (npm test copies them in first): every
// saint the site has a bio for opens an Ordo day that actually shows them.
test('every saint with a bio opens an Ordo day whose celebration is that feast', () => {
  const bundled = bundledFeastDates();
  const calendars = new Map();
  const dayOf = date => {
    const year = date.slice(0, 4);
    if (!calendars.has(year)) calendars.set(year, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', `calendar-${year}.json`), 'utf8')));
    return calendars.get(year)[date];
  };
  const saints = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ordo', 'saints.json'), 'utf8')));
  const missing = [];
  for (const name of saints) {
    const day = ordoDayFor(name, '2026-01-01', bundled);
    if (!day) missing.push(name);
    else assert.equal(dayOf(day.date).name, name);
  }
  assert.deepEqual(missing, [], 'feasts in no bundled calendar');
});
