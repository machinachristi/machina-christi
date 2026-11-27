# The photocopy that wasn't there: why five API tests seemed to blame Node 26

*AB#175 · November 2026*

## What changed, in one sentence

Five of the API's tests failed on the Mac. That looked like the fault of a
newer Node, but the real cause was a missing photocopy of the Ordo calendars,
so the API now reads the originals when the copy isn't there.

## The story, like you're five

**Where the calendar lives.** The Ordo page's calendars (which feast falls on
which day, in 2026 and 2027) are files in the site's `ordo/` folder. The API
needs them too: `/api/season` uses them to name the day's feast and saint, and
search uses them to open a saint's card on the right Ordo day. But the live
API is packed and shipped on its own, without the rest of the site. So a small
script photocopies the calendar files into the API's own folder
(`functions/src/data/`) before it's packed. The photocopy is never saved in
the project's history (**made, not kept**). It's made fresh each time from
the originals, so it can never fall out of date.

**When the copy is made.** The copying script runs as a **setup step**:
before the deploy packs the API, before `npm start`, and before `npm test`.
The test robot (CI) always uses `npm test`, so it always had the copy.

**What went wrong.** Claude sessions often work in a fresh **worktree** (a
second desk with a clean copy of the project), and there they ran the tests
with plain `node --test`. That's the same exam, but started by the back panel,
so the setup step never ran. A fresh desk has no photocopy. The API found no
calendar, quietly answered "no feast today" (which is its safe behaviour
when a year's calendar is missing), and the five tests that expect a feast
failed.

**Why Node got the blame.** The Mac has Node 26; the test robot uses Node 24.
The failures only showed on the Mac, so the version looked like the
difference. Testing **one thing at a time** settled it: same Mac, same
Node 26, and only the copy changed:

| On the Mac, Node 26 | Tests passing |
|---|---|
| no copy, plain `node --test` | 93 of 98 |
| an old copy from 16 November | 98 of 98 |
| a fresh copy (`npm test`) | 98 of 98 |

The copy was the whole difference, and Node 26 was never involved.

**The fix.** One small file, `functions/src/lib/data-dir.js`, now answers
"where are the API's data files?" for everything that reads them. If the
photocopy folder exists, it says "there", which is always the case on the live
API. If the folder doesn't exist at all, as on a fresh desk, it says "read the
originals in `ordo/`". So plain `node --test` now passes on a fresh desk too.

## Why it was built this way

- **No change to the live API.** The deploy always makes the copy, so the live
  API reads exactly what it read before. Its answers were compared before and
  after, for every day from December 2025 to January 2028 and every saint's
  Ordo link: identical, byte for byte, whether read from the copy or from
  `ordo/`.
- **Only a *missing* folder falls back.** If the folder is there but empty,
  the copy step ran and broke. That should still make the tests fail, so it
  isn't papered over.
- **Not "use Node 24 on the Mac".** Pinning an older Node would have changed
  nothing, because the version was never the cause.
- **The copy stays.** Shipping the API with its own copy keeps it independent
  of the website's files once deployed; only a developer's fresh desk takes
  the shortcut.

## How we know it's right

- On the Mac (Node 26): 98 of 98 with plain `node --test` on a fresh desk,
  98 of 98 with `npm test`, and 93 of 98 with an empty copy folder (the
  broken-copy case still shows).
- CI runs the same tests on Node 24 with `npm test` on this change.

## Things to remember

- `npm test` is still the way to run the API's tests: it refreshes the copy,
  so it also catches an out-of-date one. Plain `node --test` now works on a
  fresh desk, but on a desk with an *old* copy it reads that old copy.
- A test failing only on one computer means something differs between the
  two. Find that difference by changing one thing at a time before blaming
  the first one you notice.

## New foundations met here

In [foundations.md](foundations.md): **setup step (a "pre" script)**,
**made, not kept (generated files)**, and **change one thing at a time
(finding the real cause)**.
