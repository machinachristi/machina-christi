# Logos — the vowels, the phone guide's card page, and why the tones waited

*Built October 2026 (board items AB#108 to AB#112, iteration `logos-thai-2`).
Words in **bold** are explained in [foundations.md](foundations.md).*

## What changed, in one sentence

The Logos page was rebuilt to look and work like the one-page guide I study
with on my phone (Cards, Alphabet and Practice tabs, colour-coded fold-out
sections, flip cards), and it now has the 32 vowels as well as the 44
consonants, every one of them read aloud by a synthetic voice. The five tones
were built too, then left off, because they couldn't be made right yet.

## The story, like you're five

**A guide on my phone becomes a page on the site.** My phone guide is a single
web page I built to study with. I like how it works, so Logos copies its shape:
three tabs along the top, and on the Cards tab four drawers that fold out (the
middle, high and low letters, and the vowels). While a drawer is
open, its title bar stays pinned to the top of the screen, so I always know
where I am. The colours are the site's own: the middle class in lacquer red,
the high class in Camino amber, the low class in Eden green, the vowels in
Pray's Marian blue. The long explanations that used to sit on the page are
gone; the cards speak for themselves.

**Vowels come in pairs: short and long.** Most Thai vowels have a short and a
long twin, like *-ะ* (ah, short) and *-า* (aa, long). Saying one when you mean
the other changes the word, so each vowel card shows a little bar (a stub for
short, a long bar for long) and names its twin. Four special vowels (*-ำ*,
*ใ-*, *ไ-*, *เ-า*) sound short but count as long, and their bar shows both.
The dash in *-ะ* stands for "a consonant goes here". Where the mark sits above
or below the consonant, the dash is dropped and the font draws a dotted circle
in its place, the way Thai school charts do.

**One player for every button.** Every round play button on the page uses the
same single player, like one record player shared by the whole house. Press a
new button and the old sound stops; you never get two voices talking over each
other. If a recording can't play, the phone's own Thai voice says it instead (a
**fallback**).

**Practice, in rounds.** The Practice tab shuffles the deck (all the letters,
one class, or the vowels) and goes through it in up to four rounds:
- turn each card, then tap **Know it** or **Revisit**;
- *Know it* puts the card away; *Revisit* sends it to the next round;
- after round four, anything still marked *Revisit* is listed as "still
  learning".

Each card is always in exactly one state (new, revisit in round 1 to 4, known)
and only certain moves between them are allowed. That is a small **state
machine**, and it's why the counts at the top (Known, Revisit, New) can never
disagree with the cards. Marks stay in my browser (**browser storage**), one
set for the letters and one for the vowels.

**Listen & pick.** Ten questions: the voice says something, and I tap which
of four it was. For letters, all four come from the same class, so the
look-alikes are there. For vowels, the short or long twin is always one of the
four, so it trains the thing that's hardest to hear: length.

**The old card trainer is retired, and its address forwards.** The old
`cards.html` page (Learn, Review, a box system) is gone. Anyone who saved its
address is sent to the new page automatically (a **redirect**), instead of
landing on "page not found".

## Why it was built this way

**Private recordings stay private.** The phone guide also plays recordings
that were made for me alone and aren't mine to publish. The site never uses
them: none is copied into it, uploaded or sent to any service, and nothing
taken from them is published. Only for the tone check, and with my
permission, the recording of the five tones was measured on this Mac as a
yardstick; the numbers stayed here. The guide's tone drawings were traced from
those recordings, so the site doesn't reuse them either. What the site does reuse is my
own: the guide's layout, its emoji, its ten little drawings, and the vowel
facts from my workbook.

**New sounds, made once.** Every new sound is read by Premwadee, the Azure AI
Speech **neural voice** Logos already used, and made the same way as the first
cards: a recipe script, `functions/scripts/record-logos.js`, reads the cards,
records only what's missing, and names each file with a **content hash**.
- **One file per sound (deduplication).** When two buttons say exactly the same
  words, they share one file (the vowel *ออ* and the first syllable of *อ อ่าง*
  would be one recording). The page plays 103 sounds, about 1.2 MB in all.
- **One speed.** The old Slow switch is gone, and so are its 44 slow files.
- **About 400 characters** of the studio's free 500,000 a month.

**Romanization follows the phone guide.** Tone marks over the vowels, hyphens
between syllables (*pôo-tâo*, *reu-sěe*), and no more dots for short
syllables. The Thai spellings stayed as they were settled for the first cards.

**Checked by machine before going on the site.** I can't yet judge Thai by ear,
so the sounds had a **second opinion**, as the consonant names did.

Azure listened. Its Thai **speech recognition** wrote down what it heard, and
**pronunciation assessment** scored each word against native speakers:
- **84 real words** (the letters' syllables, the vowels' example words and
  the five tones, as they were then): the middle score was 100. The only low one was the lone syllable
  *ฉอ*, which the scorer couldn't place at all; the full name *ฉ ฉิ่ง* passed
  in the first lab.
- **The 30 bare vowel sounds** aren't words, so the scorer has nothing to
  compare them with. It heard *ใอ* as *ไอ*, which is right: those two sound
  exactly the same. Vowels were judged by measuring instead.

A small measuring program listened too, on this Mac, with no Azure (**measuring
a voice**):
- **Length:** every short vowel came out shorter than its long twin, between
  about four tenths and two thirds as long.
- **Sound:** every short vowel sounded closest to its own long twin, not to any
  other vowel.
- **Tone shape:** 82 of 105 syllables matched the voice's own five tones.
  That was the wrong yardstick: the voice's five tones were themselves off,
  as the tone check below found.

What the checks caught, and what changed:

| Problem | What was found | Fix |
|---|---|---|
| Short vowels with a glide (*อัวะ เอียะ เอือะ*) | the voice stretched them almost to full length | they're played 60% faster |
| *เออะ* | said half-long, heard as the long *เออ*, scoring 15 | played 40% faster |
| *เณร* (novice monk) | heard as *เอน*, scoring 73 | the voice reads *เนน*, which sounds the same; it scores 100 |

## Why there are no tones (yet)

The page was built with a Tones drawer (*คา ข่า ค่า ค้า ขา*, each with a little
drawing of its pitch) and, under every letter, its syllables grouped by tone,
each with a play button. Tones matter more than anything else in Thai, so
before it went live they had a check of their own, with one rule: no tones at
all is better than tones that aren't right.

**A yardstick from outside.** The check measured against the published shapes
of the five tones, written as numbers on a five-step scale (1 at the bottom of
a voice, 5 at the top): mid 33, low 21, falling 451, high 45 (older speakers
say it level, 44), rising 214. The sources were Abramson's classic 1962
measurements, Morén and Zsiga (2006) and Teeranon and Rungrojsuwan (2009). Each
voice was put on its own scale, from its own lowest to its own highest
(**normalizing**), so a woman's voice and a computer's compare shape for shape.

**Testing the tester first.** With my permission, a native speaker's private
recording of the five tones was the known answer (**calibration**). The
measuring program got two of her ten tones wrong at first, both its own fault,
and passed all ten once fixed. Only then did it judge the voice.

**What it found.** Said alone, the voice's mid tone fell like its low one, and
its high tone dipped like its rising one. Said all five in a row, its falling
tone never fell. Only 50 of 87 syllables in the letters' tone rows were
nearest their own shape.

**What was tried:**
- slowing the voice down only stretched the same shapes;
- Azure's pitch outline (in **SSML**) turned out to be a loose hint, and it
  turned the rising tone into a falling one;
- redrawing each recording's pitch to the textbook shape with Praat, a free
  phonetics program, made every tone *measure* right, but to my ear it still
  wasn't good enough to learn from.

So the tones were left off: the Tones drawer, the tone rows and their 55
sounds. The spellings still carry their tone marks (*gài*), because that's how
the words are written. The redrawing work is kept aside, not thrown away
(board item AB#112), in case a better voice or a native speaker's recording
makes trustworthy tones possible later.

**Keyless, and short.** The tone trials used a speech role given at 05:13:48
and taken away at 05:24:45 (UTC) on 26 October, with none left afterwards.

**Keyless, and for under half an hour.** Recording and checking needed a speech
role on my Azure account. It was given at 03:10 and taken away at 03:34 (UTC)
on 26 October, and I checked that none was left (**role and least
privilege**). There are no keys anywhere: the scripts signed in as me.

**Still just files.** No API, database or new Azure service: the page, one data
file (`logos/thai.json`) and the sounds. It works on a pull request's preview
copy of the site, and offline once loaded.

## How we know it's right

- **Tests (`tests/logos.spec.js`, 17 of them),** run in Chrome's engine and in
  Safari's (WebKit, the engine on every iPhone):
  - the data: 44 letters, 32 vowels whose twins point at each other; every
    field filled; every sound present and none left over; nothing published says whose lessons Logos
    learned from;
  - the page: the tabs, the drawers (and no tones), turning a card, each play
    button playing its own file, the dashless vowels, the Alphabet order;
  - Practice: rounds, counts, the finish list, Reset, separate decks, saved
    across a reload; Listen & pick from the first question to the score;
  - the old address redirects;
  - layout: every letter stays inside its card, text is 14px or bigger, and
    nothing scrolls sideways at four phone widths.
- **The recipe's own tests (`functions/test/logos.test.js`):** every sound plays
  the file the recipe calls for, the same words are recorded once, and changing
  a word, the voice or the pace changes the file name.
- **Screenshots** of every tab, at the narrowest phone width (320) and at 390,
  checked by eye.
- **A real iPhone (the iOS Simulator), in Safari:** the drawers, the pinned
  title bars, turning cards, and sound. A small throwaway page reported back
  what Safari did when a play button was tapped: the sound *started*, with no
  need for the phone's own voice.

**Looking closely caught three real bugs:**
- **A name used twice.** A turned card had a dark strip under it. The page's
  "‹ home" link and the back of every card were both called `back`, so the card
  borrowed the link's spacing and letter spacing (a **name collision**). The
  link is now called `home`.
- **A glow that stays.** After a tap, an iPhone keeps a button looking
  "hovered" until you tap somewhere else, so a turned card glowed brighter than
  the panel of sounds under it. A turned card now keeps one even edge.
- **A lonely count.** On the narrowest phones, "New 44" wrapped onto a line by
  itself. The round now gets its own line, with the three counts together below
  it.

## Things to remember

- **Fixing a card** is an edit to `logos/thai.json`. If you change what is
  *said* (`say` or `word_say`), re-run the recipe so the
  sound is re-recorded and re-checked. That needs the speech role again: ask
  for it, use it, take it away.
- **Respellings for the voice** (*เนน* for *เณร*, *รือสี* for *ฤๅษี*) change
  only what is said, never what is shown.
- **Two vowels are obsolete** (*ฦ*, *ฦๅ*) and one is rare (*ฤๅ*). They're on the
  cards, marked as such, but Listen & pick leaves the obsolete ones out.
- **Practice marks** are per browser and per device. Clearing site data, or a
  long break from Safari, starts them again.
- **Tones come back only when they pass.** The check (published shapes, a
  calibrated measuring program, and my own ear) is the bar for any future
  tones, from a better voice or a recording I'm allowed to publish.
- **Next:** practising aloud, where the studio listens to me say a letter or a
  vowel and shows my pitch beside the voice's.

## New foundations met here

Redirect (301) · deduplication (one file per sound) · accessible controls ·
name collision · measuring a voice (length, pitch, vowel sound) · calibration
(testing the tester) · normalizing (comparing voices fairly). Met again: state
machine, fallback, content hash, second opinion, declination, SSML. See
[foundations.md](foundations.md).
