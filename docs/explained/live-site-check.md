# The morning walk — a robot checks the live site every day

*AB#118 · November 2026*

## What changed, in one sentence

Every morning a robot visitor, sized like a phone, walks through every gate of
the real machinachristi.com, checks that each page opens cleanly and that the
saints, prayers, recordings and search really answer, and, only if something
is broken, writes it up on the planning board.

## The story, like you're five

**Exams and a caretaker.** Until now every check on the site was an exam
(a test) taken *before* a change goes live: change something, and more than
150 tests walk a copy of the site on a test machine. But a website can break
when nobody touched it. A service it relies on can stop, a certificate can
run out, a cache can keep a bad copy. Exams can't see that, because they only
run when something changes. So the site now also has a caretaker: a check
that walks round the *live* building every morning, whether or not anything
changed. That second kind of check is called **monitoring**.

**What the caretaker looks at.** The robot (Playwright, the same one that runs
the tests) opens every page the sitemap lists, plus one prayer, and notes
anything that goes wrong on the way: a script error, an error message in the
browser's console, content the security rules blocked, or a request to the
site or its API that failed. Then it checks that each gate does its work:
- the homepage shows every gate and today's place in the Church year;
- Ordo shows St Agnes's life, and the answer came from the saints database;
- Pray lists every prayer, and a prayer's lines arrive from the API;
- search finds Agnes by name, and a prayer by its Thai words;
- Eden's garden opens, Camino's game draws, Logos shows its letter cards and
  the Workshop builds its city of light;
- every prayer recording (10 prayers, Thai and English, normal and slow:
  40 files) starts to play;
- the padlock: both addresses' certificates have more than two weeks left.

**The trap it had to avoid.** The pages are built to be kind: if the API
doesn't answer within five seconds, they quietly show the copy of the prayers,
saints and search cards that ships with the site. A visitor barely notices.
But a robot that only *looked* at the page would see prayers on the screen and
report "all fine" while the API was down. So it also listens to the page's own
conversation with the API, and checks the answer really came from there.
(The word for the kindness is **fallback**, or graceful degradation.)

**It doesn't count as a visitor.** The site counts visits (telemetry) to learn
how it's used. A robot visiting every morning would make the numbers lie. So
the robot tells the site "please don't track me" (Global Privacy Control,
which the counting script already honours), and answers anything that would
count it itself.

**Why it runs on the Mac.** The plan was to run it on GitHub's computers,
which run the tests, so it would work even with the laptop closed. But
Cloudflare, the front gate every visitor passes through, has bot protection
(Bot Fight Mode) that turns GitHub's computers away: they come from a
computer centre and look like machines, which they are. The Mac visits from an
ordinary home address, so it is let in like anyone else. Running there also
means it can write to the board with the builder's own sign-in, so no new key
or password exists anywhere. The cost: it only runs while the Claude app is
open. If the app is closed when the check is due, it runs the next time the
app opens.

**A second try, on purpose.** After a quiet night, the API's first answer can
be slow: the cloud parks programs nobody is using, and the first visitor
waits while one starts again (a **cold start**). So each check gets a second
try, and the routine reruns anything that failed both. A real fault keeps
failing; a yawn doesn't. (The first slow answer seen while building this
looked like a yawn, and turned out to be a real fault: see below.)

**A fresh desk each morning.** The checklist reads what *should* be there
(the gates, the pages, the prayers) from the project itself. So it must read
the same version that is live: main. The usual folder is often on some other
branch, half-way through other work. So each morning the routine sets up a
fresh second desk (a git **worktree**) holding main, runs the check from there,
and clears it away afterwards.

**When something is broken.** The routine first looks on the board for an
Issue it already opened about the same thing, so one problem makes one Issue,
not one a day. It writes what a visitor would notice, which checks failed,
and its best guess at the cause, clearly marked as a guess. It never changes
the site, the code or any Azure or Cloudflare setting: a caretaker reports
the broken window, he doesn't start rebuilding the wall.

