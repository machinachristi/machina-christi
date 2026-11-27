# Three gates: Pray, Wander, Build

*Board item AB#172 (steps 1 and 2); step 3 gets its own Eden item. Started
27 November 2026. Words in **bold** are explained in
[foundations.md](foundations.md). This page grows with each step.*

## What is changing, in one sentence

The front door goes from six gates to three (**Pray**, **Wander** and
**Build**) without deleting a single page or changing a single address: the
rooms only move behind different gates, the way furniture moves between rooms
when you rearrange a house.

## The whole plan

On 25 November 2026 the owner walked a "show home" of ideas (PR #144) and chose
three gates. The written plan, approved on 27 November, does it in three steps,
each one its own small **pull request**:

1. **The new rooms are made ready.** The Pray page gains a door to Ordo, and a
   new Build page holds the Workshop and the side projects. The front door
   doesn't change yet.
2. **The front door becomes three gates.** About becomes a small book in the
   corner, and the words that describe the site change with it.
3. **Logos gets a station in the garden,** like Camino's waymarker.

Where everything ends up:

```
PRAY   → pray.html, the Pray room
   ├─ Ordo: today in the Church              (new card at the top, step 1)
   └─ the prayers, The Mass first
WANDER → world.html, Eden
   ├─ heaven, up Jacob's ladder
   ├─ Camino, at the waymarker by the gate
   └─ Logos, a station in the garden         (step 3)
BUILD  → build.html, the Build page          (new, step 1; its gate comes in step 2)
   ├─ Workshop: how it's built
   └─ Projects: Camino, Logos
```

Steps 1 and 2 follow one rule, the same as building a new road before closing
the old one: **expand, then contract**. First every room gets its new door
(step 1), and only then are the old doors taken away (step 2). So Ordo, Logos
and Camino are never cut off, not even for a day.

## Step 1: the new rooms are made ready (AB#172)

### What changed

- **`pray.html`, the Pray room,** has a new card above the prayers: **Ordo**,
  "today in the Church", the old Ordo gate's own words. It glows Ordo's violet
  when touched, where the prayers glow Pray's blue.
- **`build.html` is new.** It is built from the Pray page's frame (the same
  "‹ home" and "search ›", the same cards), lit with the Build gate's warm
  timber colour. It holds:
  - a **Workshop** card, "how it's built";
  - a **Projects** card with one line per side project: **Camino**, "the
    pilgrim road", and **Logos**, "learning Thai, letter by letter".
- **A new test walks the whole site from the front door** and fails if any
  page in the **sitemap** can't be reached by following links. See "No room
  without a door" below.

Nothing on the front door changed. The Build page isn't linked from anywhere
yet and isn't in the sitemap. It's a room furnished before its door is cut.
The owner checks it at its address on the pull request's **preview site**.

### The story, like you're five

**A page is written, or a page is drawn.** A web page arrives as a written
sheet (the **HTML**), and then its little programs (**scripts**) can add
more to it. The Pray page's prayers are *drawn*: a script fetches the list of
prayers and makes a card for each one, which takes a moment. The Ordo card is
*written*: it's on the sheet itself. So it's there the instant the page
arrives, before the prayers, and even on a phone that has scripts switched
off. It's the difference between a sign painted on a door and one someone
comes along later to hang up. A door you need should be painted on.

**Every room on one card.** The Build page's Projects card is a list, not a
single link: a small heading, then one line per project, each line its own
door. Each line is at least 44 points tall, the size phone makers recommend
for a thumb, and a test checks a tap a little off-centre still lands.

**A room with no door.** A page that no link points to is an
**orphan page**. It exists and works, but only someone who already knows its
address can find it, like a room in a house with the doorway plastered over.
Moving the gates around is exactly the kind of change that can orphan a room
by accident: take away the Logos gate, forget to add Logos to the Build page,
and Logos is still there but nobody can find it.

### No room without a door: the new guard

`tests/site-map.spec.js` turns the promise "no page becomes unreachable" into
a **test**: something the robot (**CI**) checks on every pull request.

It works like a visitor who taps everything. It starts at the front door,
opens each page in a real browser, writes down every link on it, then visits
each new page in turn, until no new pages turn up. Then it checks every
address in `sitemap.xml` is on its list. Because it uses a real browser, the
links that scripts draw (the prayer cards, "Pray today", Ordo's prayer of the
day) count too.

Two details:

