// Who stands in heaven, from the site's own records — never from memory
// (AB#106). This loader reads the same files the Ordo page reads: the
// saints' records (ordo/saints.json) and the liturgical calendar
// (ordo/calendar-<year>.json). From them it keeps only what heaven shows:
// each saint's name, the title the record gives them, and their feast days.
//
// It never keeps the bios (each record's `excerpt`). Heaven is a place of
// joy (Revelation 21:4), and some of them tell of martyrdoms in detail. Only
// the records' keys are read; the values are dropped unread.
//
// LOCKED: the weekly update-world routine may never edit this file (the World
// Diff Guard, guard 4, enforces it). Heaven's other modules may change week
// by week; who the saints are, and what is said of them, changes only by hand.
//
// It never fails: on any fault it resolves with no saints, and heaven opens
// with the multitude alone.

const SAINTS_URL = new URL('../../ordo/saints.json', import.meta.url);
const calendarURL = year => new URL(`../../ordo/calendar-${year}.json`, import.meta.url);
const FIRST_CALENDAR = 2026;   // the earliest year the site keeps a calendar for
const COLORS = new Set(['white', 'red', 'green', 'violet', 'rose']);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// St Joseph has two records, one for each of his feasts. In heaven he is one
// man: one figure carrying both feasts.
const JOSEPH = ['Saint Joseph Husband of the Blessed Virgin Mary', 'Saint Joseph the Worker'];

// 'MM-DD' → '5 February'.
export function feastText(mmdd) {
  const m = +mmdd.slice(0, 2), d = +mmdd.slice(3, 5);
  return MONTHS[m - 1] ? `${d} ${MONTHS[m - 1]}` : '';
}

// dayOverride: 'YYYY-MM-DD' (a test or the curious asking for another day),
// or null for the visitor's own today.
// Resolves to { saints: [{ key, keys, name, title, feasts: ['MM-DD'], kind:
// { martyr, doctor, virgin, pastor, apostle, evangelist }, figures: 1-3 }],
// today: { key, color } | null }.
export async function loadSaints(dayOverride = null) {
  try {
    const today = validDay(dayOverride) || localDay(new Date());
    const year = +today.slice(0, 4);
    const [records, calendars] = await Promise.all([fetchJSON(SAINTS_URL), loadCalendars(year)]);
    if (!records || typeof records !== 'object' || Array.isArray(records)) {
      return { saints: [], today: null };
    }
    // The keys alone: the records' values (their bios) are never read.
    const keys = Object.keys(records).filter(k => k.length > 0 && k.length < 200);

    // Each saint's feast day, from the first calendar (this year's, then
    // next year's) that keeps it — so a feast moved in one year never shows
    // as two days.
    const feasts = new Map();
    for (const cal of calendars) {
      const kept = new Map();
      for (const date of Object.keys(cal)) {
        const day = cal[date];
        if (!day || typeof day.name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (feasts.has(day.name)) continue;
        if (!kept.has(day.name)) kept.set(day.name, new Set());
        kept.get(day.name).add(date.slice(5));
      }
      for (const [name, days] of kept) feasts.set(name, days);
    }
    const feastsOf = key => [...(feasts.get(key) || [])].sort();

    const saints = [];
    const byKey = new Map();
    for (const key of keys) {
      if (JOSEPH.includes(key)) continue;
      const entry = describe(key, feastsOf(key));
      saints.push(entry);
      byKey.set(key, entry);
    }
    const josephKeys = JOSEPH.filter(k => keys.includes(k));
    if (josephKeys.length) {
      const all = new Set();
      for (const k of josephKeys) for (const f of feastsOf(k)) all.add(f);
      const entry = {
        key: josephKeys[0],
        keys: josephKeys,
        name: 'Saint Joseph',
        title: josephKeys.includes(JOSEPH[0]) ? 'Husband of the Blessed Virgin Mary' : 'the Worker',
        feasts: [...all].sort(),
        kind: kinds(josephKeys.join(' ')),
        figures: 1,
      };
      saints.push(entry);
      for (const k of josephKeys) byKey.set(k, entry);
    }

    // Through the year, January first; any without a feast day at the end.
    saints.sort((a, b) => (a.feasts[0] || '99').localeCompare(b.feasts[0] || '99')
      || a.name.localeCompare(b.name));

    // Today's saint, if today's celebration is one of them.
    let todays = null;
    for (const cal of calendars) {
      const day = cal[today];
      if (day && typeof day.name === 'string' && byKey.has(day.name)) {
        todays = {
          key: byKey.get(day.name).key,
          color: COLORS.has(day.color) ? day.color : 'white',
        };
        break;
      }
    }
    return { saints, today: todays };
  } catch (err) {
    console.warn('heaven: the saints could not be read —', err && err.message);
    return { saints: [], today: null };
  }
}

// One record's key → what heaven shows of it. The name is everything before
// the first ', ' and the title everything after (a key with no comma is all
// name), exactly as the record has it.
function describe(key, feasts) {
  const cut = key.indexOf(', ');
  return {
    key,
    keys: [key],
    name: cut < 0 ? key : key.slice(0, cut),
    title: cut < 0 ? '' : key.slice(cut + 2),
    feasts,
    kind: kinds(key),
    figures: figuresOf(key),
  };
}

// What each carries comes from the words of the record alone: a palm for
// the martyrs (Revelation 7:9), a book for the doctors and the evangelists,
// a lily for the virgins, a shepherd's crook for the bishops and popes, a
// small flame for the apostles (Acts 2:3).
function kinds(text) {
  // "the Blessed Virgin Mary" names Our Lady, not a saint's own title.
  const own = text.replace(/Blessed Virgin Mary/g, '');
  return {
    martyr: /\bmartyrs?\b/i.test(own),
    doctor: /\bdoctors? of the church\b/i.test(own),
    virgin: /\bvirgins?\b/i.test(own),
    pastor: /\b(bishops?|popes?)\b/i.test(own),
    apostle: /\bapostles?\b/i.test(own),
    evangelist: /\bevangelists?\b/i.test(own),
  };
}

// A record that names more than one saint stands as a small cluster: three
// for "…and Companions", or for three names ("Saints Michael, Gabriel and
// Raphael" — the first name alone before the comma, the other two joined
// after it); otherwise two for "Saints…".
function figuresOf(key) {
  if (/\band Companions\b/i.test(key)) return 3;
  if (!key.startsWith('Saints ')) return 1;
  const [first, second = ''] = key.slice('Saints '.length).split(', ');
  return !first.includes(' and ') && second.includes(' and ') ? 3 : 2;
}

// This year's calendar and next year's, so a saint whose day falls on a
// Sunday this year (and so is not kept) still has a feast day to show; if
// this year's is missing, the latest year before it that is there.
async function loadCalendars(year) {
  const [now, next] = await Promise.all([fetchJSON(calendarURL(year)), fetchJSON(calendarURL(year + 1))]);
  const found = [now, next].filter(isCalendar);
  if (!isCalendar(now)) {
    for (let y = year - 1; y >= FIRST_CALENDAR && y >= year - 3; y--) {
      const cal = await fetchJSON(calendarURL(y));
      if (isCalendar(cal)) { found.push(cal); break; }
    }
  }
  return found;
}

function isCalendar(c) {
  return !!c && typeof c === 'object' && !Array.isArray(c);
}

async function fetchJSON(url) {
  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    return r.ok ? await r.json() : null;
  } catch (_) {
    return null;
  }
}

function validDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? v : null;
}

function localDay(t) {
  const p = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
