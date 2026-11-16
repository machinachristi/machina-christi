# Pray — The Mass, line by line

*AB#151 · Task AB#163 · November 2026*

## What changed, in one sentence

Pray has a new page, The Mass: the six prayers the people say at Mass, in the
order they come, in Thai and English, line by line, with one Listen button that
reads straight through. Three of them are new to the site, and every prayer
names where its Thai and its English come from.

## The story, like you're five

**A playlist, not a new album.** The Mass isn't written out a second time.
Its entry in `pray/prayers.json` only names its parts, in order:

1. The Sign of the Cross
2. I Confess (new)
3. The Nicene Creed
4. The Our Father, without its Amen
5. Lamb of God (new)
6. Lord, I Am Not Worthy (new)

It works like a playlist. The songs stay where they are, and the playlist
only lists them. Fix a word in the Our Father and the Mass has the fix too,
because there is only one Our Father.

**No Amen after the Our Father.** At Mass the priest carries straight on after
the Our Father, and the people answer later with "For the kingdom, the power
and the glory are yours…", so neither the Thai nor the English Mass has an Amen
there. A part can therefore be named as "the Our Father, leaving out its last
Amen". The Our Father's own page keeps its Amen.

**Two parts without a card.** Lamb of God and Lord, I Am Not Worthy are only
said at Mass, so they have no card of their own on the Pray list (they are
marked `"listed": false`). Each still has its own page, and search finds them.
I Confess is also prayed at night, so it keeps its card.

**The page.** At the top is a numbered list of the six parts. At Mass you tap
the part being said and the page jumps to it. Each part begins under a
numbered band with its name in English and Thai, a short note on when it is
said, its own two Listen buttons (▶ ไทย and ▶ English, just that prayer), and
its sources. The bar at the bottom still plays the whole Mass, from the Sign of
the Cross to Communion. A line's number counts through the whole Mass (53
lines), so tapping any line plays that line.

**One recording, many ways in.** The Mass has one long recording per language
and speed, with the moment each line starts. Playing one prayer means starting
at its first line and stopping where the next prayer's first line begins, the
same way a tapped line plays from its start to the next line's.

**The English is the Church's own.** For the prayers said at Mass, the English
now comes from the Church's English Missal of 2010, set out in the same lines
it uses. That includes both Creeds: the Nicene Creed now says
"consubstantial with the Father" and "I believe in one, holy, catholic and
apostolic Church", as heard at Mass. Where one English line holds two of the
Missal's lines, the page keeps the line break, and a gap marks where a new
paragraph starts. In three places the Thai and the English split the Creed in
different spots, so two Thai rows were joined into one, to keep each English
line with its Thai.

**Credit where it's due.** Every prayer page says where its Thai comes from
(with a link) and where its English comes from. The English from the Missal
carries its credit line at the foot of the page, and under search results that
show it. The other English is the traditional wording, which belongs to
everyone.

## Where the words come from

| Part | Thai | English |
|---|---|---|
| The Sign of the Cross | Catholic Commission for Liturgy, Thailand (2010) | the traditional wording |
| I Confess | Catholic Commission for Liturgy, Thailand (2010) | The Roman Missal (ICEL, 2010) |
| The Nicene Creed | Catechetical Center, Archdiocese of Bangkok | The Roman Missal (ICEL, 2010) |
| The Our Father | Catholic Commission for Liturgy, Thailand (2010) | the traditional wording |
| Lamb of God | the Thai Order of Mass, Redemptorists of Thailand | The Roman Missal (ICEL, 2010) |
| Lord, I Am Not Worthy | Catechetical Center, Archdiocese of Bangkok | The Roman Missal (ICEL, 2010) |

The Apostles' Creed (not part of the Mass page) now has the Missal's English
too.

## Questions for a Thai speaker

These wait for the owner's Thai speaker before the work is merged:

- **อาเมน or อาแมน?** The Commission's 2010 pages print อาเมน on six of the
  seven pages that have an Amen. Its 2021 booklet, the Redemptorists and the
  archdiocese print อาแมน. The site keeps อาเมน everywhere, as the 2010 pages
  have it.
- **ด้วยกาย in I Confess.** The Commission's page has a tab between ด้วย and
  กาย. The booklet and the Redemptorists print ด้วยกาย, together, and so does
  the site.
- **Lamb of God** has only one full Thai copy online (the Redemptorists').
  The archdiocese's page agrees on its name and its ending.
- **The Thai names** of The Mass (พิธีบูชาขอบพระคุณ) and of the three new
  prayers.
- **The Sign of the Cross** on the Commission's page has a space in
  "เดชะพระนาม พระบิดา" that the site doesn't. That's left as it is for now.

## Why it was built this way

**Parts by name, not copies (one source of truth).** A copied Creed inside
the Mass would sooner or later disagree with the Creed's own page. Naming the
parts means each prayer's words live in one place.

**Put together in two places, and checked to agree.** The publisher (which
sends the prayers to the database behind the API) and the page itself (which
shows the site's own copy at once, before the API answers) each expand the
Mass from its parts. A test makes both expand the real file and checks the
results match line for line. Expanding something that is already expanded
leaves it the same, so neither can go wrong by doing it twice.

**Mistakes stop the publisher.** A part that doesn't exist, a part that is
itself made of parts, an Amen to leave out that isn't there, two prayers with
the same name: each one stops the publishing run with a message, instead of
quietly publishing a broken Mass.

**An old API and new pages, for a few minutes.** After a merge, the pages and
the API are updated at different moments. An API from before this change says
nothing about which prayers are listed. Then the page keeps its own copy's
answer, so Lamb of God never flashes onto the list.

**One recording for the whole Mass.** The Mass gets its own recordings (Thai
and English, normal and slow), with a bookmark at every line, like every
prayer. Publishing records only what changed: the Mass, the two Creeds and the
three new prayers. That's 24 recordings and 18,184 characters, under 4% of the
free 500,000 a month.

## How we know it's right

- **Unit tests** (98, in `functions/test/`): expanding parts and their
  positions, every refusal, the real Mass's parts in order, the Our Father
  without its Amen, a change to one part re-recording only that part and the
  Mass, the API's list saying which prayers are listed, and every English
  credit naming its source.
- **Page tests** (160 across the site, in `tests/`): the list shows The Mass and hides the two
  parts said only at Mass; the Mass page draws every part's heading and lines
  in order; Listen reads all 53 lines and the highlight walks into each new
  part; each part's own Listen reads just that prayer (the Our Father without
  its Amen) and, with recordings, plays just its stretch and stops where the
  next part begins; tapping a line in a later part plays that line; the numbered list
  jumps to its part; a link to a part opens there; the page and the publisher
  expand the Mass the same way; the credit shows on prayer pages and under
  search results; everything is 14px or more on a small phone, with no
  sideways scrolling.
- **Look test**: real screenshots at two phone sizes (390×844 and 375×667),
  where the owner chose the card's place, the list at the top, the numbered
  bands, the credit line, each prayer's compact Listen row (keeping the
  whole-Mass bar), and every new sentence a visitor reads.
