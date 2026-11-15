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

## Stage 2: the Tree of Life, the greatest thing in the garden (AB#129)

### What changed

The old Tree of Life was a straight post with three yellow lumps on top,
under 6 m tall. The new one is a real spreading tree about 10 m tall: a pale
trunk rising in a slow S from flared roots, seven boughs opening from it
like the branches of the lampstand (Exodus 25:32), and a broad, layered
crown of gold over them. Its twelve fruits (Revelation 22:2) now hang under
the crown as twelve small lights, each its own colour, and its lamp sits in
the fork, so at night it lights the boughs and the underside of the gold.

### The story, like you're five

**A tree made of simple shapes.** The computer has no idea what a tree is.
The trunk and boughs are 40 or so tapering tubes laid end to end; the crown
is 40 squashed balls, one over the tip of every bough and twig, then a ring
above those, then two big ones on top. A short recipe (a **procedure**)
places them, so the tree is *grown by code* rather than drawn by hand.
Wherever the recipe needs a little variety ("this bough reaches a bit
further") it asks a **seeded random** number source, which gives the same
"random" numbers every time, so every visitor sees the same tree.

**Eighty shapes, two paint orders.** Painting 80 shapes one by one would be
80 **draw calls**, and the garden's whole budget is 200. So before the
garden opens, all the tubes are melted into one shape and all the balls into
another (a **merged mesh**), each corner carrying its own colour: pale wood
darkening toward the root, amber gold brightening toward the top. The tree
is then two paint orders, plus one for the twelve fruits: three, exactly
what the old post and lumps cost.

**One place for the measurements.** A dozen things hang off this tree: the
birds that roost on it at dusk, the sparrow's nest, its shadow, the shaft of
low light under it, the gold leaves it sheds, the flock that walks round its
trunk. Each used to have the old tree's size typed in by hand (a perch at
5.55 m, a shadow 2.6 m wide). Now the tree's own file says how tall and wide
it is and where its perches, nest and fruits are, and everything else reads
those numbers. This is called a **single source of truth**.

### What it cost, and how we know

| Where | Before | After | Limit |
|---|---|---|---|
| Opening shot, 1280 × 800 desktop | 190 draws | 189 | 200 |
| Arrival, upright phone | 149 draws | 149 | 200 |
| Triangles at arrival, upright phone | about 56,000 | about 61,000 | 150,000 |

### What it teaches about software

- **Detail is cheap; separate objects are expensive.** The new tree has
  about 4,000 more triangles and costs no more to draw, because the graphics
  chip is slowed by the *number of paint orders*, not much by their size.
- **Say a fact once.** When the same number is typed in six files, changing
  the tree means hunting for all six, and missing one leaves a bird sitting
  in mid-air. Keep each fact in one place and let everything else read it.
- **Tune by eye, in real pixels.** The first render had the right shape and
  the wrong colour (a dull brown), and ten of the twelve fruits were hidden
  inside the crown. No test would have caught either; a screenshot did.

## Stage 3: the light of the garden (AB#130)

### What changed

Until now each frame of the garden went straight from the 3D scene onto the
screen, with flat air, a hard sun and colours that were the same at every
hour. Now each frame is first painted off screen and then *finished*, the
way a photograph is developed: the air between near and far takes the
colour of the sky, the sun gets a soft halo and its beams fall through the
boughs, bright things (the Tree of Life's gold, its fruits, the lamps, the
stars) glow softly into the air round them, and the colour of the whole
picture follows the hour, from clear day through warm gold to blue and
silver night. The new file is `world-app/lightpass.js`.

### The story, like you're five

**Painting at the back of the studio.** Before, the garden was painted
straight onto the window you look through. Now it's painted on a sheet at
the back first (a **render target**), and the sheet is worked on as a whole
before it's hung up. That second step is called **post-processing**. The
sheet uses extra-fine colour, so it can hold light *brighter than white*:
the sun really is many times brighter than a white sheep, and the finishing
steps need to know that.

**Five finishing steps.** Each one is a small program run once over every
dot of the picture:

1. *Air*: far things fade toward the sky's colour, a little more toward the
   sun; the sun gets its halo.
2. *Beams*: from every dot, look back toward the sun; where the way is open
   sky, light streams through, and where boughs are in the way, shadow. This
   makes the shafts of light through the trees.
3. *Glow* (**bloom**): pick out only the brightest parts, blur them at four
   sizes, lay them back on top.
4. *Squeeze to the screen* (**tone mapping**): a curve borrowed from film
   brings the too-bright light back into what a screen can show, without
   flat white patches.
5. *Grade*: a touch of contrast and colour for the hour, and slightly
   darker corners, like an old lens.

**Three airs, blended.** There is a *day* air, a *gold* air and a *night*
air, each a short list of settings (how thick the haze, how bright the
glow, how warm the colour). Every frame the garden looks at how high the sun
is and how dark it's become, and blends the three, so evening slides into
night with no jump.

**Knowing when to step aside.** All this costs the graphics chip real work.
A phone that can't keep up would rather have the plain garden running
smoothly than a beautiful one stuttering. So the light pass switches itself
off:

- on a computer with no graphics chip (where the "chip" is really the main
  processor pretending), which is also how the automatic tests run;
- if the screen can't show the extra-fine colour at all;
- if the garden runs under 28 frames a second for three seconds; it then
  remembers that for a week on that phone, so it doesn't stutter each visit;
- if the drawing ever fails, in which case it quietly goes back to the plain
  way rather than leaving a black screen.

This is **graceful degradation**: plan A where it works, plan B by itself
where it doesn't. Adding `?light=off` to the address forces plan B, and
`?light=on` forces plan A; `?fps=1` shows a small corner readout of which
one is running and how fast.

**The old beams rest.** The garden used to fake sunbeams with pale
see-through wedges. With the real beams on, those are hidden; when the light
pass steps aside, they come back.

### What it cost, and how we know

The finishing steps are 14 extra paint orders per frame, *whatever* is in
the garden, so they're counted apart: `getState().render` still reports
what the garden itself costs, against its own budget.

| Where | Before | After | Limit |
|---|---|---|---|
| Opening shot, 1280 × 800 desktop (the garden's own cost) | 189 draws | 188 | 200 |
| Arrival, upright phone | 149 draws | 149 | 200 |
| Finishing steps, every frame | none | 14 | n/a |
| Speed on the Mac, light pass on | 60 frames a second | 60 | n/a |

### What it teaches about software

- **A fixed cost versus a cost per thing.** Adding a tree adds paint
  orders; the finishing steps cost the same however much is drawn. Knowing
  which kind of cost you're adding tells you how it will grow.
- **Measure on the device, decide on the device.** No list of phone models
  says which phones are fast enough. The garden times itself and decides,
  and remembers, on each phone.
- **A plan B that is tested too.** The tests run on a computer with no
  graphics chip, so one test checks the light pass steps aside there, and
  another forces it on and checks it draws, survives night and survives the
  screen changing size.
