# The show home: every idea at once, built to be thrown away

*November 2026. Board item AB#171. Pull request #144, a draft that is never merged. This page lives on the experiment's branch: if the owner keeps it, it moves to `main` in a pull request of its own.*

## In plain words

A builder sometimes furnishes one house completely, a **show home**, so that buyers can walk through it and choose what they want in their own. Nobody moves in, and when the selling is done it comes down.

This was the same idea for Machina Christi. The 22 November theme review produced 25 ideas (X1 to X25): the name explained, a rule, verses over the doors, five wings on the front door, a hallway, a Gather wing for Chiang Mai, a Build wing, and more. Judging 25 ideas from a description is hard, so all of them were built at once into a copy of the site. The owner walks through it on their phone and marks each idea **keep**, **change** or **drop**. Then the copy is thrown away, and each idea that was kept is rebuilt properly, one small pull request at a time.

## How it was built

- **One draft pull request, one commit per idea.** A commit is a saved snapshot of one change with a label, and each is labelled X1, X2… So the list of commits doubles as a menu: any idea can be kept or dropped on its own. "Draft" means GitHub refuses to merge it by accident.
- **Everything new in one folder, `house/`.** The new pages (the wings, Chiang Mai, candles, the Angelus, the hornbook, the tour) and two shared files sit there: `house.css`, the look, and `house.js`, the "threads" that run through every room (verses, the hallway, next-door cards, the season, the Angelus, the passport). Today's pages gained only two lines each to load them, plus their idea's own small edit.
- **Pretend parts that say so.** Anything that would need a server, real people or real facts is faked in the browser and marked: meetings and Mass times say "example, not real", candles stay on the phone, and dashed boxes mark where a contact or a name would go.
- **Switches only the preview has.** The season colour and search only work on machinachristi.com. So the tour has a season switch (to see the house in Advent violet) and an Angelus switch (to ring the bell at any hour). Both check the web address and never appear on the live site.
- **Built in four stages,** each uploaded as it was finished: words and the front door; the wings and the hallway; Gather; Build.

## How it stayed safe

- The folders that wake Azure when they change (`infra/`, `functions/`, `db/`, the calendars, `pray/prayers.json`) were never touched, and nor was Eden. So nothing outside the website itself could change.
- A preview copy is unlisted, not secret: anyone with the link can open it. It is deleted when the pull request closes.
- The Chiang Mai list never counts visits, not even through the season service, and never stamps the passport. A visit to a list of recovery meetings can say something about someone's health.

## What the tests said

The site's automatic tests passed everywhere except the front door, where nine checks failed **on purpose**: they describe the old door (six gates, the old tagline, the About gate, which gate stands beside Eden). A test is like a photograph of how a room was meant to look: when the room is redecorated on purpose, the photo is retaken, and that happens only for ideas that are kept, in their own pull requests. Every check of readability, privacy and security passed on the pages that gained new things.

## What it shows about software

- **Prototype before product.** It is cheaper to build something quickly, learn from it and throw it away than to argue about it, or to build it properly and find it was wrong. The throwaway version can cut corners (fakes, preview-only switches) because it will never be the real thing.
- **Undo is easy only when nothing outside was touched.** Files on a branch cost nothing to throw away. Changes to servers, databases or anything already published do. That is why the show home touched only files.
- **Content apart from code.** Every room's verse and "why" line sits in one small table in `house.js`. Changing the words means editing the table, not hunting through pages, the same idea as the prayers living in one data file.
- **Privacy is a design choice.** Not counting the Chiang Mai page, and not stamping it, cost nothing to build. They had to be thought of before building, not added after.

## Afterwards

Close the pull request without merging (the preview disappears), press "Delete branch", and the worktree folder is removed. Each kept idea becomes its own Issue and its own small pull request from `main`, with its words settled, its tests updated, and any Thai checked by a Thai speaker.
