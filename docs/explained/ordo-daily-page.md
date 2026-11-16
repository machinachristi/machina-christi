# Ordo — a daily page: the Gospel itself, and a prayer for the day

*AB#152 · November 2026*

## What changed, in one sentence

Ordo used to name the day and point to another website for the Gospel; now it
shows the day's Gospel on the page, the saint when there is one, and one
prayer for the day that leads into the Pray pages.

## The story, like you're five

**A timetable and a book.** To show today's Gospel, the page needs two things:
which passage is read today, and the words of that passage. Think of a
railway: the timetable says which train leaves at nine, and the train itself
is somewhere else. The site now keeps both.

- The *timetable* is `ordo/gospel-2026.json` (one per year). For every date it
  holds a line such as "Luke 18:1–8".
- The *book* is the four Gospels in the Douay-Rheims Bible, an English
  translation old enough to be free for anyone to copy. It is cut into 89
  small files, one per chapter, in `ordo/gospel/`.

When you open Ordo, the page reads today's line in the timetable, then fetches
only the chapter it names. That is a few thousand letters, not four whole
Gospels, so the page stays quick on a phone.

**The timetable is worked out, not typed.** Nobody typed 730 dates by hand.
The Church's readings follow rules: "Tuesday of the 5th week of Lent reads
this", "the Assumption reads that", "Sundays go round in three years, A, B and
C". Those rules sit in one file, `scripts/lectionary-gospels.json` (taken from
the reference tables compiled by Felix Just, S.J.). A small program,
`scripts/build-gospel-table.mjs`, takes a year's calendar, works out where
each day falls by counting from Easter and from Advent, and looks up the rule.
For a new year, run the program again; nothing is retyped.

The program refuses to guess. If a day can't be placed, or a feast has no rule,
or its own count disagrees with the name the calendar gives the day, it stops
with an error.

**Checking the timetable against a printed one.** A worked-out answer can
still be wrong, so it was compared three ways:

1. with a second calendar project's readings, for the days it lists;
2. with the dates printed in the reference tables themselves (331 weekdays);
3. with the calendar the bishops of the United States print each year, day by
   day for both years: 701 of 730 days read the same Gospel.

The 29 that differ are understood. Most are days our calendar keeps on a
different date on purpose (the Epiphany on 6 January and Corpus Christi on its
Thursday, where the United States moves both to a Sunday). The rest are the
same passage written two ways.

The third check also found a real mistake. Monday 29 November 2027 was showing
a Gospel from Christmas week. The program had a rule "from the 17th, use the
special December readings" and only looked at the day of the month, so the
29th of *November* slipped through. It now checks the month too, and a test
names that date so it can't come back.

**Verse numbers that don't line up.** The readings are cited by modern verse
numbers. The Douay-Rheims counts differently in six chapters (it joins or
splits a verse here and there), so "verses 51 to 58" would have pointed at the
wrong lines. The program that cuts the book into chapters renumbers those six
to match, and stops if any chapter ends up with the wrong number of verses.

**The prayer for the day.** One small rule in `assets/today-prayer.js` picks a
prayer by the day of the week (Saturday is Our Lady's day, so the Hail Mary)
and lets a few kinds of feast outrank it (a feast of Our Lady brings the Hail,
Holy Queen). It lives in its own file so the homepage can ask the same
question later without a second copy of the rule.

**If something fails.** If the timetable for a year is missing, the old link
to the day's readings appears instead. If only the chapter fails to load, the
reference still shows with a link to read it elsewhere.

## What this shows about software

- **Rules in, answers out.** Keep the small thing a person can check (the
  rules) and let a program produce the large thing (every day of the year).
  See *Generated file* in [foundations.md](foundations.md).
- **A program should fail loudly.** A build that stops with "I can't place
  this day" is worth more than one that quietly prints something plausible.
- **Check against something you didn't make.** The mistake was invisible to
  the program's own checks, because they shared its blind spot. See *Second
  opinion* and *Boundary case* in foundations.
- **Send only what's needed.** One chapter per visit, fetched when asked for:
  *Lazy loading* in foundations.

## Where things are

| What | Where |
|---|---|
| The page | `ordo.html` |
| Which Gospel on which day | `ordo/gospel-YEAR.json` |
| The words, one chapter per file | `ordo/gospel/` |
| The rules | `scripts/lectionary-gospels.json` |
| The program that makes the timetable | `scripts/build-gospel-table.mjs` |
| The program that cut up the book (run once) | `scripts/build-gospel-text.mjs` |
| The prayer rule | `assets/today-prayer.js` |
| The checks | `tests/ordo.spec.js` |

## Adding a year

1. `node scripts/fetch-calendar.mjs 2028` (the calendar, as before)
2. `node scripts/build-gospel-table.mjs 2028`

If step 2 stops with an error naming a feast, add that feast's Gospel to
`scripts/lectionary-gospels.json` and run it again.
