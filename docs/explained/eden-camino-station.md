# A game inside the garden: the waymarker at the gate, and Camino behind it

*Board item AB#165. Built November 2026. Words in **bold** are explained in
[foundations.md](foundations.md).*

## What changed, in one sentence

The Camino game used to have its own gate on the homepage; now you reach it
from inside Eden, by walking Adam into a waymarker that stands beside the
garden's eastward gate, and when the game is over he is back in the garden
where he stood.

## Why

Play and delight belong in the garden. Eden was a place to wander, and
Camino was a game somewhere else on the site. Putting the game's door inside
the garden gives the wandering somewhere to arrive, and it is built as a
pattern, called a **station**, so that more games can be given doors of
their own later without building the machinery again.

## What the owner chose

Three questions were put to the owner with real pictures at phone size
before anything was built:

1. **Where does it stand, and what does it look like?** At the garden's
   gate: a milestone with the pilgrim's scallop shell in gold on its face, a
   staff and gourd leaning on it, and the first stones of a road leading
   out. Its caption is *Derekh* (Hebrew for "way"), "the pilgrim road", and
   its verse is Isaiah 35:8: "And an highway shall be there, and a way, and
   it shall be called The way of holiness."
2. **How do you enter?** By walking into it, the same way Adam steps onto
   Jacob's ladder. A tap on or near it sends him there.
3. **Does the homepage keep its Camino gate?** No. The homepage now has six
   gates. The game's own address (`/game.html`) still works, and the About
   Camino page still links to it.

## How it works, as a story

Think of the garden as a stage play and the game as a film.

1. **Adam walks into the waymarker.** The garden notices he has come within
   a stride or so of it while walking (standing beside it does nothing).
2. **The lights go down.** A veil of pale light gathers over the picture.
3. **A screen is lowered in front of the stage.** The game is a separate
   web page, and it is shown over the garden through an **iframe**, a window
   through which a second page shows. The game was not rewritten or copied
   into the garden. It is the same page that opens at `/game.html`.
4. **The actors hold still.** The garden's **drawing loop** is stopped and
   its sound is put to rest. Nothing is unloaded. The stage is still set
   behind the screen; it just is not moving, so the phone can give all its
   strength to the game.
5. **The film ends.** The game's button, which reads "Return home" when the
   game is opened by itself, reads "Return to the garden" here. Pressing it
   does not go anywhere. It pushes a note to the garden (a **message between
   pages**) that says "close me".
6. **The screen is lifted.** The garden checks the note is from its own
   game, lowers the veil again, takes the frame away, starts its loop and
   its sound, and lifts the veil. Adam is standing exactly where he stood,
   turned to face the garden. The waymarker will not open again until he
   has walked a few steps away, so he cannot fall straight back in.

## Three things that had to be right

**The back button.** On a phone people press Back to leave a game. Without
care, Back would have left the whole garden. So opening the game adds one
step to the **browser history**; pressing Back steps over it, the garden is
told, and it closes the game. Pressing Back again leaves the garden as
before.

**Sound.** Eden and Camino already shared one setting for sound, kept on
your phone. When the game opens, the garden's sound rests. When Adam comes
back, the garden reads the setting again, so if you turned sound off inside
the game it stays off in the garden. Phones (iPhones most of all) only let a
page make sound after a finger has touched it, and that rule applies to a
page in a frame too. Here the game's first tap on "start" is that touch.

**If the game will not load.** A station must never be able to take the
garden down. The garden does not lift its veil just because *something*
arrived in the frame, because that something could be an error page. It
waits for the game itself to say "I am drawn and ready", a short message the
game sends after its first picture. If that word has not come within twelve
seconds (no signal, say, or a page that arrived broken), the veil lifts on
the garden again and that station rests for the visit. This is a
**fail-safe**, the same idea that protects the garden from anything going
wrong in heaven. The lesson underneath: "something loaded" and "the right
thing loaded and works" are two different facts, and careful software waits
for the second. It is the difference between hearing the oven door and
hearing the cook say the meal is ready. (A review before merging found the
gap: the first version lifted the veil on any page at all.)

## The pattern: one small list

Everything about a station is one entry in a short list in
`world-app/stations.js`: its name, where it stands, its verse, the address
of the game, and which landmark to build. The tap that walks him there, the
caption, the veil, the pausing, the note back and the Back button all follow
from the entry. Adding a second game later means adding a second entry and,
if it should look different, a second landmark.

## What it cost to draw

The garden lives under a ceiling of 200 **draw calls** in its opening view.
The waymarker, with its shell, staff and paving stones, is baked into one
shape with its colours painted in, so it is a single draw call, and it
stands far from where a visit begins.

| View | Before | After |
| --- | --- | --- |
| Opening view, phone-shaped screen | 157 | 157 |
| Opening view, wide screen | 185 | 185 |
| Standing by the gate | 104 | 105 |

## How it is checked

Four new **tests** were added to the garden's feature checks. They aim at
things that hold still, because a slow test machine makes moving things hard
to judge:

- the waymarker is listed, named when he is near, and a tap beside it is
  taken as meant for it;
- walking in opens the game; the garden's clock is stopped while it is
  open; the game's own button and the Back button each bring him back to
  the same spot, and the garden's clock runs again;
- the garden's sound rests under the game, wakes after it, and keeps a
  choice made in the game;
- a game that never loads leaves him safely in the garden, and so does a
  page that loads in its place but is not the game.

The homepage checks were changed to expect six gates and no Camino gate,
and still check that the game opens by its own address.

## What this shows about software in general

- **Compose, don't rewrite.** The game was already a finished page. Showing
  it through a frame and agreeing on one small note ("close me") joined two
  programs without either needing to know how the other works inside. Most
  large software is built this way: separate pieces with a small, clear
  agreement between them.
- **Pause is cheaper than rebuild.** Keeping the garden in memory and
  stopping its loop means coming back is instant and nothing is lost. The
  price is memory held while the game runs, which is a fair trade here.
- **Put the pattern in data.** When something will be done a second time,
  describe it as an entry in a list and let one piece of code read the
  list. The second time then costs a few lines.
