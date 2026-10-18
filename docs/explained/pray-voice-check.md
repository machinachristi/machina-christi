# Pray — the Thai voice, checked by machine and taught eight words

*AB#17 · Tasks AB#101 (the check) and AB#102 (the fix) · October 2026*

## What changed, in one sentence

Two listening machines checked every line of the Thai prayers, found a handful
of rare Church words the computer voice says wrong, and the voice now reads
those words from respellings, while the pages still show the Church's own
spelling.

## The story, like you're five

**Two listeners.** The prayers are read aloud by a computer voice (Niwat, from
Azure AI Speech). I can't judge Thai pronunciation yet, so two machines
listened instead:
- **the stranger** (speech-to-text, given no hint) writes down whatever it
  hears;
- **the examiner** (pronunciation assessment) is told what *should* be said
  and scores every word and sound out of 100.

They make different kinds of mistakes. The stranger "hears" familiar words in
place of rare ones; the examiner trips over words it doesn't know. So a word
only counts as wrong where both agree, at both speeds.

**One recording, cut into lines.** Each prayer is one recording, and the site
already knows when every line starts (the bookmarks from Phase 4). The voice
pauses 0.6 seconds between lines, so each recording was cut in the middle of
those pauses: 218 clips (109 lines, normal and slow), none longer than 9
seconds, so no word was cut in half.

**The examiner needed spaces.** Thai is written without spaces between words,
so the examiner first has to guess where words end (word breaking). It guessed
wrong in about 4 clips out of 10 and then reported nonsense, such as a word
"missing" right beside two words "added". Given the same text with spaces
between the words, most of those alarms went away: a line that scored 54
scored 100.

**A fair test for each suspect.** For every suspect word, the examiner scored
the same clip again against the correct reading spelled out syllable by
syllable (ปะ ถม มะ กาน). A syllable that comes back "omitted" wasn't said.
One lesson here: the first respellings were made-up words, which tripped the
examiner too, and made ปฐมกาล look wrong when the voice says it perfectly.
Spacing every syllable fixed the test.

**What the two listeners found.** The voice is right almost everywhere. Every
problem was a rare Church word, or a long run of letters with no space:

| Prayer, line | Word | What the voice said |
|---|---|---|
| Apostles' Creed 6, Nicene Creed 11, Hail Holy Queen 13, Memorare 1 | มารีย์พรหมจารี (the Virgin Mary) | "มา พรหมจารี": Mary lost her รี |
| Memorare 6 | พรหมจารี (virgin), twice | "พรหม-จา-รี": the hidden มะ dropped |
| Apostles' Creed 3, Nicene Creed 3 | พระเยซูคริสตเจ้า (Jesus Christ) | "…คริสต้า": เจ้า swallowed |
| Nicene Creed 23 | ประกาศก (prophets) | ประกาศ, which means "announce" |
| O Blood and Water 2 | พระหฤทัย (the Sacred Heart) | พระฤทัย: หะ dropped |
| Memorare 8 | พระวจนาตถ์ (the Word) | "พระวุดนาด": two syllables, not three |
| Hail Mary 1 | พระหรรษทาน (grace) | พระหัน**สด**ทาน, not หัน**สะ**ทาน |
| Apostles' Creed 15 | ศักดิ์สิทธิ์ (holy), in "the holy catholic Church" | dropped (fine in the Nicene Creed, which has spaces there) |

Many other flags were the machines' own confusion, and the voice is fine:
เดชะ, อาเมน, ปฐมกาล, นิรันดร, พระชนมชีพ, สรรพานุภาพ, and the line-ending บาป,
whose last sound fades into silence so both listeners miss it.

**Fixing the voice, not the text.** `pray/prayers.json` is the master copy of
the Church's texts, so its prayer lines don't change at all. Instead, the
audio settings, the same place that names the voice and the slow speed, gain a
short `say` list: each word as the Church writes it, and what the voice should
read instead. The page shows and search finds the real spelling; only the
recording uses the respelling.

**Trying the respellings first.** Before anything was changed, the voice read
every candidate respelling, line by line at both speeds, and the same two
listeners checked them. Each line was also read as written, as a **control**:
all 24 controls still went wrong, which proves the test would catch the
problem. Two rounds settled it:

