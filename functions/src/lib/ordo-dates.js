// Which day to open in Ordo for a saint's feast. Ordo is addressed by date
// (ordo.html?date=YYYY-MM-DD), and a feast isn't celebrated every year on its
// day: a Sunday or a greater feast can take its place (Saint Francis of
// Assisi isn't in the 2026 calendar: October 4 is a Sunday). So the answer is
// looked up in the Ordo calendars the API bundles (scripts/copy-calendar.js):
// the next date the feast is actually celebrated, or else the latest past
// one. Worked out when search answers, not stored in the index, so the
// passing of time and next year's calendar need no reindex.
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// { "<celebration name>": ["2026-01-21", "2027-01-21", …] } from calendar
// files shaped { "YYYY-MM-DD": { name, … } }.
function feastDates(calendars) {
  const dates = new Map();
  for (const calendar of calendars) {
    for (const [date, entry] of Object.entries(calendar ?? {})) {
      if (!entry?.name) continue;
      if (!dates.has(entry.name)) dates.set(entry.name, []);
      dates.get(entry.name).push(date);
    }
  }
  for (const list of dates.values()) list.sort();
  return dates;
}

let bundled;
function bundledFeastDates() {
  if (!bundled) {
    let files = [];
    try {
      files = fs.readdirSync(DATA_DIR).filter(f => /^calendar-\d{4}\.json$/.test(f));
    } catch {
      // no data copied (run `npm run copy-data`)
    }
    bundled = feastDates(files.map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'))));
  }
  return bundled;
}

// { date, url } for the feast, or null when no bundled calendar has it.
// `today` is a YYYY-MM-DD key (dates compare as strings).
function ordoDayFor(feastName, today, dates = bundledFeastDates()) {
  const list = dates.get(feastName);
  if (!list?.length) return null;
  const date = list.find(d => d >= today) ?? list[list.length - 1];
  return { date, url: `/ordo.html?date=${date}` };
}

module.exports = { feastDates, bundledFeastDates, ordoDayFor };
