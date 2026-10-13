# Phase 1 — the website that knows what day it is in the Church

*Built October 2026 (board item AB#38). Words in **bold** are explained in
[foundations.md](foundations.md).*

## What changed, in one sentence

The website now quietly shows the Church's season — a thin line of light along
the top of the page in the colour of the day (green now, violet in Advent and
Lent, white at Christmas and Easter, red or rose on special days), and the
season's name under "Machina Christi" on the home page.

## The story, like you're five

Imagine the website is a little house. Before, the house had no window: it
didn't know if it was Christmas or an ordinary Tuesday.

So we built a **helper who lives in a tower** (the **server**). Anyone can
shout up a date — "What is the thirteenth of October?" — and the helper shouts
back: "That's Ordinary Time, week 28, and the colour is green!"

The helper doesn't look the season up in a big book. She **works it out**,
like doing a sum. There's an old, clever recipe for finding Easter's date in any
year, and once you know Easter, everything else follows: Lent starts 46 days
before it, Pentecost comes 49 days after, and Advent starts four Sundays before
Christmas. So she can answer for any year, even far in the future.

For saints' days she *does* use a book — the same calendar the Ordo page reads —
because you can't work out a saint's day with a sum; somebody has to write the
list down.

Shouting up to the tower takes a moment, so we added a **noticeboard at the
bottom of the tower** (the **cache**, run by a company called Cloudflare).
The first time anyone asks about a date, the answer gets pinned on the board.
Everyone after that just reads the board. That's faster for them, and the
helper hardly has to work at all — which keeps it free.

Finally, each page of the website shouts up its own date when you open it, and
then lights the little line at the top in the colour it hears back. If the
helper ever doesn't answer, the page just stays as it always was. Nothing breaks.

## Why it was built this way

**Why ask a server instead of the page working it out itself?**
It could have been done inside the page. But this was a chance to build the
first real piece of the website that *runs somewhere* rather than just being
downloaded, and to learn how servers, caches and monitoring fit together. Later
phases (saints in a database, a prayer wall) need exactly this foundation. Now
other things — an app, a social-media robot — can ask the same helper too.

**Why does the phone send its own date?**
"Today" is different in Bangkok and in Boston. If the server guessed, half the
world would see tomorrow's colour. So the phone says what day it is *where you
are*, and the server just answers about that date.

**Why only a thin line and a few words?**
Gold is the site's own colour, and it stays. The season is a whisper on top of
it, not a repaint.

## How we know it's right

We wrote **tests** — little exams the computer marks every time anything
changes. The biggest one compares our sum with an independent Church calendar
(a project called litcal) for **every single day of 2026 and 2027**: 730 days,
all matching. We also broke the sum on purpose (made Lent start a day late) to
check the exam would notice. It did.

On the website side, the tests pretend to be the helper so they can say "it's
Advent" or "the helper is down" and check the page reacts the right way —
without ever bothering the real one.

After it went live we checked by hand:
- asked about today twice: the first answer came from the helper ("MISS"), the
  second straight off the noticeboard ("HIT");
- Easter is white, Ash Wednesday violet, Gaudete Sunday rose, St Andrew red;
- a made-up date like 30 February is politely refused.

## One thing to remember every year

The saints' calendar files only cover 2026 and 2027. Before each new year,
someone runs one command to add the next year (it's written in
`infra/README.md` under "Yearly upkeep"). If it's forgotten, nothing breaks —
the season and its colour still work — only the saint's name stops appearing.

## New foundations met in this phase

API · endpoint · JSON · stateless · pure function · cache and the edge ·
CORS (the permission slip) · telemetry. See [foundations.md](foundations.md).