| As the Church writes it | The voice reads | What the check showed |
|---|---|---|
| มารีย์พรหมจารี | มารีย์ พรหมมะจารี | รี back in all 8 clips; มะ clear in half (it blurs into the m before it) |
| พรหมจารี | พรหมมะจารี | มะ back in 3 of 4 places, from none |
| คริสตเจ้า | คริดตะเจ้า | เจ้า back in all 4 clips (86–99); the small ตะ stays soft |
| ประกาศก | ประกา สก | the last syllable back (94; 76 when slow, at the line's end) |
| พระหฤทัย | พระหะฤทัย | right at both speeds (100), heard exactly |
| พระวจนาตถ์ | พระวะจะนาด | all three syllables back; weaker when slow |
| พระหรรษทาน | พระหันสะทาน | สะ right at both speeds (100) |
| ศาสนจักรศักดิ์สิทธิ์สากล | ศาสนจักร ศักดิ์สิทธิ์ สากล | right at both speeds (95–98), heard exactly |

The trial also taught a surprise: a fix can move a mistake instead of removing
it. A plain space brought Mary's รี back, but then the voice dropped the มะ of
พรหมจารี instead. Only spelling the มะ out fixed both.

## Why it was built this way

**Respellings sit with the voice settings, not in the lines.** A second copy of
each line just for the voice would double the Church's text and drift out of
step. A list of a few words is small, easy to read, and leaves every line
exactly as its source wrote it.

**One pass, longest word first.** The recipe replaces all listed words at once,
longest first: in "มารีย์พรหมจารี" the Mary entry wins over the shorter
"พรหมจารี" inside it, and a respelling is never respelled again.

**Only the prayers that change are recorded again.** A recording's name holds a
fingerprint of what the voice reads (Phase 4). A new respelling changes the
fingerprint only for the prayers that contain the word: 12 of the 40
recordings (6 prayers, Thai, both speeds), and none in English.

**A typo can't slip through.** Publishing refuses a respelling for a word no
prayer contains, so a mistyped entry stops the run instead of silently doing
nothing.

**Keyless, and only for minutes.** The checks signed in as me, with no keys.
My account was given the temporary Speech User role three times, for 34,
12½ and 6 minutes; it was removed straight after each run, and each time a
listing showed none left. Everything stayed on the free tier: about 74 of the
300 free listening minutes this month, and about 58,000 of the 500,000 free
voice characters.

## How we know it's right

- **The control and the trial**, above: every control went wrong, and every
  chosen respelling did better.
- **Three new tests** (`functions/test/prayers.test.js`): a respelling changes
  only what the voice reads, never the prayer shown on the page; only prayers
  with the word get new recordings; and a respelling must be for a word some
  prayer has.
- **The publisher's dry run** on the pull request lists exactly the 12 Thai
  recordings it will make (5,750 characters).
- **After merging**, the same machine check listens to the new recordings.

## Things to remember

- **To respell another word:** add it to `say` in `pray/prayers.json`'s
  `audio` settings. Publishing re-records only the prayers that contain it.
  Then check the new recording: the Speech role for a few minutes, the same two
  listeners, the role taken away.
- **The check's lessons:**
  - give the examiner the text with spaces;
  - judge a respelling by the score of the syllable that should be there, since
    the examiner forgives extra sounds but not missing ones;
  - the first word of a line scores a little lower;
  - a line's last stop sound (p, t, k) fades, and both listeners miss it.
- **Tones can't be checked this way.** The examiner doesn't grade Thai tones,
  and a rough pitch tracker couldn't tell tones apart in flowing speech. On
  average, Niwat's five tones have the textbook shapes.
- **The romanization** was checked syllable by syllable, all 1,155 of them,
  against the Thai spelling rules and the official Royal Institute dictionary.
  Only two words have a wrong tone mark, each in both Creeds: ปิลาต should be
  bpì-lâat, and ศาสนจักร should be …-ná-…. Those are text fixes, not voice
  fixes, and wait for their own OK.
- A machine is a second opinion, not a native speaker: if a Thai Catholic ever
  says a word differently, their ear wins.

## New foundations met here

Speech-to-text · pronunciation assessment · homophone · respelling · a control
(and changing one thing at a time) · word breaking · a second opinion. See
[foundations.md](foundations.md).
