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

**Source (provenance).** Where a fact came from, kept with the fact, like a
footnote. It lets anyone check it, and lets us fix it when the source is fixed.
*Here:* the database refuses a bio or a date of death that doesn't point at its
source; the site links each one.

**Scheduled job (timer).** A program that nobody asks for: it runs by itself
on a clock, like a dishwasher set to start at 2 a.m.
*Here:* every Sunday the "librarian" wakes the database and writes out the
saints.

**Blob storage.** A cupboard for files in the cloud. "Blob" just means "a lump
of data", whatever's in it: a photo, a video, a JSON file. Much cheaper and
simpler than a database, but it can only hand back whole files, not answer
questions.
*Here:* the saints snapshot and the API's own packages.

**Document database (NoSQL).** A database that stores each thing as one whole
folder (a *document*, written in JSON) instead of cards spread across drawers
that point at each other. Best when you always fetch the whole thing at once.
*Here:* Cosmos DB holds the prayers; SQL holds the saints, whose facts point at
each other.

**Document.** One folder in a document database: everything about one thing,
together. *Here:* one prayer: its Thai lines, pronunciation, English, source and
recordings.

**Container.** A shelf of documents of one kind inside a document database, like
a drawer, but holding whole folders. *Here:* the `prayers` container.

**Partition key.** The label that decides where each document is stored. Ask by
that label and the database goes straight to the right place; ask any other
way and it has to look around. Choose the label you'll search by most.
*Here:* each prayer's own name (`/id`).

**Point read.** Fetching one document by its name and partition key: straight to
the shelf, nothing else read. The cheapest question there is.
*Here:* one prayer costs 1 request unit.

**Neural text-to-speech.** A computer voice trained on many hours of real
speech, so it sounds natural, unlike the older robotic voices.
*Here:* Niwat (Thai) and Andrew (English), from Azure AI Speech.

**SSML.** A script for a computer voice: the words, plus instructions such as
"pause 0.6 seconds" or "read 30% slower".

**Bookmark (speech).** An invisible flag in an SSML script. The voice reports the
exact moment it reaches each one. *Here:* one at the start of each line, which
gives the timings the Pray highlight follows.

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

**Sleeping (serverless) database.** A database that switches itself off when
nobody's using it and wakes when someone knocks, like lights on a motion
sensor. Cheap, but the first knock waits while it wakes.
*Here:* Azure SQL's free offer sleeps after an hour alone and takes about a
minute to wake, which is why visitors read a published snapshot instead.

**Cache-busting (versioning).** Changing the question slightly (adding
"version 2") so every cache treats it as new and fetches a fresh answer,
instead of serving a copy kept from before. Like reprinting a menu with a new
date so nobody reads the old one pinned by the door.
*Here:* when the season answer gained the day's saint, old copies kept by
Cloudflare and browsers hid it until the question became `…&v=2`.

**Request unit (RU).** Cosmos DB's measure of effort: reading one small
document costs about 1, writing one about 5–10, a search across documents more.
Like counting a delivery in parcels, not in hours. *Here:* writing all 10
prayers cost 403.7 RU.

**Provisioned throughput, and its cap.** Booking a fixed amount of effort per
second in advance, like a phone plan's monthly minutes. A cap says "never book
more than this". *Here:* 1,000 RU every second, free for life, capped at 1,000
so nothing can cost money.

**Rate limit.** A limit on how *fast* you may ask, not just how much: "no more
than 20 questions a minute". Go faster and you're told to wait, or hung up on.
*Here:* the free speech studio's limit tripped the recording robot once; it now
paces itself (and Cloudflare rate-limits the API the same way, to protect it).

