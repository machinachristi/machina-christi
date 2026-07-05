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

// One winning celebration per date: the highest-graded non-vigil entry.
// Vigil Masses (evening-of-the-day-before anticipations) aren't "today's"
// celebration for a daily-glance page, so they're excluded from consideration.
function reduceToOnePerDate(events) {
  const byDate = new Map();
  for (const e of events) {
    if (e.is_vigil_mass) continue;
    const date = e.date.slice(0, 10);
    const prev = byDate.get(date);
    if (!prev || e.grade > prev.grade) {
      byDate.set(date, { name: e.name, grade: e.grade, grade_lcl: e.grade_lcl });
    }
  }
  return Object.fromEntries([...byDate.entries()].sort());
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
