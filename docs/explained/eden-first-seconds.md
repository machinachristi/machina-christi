# Eden's first seconds: a full shopping list, no double asking, and the title card that stays

*November 2026, AB#169. The second of several small steps from the review of
how Eden first loads (after AB#167, which let the homepage's gate open the
garden straight away).*

## What a visitor notices

You tap the Eden gate on the homepage. While the garden downloads, the screen
now keeps the tree, **EDEN** and Genesis 2:8, with *entering…* breathing
quietly beneath. Before, all of that faded away and left an almost empty dark
screen with one small line, for the second or two the garden takes to arrive.
Then the card dissolves into the moving garden, as before.

The garden should also arrive a little sooner. In a lab copy of the site, a
pretend Thai phone (a tenth of a second per [round trip](foundations.md),
20 Mbit/s, a processor four times slower than a laptop's) went from about
2.9 seconds to about 2.25 seconds. The real proof is measured on the live site
after this change goes live. Test copies of the site (PR previews) take 20–26
seconds to start, so their numbers don't compare.

## Why the garden was slower than it needed to be

The garden is about 120 small files of code. Each one names, at its top, the
others it needs (its *imports*). A browser left alone finds them the way you'd
cook from a recipe that says "see page 40" on page 12: open the first file,
read it, discover the next files, fetch those, read them, discover more. Each
"discover, then fetch" is a full round trip.

To skip that, the garden's own page (`world-app/index.html`) hands the browser
a shopping list up front: one `<link rel="modulepreload">` line per file, so
everything is fetched together from the first moment (see *Preload vs
prefetch* in [foundations.md](foundations.md)).

Eight files had never made it onto that list: the game stations and the
waymarker by the gate, Adam's dance, the almond, frankincense and hyssop
plants, and heaven's city and healing leaves. Nothing on screen broke, because
a file missing from the list still loads; it just loads *late*, about two extra
round trips after the rest. That's exactly the kind of mistake nobody notices.
So the fix has two halves:

1. **The eight lines are added.**
2. **A check makes sure it can't happen again.** `tests/world-start.spec.js`
   reads the garden's files without running them, follows every import from
   `main.js` (the garden's family tree, its *import graph*), and fails if any
   file in that tree is missing from the list. The failure message prints the
   exact line to add. It also fails the other way round, if the list names a
   file the garden doesn't use (a typo, or a scene that was removed), because
   that would be downloaded for nothing.

The weekly robot that grows the garden (the `update-world` routine) adds new
files most weeks, so its instructions now say: every new module gets its
line in `world-app/index.html`. If it forgets, the check stops its change
before it goes live, and tells it which line to add.

## No double asking

`world.html` is the page around the garden. While a visitor reads its intro
("A rendition of the first garden…"), it quietly fetches the four heaviest
files in the background, so they're ready when "enter the garden" is tapped.
That's a *prefetch*: buying tomorrow's bread on the way home.

Since AB#167, visitors who come through the homepage's gate skip the intro:
the address ends in `#enter`, and the garden starts loading at once. Then the
background fetch was pointless. The garden was already asking for those same
files at full speed, so they could be asked for twice. Now the background
fetch stands aside whenever the garden is already on its way: arriving at
`#enter`, or tapping "enter the garden" before the quiet moment it waits for.

## The title card that stays

This was a small change to the page's style rules (CSS). One rule said "while
loading, fade the tree, the name and the verse to nothing". That rule is gone.
The intro's sentence and its button still step aside, and *entering…* takes
their place, right under the verse.

Three things were kept on purpose:

- **"return home" stays** in its corner the whole time.
- **Kind to the eyes.** Every word on the card is at least 14 pixels tall on
  a phone. The verse's "GENESIS 2 : 8" line grew a little to meet that.
- **Less motion if you ask for it.** A phone set to reduce motion shows
  *entering…* still, without the breathing, and nothing on the card fades.
  The page still can't be pinch-zoomed, as for all of Eden.

The owner chose the look from real phone-size screenshots, before and after,
not from sketches.

## The checks that guard it

`tests/world-start.spec.js` runs with the site's quick tests: none of it needs
the garden itself to run, so it doesn't slow the heavy garden tests.

- **The list:** every file the garden imports is preloaded, and every
  preloaded file is really imported, once. A check on the check makes sure the
  file-reading still finds three.js and the waymarker (two steps from
  `main.js`), so it can't pass by finding nothing.
- **The background fetch:** it happens while the intro is read, and not after
  `#enter` or a quick tap. The test catches the browser's "quiet moment"
  itself and decides when it comes, so nothing depends on timing.
- **The card:** on two phone sizes, both ways in (gate and button), the tree,
  EDEN, the verse, *entering…* and "return home" are visible, the button is
  gone, and every word is at least 14px. With reduced motion, the line holds
  still.

The garden's own page is held back on purpose in these checks (a *stand-in*),
so the page stays on its loading screen while the test looks at it.

## What comes next

From the same review, in order: the homepage fetching Eden's two pages ahead
of time; packing the garden's 120 files into a few (with names that change
whenever their contents do, so phones can keep them forever); and a richer
loading moment (the verse unfolding, the tree's fruits lighting up as real
progress, a soft first picture of the garden).

## Words used here

Round trip, import graph, and preload vs prefetch are in
[foundations.md](foundations.md), under *Speed and cost*. *Stand-in (mock)* is
under *Making changes safely*.
