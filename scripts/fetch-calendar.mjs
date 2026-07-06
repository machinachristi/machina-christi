#!/usr/bin/env node
// One-off / annual maintenance script: fetches the General Roman Calendar
// from the Liturgical Calendar API and writes a compact static JSON file
// (ordo/calendar-<year>.json) for the Ordo page to read at
// request time. The site has no build step (see the CI workflow comment
// about avoiding Azure's Oryx auto-detection), so this is run locally by
// hand — re-run it each year to add the next year's file.
//
// Usage: node scripts/fetch-calendar.mjs 2026 2027

// NB: /api/v1/calendar returns an HTML documentation page unless called
// exactly the way its own front-end does; /api/dev/calendar is the endpoint
// that reliably returns raw JSON and is what's used here.
const API = 'https://litcal.johnromanodorazio.com/api/dev/calendar';

async function fetchYear(year) {
  const url = `${API}?year=${year}&locale=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`litcal ${year}: HTTP ${res.status}`);
  const data = await res.json();
  return data.litcal;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
}

// The Sunday (YYYY-MM-DD) that starts dateStr's liturgical week — Ordinary
// Time's week number turns over on Sundays, so grouping by this key lets us
// borrow a weekday-name template from any other day in the same week.
function weekStartKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// One winning celebration per date: the highest-graded non-vigil entry.
// Vigil Masses (evening-of-the-day-before anticipations) aren't "today's"
// celebration for a daily-glance page, so they're excluded from consideration.
//
// Ferial weekdays (grade 0) are still returned by the API alongside optional
// memorials (grade 2) on top of them, so those are kept as weekday_name —
// this is what lets the Ordo page always show "Monday of the 14th Week of
// Ordinary Time" even on a day with a saint's optional memorial. Obligatory
// memorials and feasts fully replace the ferial in the API's own model (no
// weekday sibling event returned at all), so for those, the weekday name is
// reconstructed afterwards from another day in the same liturgical week that
// does have one, swapping in the correct day-of-week word.
function reduceToOnePerDate(events) {
  const byDate = new Map();
  for (const e of events) {
    if (e.is_vigil_mass) continue;
    const date = e.date.slice(0, 10);
    const prev = byDate.get(date) || {};
    if (e.grade === 0) {
      byDate.set(date, {
        name: prev.name ?? e.name,
        grade: prev.grade ?? e.grade,
        grade_lcl: prev.grade_lcl ?? e.grade_lcl,
        weekday_name: e.name,
        season: e.liturgical_season,
      });
    } else if (prev.grade === undefined || e.grade > prev.grade) {
      byDate.set(date, { ...prev, name: e.name, grade: e.grade, grade_lcl: e.grade_lcl, season: prev.season ?? e.liturgical_season });
    }
  }

  // Sundays are their own celebration, not a suppressed ferial, so they're
  // never given a synthesized weekday_name — and neither are solemnities
  // (grade 6) or the tier above them (grade 7: the Triduum, Christmas, etc.).
  // Those outrank feasts/memorials enough that, like a Sunday, the day simply
  // *is* the solemnity — noting the ferial week underneath would be pedantic
  // rather than informative. For everything below that (feasts, obligatory
  // and optional memorials), borrow a template (word + template string) from
  // elsewhere in the same week *and season* and substitute in this date's own
  // day-of-week word. The season check matters right at a season boundary —
  // e.g. Dec 26–31 falls in the same Sunday-Saturday week as the preceding
  // Advent weekdays, but is Christmastide, not Advent, so an Advent template
  // must not leak in. Some seasons (e.g. the Christmas octave's "Nth Day of
  // the Octave" naming) don't use a day-of-week word at all — those are
  // simply left unfilled, which falls back to the previous display.
  const templatesByWeek = new Map();
  for (const [date, entry] of byDate) {
    const template = entry.grade === 0 ? entry.name : entry.weekday_name;
    if (!template) continue;
    const word = dayOfWeek(date);
    if (!template.includes(word)) continue; // e.g. "5th Day of the Octave of Christmas" — not substitutable
    const key = `${weekStartKey(date)}|${entry.season}`;
    if (!templatesByWeek.has(key)) templatesByWeek.set(key, { word, template });
  }
  for (const [date, entry] of byDate) {
    if (entry.grade === 0 || entry.grade >= 6 || entry.weekday_name || dayOfWeek(date) === 'Sunday') continue;
    const ref = templatesByWeek.get(`${weekStartKey(date)}|${entry.season}`);
    if (!ref) continue;
    const targetWord = dayOfWeek(date);
    if (targetWord === ref.word || !ref.template.includes(ref.word)) continue;
    entry.weekday_name = ref.template.replace(ref.word, targetWord);
  }

  // Only keep weekday_name where it differs from the winning name — i.e.
  // where a memorial/feast/solemnity actually sits on top of a ferial day.
  const out = new Map();
  for (const [date, entry] of byDate) {
    const { weekday_name, season, ...rest } = entry;
    out.set(date, weekday_name && weekday_name !== rest.name ? { ...rest, weekday_name } : rest);
  }
  return Object.fromEntries([...out.entries()].sort());
}

async function main() {
  const years = process.argv.slice(2).map(Number);
  if (!years.length) {
    console.error('Usage: node scripts/fetch-calendar.mjs <year> [year...]');
    process.exit(1);
  }
  const fs = await import('node:fs/promises');
  // litcal's "year" param is a liturgical year, not a Gregorian one: fetching
  // year=Y returns Advent(Y-1) through Christ the King(Y), so Advent/December
  // of a Gregorian year Y actually lives in the year=Y+1 response. Fetch both
  // and merge so each output file has full Jan 1–Dec 31 coverage.
  for (const year of years) {
    const [thisYear, nextYear] = await Promise.all([fetchYear(year), fetchYear(year + 1)]);
    const byDate = { ...reduceToOnePerDate(thisYear), ...reduceToOnePerDate(nextYear) };
    const filtered = Object.fromEntries(
      Object.entries(byDate).filter(([date]) => date.startsWith(String(year))).sort()
    );
    const out = `ordo/calendar-${year}.json`;
    await fs.writeFile(out, JSON.stringify(filtered, null, 0));
    console.log(`wrote ${out} (${Object.keys(filtered).length} dates)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
