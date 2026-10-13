// The liturgical season for any date, worked out from first principles: no
// data files, no network. Everything hangs off two anchors, Easter (moveable)
// and Christmas (fixed). Rules follow the General Roman Calendar, the same
// calendar the Ordo data comes from: Epiphany on 6 January, so the Baptism of
// the Lord is the Sunday after it.
//
// Dates are plain 'YYYY-MM-DD' keys handled as UTC midnights, so the server's
// own time zone can never shift a day.

const DAY = 86400000;

function toDate(key) {
  return new Date(`${key}T00:00:00Z`);
}

function addDays(date, n) {
  return new Date(date.getTime() + n * DAY);
}

function daysBetween(from, to) {
  return Math.round((to - from) / DAY);
}

// Easter Sunday: the anonymous Gregorian algorithm (Meeus/Jones/Butcher),
// exact for every Gregorian year.
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// First Sunday of Advent: the fourth Sunday before Christmas
// (always 27 November to 3 December).
function adventStart(year) {
  const christmas = new Date(Date.UTC(year, 11, 25));
  const sundayBefore = addDays(christmas, -(christmas.getUTCDay() || 7));
  return addDays(sundayBefore, -21);
}

// Baptism of the Lord: the Sunday after Epiphany (7 to 13 January).
function baptismOfTheLord(year) {
  const epiphany = new Date(Date.UTC(year, 0, 6));
  return addDays(epiphany, 7 - epiphany.getUTCDay());
}

function week(from, date) {
  return Math.floor(daysBetween(from, date) / 7) + 1;
}

const NAMES = {
  advent: 'Advent',
  christmas: 'Christmas',
  lent: 'Lent',
  triduum: 'Easter Triduum',
  easter: 'Easter',
  ordinary: 'Ordinary Time',
};

// { key, name, week, color } for a 'YYYY-MM-DD' date. `week` is the week of
// the season as the Church numbers it (null in Christmas and the Triduum;
// 0 for the days after Ash Wednesday). `color` is the day's colour from the
// season alone; a feast on the day can override it (see /api/season).
function seasonFor(dateKey) {
  const date = toDate(dateKey);
  const year = date.getUTCFullYear();
  const pascha = easter(year);
  const ashWednesday = addDays(pascha, -46);
  const holyThursday = addDays(pascha, -3);
  const pentecost = addDays(pascha, 49);
  const advent = adventStart(year);
  const baptism = baptismOfTheLord(year);

  let key;
  let wk = null;
  let color;
  if (date >= advent && date < toDate(`${year}-12-25`)) {
    key = 'advent';
    wk = week(advent, date);
    color = daysBetween(advent, date) === 14 ? 'rose' : 'violet'; // Gaudete
  } else if (date >= toDate(`${year}-12-25`) || date <= baptism) {
    key = 'christmas';
    color = 'white';
  } else if (date >= ashWednesday && date < holyThursday) {
    key = 'lent';
    const firstSunday = addDays(pascha, -42);
    wk = date < firstSunday ? 0 : week(firstSunday, date);
    color = daysBetween(date, pascha) === 21 ? 'rose' : 'violet'; // Laetare
  } else if (date >= holyThursday && date < pascha) {
    // Holy Thursday is Lent until the evening Mass; a glance at the day
    // shows what the day is for, so the Triduum takes the whole of it.
    key = 'triduum';
    color = daysBetween(date, pascha) === 2 ? 'red' : 'white'; // Good Friday
  } else if (date >= pascha && date <= pentecost) {
    key = 'easter';
    wk = week(pascha, date);
    color = date.getTime() === pentecost.getTime() ? 'red' : 'white';
  } else {
    key = 'ordinary';
    color = 'green';
    if (date < ashWednesday) {
      wk = week(baptism, date);
    } else {
      // After Pentecost the weeks are counted back from Christ the King,
      // the last Sunday before Advent, which always begins week 34.
      const christTheKing = addDays(advent, -7);
      const sunday = addDays(date, -date.getUTCDay());
      wk = 34 - daysBetween(sunday, christTheKing) / 7;
    }
  }
  return { key, name: NAMES[key], week: wk, color };
}

module.exports = { easter, adventStart, baptismOfTheLord, seasonFor };
