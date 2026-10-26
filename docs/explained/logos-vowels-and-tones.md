# Logos — the vowels, the tones, and the phone guide's card page

*Built October 2026 (board items AB#108 to AB#111, iteration `logos-thai-2`).
Words in **bold** are explained in [foundations.md](foundations.md).*

## What changed, in one sentence

The Logos page was rebuilt to look and work like the one-page guide I study
with on my phone (Cards, Alphabet and Practice tabs, colour-coded fold-out
sections, flip cards), and it now has the 32 vowels and the five tones as well
as the 44 consonants, every one of them read aloud by a synthetic voice.

## The story, like you're five

**A guide on my phone becomes a page on the site.** My phone guide is a single
web page I built to study with. I like how it works, so Logos copies its shape:
three tabs along the top, and on the Cards tab five drawers that fold out (the
tones, the middle, high and low letters, and the vowels). While a drawer is
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

**Five tones, five shapes.** The Tones drawer starts with all five said in a
row (*คา ข่า ค่า ค้า ขา*, kaa kàa kâa káa kǎa) and then each one alone, with a
small drawing of its pitch: level, low, falling, high, rising. Turn a letter's
card and, under it, its name is split into syllables grouped by tone, each with
the same drawing and its own play button. *ก ไก่* gives a Mid row (*gaw*) and a
Low row (*gài*). This is **tone and pitch** made visible.

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
them in any way: while building this, they weren't opened, played, measured,
copied or sent anywhere. The guide's tone drawings were traced from those
recordings, so the site doesn't reuse them either; its five shapes were drawn
new from the standard textbook pitch shapes. What the site does reuse is my
own: the guide's layout, its emoji, its ten little drawings, and the vowel
facts from my workbook.

**New sounds, made once.** Every new sound is read by Premwadee, the Azure AI
Speech **neural voice** Logos already used, and made the same way as the first
cards: a recipe script, `functions/scripts/record-logos.js`, reads the cards,
records only what's missing, and names each file with a **content hash**.
- **One file per sound (deduplication).** When two buttons say exactly the same
  words, they share one file. *จ จาน*'s name and its Mid row are the same
  words, so they're one recording. The page plays 184 sounds from 158 files, about 1.7 MB in all.
- **One speed.** The old Slow switch is gone, and so are its 44 slow files.
- **About 400 characters** of the studio's free 500,000 a month.

**Romanization follows the phone guide.** Tone marks over the vowels, hyphens
between syllables (*pôo-tâo*, *reu-sěe*), and no more dots for short
syllables. The Thai spellings stayed as they were settled for the first cards.

**Checked by machine before going on the site.** I can't yet judge Thai by ear,
so the sounds had a **second opinion**, as the consonant names did.

Azure listened. Its Thai **speech recognition** wrote down what it heard, and
**pronunciation assessment** scored each word against native speakers:
- **84 real words** (the tone rows, the vowels' example words and the five
  tones): the middle score was 100. The only low one was the lone syllable
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
- **Tone shape:** 82 of 105 syllables had the pitch shape their tone asks for.
  Most of the rest are a letter's name syllable (*คอ*, *ดอ*, *บอ*) taken from
  the middle of a two-word recording, where the phrase bends it
  (**declination**). It's a rough tool, so I read it as "nothing looks badly
  wrong", not as a grade.

What the checks caught, and what changed:

| Problem | What was found | Fix |
|---|---|---|
| The tone examples | *ป๊า* (high) was heard as *ป่า* (low), scoring 14 | the five tones now use *คา ข่า ค่า ค้า ขา*, which all came out right |
| Short vowels with a glide (*อัวะ เอียะ เอือะ*) | the voice stretched them almost to full length | they're played 60% faster |
| *เออะ* | said half-long, heard as the long *เออ*, scoring 15 | played 40% faster |
| *เณร* (novice monk) | heard as *เอน*, scoring 73 | the voice reads *เนน*, which sounds the same; it scores 100 |

One thing the fixes can't change: said on their own, Premwadee's mid and low
tones sound close. Heard all five in a row, the difference is clear, which is
why that row comes first.

**Keyless, and for under half an hour.** Recording and checking needed a speech
role on my Azure account. It was given at 03:10 and taken away at 03:34 (UTC)
on 26 October, and I checked that none was left (**role and least
privilege**). There are no keys anywhere: the scripts signed in as me.

**Still just files.** No API, database or new Azure service: the page, one data
file (`logos/thai.json`) and the sounds. It works on a pull request's preview
copy of the site, and offline once loaded.

## How we know it's right

- **Tests (`tests/logos.spec.js`, 20 of them),** run in Chrome's engine and in
  Safari's (WebKit, the engine on every iPhone):
  - the data: 44 letters, 32 vowels whose twins point at each other, 5 tones;
    every field filled; each tone row's marks agree with its tone; every sound
    present and none left over; nothing published says whose lessons Logos
    learned from;
  - the page: the tabs, the drawers, turning a card, each play button playing
    its own file, the dashless vowels, the Alphabet order;
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
  *said* (`say`, `word_say` or a tone row's `say`), re-run the recipe so the
  sound is re-recorded and re-checked. That needs the speech role again: ask
  for it, use it, take it away.
- **Respellings for the voice** (*เนน* for *เณร*, *รือสี* for *ฤๅษี*, *คัง* for
  *ฆัง* in a tone row) change only what is said, never what is shown.
- **Two vowels are obsolete** (*ฦ*, *ฦๅ*) and one is rare (*ฤๅ*). They're on the
  cards, marked as such, but Listen & pick leaves the obsolete ones out.
- **Practice marks** are per browser and per device. Clearing site data, or a
  long break from Safari, starts them again.
- **Next:** practising aloud, where the studio listens to me say a letter or a
  vowel and shows my pitch beside the voice's.

## New foundations met here

Redirect (301) · deduplication (one file per sound) · accessible controls ·
name collision · measuring a voice (length, pitch, vowel sound). Met again:
state machine, fallback, content hash, second opinion, declination. See
[foundations.md](foundations.md).
