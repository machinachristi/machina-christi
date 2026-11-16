#!/usr/bin/env node
// Works out which Gospel is read at Mass on every day of a year and writes
// ordo/gospel-YEAR.json, which ordo.html reads beside ordo/calendar-YEAR.json.
//
//   node scripts/build-gospel-table.mjs            every year that has a calendar file
//   node scripts/build-gospel-table.mjs 2028       just that year
//
// Two things go in: the calendar file (what each day IS) and the rule table
// scripts/lectionary-gospels.json (what is read on each KIND of day). This
// script finds each day's place in the Church's year by counting from Easter
// and from Advent, looks the place up in the rule table, and stops with an
// error rather than guess if a day cannot be placed or the calendar's own name
// for the day disagrees with the count.
//
// Each day comes out as { r, b, s } (+ n, a short note, on a few days):
//   r  the reference as a person reads it      "Luke 18:1–8"
//   b  which book's chapter files to open      "lk"   (ordo/gospel/lk-18.json)
//   s  the verses, as [chapter, first, last]   [[18, 1, 8]]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORDO = join(ROOT, 'ordo');
const rules = JSON.parse(readFileSync(join(ROOT, 'scripts', 'lectionary-gospels.json'), 'utf8'));

// ── reading a reference such as "Matt 9:35—10:1, 5a, 6-8" ───────────────────
const BOOKS = { Matt: ['mt', 'Matthew'], Mark: ['mk', 'Mark'], Luke: ['lk', 'Luke'], John: ['jn', 'John'] };
const chapterLength = (() => {
  const seen = {};
  return (b, c) => (seen[`${b}-${c}`] ??= JSON.parse(readFileSync(join(ORDO, 'gospel', `${b}-${c}.json`), 'utf8')).length);
})();

export function readRef(ref) {
  const m = ref.match(/^(Matt|Mark|Luke|John) (\d+):(.+)$/);
  if (!m) throw new Error(`cannot read reference "${ref}"`);
  const [b, bookName] = BOOKS[m[1]];
  let ch = +m[2];
  // spans: from (c1, v1) to (c2, v2). Half-verse letters (5a, 28b) are dropped:
  // the page shows whole verses.
  const spans = [];
  for (const piece of m[3].split(/[,;]\s*/)) {
    const p = piece.trim().match(/^(?:(\d+):)?(\d+)[a-d]*(?:\s*[-—]\s*(?:(\d+):)?(\d+)[a-d]*)?$/);
    if (!p) throw new Error(`cannot read "${piece}" in "${ref}"`);
    if (p[1]) ch = +p[1];
    const span = { c1: ch, v1: +p[2], c2: p[3] ? +p[3] : ch, v2: p[4] ? +p[4] : +p[2] };
    ch = span.c2;
    const last = spans[spans.length - 1];
    if (last && last.c2 === span.c1 && span.v1 <= last.v2 + 1) { last.c2 = span.c2; last.v2 = Math.max(last.v2, span.v2); }
    else spans.push(span);
  }
  let r = `${bookName} `, at = null;
  const s = [];
  for (const sp of spans) {
    if (at !== null) r += ', ';
    r += (at === sp.c1 ? '' : `${sp.c1}:`) + sp.v1;
    if (sp.c2 !== sp.c1) r += `–${sp.c2}:${sp.v2}`;
    else if (sp.v2 !== sp.v1) r += `–${sp.v2}`;
    at = sp.c2;
    for (let c = sp.c1; c <= sp.c2; c++) {
      const first = c === sp.c1 ? sp.v1 : 1;
      const lastV = c === sp.c2 ? sp.v2 : chapterLength(b, c);
      if (first > lastV || lastV > chapterLength(b, c)) throw new Error(`"${ref}" runs past the end of ${b} ${c}`);
      s.push([c, first, lastV]);
    }
  }
  return { r, b, s };
}

// ── dates ────────────────────────────────────────────────────────────────────
const DAY = 86400000;
const D = (y, m, d) => Date.UTC(y, m - 1, d);
const dow = (t) => new Date(t).getUTCDay();          // 0 Sunday … 6 Saturday
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const sundayOnOrBefore = (t) => t - dow(t) * DAY;
const sundayOnOrAfter = (t) => t + ((7 - dow(t)) % 7) * DAY;

function easter(y) {                                 // the usual Gregorian reckoning
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return D(y, month, day);
}

