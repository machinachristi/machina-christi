# A card for every prayer: what a shared link shows, and how search engines find each prayer

*November 2026, from the whole-site review (item M1, AB#147).*

## What changed for a visitor

When you paste a Machina Christi link into iMessage, LINE, WhatsApp or
Facebook, the app shows a small card with a picture, a title and a line of
text. Until now every link showed the same card: a view of the Eden garden
from the sky, titled "Pray · Machina Christi" for every prayer.

Now:

- **Each prayer has its own card.** The Hail Mary's card says *The Hail
  Mary* and *บทวันทามารีย์* in gold under the Machina Christi sprig, with
  "MACHINA CHRISTI · PRAY" at the foot. The card's text line gives the prayer's
  short description ("the angel's greeting"). That line was left off the
  picture itself because it would be too small to read in a phone's preview.
- **The homepage and most other pages show the site's own card:** the gold
  sprig, the name, and *A little place to pray, to learn, and to wander*.
- **Eden's pages** (the garden and About Eden) keep the garden picture,
  because there it fits.

Each prayer also lives at an address of its own, such as
`machinachristi.com/pray/hail-mary.html`, and the sitemap lists all fourteen,
so search engines can find each prayer and list it by name.

## Why a prayer needed a page of its own

A chat app making a card fetches the page and reads only the few labelled lines
at its top (see *Link preview* in [foundations.md](foundations.md)). It never
runs the page's code.

The prayer page was one page for all the prayers. The address said which one
(`prayer.html?p=hail-mary`), and the page's code read that and filled in the
words *after* it opened. A person saw the Hail Mary. The chat app, which never
runs the code, saw only the blank form, the same one for every prayer.

So each prayer now gets a real page with its name already written into the top.

## How fourteen pages stay one page

Fourteen copies kept by hand would drift apart: a fix made in one and forgotten
in the others. So nobody keeps them by hand. It works like a mail-merge:

- `prayer.html` is the master letter. All the design, the Listen buttons and
  the pronunciation guide live there, and only there.
- `scripts/build-prayer-pages.mjs` is the merge. For each prayer in
  `pray/prayers.json` it copies the master and changes only the top lines (the
  title, the description, the picture, the page's own address). It also writes
  the prayer's name on the page, so the page's code knows which prayer to show.
  It updates the sitemap at the same time.
- `scripts/build-share-cards.mjs` draws the pictures. It opens a small design
  page, `scripts/share-card.html`, in the same robot browser the tests use, and
  takes a photograph at 1200 × 630, the size chat apps expect.

These are *generated files* (see [foundations.md](foundations.md)). A new test,
`tests/prayer-pages.spec.js`, reruns the merge and compares. If someone edits
the master or adds a prayer and forgets to rerun the scripts, the test fails
and says which command to run.

## Old links still work

Links already sent to people use the old shape, `prayer.html?p=hail-mary`.
That page still opens, sees it has no prayer of its own, and forwards the
visitor straight to `pray/hail-mary.html`. Like a forwarding address after a
move, it keeps any part of The Mass named in the link
(`…#part-lamb-of-god`). Search results still use the old shape for now and are
forwarded the same way. They'll point to the new pages directly the next time
the search part of the API is changed.

## Did robots.txt need changing?

No. `robots.txt` is the sign on the gate for search engines, and ours already
says "everything is welcome". What helps a search engine find each prayer is
the **sitemap**, the map of rooms, which now lists all fourteen. Each prayer
page also says which address is its real one (its *canonical address*), so the
old and new links aren't filed twice.

## The idea underneath

**One source, many outputs.** Software often keeps a single true copy and lets
a program make the many versions people need, the way a printer runs one plate
for a thousand leaflets. You edit the plate, never the leaflets. Done well, a
check makes sure the leaflets were reprinted after the plate changed.