**Byte ranges (206 Partial Content).** Asking for part of a file ("bytes 0 to
1, please"), and getting just that piece back, marked 206. Media players use it
to start quickly and to jump around; iPhones refuse to play audio from a server
that can't do it. *Here:* the API's recording relay.

**Content hash, and immutable caching.** A short fingerprint worked out from a
file's contents: change anything and the fingerprint changes. Put it in the
file's name and the file under that name can never change, so every cache may
keep it forever ("immutable"). *Here:* `our-father/th-slow-5ea7f0c694.mp3`.

## Networks and security

**Firewall.** A list at the door saying who may even knock. It works alongside
sign-in: the firewall decides who can reach the door, the badge decides who gets in.

**Region.** Which of the cloud provider's cities a piece of the system lives
in (East US 2 is Virginia, Central US is Iowa). Things in the same region talk
fastest, and some features only work within one region.
*Here:* the API and the database both live in Central US.

**Virtual network and subnet.** A private building in the cloud (the virtual
network, or VNet), divided into hallways (subnets). What's inside can talk
privately; the outside world can't wander in.
*Here:* `vnet-machina`, with one hallway, `func`, for the API.

**Service endpoint.** A pass that lets everyone in one hallway reach a
particular Azure service by a private route, so that service can say "I only
open the door to that hallway".
*Here:* the database admits only the API's hallway.

**Defence in depth.** Several independent locks instead of one, so a single
failure (a stolen badge, a mistaken rule) isn't enough to get in.
*Here:* to reach the saints, you must be inside our network *and* hold a badge
with a database account; the API's badge can only read.

**Role and least privilege.** A role is a named set of permissions, like a job
description: "may file cards, may not change the locks". Least privilege means
giving each person or program the smallest role that lets it do its job, so a
mistake or a break-in can only do small damage.
*Here:* you own the database server; the deploy robot may change tables and
data but not the server or its owner; the API may only read.

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
*Here:* the deploy used it to start the librarian right after a change, until
October 2026: now it leaves a note in a queue instead (below), and the robot
can't even read the key. Fewer keys in circulation is safer, even "harmless" ones.

**Queue (message queue).** A mailbox between two programs: one drops a note in,
the other picks it up when it's ready and does the job. The sender needs only
the right to post notes, not the power to run anything; and if the job fails,
the note goes back in the box to be tried again.
*Here:* after a database change, the deploy posts to the `saints-publish` queue,
and the API publishes the saints.

**Control plane and data plane.** Two different doors: one for managing a
service (create it, delete it, change its settings) and one for using what's
inside it (read or write the data). Holding a key to one doesn't open the
other: the owner of a library building still needs a reader's card to take out a
book. *Here:* you own the Cosmos DB account, but it refused to show you the
prayers; only the robot and the API hold data badges.

**Private container, and relaying.** Files no outsider may open directly; an
app that holds a badge fetches them and passes them on, like a librarian
fetching a book from the closed stacks. *Here:* the recordings, passed on by
`/api/audio`.

**SAS (shared access signature).** A ticket written into a link that lets
whoever holds the link open one file for a while. Handy, but anyone who gets the
link gets in, and a ticket signed with an account key works until it expires.
*Here:* not used. Storage keys are switched off (so key-signed tickets can't
even be made), and every machine uses its own managed identity instead.

**Synthetic-voice disclosure.** Saying plainly when a voice is computer-made, so
nobody mistakes it for a person. *Here:* a line under each prayer names the
voices as synthetic.

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

**Core tests vs feature tests.** Two kinds of exam. A *core* test checks what
must stay true however much the project changes ("the page loads", "nothing
crashes", "it fits on a phone"), like a building inspector's safety rules.
A *feature* test checks one particular thing someone once built ("there's a
gate in the east"), like a photo of how a room was decorated. If a redesign is
on purpose, the photo should be retaken; the safety rules never bend. Keeping
them in separate files means you can let someone change one kind without
letting them touch the other.
*Here:* Eden's tests are split into `tests/world-core.spec.js` (locked: the
weekly AI run may never edit it) and `tests/world-features.spec.js` (the run may
add tests for new things, and update or retire a feature's test only when it
deliberately reshaped that feature, explaining each change in its PR).

**CI (continuous integration).** A robot that runs all the tests on every pull
request, so nothing gets merged on trust alone.
*Here:* GitHub Actions — the "Smoke Test" and "Azure Platform" checks.

**Workflow.** The robot's recipe: a file listing the steps to run and when
("on every pull request: install the test tools, run the tests; on a merge to
main: deploy"). GitHub provides the robot, but it does only what our recipes
say, and the recipes are code like any other, changed through pull requests.
*Here:* the files in `.github/workflows/`, one for the website and one for the
API and Azure.

**Runner.** The computer a workflow runs on: a fresh, empty machine GitHub
lends for the length of the run and wipes afterwards, like a kitchen hired by
the hour. Starting clean every time means a test can't pass just because of
something left over on someone's laptop.
*Here:* a new Linux machine for every check you see on a pull request.

**Running tests side by side (workers).** To finish sooner, the test robot
splits the exams between a few helpers ("workers") who sit them at the same
time, like two cashiers instead of one queue. That's only safe when the exams
don't share anything scarce. Two helpers both needing the one oven makes each
dish late, and a test with a time limit then fails, even though nothing is
broken. A test that passes or fails depending on luck like this is called
*flaky*, and the fix is to find what's being shared, not to keep pressing
"run again".
*Here:* CI's runner has two workers and draws the Eden garden without a
graphics chip, so two gardens at once each ran at half speed and the "rain
arrives" check ran out of time. The Eden feature tests now wait for the core
tests to finish, while the rest of the site's tests keep the second worker
busy (`projects` in `tests/playwright.config.js`).

**Required check.** A check GitHub must see pass before it lets a pull request
merge, like a signature a bank needs before releasing money. Other checks still
run and report, but don't block on their own.
*Here:* "Smoke Test" (the browser tests) and "World Diff Guard" (Eden's update
rules: which files the weekly AI run may change, no network or hidden code, and
any borrowed three.js add-on must match the official copy byte for byte) are
required for `main`; the Azure preview isn't, so it's read before
asking to merge.

**Stand-in (mock).** A pretend version of something a test can't use for real
(a voice, a server, a sign-in), which behaves the way the test tells it to.
It lets a test try situations that are hard to cause on purpose.
*Here:* the Pray tests use a pretend voice, because the test computer has no
speakers; it can even skip announcing a line, to imitate an iPhone glitch.

**Fake clock.** In a test, a stand-in for time itself that the test moves by
hand ("now it's 4.2 seconds in"), so anything time-based can be checked at exact
moments without waiting. *Here:* the Pray tests swap the audio player for one
whose clock the test controls.

**Blue-green deployment.** Replacing a live system by building the new one
next to the old, switching visitors over, and only then removing the old one,
like moving house by living in both for a day. There's never a moment without
a working system, and if the new one misbehaves you switch back.
*Here:* how the API moved from East US 2 to Central US.

**Deploy.** Putting the new version where the public can reach it — moving the
finished dish from the kitchen to the table.
*Here:* merging a PR into `main` makes GitHub Actions deploy it automatically.

**Telemetry.** The server keeping a log of what happened — how many questions,
how fast, anything that failed — like a shop's till roll. You read it to learn
how things are really going rather than guessing.
*Here:* Azure Application Insights, read with saved queries.
