# Software foundations, in plain words

A growing glossary. Each idea gets an everyday comparison and a line on where
it shows up in Machina Christi. New ideas are added as the project meets them.

## The pieces

**Website (the client side).** The pages you see on your phone. Your phone
downloads them and shows them, like picking up a printed leaflet: once it's in
your hand, everything on it is already decided.
*Here:* the gates on machinachristi.com — Eden, Camino, Ordo, Pray.

**Server.** A computer somewhere else that is always on, waiting for questions.
Unlike a leaflet, it can work out a fresh answer each time it's asked.
*Here:* the Azure Function app, which wakes up when someone asks it something.

**API.** The agreed way to ask a server a question and get an answer back —
like the counter at a post office: you hand over a form filled in the expected
way, and you get a reply in the expected shape. The "endpoint" is the specific
counter window, i.e. the web address you ask at.
*Here:* `api.machinachristi.com/api/season?date=2026-10-13` asks "what is this
day in the Church's year?"

**JSON.** The format the answer comes in: a tidy list of labels and values,
like a filled-in form. `{"season": "Advent", "color": "violet"}` reads as
"season: Advent, colour: violet".

**Stateless.** A server that remembers nothing between questions — a calculator,
not a diary. Every answer is worked out fresh from the question alone. That
makes it simple, cheap and safe to copy or restart.
*Here:* the season API works the season out from the date every time.

**Pure function.** A piece of code that, given the same input, always gives the
same output and touches nothing else — like 2 + 2. The easiest kind of code to
trust and to test.
*Here:* the season formula: give it a date, it gives back the season.

## Speed and cost

**Cache.** Keeping a copy of an answer so you don't have to ask again — a sticky
note on the fridge instead of phoning your mum every time. The trick is knowing
how long the note stays true.
*Here:* Cloudflare keeps each day's season answer for a day, so most visitors
never reach our server at all; it's faster for them and costs us nothing.

**Edge / CDN.** Cache copies kept in many cities around the world, so the
answer comes from somewhere near you rather than from one faraway computer.
*Here:* Cloudflare.

## Making changes safely

**Branch.** A photocopy of the whole project you can scribble on while the real
one stays untouched. Nothing you do there reaches the live site until it's merged.

**Pull request (PR).** Asking to fold the scribbled copy back into the real one.
It's where the changes are reviewed and the automatic checks run first.

**Test.** An exam with known answers that the computer marks every time the
code changes. If someone breaks something later, a test fails and says where.
A good test is one you've seen fail when the code is wrong.
*Here:* the season formula is checked against an independent calendar for
every day of 2026 and 2027.

**CI (continuous integration).** A robot that runs all the tests on every pull
request, so nothing gets merged on trust alone.
*Here:* GitHub Actions — the "Smoke Test" and "Azure Platform" checks.

**Deploy.** Putting the new version where the public can reach it — moving the
finished dish from the kitchen to the table.
*Here:* merging a PR into `main` makes GitHub Actions deploy it automatically.

**Telemetry.** The server keeping a log of what happened — how many questions,
how fast, anything that failed — like a shop's till roll. You read it to learn
how things are really going rather than guessing.
*Here:* Azure Application Insights, read with saved queries.
