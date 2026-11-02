# The waiting room at Azure's door — why the API sometimes took a minute

*AB#125 · November 2026*

## What changed, in one sentence

The API (the part of the site that answers questions such as "which prayers
are there?" and plays the recordings) was allowed to seat only 4 visitors at
once, so everyone else waited outside in 5-second steps for up to a minute;
it now seats 32, which costs nothing, and the waits are gone.

## The story, like you're five

**The puzzle.** The morning robot (the [live-site check](live-site-check.md))
found that some requests to the API waited 10 to 55 seconds before anything
came back. Yet the API's own diary (Application Insights, the record Azure
keeps of every request the API handles) said it answered each of them in a
few thousandths of a second. Both were true. So the time was being lost
somewhere between the visitor and the API, and the job was to find where.

**First suspect: the computer doing the measuring.** One test request "took"
17 minutes, although it had been told to give up after 70 seconds. A program
can only overrun its own alarm clock like that if the whole computer was
paused. The Mac's power log showed it: the lid was closed on battery, so it
slept between short wake-ups. Those results were thrown away, and every later
test ran with the Mac kept awake (`caffeinate`). The original waits happened
while the Mac was wide awake, though, so the Mac wasn't the answer.

**Matching the stamps.** Like comparing a parcel's "sent" stamp with the
depot's "received" stamp, each test request's departure time was compared
with the moment the API's diary said it arrived. A request that waited
56 seconds arrived at the API at the *end* of the wait, and the API, already
awake and warm, answered it in 6 thousandths of a second. So the request was
held *before* the API, at Azure's door.

**A rhythm.** Every wait was about 5½ seconds plus a whole number of
5-second steps: 5, 15, 40, 45, 50 seconds, and at 60 seconds Azure gave up
and answered "503, Service Unavailable". A fixed beat like that means
something checks "ready yet?" every 5 seconds before letting a request in,
like a host who only looks up at the queue every 5 seconds.

**Whose door?** Requests sent straight to Azure, skipping Cloudflare, waited
too, even though Azure only had to say "403, not allowed in". But asking the
very same Azure door for a made-up app got "404, no such app" instantly, 12
times out of 12. So Azure's shared doorway was fine; the hold was about *our*
app.

**The café with four seats.** Microsoft's documentation explains the rest.
On the Flex Consumption plan, each copy of an app takes a limited number of
requests at once (its **concurrency**), and a copy with 512 MB of memory
takes 4 unless told otherwise. When every seat is taken, Azure starts another
copy. But the API is allowed only **one** copy (a deliberate choice, so a
flood of traffic can't run up a bill), so latecomers simply wait outside.
Sending 6 requests at the same moment showed it plainly: only 2 to 4 got in,
and 11 of 24 were turned away after a minute. Even seats that had just been
freed weren't offered to the queue straight away, which is why a single
visitor could get stuck too.

**The fix.** Most of what the API does is wait on other services (the prayer
library, the recordings store, search), and a Node program can wait on many
things at once, the way one waiter takes many orders while the kitchen
cooks. So the one copy now seats 32. Nothing else changes: still one copy,
still the same cost ceiling.

## Why it was built this way

- **More seats, not more copies.** Raising the number of copies would also
  have worked, but each new copy starts cold (a few seconds' wait) and raises
  the ceiling a flood could reach. More seats in one copy keeps both the speed
  and the cap.
- **Free.** Azure bills a copy's busy seconds, not each request, so 32 people
  seated at once cost no more than 4 seated one after another (less, if
  anything). Keeping a copy always awake would have removed cold starts too,
  but costs about $5 a month, over the site's $1 budget, and wouldn't have
  fixed this: the waits happened while the copy was already awake.
- **Written in the blueprint.** The setting lives in `infra/main.bicep`
  (`httpConcurrency`), so every deploy keeps it. A change made by hand in
  Azure would be quietly undone by the next deploy.

## How we know it's right

The same tests were run before and after, with the Mac kept awake:

| Test | Waited over 3 s, before → after | Turned away, before → after | Slowest 1 in 10, before → after |
|---|---|---|---|
| 30 single requests through Cloudflare | 43% → 3% | 2 → 0 | 51.5 s → 1.2 s |
| 30 single requests straight to Azure | 57% → 7% | 0 → 0 | 51.7 s → 1.4 s |
| 4 bursts of 6 at once | 83% → 0% | 11 → 0 | 61.1 s → 1.1 s |

The few waits left after the change (about 8 seconds) were one cold start:
changing the setting restarts the API, and the host's diary shows the restart
at that very moment.

Then the morning robot walked the live site: all 29 checks passed in
2.1 minutes, and "every prayer recording plays" took 1.1 minutes, its usual
time (earlier that day it had failed twice, and passed once at twice its
usual time). Most recordings were already kept by Cloudflare by then, which
never stalled, so the tests above are the sharper proof.

Azure's own front-door records (the "Availability and Performance" check in
the portal's *Diagnose and solve problems*) had shown the slowest 1 in 10
requests taking 40 to 60 seconds through the morning; that's the number to
watch over the coming days.

## Things to remember

- A program's own diary only times the work *inside* the program. Time spent
  queueing at the door, or starting up, never shows there. When a visitor
  waits but the diary says "fast", look at the door.
- Before trusting a long timing from the Mac, check it was awake:
  `pmset -g log | grep -E "Sleep|Wake"`. Lid closed on battery means sleep.
- If the API ever needs more than one copy, raise `maxInstances` in
  `infra/main.bicep`; `httpConcurrency` is how many requests each copy seats.

## New foundations met here

In [foundations.md](foundations.md): **concurrency (and its limit)**, and an
update to **cold start**.
