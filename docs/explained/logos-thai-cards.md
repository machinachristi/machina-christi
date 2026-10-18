# Logos — learning Thai, letter by letter

*Built October 2026 (board items AB#97, AB#98). Words in **bold** are
explained in [foundations.md](foundations.md).*

## What changed, in one sentence

A seventh gate, Logos, opened on the home page: the 44 Thai consonants as flash
cards, in the order and spelling of a Thai learner's workbook, each with its name
read aloud by a synthetic Thai voice, and a box system that brings back the
cards I keep missing.

## The story, like you're five

**A pack of cards.** The front of each card shows a Thai letter, big. Tap it,
and the card turns over: the letter's name and the word that names it (ก is
กอ ไก่, *gaw ġài*, "g as in chicken"), how to say it in English letters, what
the word means, and which of the three classes the letter belongs to. Thai
children learn their letters this way.

**Three ways to use the pack.**
- **Learn:** go through the cards in the book's order, turning each one over.
- **Review:** the box system (below).
- **Listen & pick:** the voice says a name, and you tap which of four letters
  it belongs to. Four from the same class, so the look-alikes are there too.

**The box system (spaced repetition).** Imagine five boxes. Every card starts
in the first. Know a card, and it moves to the next box and waits longer before
it comes back: a day, three days, a week, two weeks. Miss it, and it goes back
to the first box and comes back today. Hard cards come often; easy ones rarely.
It's called **spaced repetition**, and this simple version is the Leitner
system, after Sebastian Leitner, who described it with real cardboard boxes.

**The cards are one small file, not a database.** All 44 cards live in
`logos/thai.json`, delivered with the pages like the bundled prayers. A database
is a filing cabinet for things that change and get searched; this is one sheet
of paper that changes only when I add a lesson.

**Your progress stays on your phone.** Which box each card is in is kept in
your browser (**browser storage**). There's no account, nothing is sent
anywhere, and it works without the internet once the page has loaded. The catch:
it lives in that one browser on that one device, and Safari may clear it if you
don't visit for about a week.

## Why it was built this way

**Following the workbook, not copying it.** The cards follow a Thai learner's
workbook: the same order, the same three classes, the same words and meanings,
and the book's own way of writing Thai sounds in English letters
(**romanization**). In that spelling, a mark over a vowel gives the tone, and a
dot over a letter marks a short syllable: *ġài*, *kȯn*, *fȧn*. The pages
themselves aren't on the site: they belong to the people who made the book.
Where the print had a slip, I was asked rather than "corrected" silently:

| Letter | Printed | On the card | Why |
|---|---|---|---|
| ฑ | *taw naangmȯnto*, with the word มณโฑ | the word นางมณโฑ | the spelling and the Thai disagreed; I chose the name as spelled |
| ฌ | *chaw ġà cheuh*, with the word เฌอ | the word กะเฌอ | the same |
| ศ | *sǎw kawsǎalaa* | *sǎw sǎalaa* | a printing slip |
| ษ | *sǎw bawreusěe* | *sǎw reusěe* | a printing slip |

**A synthetic voice, checked by a second machine.** The cards' voice is
Premwadee, a **neural voice** from the same Azure AI Speech studio that records
the prayers.

Choosing it, in a throwaway lab:
1. The studio read all 44 names in each of its three Thai voices (Premwadee,
   Achara and Niwat).
2. A small script measured each syllable's **pitch line** and asked whether its
   shape matched the tone the book's spelling asks for.
3. I listened to each voice reading every class.

**What the lab found.**
- **The first check was too strict.** It flagged 41 of 44 names as having the
  wrong tone, which was nonsense. Speech drifts down toward the end of anything
  said (**declination**), so even a level tone falls a little at the end of a
  name. Comparing each syllable with the same voice's *other* syllables of each
  tone worked: a fair comparison instead of fixed thresholds.
- **On average, Premwadee's five tones came out clearly distinct.** Her rising
  syllables dip then climb, her falling ones start high, and her low ones end
  lowest. Syllables whose shape looked more like another tone:

  | Voice | Out of 44 |
  |---|---|
  | Premwadee | 19 |
  | Niwat | 24 |
  | Achara | 39 |

  These are rough, because mid vs low and high vs rising are close cousins.
