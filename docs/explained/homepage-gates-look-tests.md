# The homepage gates — three look tests, and the light they left behind

*AB#114 · Tasks AB#115 (the look tests) and AB#116 (the change) · October 2026*

## What changed, in one sentence

After trying the homepage's gates as a 3D room in three different ways, the
page stayed as it was, one large gate at a time, and took from the 3D
versions only the three things that looked best, made with a few lines of
CSS: a stronger glow of each gate's colour at its base, a brighter gold edge,
and a glow around each emblem.

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
wanted. What was wanted was the light: the colour glowing at the gate's base,
the gold edge catching the light, and the emblem glowing. All three are
plain styling, so they came to today's page and nothing else did.

## The three changes

All in `index.html`'s style rules (CSS). No new JavaScript and no new
download; every gate, name, hint and dot stands exactly where it did.

1. **The colour glow at the base.** The soft light inside each gate rises a
   little higher and brighter from its threshold, and the gate now casts its
   own colour onto the page around and below its base (a `box-shadow` in the
   gate's colour). It belongs to each gate, so it moves with it as you swipe,
   and a gate added later gets one automatically.
2. **The gold edge.** The border and the inner moulding are a softer,
   brighter gold, measured to match the 3D room's. The brightest edge
   pixel went from (76, 61, 19) to (143, 122, 72).
3. **The emblem's glow.** Two glows instead of one: a fine gold one close to
   the line, and a wider one in the gate's own colour.

One practical detail: the row of gates clips whatever is drawn outside it, so
it now has more room underneath for the glow, and the "Tap a gate to enter"
line is pulled up by exactly that much. Measured before and after, no gate
moved by even half a pixel at any of the three sizes.

## How it was checked

- Screenshots before and after at 375×667, 390×844 and 1280×800, with the
  pixel colours of the edge, the emblem and the glow read and compared
  against the 3D room's.
- The homepage tests (seven gates, swiping, tapping, keyboard, the back
  button), the season line, the security rules, and the walks from the
  homepage into Eden, the Workshop and Pray all pass.
- On the pull request's preview site, on a real phone.

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
