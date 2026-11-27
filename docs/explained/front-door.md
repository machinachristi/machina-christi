# The front door: what this place is, today's prayer, and the gates beside Eden

*November 2026, from the whole-site review (Step 2: Q4, M5, F1).*

> **Since late November 2026 the front door has three gates: Pray, Wander and Build.** This page records how it was before; the move is told in [three-gates.md](three-gates.md).

## What a visitor meets now

The homepage used to say only the name and the season. A first-time visitor
had to guess what the place was. Now, under the name:

> *A little place to pray, to learn, and to wander*

These are the owner's own words, chosen from four real screenshots: two
explaining sentences, a verse, and leaving it blank. Under the gates, where
"Tap a gate to enter" stood, there's a quiet framed line, **Pray today**, which
opens one prayer.

The gates are in a new order too: **About · Ordo · Eden · Pray · Logos ·
Workshop**. The page still opens on Eden, but the two everyday places, Ordo
(today in the Church) and Pray, are now one swipe away on either side.

And across the site, small text is a little brighter and small buttons have
bigger tap areas (see *Contrast ratio* and *Tap target* in
[foundations.md](foundations.md)).

## How "Pray today" chooses

A table of seven lines, one per weekday, after the Church's old weekday
devotions: Sunday the Mass, Monday the Glory Be (the Trinity), Tuesday the
Angel of God (the angels), Wednesday the Our Father, Thursday "Lord, I Am Not
Worthy" (the Eucharist), Friday "O Blood and Water" (the Passion), Saturday the
Hail Mary (Our Lady).

It reads the day from the visitor's own phone, like glancing at the calendar
on the kitchen wall instead of phoning someone to ask. So it is instant and
works even when the site's back office (the API) is asleep. If the phone
doesn't run the page's script at all, the link still opens the Our Father.
That is a **fallback**: a plan B written into the page itself.

Later (item B2/B4) it could follow the Church's own day, for example a feast
of Our Lady on a Tuesday. That would mean asking the server, so it waits.

## Why the gate order needed no new code

The dots under the gates, the arrow keys and the opening gate are all worked
out from the list of gates on the page. The script looks for Eden *by name*,
not "the second gate". So reordering came down to moving six blocks of text,
like reordering pages in a ring binder: the table of contents rebuilds itself.
This is a general habit in software: **let the data drive the layout**, so
that a change in one place doesn't need matching changes elsewhere.

## The tests that guard it

- The sentence is there, word for word.
- For each of the seven days the test sets a pretend date. It checks that
  "Pray today" points at a prayer that really exists in `pray/prayers.json`,
  shows that prayer's real name, and is at least 44 pixels tall.
- On a small phone (375×667) the whole page still fits without scrolling,
  and the centred gate keeps its full width of 195 pixels.
- `tests/kind-to-eyes.spec.js` taps 21 pixels off-centre on the small
  buttons, and measures how strongly every reading page's text stands out.

**Setting a pretend date** is an everyday trick in testing: the test wants to
see Saturday's prayer, but it may well run on a Tuesday. So it tells the
browser what day to believe, like a stage clock set for the play.
