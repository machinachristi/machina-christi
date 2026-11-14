# Eden revamp: a large place, a great tree, new light, the ladder by night, and verses

*Board item AB#127, one Task per stage (AB#128 to AB#132). Started November
2026. Words in **bold** are explained in [foundations.md](foundations.md).*

## What is changing, in one sentence

In November 2026 the garden was tried out three bigger ways as phone-size
**look tests**. The owner chose none of the three and kept only the five
things they all shared: a wider, lower camera, a rebuilt Tree of Life, a
"light pass" that colour-grades the picture like a film, Jacob's ladder seen
only at night, and verses shown in the garden itself. They are being built
one at a time, one stage per pull request, each looked at on the owner's own
phone before the next begins.

## Stage 1: a small figure in a large place (AB#128)

### What changed

Until now the camera stood 6.4 m behind Adam and looked down at his back.
On a phone held upright that showed a slice of the garden only about 30°
wide, with Adam filling the middle of it. Now the camera stands 10.5 m back
and 3.4 m up, and looks straight out, level, at a point 9 m past him. He
stands lower in the picture and about half the size, and the garden (and its
sky) opens out above and around him.

### The story, like you're five

**A camera in a game is a pretend camera.** Nothing films anything. Every
frame, the computer works out what a camera standing *there*, pointing
*that way*, would see, and paints it. Moving the **camera** is like a
photographer taking three steps back and lifting the lens from the person's
shoes to the horizon: the person is the same size, but the picture now says
"look where he is" instead of "look at him".

**How wide it sees depends on the screen's shape.** A pretend camera has a
**field of view**: how much of the world fits in the picture, measured as an
angle. A phone held upright is a tall, thin window, so the camera sees 72°
from top to bottom but only about 37° from side to side. On a wide computer
screen the same 72° from top to bottom would mean almost 100° across, and
everything at the edges would look stretched, like the edge of a photo taken
with a fisheye lens. So the camera now checks the screen's **aspect ratio**
(how wide it is compared to how tall) and picks the field of view to suit:
tall screens get the tall view, wide screens are held to 90° across. Turn a
phone on its side and it changes, there and then.

**Looking past him, not at him.** The old camera aimed at a spot just in
front of his chest, a little the way he was facing. With the new camera's
aim 9 m out, that would have swung him off the side of a phone's narrow
picture every time he turned. So the camera now looks along its own line,
from where it stands, through him, and on: he is always in the middle from
side to side. When the ground behind him pushes the camera up (it is never
allowed inside a hill), or it lags below him on the way up the ladder, it
tips its gaze by exactly enough to keep his feet in the same place on the
screen.

**Tapping him to dance.** He is about 100 pixels tall on a phone now, half
what he was. The place a tap counts as "on him" was a band round his body
roughly as wide as he looks; now it is always at least a fingertip wide, and
reaches a little past his feet and over his head.

### What it cost, and how we know

The bigger the view, the more of the garden is drawn in each frame. Each
"paint this" order to the graphics chip is a **draw call**, and the garden
promises to stay under 200 of them so phones keep up. The worst moment is the
opening shot on a wide computer screen, which sees almost the whole garden at
once. Measured on this Mac, over the first five seconds:

| Where | Before | After | Limit |
|---|---|---|---|
| Opening shot, 1280 × 800 desktop | 186 | 190 | 200 |
| Arrival, upright phone | 136 | 149 | 200 |
| Arriving in heaven, upright phone | 29 | 31 | 200 |

### What it teaches about software

- **Change the input, check everything that reads it.** One file decides
  where the camera stands, but six other places *use* where it stands: the
  opening shot, lying back to look at the sky, tapping Adam, tapping the
  ground to walk, the climb up the ladder, and heaven. Before changing a
  shared thing, list everything that depends on it, and check each one.
- **Numbers that suit one screen don't suit every screen.** The look test's
  72° was chosen on a phone. Rather than copy the number, the code copies the
  *idea* (as tall a view as the screen allows, never stretched), so it holds
  on screens nobody tested.
- **A test is changed on purpose, never to get past it.** One test waited
  for the camera to come within 7.5 m of Adam, which it now never does. That
  number was changed to 11.5 m, with a note saying why, and a new test pins
  the new camera: well back, a tall view on a phone, held to 90° across on a
  wide screen, and Adam low and centred in the picture.
