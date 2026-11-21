# A ruler for Eden's opening: how long the garden takes, step by step

*Board item AB#168. Built November 2026. Words in **bold** are explained in
[foundations.md](foundations.md).*

## What changed, in one sentence

Eden now times itself as it opens, step by step. Add `?timing=1` to its
address and the times appear in a corner of the screen. Every visit also
counts them once, as a few rounded numbers, in the site's **telemetry**.

## Why

A review on 21 November 2026 found that Eden takes about 2.9 seconds to open
on a phone in Thailand, and that a few small steps could bring that to about
1.5. Before changing anything, you need a ruler: a way to measure the
same thing, the same way, before and after each change. Otherwise "it feels
faster" is a guess. It also matters *where* you measure:

- A test computer can pretend to have a slow network, but it cannot pretend
  to be a slow phone. Building the garden and drawing its first picture
  happen on the phone's own chips.
- The owner's Mac reaches the site through a VPN that made everything look
  slow, so numbers from the Mac were misleading.
- Preview sites (the copies made for each pull request) take 20 to 26
  seconds and skip Cloudflare entirely. Their numbers can't be compared with
  the live site's.

So the ruler lives on the live site and is read on real phones. Live is
compared with live, before and after each step.

## How it works, as a story

Think of a relay race with an official holding a stopwatch at each
handover, calling out the time.

1. **You tap.** Either "enter the garden" on Eden's welcome, or the Eden gate
   on the homepage (which goes straight in through `world.html#enter`). The
   page notes the moment.
2. **The scripts arrive.** The garden is made of about 120 small programs
   (modules). The browser fetches every one before the garden's main program
   runs its first line, so that first line is where the first mark goes:
   *all the scripts are here*.
3. **The garden is built.** Ground, river, trees, creatures, Adam and Eve.
   A mark after the garden, and another just before the warm-up picture.
4. **The first picture.** The garden draws one hidden picture behind the
   veil, so that the phone has done its slow first-time work (translating
   about 38 **shaders**) before you see anything. A mark after it.
5. **Ready.** The first real frame is drawn and the garden tells the page
   "I'm ready" (a **message between pages**). It now sends its marks along
   with that message.

The page around the garden (`world.html`) and the garden itself (inside an
**iframe**) each keep their own stopwatch, started when each began to load.
So before subtracting, the page moves the garden's marks onto its own
stopwatch: the browser says exactly when each stopwatch was started.

## What the readout says

> **tap → garden 2.4 s**
> page 0.3 · scripts 1.3 · build 0.5 · first picture 0.3

| Step | From → to | Mostly |
|---|---|---|
| **tap → garden** | the tap → the garden shown | the whole wait |
| **page** | the homepage's Eden gate tapped → `world.html` loaded | waiting (only shown when you came straight in) |
| **scripts** | → every script arrived | **waiting** for the network |
| **build** | → the garden built | the phone **working** |
| **first picture** | → the first picture drawn and shown | the phone's graphics chip **working** |

The steps follow one after another, so they add up to the whole (give or
take rounding).

Reading it tells you which fix to reach for (**waiting versus working**):

- **scripts is big:** the network is the problem. Fetching earlier, keeping
  copies longer, or packing the scripts together will help.
- **build is big:** the phone is busy building. Less to build at the start
  would help; a faster network would not.
- **first picture is big:** shader translating. That is the "shader work" at
  the end of the plan, done only if these numbers ask for it.

## How to read it on your phone (after the change is live)

1. On the phone, open **`machinachristi.com/world.html?timing=1#enter`**.
   That goes straight in, like the homepage's Eden gate, so the clock starts
   the moment the page starts loading.
2. Or open **`machinachristi.com/world.html?timing=1`**, wait on the welcome,
   and tap *enter the garden*. While you read the welcome, the page quietly
   fetches the biggest scripts ahead, so this way is usually quicker.
3. Wait for the garden. The readout appears bottom left. Take a screenshot.
4. To see the difference between a first visit and a return visit:
   - the **first visit of the day** has to fetch everything;
   - a **reload straight after** uses the copies the phone kept, so
     "scripts" shrinks and "build" and "first picture" stay about the same.
5. Try Wi-Fi and mobile data. Do the same again after each speed change and
   compare the screenshots.

If you switch away from the page while the garden opens, the phone pauses
it, and the readout says *hidden part of the way: not counted*.

## What telemetry counts, and what it doesn't

Once per visit, when the garden opens, the page sends one event called
`eden-open`. It holds:

- `entry`: `link` (came straight in, from the gate or the About page) or
  `button` (tapped "enter the garden");
- `seconds`, `pageSeconds` (straight-in visits only), `scriptsSeconds`,
  `buildSeconds`, `pictureSeconds`, each rounded to a tenth of a second.

That is all. No address, no query, nothing about the phone that the page
view doesn't already have. It travels through the same telemetry as page
views, so it is silent in the same places: anywhere but the live site, and
whenever the browser asks not to be tracked (Global Privacy Control or Do
Not Track). In those cases telemetry never opens the door this event goes
through (`window.mcTelemetry`), so there is nothing to send it with. A
visit that was hidden part of the way isn't counted.

To read them in Log Analytics (`log-machina-web`):

```kusto
AppEvents
| where TimeGenerated > ago(30d) and Name == "eden-open"
| extend Entry = tostring(Properties.entry),
         Total = todouble(Measurements.seconds),
         Scripts = todouble(Measurements.scriptsSeconds),
         Build = todouble(Measurements.buildSeconds),
         Picture = todouble(Measurements.pictureSeconds)
| summarize Visits = count(), MedianTotal = percentile(Total, 50), P90Total = percentile(Total, 90),
            MedianScripts = percentile(Scripts, 50), MedianBuild = percentile(Build, 50),
            MedianPicture = percentile(Picture, 50) by Entry, ClientCountryOrRegion
```

Almost every visit today is the owner's or a robot's, so these numbers will
grow slowly. The readout on the owner's own phone is the main ruler.

## What was tested

`tests/world-timing.spec.js` opens the garden twice:

- with `?timing=1` (straight in): the readout appears with every step, the
  steps add up to the whole, the text is at least 14px, it fits on the
  screen, it takes no touches, and pinch-to-zoom stays off;
- without it (through the welcome's button): there's no readout, but all
  five marks were still made, so nothing is missing when it is asked for.

It never judges the numbers themselves: the test computer draws the garden
in software, so its times say nothing about a phone's. It runs after the
other garden checks, never alongside them, because two gardens drawn at once
slow each other down (**running tests side by side**).

`tests/security-and-telemetry.spec.js` now also checks that a visit to the
garden on the live site sends exactly one `eden-open` event with only those
rounded numbers, and that the door it goes through doesn't exist off the
live site or under Global Privacy Control.

## Where it lives

- `world-app/main.js`: the five marks (`eden:scripts`, `eden:garden`,
  `eden:warm`, `eden:picture`, `eden:ready`), sent with `world:ready`.
- `world.html`: notes the tap, works out the steps, shows the readout, and
  counts it once.
- `assets/telemetry.js`: the small door (`window.mcTelemetry.event`), opened
  only where telemetry is allowed to send.

## What it shows about software in general

Measure before you change anything, and measure where it matters. The same
code can be slow for two quite different reasons, waiting or working, and
each needs a different fix. A ruler that splits the time into its steps
tells you which one you have, and later whether the fix worked.