- **End rooms.** Eden, the Workshop and Camino draw whole 3D worlds and only
  link back home, so the walk notes them as reached without opening them.
- **Prayers said only at Mass.** The Lamb of God and "Lord, I Am Not Worthy"
  have no card of their own on the Pray page. That was decided when The Mass
  was built: they are said inside it. A visitor finds them in The Mass's
  numbered list of parts. Their own pages stay in the sitemap for search
  engines and shared links. So the walk counts them as reached when it reaches
  The Mass and finds its link to their part. Only prayers marked "said only at
  Mass" in the prayer file get this pass.

The test attaches a list of the route it found to each page, such as
`/pray/memorare.html ‹ /pray.html ‹ /`, so a failure is easy to read. The
test passed on the first day, as it should: today's six gates leave no room
without a door. Its job is step 2, where three gates are taken away.

**Testing the tester.** A guard is only worth having if it fails when
something is really wrong. So before trusting it, `build.html` was added to
the sitemap for one run (nothing links to it yet). The test failed and named
exactly that page, then the sitemap was put back.

### What it teaches about software

- **Expand, then contract.** When you move something people rely on, add the
  new way first, check it, and only then remove the old one. Two small,
  separate changes are safer than one big swap, and if the second one goes
  wrong, the first still stands.
- **Write the promise down as a test before the risky change.** "No page
  becomes unreachable" was true by luck until now. A test written *before*
  step 2 makes it true on purpose, and it will hold for every reorganization
  after this one.
- **Change the counter when the room changes.** Several old tests counted
  "every card on the Pray page" to mean "every prayer". With Ordo's card in
  the room, they now count the cards in the prayer list only. One of them is
  in the daily walk of the live site, so that walk won't trip the morning
  after this goes live.
- **What's important is written, not drawn.** Anything a visitor must be able
  to reach goes into the page itself, so it never waits on a script.

### How to add a side project

1. Add one line to the Projects card in `build.html`: copy the Camino `<li>`,
   change the address, the name and the short phrase.
2. If it has a story, add an About page for it (`about-<name>.html`) and a card
   on `about.html`.
3. Add the new pages to `sitemap.xml`. The site-map test then proves they can
   be reached.
4. Add the project to `tests/build.spec.js` (the `ROOMS` list at the top).

### How the owner checks it, on a phone

On the pull request's preview site:

- Open `/pray.html`: Ordo is on top. Tap it, then "‹ home". The prayers still
  list below it (12 cards).
- Open `/build.html`: tap Workshop, Camino and Logos in turn.

## Step 2: the front door becomes three gates (AB#172)

### What changed

- **The front door has three gates: Pray · Wander · Build.** It opens on
  Wander, in the middle, so Pray and Build are each one swipe away, and a swipe
  past either end loops round to the other.
  - **Pray**, "prayers in Thai & English", opens the Pray room (with Ordo at
    the top since step 1).
  - **Wander**, "the digital garden", opens Eden. It is the old Eden gate with
    a new name.
  - **Build**, "the workshop & projects", opens the Build page. It is the old
    Workshop gate, with a new name and a new address.
- **The About, Ordo and Logos gates are gone.** Their rooms are all still there,
  behind the new gates.
- **About is a small open book in the top-left corner,** opposite the Search
  glass. It's the same book the About gate carried, at thumb size (44 points).
  It arrived in the same change that removed the About gate, because that gate
  was the only way into the About pages.
- **Two small lines of text grew from 13 to 14 points:** the words under each
  gate and the "Pray today" label. 14 is the site's floor for easy reading on a
  phone.
- **The words that describe the site changed too:**
  - the link-preview and search-engine description now names the three gates;
  - the About page groups its six stories under them (Pray: Ordo, Pray;
    Wander: Eden; Build: Workshop, Camino, Logos), the one place the whole map
    shows;
  - the README's "The gates" section;
  - the glossary's "Website" entry;
  - a one-line pointer at the top of the two older write-ups about the door.
- **The sitemap** gains the Build page, so search engines can find it.

### The story, like you're five

**Moving the signs, not the rooms.** No page was deleted, renamed or moved, so
every address anyone has saved or shared still works. Only the signs on the
front door changed. It's like a shop that moves its displays around: the
stockroom is the same, the doors to it are new.

**A name tag outlives the name.** Every piece of a page can wear a hidden
**class name**, a tag that only style rules and tests read. The middle gate's
words now say "Wander", but its tag still says `portal--eden`. Three things
find the gate by that tag: the door's own script (to know which gate to open
on), a locked Eden test, and the daily walk of the live site. Changing the
words and keeping the tag meant none of them had to change. The Workshop
gate's tag did change, to `portal--build`, because it now opens a different
room.