## Why it was built this way

- **A test file, not a special program.** The check is ordinary Playwright
  tests (`tests/live/live-site.spec.js`) with their own settings
  (`tests/live/playwright.config.js`). Anyone can run it by hand with one
  command, and it reuses the test helpers Eden's tests already trust. The
  usual tests skip that folder: they check a copy, this checks the real thing.
- **One visitor at a time.** Cloudflare allows 20 API requests per 10 seconds
  from one address. The check opens one page at a time and spaces out the 40
  recording requests, so it stays well inside that limit, the way a real
  visitor would.
- **Expected numbers come from the project, not the test.** "How many gates?"
  is read from `index.html`, and the prayers from `pray/prayers.json`. Add a
  gate or a prayer and the morning check expects it the next day, with no
  edit to the check.
- **AI on top, plain test underneath.** The scheduled task is a Claude run,
  so a failure arrives explained in plain words, with the duplicates sorted
  out. But the verdict comes from the tests, not from the AI's opinion.

## How we know it's right

It was run against the live site three times while it was built, and each
run taught something:

1. **Every page "failed" within 4 seconds: the checklist's own fault.**
   Cloudflare adds its own visitor counter to each page, sealed with a
   fingerprint (an *integrity* hash). The first checklist swapped it for an
   empty stand-in so the robot wouldn't be counted, and the browser rightly
   refused a script that didn't match its seal. Now the counter loads as it
   is and only its report is caught.
2. **21 passed, 1 passed on its second try, 7 failed.** Six were the same
   harmless thing: the pages fetch likely next pages early (prefetching),
   Cloudflare refuses every such early fetch ("prefetch refused: not
   eligible"), and the browser's console repeats each refusal as an error.
   The checklist already set those refusals aside; now it ignores the
   console's repeat too. The seventh was **real**: twice, a request for a
   recording or a prayer got no answer for 45 seconds. Followed up by hand:
   the API's own records show it answers in a few milliseconds, but some
   requests wait 10 to 55 seconds at Azure's door before reaching it, through
   Cloudflare or directly. Pages hide it by falling back after 5 seconds; a
   recording has no copy to fall back on. Written up as **AB#125**.
3. **All 29 passed** in 3.8 minutes. The recordings check took twice its
   usual time, so the waits were still happening, just under 45 seconds.

So the check has been seen to fail for a real fault, for its own mistake and
for harmless noise, and each was told apart. The usual pre-merge tests list
191 tests, none of them from `tests/live/`.

## Things to remember

- Run it by hand: `npx playwright test -c tests/live/playwright.config.js`
  (from a copy of main, so the checklist matches what is live).
- The routine is the scheduled task **live-site-check** in the Claude app,
  every morning at about 8:10 (Mac time; the app adds a few minutes so
  routines don't all start at once). Its instructions live outside the
  project, in `~/.claude/scheduled-tasks/live-site-check/SKILL.md`.
- If every check fails at once, suspect the Mac (asleep, offline, lid closed
  on battery) or Cloudflare's bot protection before the site.
- The waits at Azure's door (AB#125) came from the API seating only 4
  requests at once; it now seats 32 ([the waiting room at Azure's
  door](api-waiting-room.md)). If the recordings check slows down again,
  look there first.
- The pages' prefetch hints (homepage gates, Eden's warm-up) never help on
  the live site, because Cloudflare refuses them. That's speed, not breakage,
  so the check ignores it; Cloudflare's Speed Brain setting decides it.
- Not covered yet: links to other websites (Vatican.va, the saints' sources)
  and whether the newest merge has reached the live site.

## New foundations met here

In [foundations.md](foundations.md): **monitoring**, **cold start**,
**certificate (the padlock)**, **bot protection**, and **worktree (a second
desk)**. Also met again: fallback, rate limit, telemetry, flaky test.
