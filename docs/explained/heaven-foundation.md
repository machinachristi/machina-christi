# Heaven — Jacob's ladder from Eden to a first heaven

*Built October 2026 (board item AB#106). Words in **bold** are explained in
[foundations.md](foundations.md).*

## What changed, in one sentence

Eden grew a second realm: a golden ladder of light now stands on the far bank
of the river, straight ahead of where Adam arrives, and walking into its foot
carries him up to a first heaven, where the saints of the site's own calendar
stand along a river of light, and walking back to the ladder's head brings him
home to the garden.

## The story, like you're five

**Two floors of one house.** Eden and heaven are like the ground floor and the
upper floor of a house. You can only be on one floor at a time, and nobody
lights the floor you're not on. In the code each floor is its own **scene**:
the box of things the computer draws each frame. Only the scene Adam is in
gets drawn, so heaven costs the garden nothing at all.

**The ladder.** "Behold a ladder set up on the earth, and the top of it
reached to heaven: and behold the angels of God ascending and descending on
it" (Genesis 28:12). It rises out of sight into light, in a soft column of
it, with ten small angels of light going up and down, and Jacob's stone
beside its foot (Genesis 28:18). You can see it from the very first second on
a phone, between the two sacred trees. To reach it you cross the river,
wading or by the stepping stones.

**The climb.** Walk into the foot and Adam turns to the ladder and climbs,
hand over hand. The words "Beth-el · the gate of heaven" (Genesis 28:17)
appear, and warm light fills the screen: that's the **veil**. Behind the veil
the stage is changed, and when it lifts he is standing in heaven.

**Heaven.** There is no night there (Revelation 22:5), and God is shown only as
light (21:23): a great soft light far in the north with an emerald bow round
about it (4:3). No throne and no figure. Those are for later, designed by
hand. From the light runs the river of the water of life, clear as crystal
(22:1), down the middle of a street of pure gold "as it were transparent
glass" (21:21). The Tree of Life stands on both banks of it at once, one
crown over the water, with twelve fruits (22:2). Around the light, in tiers,
stand thousands of soft lights: the multitude no one could number (7:9).

**The saints.** Along both banks stand the 161 saints of the site's calendar,
as robed figures of light, with no faces and with halos. Each carries what
its title says: a palm for a martyr, a book for a doctor of the Church or an
evangelist, a lily for a virgin, a shepherd's crook for a bishop or pope, and
a small flame over the head for an apostle (Acts 2:3). They stand in the
order of their feasts, January nearest you, so walking toward the light walks
through the year. Draw near one and its name, title and feast day appear. A
record that names several saints ("Saints Peter and Paul", "…and
Companions") stands as a small group of two or three.

**Today's saint greets you.** If today is a saint's day in the calendar, that
saint stands at the head of the ladder to meet Adam, robed in the day's
colour, and turns toward him as he moves. On 19 October that is Saints John
de Brébeuf and Isaac Jogues and their companions, in red.

**And home again.** Walk back to the ladder's head (look for the column of
light), and the veil comes again; Adam climbs down into the garden and steps
off, with the ladder rising behind him. While he was away, the garden's clock
stood still.

## Why it was built this way

**Built only when needed (lazy loading).** Heaven's pieces aren't built when
the garden opens. They're built in the background when Adam first comes
within about 15 metres of the ladder, a little at a time, so walking never
stutters. It's like a theatre setting up the second stage only once the
audience heads toward it. Visitors who never climb never pay for heaven.

**The saints come from the site's own records.** A small, careful reader
(`world-app/heaven/saints.js`) fetches the same two files the Ordo page uses:
the saints' records and the liturgical calendar. It's a **same-origin
request**, asking our own website for our own file, which the site's security
rules allow. It keeps only each saint's name, title and feast day. It never
keeps the life stories (bios), because some of them describe martyrdoms in
detail, and heaven is a place of joy (Revelation 21:4). Two small rules came
from the data itself:
- **Two calendars, not one.** In a single year about 26 saints' days fall on a
  Sunday, and the Sunday wins, so this year's calendar doesn't list them. The
  reader also looks at next year's, so every saint gets a feast day.
- **St Joseph has two records** (19 March and 1 May). In heaven he is one man,
  carrying both feasts.

**Nothing in heaven can break the garden (fail-safe).** The page around the
world removes the whole world if any error escapes, even long after it has
loaded. So everything heaven does (reading the saints, building, every
frame's work and drawing) runs inside a guard. If anything goes wrong, Adam
stays in Eden, or is brought gently back down to it, a quiet note goes to the
browser's console as a warning, and the ladder rests for the rest of the
visit. The same happens if heaven isn't ready eight seconds after the veil
is full. It's a **fail-safe**: when it fails, it fails into the safe place.

**A state machine for the journey.** The way between the realms is a short
list of states: in Eden → climbing → under the veil → arriving → in heaven →
leaving → climbing down → stepping off → in Eden. At every moment Adam is in
exactly one of them, and each state says exactly what can happen next. It's
like a lift that is always either stopped at a floor, going up, or going down,
never half of two. It makes the journey hard to break halfway.

**The same budget as the garden.** Phones can only draw so many things per
frame (**draw calls**). Eden's limit is 200. Heaven stays well inside it:
about 25 things drawn, because each kind of thing is drawn once however many
there are (all 194 saint figures in one go, all their halos in another, all
the multitude's lights in one). That leaves heaven plenty of room to grow.

**It grows week by week, but the saints are locked.** The weekly Eden routine
will furnish heaven from now on. It may change heaven's other parts, but never
the saints' reader: CI's **World Diff Guard** refuses any routine change to
that one file. Who the saints are, and what is said of them, changes only by
hand.

## How we know it works

Four new **locked** checks (the weekly routine can never edit them) run on
every change:
1. **The round trip.** Walking into the ladder carries Adam up to heaven,
   heaven stays under 200 draw calls and 150,000 triangles while he arrives,
   he can walk there, and walking to the ladder's head brings him back to the
   foot, with the garden drawing again and no errors.
2. **If heaven can't be built** (the check forces the build to fail), he
   stays safe in Eden and the world lives on.
3. **If something goes wrong inside heaven** (the check forces a fault a
   moment after he arrives), he is brought home to Eden and the world lives
   on.
4. **If the saints' records are missing**, heaven still opens, with the
   multitude and no named saints.

Two feature checks pin the details: on 19 October, today's saints greet him
with "· today", every one of the 161 saints is there, the first in the ranks is
named with its feast day as he draws near; and the angels really do go up and
down the ladder.

## Things to remember

- **To see another day's saint**, add `?day=2026-12-26` (any date) to the
  world's address.
- **Heaven's look will follow the restyle.** When the Eden restyle (AB#88)
  lands, its colours and glow should cover heaven's scene too.
- **Christ, the Blessed Virgin Mary and the throne** are not shown, and will
  only ever be designed by hand.

## New foundations met here

Scene · draw call · lazy loading · same-origin request · fail-safe · state
machine. See [foundations.md](foundations.md).
