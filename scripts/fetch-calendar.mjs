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
//
// weekday_name is kept only when the API itself returns a ferial weekday
// (grade 0) sibling alongside the winning celebration. That mirrors the
// Church's own model: on an *optional* memorial the weekday is still the
// day's default celebration (the memorial is a choice), so litcal returns
// both; on obligatory memorials, feasts, and solemnities the celebration
// replaces the weekday outright, litcal returns no ferial sibling, and no
// weekday name is invented here — the page shows the celebration itself.
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
      });
    } else if (prev.grade === undefined || e.grade > prev.grade) {
      byDate.set(date, { ...prev, name: e.name, grade: e.grade, grade_lcl: e.grade_lcl });
    }
  }

  // Only keep weekday_name where it differs from the winning name — i.e.
  // where a memorial actually sits on top of a still-in-force ferial day.
  const out = new Map();
  for (const [date, entry] of byDate) {
    const { weekday_name, ...rest } = entry;
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
