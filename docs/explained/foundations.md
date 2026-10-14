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

**Database.** A filing cabinet for information, with labelled drawers (tables)
and a card for each thing in a drawer (rows). Unlike a single file, you can ask
it precise questions and change one card without rewriting everything.
*Here:* Azure SQL holds Ordo's saints.

**SQL.** The language for asking a database questions: "show me every saint
who died in the 4th century" is one short sentence of SQL. T-SQL is Microsoft's
dialect of it.

**Schema.** The layout of the cabinet: which drawers exist, what goes on each
card, and how cards in different drawers point at each other (a feast day card
points at the saint cards it celebrates).

**Migration.** A numbered, written-down change to the cabinet's layout or
contents ("add a drawer for patron causes"). They're applied in order, each
exactly once, and never edited afterwards — like entries in a ledger. That way
the cabinet in the cloud can always be rebuilt from the files.

**Transaction.** A group of changes that either all happen or none do, like a
bank transfer that can't take money out without putting it in. A *dry run* does
the work inside a transaction and then cancels it: a rehearsal that keeps nothing.

**Managed identity.** A staff badge Azure gives to a piece of software, so it can
prove who it is without a password. No password means nothing to leak, forget
or rotate.
*Here:* the API, the deploy robot and the database all use badges.

**Scheduled job (timer).** A program that nobody asks for: it runs by itself
on a clock, like a dishwasher set to start at 2 a.m.
*Here:* every Sunday the "librarian" wakes the database and writes out the
saints.

**Blob storage.** A cupboard for files in the cloud. "Blob" just means "a lump
of data", whatever's in it: a photo, a video, a JSON file. Much cheaper and
simpler than a database, but it can only hand back whole files, not answer
questions.
*Here:* the saints snapshot and the API's own packages.

## Speed and cost

**Snapshot (publishing).** Copying what you need from a slow or costly place
into a quick, cheap one, ahead of time. A newspaper is printed once in the
night and read by thousands; nobody phones the reporters.
*Here:* the database sleeps; once a week (and after every change) its saints
are printed to one JSON file, and the API reads only that file.

**Cache.** Keeping a copy of an answer so you don't have to ask again — a sticky
note on the fridge instead of phoning your mum every time. The trick is knowing
how long the note stays true.
*Here:* Cloudflare keeps each day's season answer for a day, so most visitors
never reach our server at all; it's faster for them and costs us nothing.

**Edge / CDN.** Cache copies kept in many cities around the world, so the
answer comes from somewhere near you rather than from one faraway computer.
*Here:* Cloudflare.

**CORS (the permission slip).** Browsers are careful: a page from one website
may only read answers from another web address if that address hands back a
note saying "this website is allowed to read me". Without the note, the browser
throws the answer away. It stops strange sites quietly reading things on your
behalf.
*Here:* the API gives the note to machinachristi.com and nobody else, which is
also why the season accent only appears on the real site, not on test copies.

## Networks and security

**Firewall.** A list at the door saying who may even knock. It works alongside
sign-in: the firewall decides who can reach the door, the badge decides who gets in.

**Default deny.** Start with every door shut and open only the ones you need,
rather than starting open and trying to remember what to shut.

**Fallback (graceful degradation).** A plan B that kicks in by itself when plan
A fails, so a visitor sees something slightly older or simpler, not an error.
Like candles in the drawer for a power cut.
*Here:* if the saints snapshot can't be read, the API answers from the bios
bundled with the site; if the database is asleep or broken, last week's
snapshot stays up.

**Master key.** One key that can start or change anything in an app. Handing
it out is only safe to someone who could already do all that, so it adds no
power. The deploy robot installs the app's code, so it could make the app do
anything anyway.
*Here:* the deploy uses it to start the librarian right after a change.

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
