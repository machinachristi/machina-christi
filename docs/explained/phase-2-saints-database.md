# Phase 2 — the saints get a home of their own

*Built October 2026 (board item AB#39). Words in **bold** are explained in
[foundations.md](foundations.md).*

## What changed, in one sentence

Ordo's saints moved out of a file frozen into the website and into a real
**database**, with every fact saying where it came from; the home page now
names today's saint as a link to Ordo, and Ordo shows when each saint died and
what they're patron of.

## The story, like you're five

Before, everything the site knew about the saints was written on one long
sheet of paper glued inside the website. To fix a typo, you had to rebuild the
whole website.

So we built the saints a **library** (the **database**). It has neat shelves:
one for saints, one for feast days, one for "patron of" (fishermen, Sicily,
sore throats…), and one for **sources**: the books and websites each fact came
from. Every card in the library must point at its source, or the library
refuses to file it. Nobody can sneak in a fact without saying where it's from.

The library is free, on one condition: it sleeps almost all the time. When
someone knocks, it takes about a minute to wake up, and then it stays awake for
an hour, which uses up some of its free time for the month. If thousands of
visitors knocked every day, it would never sleep and the free time would run out.

So visitors never knock. Instead we hired a **librarian** (a **scheduled
job**). Every Sunday, and straight away whenever someone changes the library,
she wakes it up, copies everything onto one printed sheet (a **snapshot**), and
pins it to a noticeboard (**blob storage**). The helper in the tower from
Phase 1, the API, now reads that sheet when someone asks "what is this day?",
and adds the saint to her answer. The library goes back to sleep.

And if anything goes wrong? If the library won't wake, last week's sheet stays
up. If the sheet itself can't be read, the helper falls back to the old glued-in
bios. A visitor never sees an error, just, at worst, a slightly older page.
That's a **fallback**.

## Why it was built this way

**Why a database at all, if visitors never use it?**
Because it's the right home for information that grows and gets corrected. A
database checks its own rules (every bio has a source; a death date can't exist
without one), can answer precise questions ("saints who died in the 4th
century"), and lets one card change without rewriting everything. Later phases
add an admin page for editing saints and a prayer wall, and they need this.

**Why does every fact name its source?**
A Catholic site that states facts about saints should be checkable. Bios come
from Butler's *Lives of the Saints* (1894), Vatican.va or Wikipedia; dates of
death and patronages come from Wikidata, a free public database. Each one links
back. When a source only knows "around 300" or "the 4th century", the site
says exactly that and no more.

**Why once a week, not every day?**
Each time the library wakes, it stays up an hour, and that costs 1,800 of its
100,000 free "vCore-seconds" a month. Weekly, plus after changes, is a handful
of wakes a month. Daily would be thirty. The saints don't change daily anyway.

**Who's allowed to do what (least privilege).**
Three have keys to the library, each to a different door:
- **You** own the building: only people can be its administrator.
- **The deploy robot** (GitHub Actions) may rearrange shelves and file new
  cards, because that's how reviewed changes (**migrations**) reach the
  library. It may *not* change who owns the building or switch the free library
  to a paid one. We built a custom **role** for exactly that.
- **The API** may only read. Even if someone tricked it, it couldn't change a
  thing.

Each gets the least it needs to do its job: that's **least privilege**.

## How we know it's right

- **Tests** check the snapshot is assembled correctly, that every bundled bio
  names its source, and that the API falls back properly.
- Before anything went live, the librarian's exact questions were rehearsed
  against the real library: 162 feasts, 178 people, 138 patronages, 331
  sources, nothing missing a source.
- The first real publish took 2.4 seconds and produced a 190 KB sheet; the API
  then answered St Elizabeth of Hungary "from: database", died 1231.
- The website's tests pretend to be the API to check the saint link, the
  one-screen home page on a small phone (375×667), and Ordo's fallback when the
  API is "down".

**One lesson learned the day it went live:** the home page first showed no
saint at all. Two **caches** (Cloudflare's noticeboard, and the visitor's own
browser) were still holding answers saved *before* the saint was added. They'd
have expired within a day, but the proper fix is **cache-busting**: the
question now carries a version number, so every cache treats it as new. Next
time the answer changes shape, the number goes up.

## Watching it

Two saved questions (queries) in Azure's logs show how it's doing: every
publish run, with how long the library took to wake; and every time the API
couldn't read the sheet (empty is good). `infra/README.md` has them, and a
one-line command for how much of the month's free library time is left.

## Things to remember

- **Changing a saint's facts** is a new numbered migration in `db/migrations`
  (see `db/README.md`), reviewed in a pull request; merging it updates the
  library and republishes the sheet automatically. (A friendlier admin page is
  Phase 3.)
- **The calendar files** still need next year added before each new year
  (Phase 1's reminder): the saint for a day is found by the day's feast name.
- **The library's door** currently lets in anything inside Azure (a password
  badge is still needed). Locking it to the API's own network is the next job
  (AB#73).

## New foundations met in this phase

Database · SQL · schema · migration · transaction · managed identity · role and
least privilege · firewall · default deny · scheduled job · blob storage ·
snapshot · fallback · master key · source (provenance) · sleeping (serverless)
database · cache-busting. See [foundations.md](foundations.md).
