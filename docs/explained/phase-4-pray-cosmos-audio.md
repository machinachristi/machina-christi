# Phase 4 — the prayers get a library and a voice

*Built October 2026 (board item AB#41). Words in **bold** are explained in
[foundations.md](foundations.md).*

## What changed, in one sentence

The prayers moved into a second kind of database, **Cosmos DB**, and each one
was recorded by a studio-quality synthetic voice (Niwat in Thai, Andrew in
English, at normal speed and slowly), so the Pray pages now play the same
clear voice on every phone and light up each line exactly as it's read.

## The story, like you're five

Before, the Pray pages asked each visitor's own phone to read the prayer
aloud. Some phones have a lovely Thai voice; some have a robotic one; some have
one that says nothing at all. And the blue highlight had to guess when the
phone moved to the next line.

So we did three things.

**We built the prayers a library (Cosmos DB).** Each prayer is one folder: a
**document** holding its Thai lines, the pronunciation guide, the English, where
the words come from, and its recordings. Unlike the saints' library (Azure SQL),
this one never sleeps. Instead it gets a fixed allowance of effort every second
(**request units**, RU): 1,000 a second, free for life. Fetching one prayer costs
about 1. And we told Azure "never allow more than 1,000" (a **throughput
cap**), so the library *can't* cost money, however busy it gets.

**We hired a recording studio (Azure AI Speech).** A robot reader with a
natural-sounding voice (a **neural voice**) reads each prayer once. We hand it a
script (**SSML**) with an invisible flag at the start of every line (a
**bookmark**). As it reads, it calls out when it passes each flag, so we know
the exact second every line begins. Those **timings** are what let the
highlight follow the voice. The free plan gives 500,000 letters a month; all 10
prayers, four ways each, took about 14,000.

**We keep the recordings in a locked cupboard (private blob storage).** Nobody
outside can open it. When a visitor presses Listen, they ask the API, and the
API (which holds a reading badge) fetches the file and hands it over.
Cloudflare keeps a copy near the visitor, so after the first listener the API
is hardly ever asked again (an **edge cache**).

A **robot publisher** ties it together. When a prayer changes in the repo and
the change is merged, GitHub Actions records only what changed (each recording
has a **content hash**: change one word and the name changes), puts the files
in the cupboard, and updates the prayer's folder in the library.

And if anything goes wrong? If the API can't answer, the pages use their own
copy of the prayers and the phone's voice, exactly as before. If a recording
won't play, the phone's voice takes over. A visitor never gets silence (a
**fallback**).

## Why it was built this way

**Why a second kind of database?** The saints' SQL database is a filing
cabinet with strict drawers and cross-references: perfect for facts that point
at each other (a feast, its saints, their sources). A prayer is one
self-contained thing that's always read whole, so it fits a **document
database** better: one folder, fetched in one step. Learning when to reach for
which is the lesson. (Later, Phase 5's search reads both, and Phase 7's prayer
wall will keep visitors' intentions in this same library.)

**Why can the API read Cosmos DB live, when visitors never touch SQL?** The SQL
database sleeps to stay free and takes a minute to wake, so we copy it to a
sheet once a week (Phase 2). Cosmos DB never sleeps; its free allowance is
effort per second, not hours awake. One prayer costs about 1 RU, and the API
also remembers answers for five minutes, and Cloudflare for five more. So reading
it live is both fast and free.

**The shelf label (partition key).** Every folder is filed under a label that
decides where it's stored. We label each prayer by its own name (`/id`), so
finding a prayer by name goes straight to it: a **point read**, the cheapest
kind (measured live: 1 RU).

**No keys anywhere: only badges.** Every machine proves who it is with a
**managed identity**, and a **role** says what it may do:

| Who | Library (Cosmos DB) | Studio (Speech) | Cupboard (recordings) |
|---|---|---|---|
| The robot publisher (GitHub Actions) | write prayers | make recordings | put recordings in |
| The API | read prayers | — | take recordings out |
| You (the owner) | none! | none | none |
| A visitor | — | — | — (only through the API) |

Keys are switched off on all three services, so a leaked key would open
nothing. Notice the third row: owning the buildings (**control plane**) doesn't
let you read what's inside them (**data plane**). We proved it: signed in as
you, the library said "does not have required RBAC permissions".

**Who builds what.** Like the SQL database, the three new "buildings" are made by
the **hand-run blueprint** (`bootstrap.bicep`), not by the robot. The robot's own
role was tightened so it can't change them, read their keys, or give itself a
library badge. That last point mattered: Cosmos DB has its *own* badge system,
separate from Azure's, so the old rule that stopped the robot granting itself
Azure roles wouldn't have caught it.

**Why not lock the library to the API's private hallway, like SQL?** The robot
publisher and, in Phase 5, the search service both need to reach it from outside
that hallway, and the prayers are public text anyway. The badge is a strong
lock on its own. We'll revisit this in Phase 7, when the prayer wall holds
people's private intentions.

**Why recordings, not just the phone's voice?** The same clear voice on every
phone; real Thai tones; exact timings; and a slow version made by the studio
reading more slowly (natural), not by the browser stretching the sound
(smeared tones).

**Why does the page say the voices are synthetic?** Because they are, and a
learner deserves to know it. Microsoft asks for this disclosure too.

## How we know it's right

- **The sound test (a throwaway, like Phase 2's network test).** Before writing
  any real code we built a temporary studio, recorded the Our Father in six
  voices, checked that every line's flag came back with a time, that pauses
  really work in Thai (nine 0.6 s pauses added exactly 5.4 s), and you chose the
  voices by ear. Then the studio was deleted for good.
- **Tests:**
  - the recipe functions: the script, the fingerprints, the timings;
  - the API: answers, errors, and pieces of a file (**206**);
  - the pages, with a stand-in audio player whose clock the test moves by hand
    (a **fake clock**): "4.2 seconds in, line 3 should be lit".
- **Locks checked live:**
  - you, the owner, were refused by the library;
  - an anonymous visitor was refused by the cupboard;
  - with the API's exact narrow badge (given to you for a moment, then taken
    back), the library could be read.
- **First publish:** 40 recordings, 10 prayers written, 403.7 RU in all.
  Our Father in Thai is 33.6 seconds; its lines start at 0, 3.5, 6.2, 9.4…
  seconds.
- **Live:** the API lists 10 prayers; a recording answers in pieces (`206`);
  Cloudflare's second answer is a `HIT`.

**A lesson from the first run.** The robot recorded 20 files as fast as it
could, and the free studio hung up on the 21st. Free plans limit not only how
much you use but *how fast* (a **rate limit**: about 20 requests a minute here).
The fix: a steady pace (one request every 3.2 seconds), "wait and retry" on a
hang-up, and saving each prayer as soon as it's done so an interruption never
loses finished work.

## Watching it

Two saved questions (queries) in Azure's logs: how many prayer reads reached
Cosmos DB each day and how many RU they cost, and how often the API itself
(rather than Cloudflare) had to answer for prayers and recordings. Each robot
run also writes a summary on its GitHub Actions page: recordings made or kept,
letters used, RU spent. `infra/README.md` has the details.

## Things to remember

- **Adding or fixing a prayer** is a change to `pray/prayers.json`, reviewed in a
  pull request. The pull request's dry run says how many recordings it will
  make; merging records them and publishes. Thai text must come from a
  Church-published source, copied letter for letter.
- **Changing a voice or the slow speed** is a change to the `audio` settings in
  the same file; every recording is then made again (about 14,000 letters).
- **The free studio's limits:** 500,000 letters a month (it refuses, never
  bills) and about 20 requests a minute (the robot paces itself).
- **St Michael and St Joseph the Worker** wait for a Thai prayer book to cite
  (AB#84); the prayers of the Mass are planned too (AB#83).

## New foundations met in this phase

Document database · document · container · partition key · point read ·
request unit · provisioned throughput and its cap · control plane and data
plane · neural text-to-speech · SSML · bookmark · rate limit · private container
and relaying · byte ranges (206) · content hash and immutable caching ·
synthetic-voice disclosure · SAS · fake clock. See [foundations.md](foundations.md).