**Sweeping up.** The three gates that left had their own colours (violet for
Ordo, parchment for About, lacquer red for Logos) and their own style rules.
Nothing used them any more, so they were deleted in the same change. Code that
nothing uses is called **dead code**. Leaving it behind costs nothing on the
day, but it confuses the next person to read the file.

### What the tests check now

- **The door** (`tests/home-and-doors.spec.js`):
  - three gates, in the order Pray, Wander, Build, with their words and
    addresses;
  - no About, Ordo, Logos, Camino or Workshop gate;
  - three dots, the middle one lit on arrival.
- **Every tap and swipe test was turned round.** Pray now peeks in on the
  *left*, so the "tap a side gate" test aims at its right-hand edge. The
  desktop arrows walk Wander → Build → Wander → Pray, then loop to Build.
- **New checks:**
  - the book opens About: top left, level with the glass, at least 44 points
    square, and the keyboard works too;
  - the Build gate opens the Build page;
  - the gates are exactly 203 points wide on a common phone, as before;
  - no text on the door is under 14 points, on a common phone and a small one;
  - both corner buttons answer a thumb;
  - the Workshop test now walks door → Build → Workshop;
  - About groups its stories under the three gates.
- **The guard from step 1 did its job.** `tests/site-map.spec.js` walks the
  whole site from the front door. With three gates removed, it still finds every
  page in the sitemap, including the new Build page. That is the proof that no
  room lost its door.

### What it teaches about software

- **The contract step is the risky one, and the expand step made it safe.**
  Because every room got its new door in step 1, this change only *removes*
  things, and a test already stood guard over exactly what could go wrong.
- **Change the words and keep the hooks.** What visitors read and what code
  holds on to are different things. Keeping the tag `portal--eden` let the name
  change without touching three other places.
- **Sweep as you go.** Delete what a change makes useless in the same change,
  while the reason is still fresh.

### Left for later, on purpose

Search keeps its own list of pages in `functions/`, the API's folder, which
this plan never touches. So, for now, the search page's card for the homepage
still names the six old rooms, and the Build page isn't in search. Fixing both
means redeploying the API and rebuilding the search index, a separate change
for another day, with the owner's OK. (The owner gave it the same day: see
"Search learns the new door" below.)

## After step 2: search learns the new door (AB#174)

### What changed

Search keeps its own list of the site's pages, separate from the pages
themselves: `functions/src/lib/site-pages.js`, in the **API**'s folder. Each
entry becomes a card in the **search index**, so typing "garden" finds Eden.
Two entries were out of date after the door changed:

- **The homepage's card** still named the six old rooms. It now says the site
  is "a gathering place of experiences, behind three gates: Pray (Ordo and the
  prayers), Wander (Eden, the garden) and Build (the Workshop and projects)".
- **The Build page had no card,** so search couldn't find it. It has one now,
  with the words people might type: "build", "projects", "workshop", "Camino",
  "Logos".

### The story, like you're five

A library has books on shelves and, separately, a card catalogue that says
what's on them. Moving the books doesn't change the catalogue. Someone has to
go and rewrite the cards. Search's list is that catalogue. When the front door
changed, the pages were right at once, but the catalogue still described the
old door until this change rewrote two of its cards.

### How it reaches the live site

Changes to the API's folder take a different road from page changes. Merging
runs the **Azure platform** workflow: it checks the API's own tests, publishes
the new API, and then posts a "please rebuild" message for the API, which
re-makes every search card from the list. The weekly jobs also rebuild the
cards every Sunday, so even a missed message is put right within a week.

### What it teaches about software

- **Two copies of the truth drift apart.** The pages describe themselves, and
  search keeps its own description. Change one and the other goes stale unless
  something checks them together. Here, an API test checks that every search
  card points at a real page in the sitemap; nothing yet checks the words
  match, so a person still has to.

### How the owner checks it, on a phone

On the pull request's preview site:

- The door opens on Wander. Swipe left for Pray, right for Build, and past
  either end to loop round.
- Tap each gate. Build should open the Build page and its three links.
- Tap the book for About, and see the stories grouped.
- "Pray today" is still there, nothing scrolls, and every word is easy to read.

## Step 3: a Logos station in the garden

*Not built yet.*
