# Phase 5 — the site learns to find things

*Built October 2026 (board item AB#42). Words in **bold** are explained in
[foundations.md](foundations.md).*

## What changed, in one sentence

The site got a search page: type a saint's name, what they're patron of, a line
of a prayer or a Thai word, and the right saint, prayer or page comes up as you
type, even with a typo.

## The story, like you're five

Before, you could only find things by walking: open Ordo and step through the
days, or open Pray and scroll the list. Now there's a librarian.

**We built a card catalogue (a search index).** Every saint's feast, every
prayer and every page of the site gets a **card**: its title, its Thai title,
its other names, the people it's about, what they're patron of, the lines of the
prayer in Thai, pronunciation and English. The catalogue lives in **Azure AI
Search**, on the free plan, and holds 184 cards. Like the index at the back of a
book, it already knows which cards contain "Agnes", so finding them is instant
(an **inverted index**).

**Each kind of writing gets its own word-cutter (analyzer).** Before a card is
filed, its words are cut apart and tidied. English is easy: spaces. Thai isn't:
it's written without spaces between words, so we use a cutter that knows Thai.
Names get a cutter that ignores accents (Thérèse = Therese). English prose gets
one that knows word families (lawyers = lawyer).

**We file the cards ourselves (our own indexer).** Azure has robots that fetch
data and write the cards themselves (**indexers**). On the free plan they can't
hold a badge, so they'd need keys, and this project uses none. So our API, which
already has badges to read the saints and the prayers, writes the cards and
hands them over (the **push** model). It does this after every deploy, after a
prayer changes, and every Sunday.

**There's a counter (`/api/search`), and only the API stands behind it.**
Visitors never talk to the search service. They ask the API, and the API asks
Search with its badge. Like every other counter on the site, Cloudflare keeps
popular answers for five minutes.

**The librarian is strict first, then kind.** First every word must match. If
nothing does, it forgives one wrong letter ("fransis" → Francis of Assisi,
**fuzzy search**). If still nothing, any of the words will do. A match in a
title counts five times one in a bio (a **scoring profile**).

**And if the librarian is away?** The page has a pocket notebook: a simple
search of the site's own files (prayers, saints, calendars). It says so when
it's using it (a **fallback**).

## Why it was built this way

**Why Azure AI Search, not just a list in the page?** With 184 cards, a list in
the page would work. But Phase 5's purpose was to learn how real search works:
indexes, analyzers, relevance. The free plan costs nothing and can't bill, and
the same skills scale to millions of cards. The page's own simple search exists
anyway, as the fallback.

**Why push, not Azure's indexers?** We checked Microsoft's documentation. For
the search service to sign in to other services with its own badge (a
**managed identity**), it must be on the Basic plan or higher, about $75 a
month. On the free plan its indexers would need keys or connection strings.
Writing our own small indexer, a couple of hundred lines, kept both rules: free,
and no keys.

**Why does the API compute the Ordo date when it answers?** A saint's feast
isn't kept every year on its day: a Sunday or a bigger feast can take its place
(St Francis of Assisi isn't in the 2026 calendar, because 4 October is a
Sunday). So the answer looks up the *next* day Ordo actually celebrates them.
Working that out at answer time, rather than writing it on the card, means
nothing has to be rebuilt as the days go by.

**Why `site-v1`, with a number?** Some changes to a card's layout can't be made
to an index in place. Azure refuses, and our deploy stops before anything goes
live. The fix is a new index beside the old one (`site-v2`), filled, checked,
and only then the old one removed: a **versioned rebuild**, like the
**blue-green** move of the API in Phase 2.

**Who may do what.** No keys anywhere:

| Who | The index's layout | The cards | The service (keys, settings) |
|---|---|---|---|
| The deploy robot (GitHub Actions) | may change it (a **custom role**, "Search Schema Writer") | — | — |
| The API | — | fills them and searches them | — |
| You (the owner) | yes (your Owner role covers it) | none! | yes |
| A visitor | — | only through the API | — |

The robot's main role now refuses *everything* to do with search, and a second,
narrow role adds back only the layout. Microsoft's ready-made role for layouts
could also read the keys and switch them back on, so we didn't use it.

**Privacy.** What people search for is never written down: not in our logs, not
in telemetry, not in the page's title, not in the browser's storage. It is in
the page's address (`?q=`), so a search can be shared; telemetry has always
removed that part. Cloudflare, which carries every request, can see addresses.

**Safety.** Anything a visitor types is reduced to plain letters and digits
before it reaches Search, so no one can sneak in search commands (**injection**).
Highlighted words come back as plain text plus positions, and the page draws
them itself, so nothing in a result can run as code (**XSS**).

## How we know it's right

**The search lab (a throwaway, like Phase 2's network test and Phase 4's sound
test).** Before any real code, we made a temporary free search service with keys
off, filled it with all 162 saints and 10 prayers, tried things, then deleted
it.

- **Keys really are off:** the service's own key was refused (401).
- **A surprise the docs got wrong:** Microsoft says an Owner can't create search
  indexes. With your Owner role, we could. The reason: index layouts are ordinary
  permissions that a "do everything" role covers. The robot's main role is "do
  everything, except…", so without an explicit "except search" it could have
  changed the index too. That's why it now refuses search entirely.
- **How Thai gets cut** (real lines from the prayers):

  | Line | Standard cutter | `th.lucene` | `th.microsoft` (chosen) |
  |---|---|---|---|
  | เดชะพระนามพระบิดา | one "word" | เดชะ · พระ · นาม · พระ · บิดา | เดชะ · พระ · นาม · พระ · บิดา |
  | ข้าพเจ้าเชื่อในพระเจ้าหนึ่งเดียว | one "word" | ข้าพเจ้า · เชื่อ · พระเจ้า | ข้าพเจ้า · เชื่อ · ใน · พระ · เจ้า · หนึ่ง · เดียว |
  | วันทามารีย์ | one "word" | วันทา · รีย์ | วัน · ทา · มา · รี · ย์ |

  Both Thai cutters stumble on มารีย์ (Mary): it's a borrowed name, not a Thai
  word. But `th.microsoft` cuts the same way when you search, so searching
  มารีย์ still finds the Hail Mary first, while `th.lucene` missed พระแม่มารีย์
  altogether. Putting a Thai word in quotes (a **phrase search**) made results
  exact.
- **What the lab couldn't fix:** a *half-typed* Thai word finds things only if
  it doesn't straddle two pieces. "วันท…" works; "พระบ…" doesn't (พระ | บิดา).
  Whole words always work.
- **Size:** all the cards together are 0.5 MB, 1% of the free 50 MB.

**Tests.**
- **The API (83):**
  - every saint the site has a bio for opens an Ordo day that really shows them;
  - typed search commands become plain words;
  - a result containing `<img onerror>` stays text;
  - the logs never contain the search words;
  - a failed read never empties the index.
- **The site (118):**
  - typing asks once, after the pause;
  - Thai stays Thai;
  - with the API down, the notebook search answers;
  - off the live site, the API is never asked;
  - the search box is big enough that phones don't zoom in;
  - the search words never reach telemetry.

**Live.** After the deploy built the 184 cards (in under a second), its own
check searched for "agnes" and "พระบิดา" and both passed. Searches through
Cloudflare found St Agnes (opening 21 January 2027), the Our Father, the Hail
Mary by its Latin name, the patron of lawyers (St Raymond of Penyafort), St
Francis from "fransis", St Paul Miki from "martyrs of japan", and Eden from
"garden".

**Two lessons from building it.**
- **Writing the tests caught a real bug.** The "newest card" time was always
  empty, because the comparison started from nothing and never moved. The deploy
  check depends on that time, so it would have failed on the first deploy.
- **A minute after a deploy, two searches hung.** The API's log showed they
  never reached it: the API restarts while the deploy changes its temporary
  access rules. A minute later both answered in about a second. Lesson: check
  the result itself (**verification**), and read the logs before blaming the
  new code.

## Watching it

Two saved questions in Azure's logs:
- **`search-requests`:** searches per day, how many found nothing, failures,
  and speed. Never the words.
- **`search-reindex-runs`:** each rebuild, with how many cards and how long it
  took.

Each deploy's summary on GitHub also says when the search was rebuilt and that
the English and Thai checks passed. `infra/README.md` ("Search") has the
details.

## Things to remember

- **A new page on the site** is found once it's added to
  `functions/src/lib/site-pages.js` (a test checks every page there is real and in
  the sitemap).
- **A new prayer or saint** needs nothing extra: the cards are rebuilt after
  every publish.
- **Other names for a prayer** go in `aka` in `pray/prayers.json`.
- **Changing how a field is cut** means bumping `SEARCH_SCHEMA_VERSION`; the
  deploy builds the new index beside the old one.
- **If Azure ever removes the free service** (it may, after a long time unused):
  1. re-run bootstrap;
  2. run the Azure Platform workflow by hand (it applies the layout and rebuilds
     the cards);
  3. restart the API.

  Until then the page's own simple search answers.
- **The Ordo calendars** need next year's file before New Year, as before; the
  search uses them too.
- **Next:** a Catechism gate (AB#94), written in our own words with links to the
  official text, whose cards will join this same index.

## New foundations met in this phase

Search index (inverted index) · field · analyzer and token · word breaking ·
stemming vs lemmatization · accent folding · prefix search · stop words · phrase
search · relevance (BM25) · scoring profile · synonym map · fuzzy search ·
indexer, push vs pull · highlighting · versioned rebuild · debounce · custom
role · injection and XSS · spike · verification · flaky test. See
[foundations.md](foundations.md).