- **Choosing the voice.** I chose Premwadee. But as a beginner I can't truly
  judge Thai pronunciation, so a machine check decided whether each name is
  right (below).

**The machine check (a second opinion).** Every one of the 88 sounds went to
Azure's Thai speech recognition twice:
- **No hint:** it writes down what it hears, like a stranger would.
- **Told the expected words:** it scores each word against native speakers
  (**pronunciation assessment**).

It ran keylessly, with a role given for a few minutes and taken away, and used
about 7 of the free 300 minutes. A third check needed no Azure: Thai tones
follow spelling rules (the letter's class, a live or dead syllable, the tone
mark), and those rules agree with the book's tone marks on all 103 syllables.

Most names scored 99 or more. Three were wrong in ways several checks agreed
on, so the voice now reads them from a respelling it can't misread, while the
card still shows the real spelling:

| Card | Before | Respelled as | After |
|---|---|---|---|
| ษ ฤๅษี | heard "สอรี ศรี" (*ri* instead of *rue*) | รือสี | heard "สอ ฤาษี"; scores 96–100 |
| ย ยักษ์ | heard "ยักย้าย" (an extra syllable) | ยัก | heard "ยอยักษ์"; scores 96–100 |
| ฏ ปฏัก | the word not found at all | ปะตัก | scores 96–98 (the slow version's last syllable still scores low) |

A machine is a second opinion, not a native speaker: the voice is a good
guide, not the final word.

The lesson for later: a picture of your pitch line beside the model's will be
more trustworthy than a computer guessing which tone you made.

**The sounds are files in the site.** 88 short MP3s (44 names, at normal speed
and slowly), about 1.2 MB together, live in `logos/audio/th/`. Each
file's name holds a fingerprint of its words, voice and settings (a **content
hash**), so phones and Cloudflare can keep them for a year. They were recorded
once by a recipe script, `functions/scripts/record-logos.js`:
- it used 598 of the studio's 500,000 free characters this month;
- it signed in as me with a role given for the length of the lab and then taken
  away.

No API, database or new Azure service is involved, so the cards work even on a
pull request's preview copy of the site.

**If a recording can't play,** the phone's own Thai voice says the name instead.

## How we know it's right

- **Tests (`tests/logos.spec.js`):**
  - the data: 44 letters in alphabet order; 9 / 11 / 24 by class; the obsolete
    ฃ ฅ; every card complete and its Thai stored one consistent way (**NFC**);
    every sound present and none left over;
  - the gate: four lessons, and "to review today" counts;
  - Learn: turn, listen, slow, step through;
  - Review: "Got it" and "Again" move the boxes the right way, and a finished
    lesson has nothing due today;
  - Listen & pick: the sound heard is one of the four letters;
  - the device voice steps in when there's no recording;
  - readable text (14px and up) on a phone.
- **The home page tests** now expect seven gates, Logos last, and the loop back
  from the first gate to Logos.
- **The security test** loads the new pages under the site's real security
  headers and finds nothing blocked.
- **Writing the tests caught a real bug.** A brand-new card you knew at first
  sight went only into box 1, and box 1 means "back today", so "Got it" and
  "Again" did the same thing. In the Leitner system a new card counts as box 1,
  and knowing it moves it to box 2: back tomorrow. Now it does.

## Things to remember

- **Fixing a card** (a spelling, a meaning) is an edit to `logos/thai.json`. If
  you change what is *said* (`say`), re-run the recipe so its sound is
  re-recorded: give yourself the Speech role for a moment, run the script and
  the machine check, then take the role away before committing.
- **Your progress** is per browser and per device. Clearing site data, or a week
  away in Safari, starts the boxes again.
- **Next:** the tones; then practising aloud, where the studio listens to you
  say a letter's name and a pitch picture shows your tone beside the model's
  (AB#43).

## New foundations met here

Spaced repetition (the box system) · browser storage and its limits · a file,
not a database · romanization · tone and pitch · declination · a second
opinion (cross-check) · Unicode normalization (NFC). See [foundations.md](foundations.md).