// Where a day sits in the year: { key, season, week }. key is null on days that
// only ever have a name of their own (Christmas Day, Good Friday…).
function place(t, y) {
  const E = easter(y), ash = E - 46 * DAY, pentecost = E + 49 * DAY;
  const advent1 = sundayOnOrAfter(D(y, 11, 27)), christKing = advent1 - 7 * DAY;
  const baptism = sundayOnOrAfter(D(y, 1, 7));
  const wd = dow(t), dd = new Date(t).getUTCDate();
  const weeks = (from) => Math.floor((t - from) / (7 * DAY));
  const numbered = (season, week) => ({ season, week, key: wd === 0 ? `${season}-${week}` : `${season}-${week}-${wd}` });

  if (t < baptism) return { season: 'christmas', key: wd === 0 || dd === 1 ? null : `jan-${dd}` };
  if (t === baptism) return { season: 'christmas', key: null };
  if (t < ash) return numbered('ot', 1 + weeks(baptism));
  if (t < ash + 4 * DAY) return { season: 'lent', key: `ash-${wd}` };
  if (t < E - 7 * DAY) return numbered('lent', 1 + weeks(E - 42 * DAY));
  if (t === E - 7 * DAY) return { season: 'lent', key: null };
  if (t < E - 3 * DAY) return { season: 'lent', key: `holy-${wd}` };
  if (t <= E) return { season: 'triduum', key: null };
  if (t < E + 7 * DAY) return { season: 'easter', key: `octave-${wd}` };
  if (t < pentecost) return numbered('easter', 1 + weeks(E));
  if (t === pentecost) return { season: 'easter', key: null };
  if (t < advent1) return numbered('ot', 34 - (christKing - sundayOnOrBefore(t)) / (7 * DAY));
  if (t < D(y, 12, 25)) {
    const p = numbered('advent', 1 + weeks(advent1));
    const lateAdvent = t >= D(y, 12, 17) && wd !== 0;        // 17–24 December have Gospels of their own
    return lateAdvent ? { ...p, key: `dec-${dd}` } : p;
  }
  return { season: 'christmas', key: wd === 0 || dd < 29 ? null : `dec-${dd}` };
}

// A, B or C: the Sunday year. It turns over on the First Sunday of Advent.
function sundayYear(t, y) {
  const churchYear = t >= sundayOnOrAfter(D(y, 11, 27)) ? y + 1 : y;
  return 'CAB'[churchYear % 3];
}

// The calendar file says things like "Tuesday of the 5th Week of Ordinary Time"
// or "Third Sunday of Lent". Read the season and number back out, to check the count.
const WORDS = { First: 1, Second: 2, Third: 3, Fourth: 4, Fifth: 5, Sixth: 6, Seventh: 7 };
const SEASONS = { 'Ordinary Time': 'ot', Lent: 'lent', Easter: 'easter', Advent: 'advent' };
function namedPlace(name) {
  const m = name.match(/(\d+)(?:st|nd|rd|th) (?:Week|Sunday) of (Ordinary Time|Lent|Easter|Advent)/)
    || name.match(/^(First|Second|Third|Fourth|Fifth|Sixth|Seventh) Sunday of (Lent|Easter|Advent)/);
  return m ? { season: SEASONS[m[2]], week: WORDS[m[1]] ?? +m[1] } : null;
}

function gospelFor(date, entry, y) {
  const t = Date.parse(date + 'T00:00:00Z');
  const year = sundayYear(t, y), where = place(t, y);

  for (const n of [entry.name, entry.weekday_name]) {
    const said = n && namedPlace(n);
    if (said && (said.season !== where.season || said.week !== where.week)) {
      throw new Error(`${date}: the calendar says "${n}" but the count gives ${where.season} week ${where.week}`);
    }
  }

  let rule = rules.feasts[entry.name], note;
  if (rule === undefined) {
    // A feast or solemnity always has its own Gospel. If it is not in the rule
    // table, stop: reading the weekday's Gospel instead would be wrong.
    const seasonal = /Sunday|Week|Weekday|Octave/.test(entry.name);
    if (entry.grade >= 4 && !seasonal) throw new Error(`${date}: "${entry.name}" is a feast with no Gospel in lectionary-gospels.json`);
    if (!where.key) throw new Error(`${date}: "${entry.name}" has no place in the rule table`);
    rule = dow(t) === 0 ? rules.sundays[where.key] : (rules.weekdaysInYear[where.key]?.[year] ?? rules.weekdays[where.key]);
    if (rule === undefined) throw new Error(`${date}: nothing in the rule table for ${where.key}`);
  }
  if (typeof rule === 'object') { note = rule.note; rule = rule.ref ?? rule[year]; }
  if (typeof rule !== 'string') throw new Error(`${date}: no Gospel for year ${year} under "${entry.name}"`);
  const out = readRef(rule);
  if (note) out.n = note;
  return out;
}

export function buildYear(y) {
  const calendar = JSON.parse(readFileSync(join(ORDO, `calendar-${y}.json`), 'utf8'));
  const out = {};
  for (let t = D(y, 1, 1); t < D(y + 1, 1, 1); t += DAY) {
    const date = iso(t);
    if (!calendar[date]) throw new Error(`${date} is missing from calendar-${y}.json`);
    out[date] = gospelFor(date, calendar[date], y);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const years = process.argv.slice(2).map(Number);
  if (!years.length) {
    for (const f of readdirSync(ORDO)) { const m = f.match(/^calendar-(\d{4})\.json$/); if (m) years.push(+m[1]); }
  }
  for (const y of years.sort()) {
    const table = buildYear(y);
    const lines = Object.entries(table).map(([d, g]) => `${JSON.stringify(d)}:${JSON.stringify(g)}`);
    writeFileSync(join(ORDO, `gospel-${y}.json`), '{\n' + lines.join(',\n') + '\n}\n');
    console.log(`wrote ordo/gospel-${y}.json (${lines.length} days)`);
  }
}
