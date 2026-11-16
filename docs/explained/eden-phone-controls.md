# Eden on a phone: feet below, eyes above, and taps that find their mark

*Board item AB#164. Started November 2026. Built first as a try-out behind a
switch; the owner tried it on a phone on 16 November 2026, found it much
better, and it became what every visitor gets. Words in
**bold** are explained in [foundations.md](foundations.md).*

## What is changing, in one sentence

Steering Adam with one finger was hard on a phone, so there is now a new way
to steer him. It was built beside the old one behind a switch, tried on a
real phone, and then made the default; the old way is kept for now as a way
back.

## What was wrong

The owner named three troubles after using the garden on a phone:

1. **The finger hid the picture.** The old way puts an invisible joystick
   under your finger wherever it lands, and most fingers land in the middle
   of the screen, right on Adam. To make him hurry you had to drag a long way
   (110 pixels), which covered still more.
2. **Turning him round was very hard.** There was no way to turn the view.
   The camera drifted round behind Adam slowly by itself, and when he walked
   toward you it was held still on purpose, so you never saw what had been
   behind him.
3. **Small things were hard to tap.** The camera now stands well back (the
   Eden revamp), so a lamb across the meadow is only a few pixels wide. The
   old way walked to the exact pixel under the finger.

## What other games do

Games that are played on phones have mostly settled on the same answers:

- The thumb that moves the character stays **low on the screen**, where a
  thumb rests, and the stick is **drawn** so you can see it.
- **Looking around is a separate gesture** from walking, often the other
  thumb, so the two never fight over one finger.
- A tap is forgiven: it goes to **the nearest thing worth tapping**, not the
  exact pixel. Phone makers advise that anything you tap should be about
  9 mm across, the size of a fingertip.

## The new way

Think of the screen as a person: **the lower part is his feet, the upper part
is his eyes.**

- **Feet (the lower 45% of the screen).** Put a thumb down and a faint ring
  appears under it with a bead in the middle. Slide the bead and he walks
  that way. The ring is small (62 pixels), so the thumb stays low. Push the
  bead to the edge and the ring turns gold: he hurries.
- **Eyes (the upper 55%).** Slide a finger sideways and the view turns with
  it, to the right for a slide to the right. A slide the whole width of the
  screen turns you half-way round. The view stays where you put it while he
  stands; once he has walked a little, the camera goes back to following him.
  A second finger can look while the first one walks.
- **Taps.** A tap is still "walk there", but a tap within a thumb's width
  (44 pixels) of an animal, of his companion, of the two trees or of the
  ladder is taken as meant for it. A tap may also last a little longer and
  wobble a little more than before and still count as a tap.
- **A line of help** shows for the first moments of a visit.

Everything else a tap means is unchanged: a tap on Adam is a dance, a tap on
the sky lays him down to look up.

## The switch

The new way is what a visitor gets. The old way is still there for now, in
case some device misbehaves: add `?controls=old` to the garden's address.

`https://machinachristi.com/world.html?controls=old`

The choice is remembered on that device; `?controls=new` puts it back. Once
the new way has been live a while without trouble, the old way and the
switch can be removed.

## What this shows about software in general

- **A feature flag.** The new way began in the code switched off unless
  asked for. That let it be tried on a real phone without changing anything
  for visitors. It is like wiring a new light into a house and leaving the
  switch off until you are happy with the bulb. Once the owner was happy,
  the switch was flipped, and the old light stays wired in for a while in
  case the new bulb fails.
- **Input is not drawing.** The library that draws the garden (three.js) has
  nothing to do with fingers. Touches come from the browser as **pointer
  events**, and our own code decides what they mean. So how a game *feels*
  to steer is almost never limited by its graphics library.
- **Feel cannot be tested by a computer.** The automatic checks can prove
  that a slide low down walks him and a slide high up turns the view. They
  cannot tell whether it feels good under a thumb. That is why this is a
  try-out, judged on a phone by a person.

## What the checks cover

Four new tests in `tests/world-features.spec.js`: the new way is the default
and `?controls=old` brings back the old; a short low drag walks him away from the camera and the stick is
drawn; a high sideways drag turns the view the right way, leaves him where he
is, and the view holds; and a tap 30 pixels wide of the Tree of Knowledge still walks him
to it. Every older Eden test now runs against the new way, unchanged.
