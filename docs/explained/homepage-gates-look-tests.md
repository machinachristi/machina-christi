# The homepage gates — three look tests, and the light they left behind

*AB#114 · Tasks AB#115 (the look tests) and AB#116 (the change) · October 2026*

## What changed, in one sentence

After trying the homepage's gates as a 3D room in three different ways, the
page stayed as it was, one large gate at a time, and took from the 3D
versions only the three things that looked best, made with a few lines of
CSS: more of each gate's own colour glowing inside it (filling the whole arch
of the gate you're on), a brighter gold edge, and a glow around each emblem.

## The story, like you're five

**The wish.** The homepage is a row of arched gates, one standing in the
middle, the others peeking in from the sides. The idea was to make them
"real": arches standing in a dark room, drawn in 3D with three.js, the same
drawing kit Eden and the Workshop use.

**Try before you build.** Building a 3D homepage properly is weeks of work.
So first came *look tests*: quick, throwaway pictures of the idea at the
exact size of a real phone and a laptop, put next to today's page. Nothing on
the site changed while they were made. They live outside the project and were
thrown away afterwards; only what they taught stays.

**Look test 1: every gate at once.** Seven gates in a room, all visible
without swiping. On a small phone that makes each gate about 75 pixels wide
(today's middle gate is 195), so the room had to use the screen's height. Two
layouts were measured: two rows (four below, three above), and a horseshoe,
like standing at the open end of an apse. Two rows kept every gate the same
size; the horseshoe made the far gates smallest, and some names touched.
Either way, seven small arches read like a menu of buttons. **Verdict: one
large gate looks better.**

**Look test 2: the single gate made real.** Today's exact layout and size,
but the gate standing in the 3D room: light falling on a floor, arches with
real depth, and the room turning when you swipe. To compare fairly, both
pages were recorded doing the same moves at the same moments, frame by frame
on one shared clock, and laid side by side as a video. It was lovely in
motion, but in a still picture very close to today, for the cost of a 3D
engine and the phone's graphics chip working the whole time.

**Look test 3: today's page with CSS touches.** The same page, with the
neighbouring gates leaning back in perspective and the gate's light pooled on
the page beneath it, with no 3D engine at all.

**The choice.** Looking at all three side by side, the leaning was not
wanted. What was wanted was the light: the gate's colour glowing, the gold
edge catching the light, and the emblem glowing. All three are plain styling,
so they came to today's page and nothing else did.

**One more round, on the preview site.** The first version also let each
gate's colour spill out onto the page beneath it. Seen on a real phone, that
wasn't wanted: the light belongs *inside* the gate. And on the gate you're on,
the light should fill the whole arch, not only its foot. So the spill was
taken out, and the gate you're on gained a broad glow through all of it.
The same look on the phone caught one small flaw: on the Pray gate, two of the
rosary's beads overlapped where the loop closes. The beads are dots placed
every 5.3 steps along the loop, but the loop is 76.98 long, not a whole number
of steps, so the last bead landed half over the first. Fifteen beads 5.132
apart fit it exactly.

## The three changes

All in `index.html`'s style rules (CSS). No new JavaScript and no new
download; every gate, name, hint and dot stands exactly where it did.

1. **The colour glow, inside the gate.** The soft light rising from each
   gate's threshold is a little taller and brighter. On the gate you're on
   (the one in the middle, or under the mouse or keyboard), a second, broad
   glow of its colour fills the whole arch, fading in as you arrive and out
   as you move on. All of it stays within the gate's gold edge: nothing
   spills onto the page, and the brief flash as you step through now stays
   inside too. Each gate draws it in its own colour, so a gate added later
   gets one automatically.
2. **The gold edge.** The border and the inner moulding are a softer,
   brighter gold, measured to match the 3D room's. The brightest edge
   pixel went from (76, 61, 19) to (143, 122, 72).
3. **The emblem's glow.** Two glows instead of one: a fine gold one close to
   the line, and a wider one in the gate's own colour.

Measured before and after, no gate moved by even half a pixel at any of the
three sizes, and the page just below the gates is exactly its old dark.

## How it was checked

- Screenshots before and after at 375×667, 390×844 and 1280×800, with the
  pixel colours of the edge, the emblem and the glow read and compared
  against the 3D room's.
- The homepage tests (seven gates, swiping, tapping, keyboard, the back
  button), the season line, the security rules, and the walks from the
  homepage into Eden, the Workshop and Pray all pass.
- On the pull request's preview site, on a real phone, which is where the
  spill beneath the gates was seen and taken out.

## What this shows about software

- **Prototypes answer questions cheaply.** Three throwaway look tests cost an
  afternoon. They saved building a 3D homepage that, once seen, wasn't
  wanted, and they found the three small changes that were.
- **Measure, don't guess.** "Brighter gold" became a colour read from the
  pixels and matched; "nothing moved" became a measurement of every gate.
- **The simplest tool that does the job.** The light that was liked turned
  out to be styling, so it's made with CSS: no download, no battery cost,
  nothing new to break.

See [foundations.md](foundations.md) for *CSS*, *look test* and
*preview site*.
