const fs = require('node:fs');
const path = require('node:path');
const { app } = require('@azure/functions');
const { seasonFor } = require('../lib/season');
const { saintFor } = require('../lib/snapshot');
const { readSnapshot } = require('../lib/snapshot-store');

// GET /api/season?date=YYYY-MM-DD: the liturgical season, the day's
// celebration (when the Ordo calendar covers that year) and the day's colour.
// The caller sends its own local date, so "today" is the visitor's today,
// wherever they are. Answers for a given date never change, so they're
// cacheable: Cloudflare keeps each date at the edge (query string is part of
// the cache key) and most visits never reach this function.
//
// The day's saint comes from the saints snapshot the publish job stores
// (publish-saints.js), never from the database itself. If the snapshot can't
// be read, the site's own bios (ordo/saints.json, bundled) answer instead.

const DATA_DIR = path.join(__dirname, '..', 'data');
const calendars = new Map();

// The Ordo page's own calendar files, copied in by scripts/copy-calendar.js.
// Read once per year and kept in memory; a missing year is not an error,
// it just means no celebration (the season is still worked out).
function calendarFor(year) {
  if (!calendars.has(year)) {
    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `calendar-${year}.json`), 'utf8'));
    } catch {
      // not covered yet: re-run scripts/fetch-calendar.mjs for that year
    }
    calendars.set(year, data);
  }
  return calendars.get(year);
}

let staticBios;
function bundledBios() {
  if (staticBios === undefined) {
    try {
      staticBios = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'saints.json'), 'utf8'));
    } catch {
      staticBios = null;
    }
  }
  return staticBios;
}

// A real calendar date, within the years the Easter algorithm and the
// Gregorian calendar both cover.
function isValidDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const year = Number(key.slice(0, 4));
  if (year < 1583 || year > 4099) return false;
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

async function season(request, context) {
  const asked = request.query.get('date');
  if (asked !== null && !isValidDate(asked)) {
    return {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { error: 'date must be a real date as YYYY-MM-DD (years 1583-4099)' },
    };
  }
  const date = asked ?? new Date().toISOString().slice(0, 10);
  const s = seasonFor(date);
  const day = calendarFor(Number(date.slice(0, 4)))?.[date];

  // A plain weekday isn't a celebration. On an optional memorial the
  // weekday still stands (the memorial is a choice), so the day keeps the
  // season's colour; anything higher replaces the weekday and its colour.
  const celebration = day && day.grade > 0
    ? { name: day.name, rank: day.grade_lcl, optional: Boolean(day.weekday_name), color: day.color }
    : null;
  const color = celebration && !celebration.optional && celebration.color ? celebration.color : s.color;
  const saint = celebration
    ? saintFor(celebration.name, await readSnapshot({ log: m => context?.log(m) }), bundledBios())
    : null;

  return {
    status: 200,
    headers: {
      // A named date's answer is fixed; "today" without a date moves at
      // midnight UTC, so it is only kept briefly.
      'Cache-Control': asked ? 'public, max-age=86400' : 'public, max-age=300',
    },
    jsonBody: {
      date,
      season: { key: s.key, name: s.name, week: s.week },
      celebration,
      color,
      saint,
    },
  };
}

app.http('season', {
  methods: ['GET', 'HEAD'],
  authLevel: 'anonymous',
  handler: season,
});

module.exports = { season };
