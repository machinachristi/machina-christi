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

**Custom role.** A role written to fit one job exactly, when the ready-made
ones give too much, like a key cut for one door instead of a master key.
*Here:* "Machina Search Schema Writer" may change the search index's layout and
nothing else; the ready-made role could also read the keys and switch them back
on.

**Injection and XSS.** Tricking a program by slipping instructions in where it
expects plain words. In search, typing `-mary` must not mean "NOT mary". On a web
page, a result containing `<img onerror=…>` must not run as code (that's
*cross-site scripting*, XSS). The cure is the same: treat everything from
outside as plain text, never as instructions.
*Here:* only letters and digits reach the search engine, and results are drawn
as text.

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

## Finding things

**Search index (inverted index).** A card catalogue made ahead of time: instead
of reading every book each time someone asks, you keep, for every word, a list
of the books it appears in, like the index at the back of a book. Asking "which
pages mention Agnes?" is then instant.
*Here:* Azure AI Search keeps one index, `site-v1`, of 184 cards: one per
saint's feast, prayer and page.

**Field.** One labelled box on a search card: the title, the Thai title, the
lines of the prayer, the saint's patronages. Each box can be searched in its own
way and count for more or less.

**Analyzer (word-cutter), token.** Before a card is filed, its text is cut into
words, made lowercase and tidied; each piece is a *token*. The same cutter runs
on what you type, so both sides match. Different languages need different
cutters.
*Here:* Thai, English, and names each get their own.

**Word breaking.** Finding where words end when nothing marks it. Thai is
written without spaces between words, so "ข้าแต่พระบิดาของข้าพเจ้า" has to be cut
by a cutter that knows Thai (ข้า | แต่ | พระ | บิดา | ของ | ข้าพเจ้า). Without one,
the whole line is a single "word" and nothing inside it can be found.

**Stemming vs lemmatization.** Two ways to match a word's family. *Stemming*
chops endings by rule (praying → "prai"); *lemmatization* looks the word up in a
dictionary (praying → pray, women → woman). The second is gentler.
*Here:* prose uses Microsoft's English lemmatizer, so "lawyers" finds "lawyer".

**Accent folding (ASCII folding).** Treating é like e, so "Therese" finds
"Thérèse" and "phra" finds "phrá" in the pronunciation guide.

**Prefix search.** Matching the start of a word, so results can appear as you
type: "agn" finds Agnes. Written `agn*`.

**Stop words.** Little words such as "of", "the" and "and" that some cutters
throw away because they're everywhere. Mixing fields that keep them with fields
that drop them can make a search fail, so our search drops them from the
question.

**Phrase search.** Asking for words in this exact order, side by side, in
quotes: `"พระแม่มารีย์"` (Holy Mother Mary) finds only the prayer that has that
exact run.

**Relevance (BM25).** How a search engine decides which match comes first. A word
that is rare across all cards, appearing in a short field, counts for more than
a common word in a long bio. BM25 is the standard recipe for that score.

**Scoring profile.** Our own adjustment on top: a match in a title counts five
times a match in a bio. *Here:* `titles-first`.

**Synonym map.** A list of words to treat as the same: "st" and "saint", "ghost"
and "spirit". Longer names for a thing ("Ave Maria" for the Hail Mary) work
better stored on the card itself, as its other names (`aka`).

**Fuzzy search.** Forgiving a typo by allowing a word to be a letter or two off
(the *edit distance*): `fransis~1` finds Francis.
*Here:* tried only when the strict search finds nothing.

**Indexer, and push vs pull.** An *indexer* is a robot that reads your data and
fills the index. *Pull*: the search service fetches the data itself (Azure's
built-in indexers). *Push*: your own code reads the data and hands the cards
over.
*Here:* push. On the free plan Azure's indexers would need keys, and we use
none, so our API, which already has the badges, does the indexer's job.

**Highlighting.** Showing which words matched, in bold or colour. The search
service marks them; the page draws the marks.

**Versioned rebuild.** When a change can't be made to something in place, build
the new one next to the old one under a new name (`site-v2` beside `site-v1`),
switch over, then remove the old: blue-green, for an index.

**Debounce.** Waiting for a pause before acting, like a lift that waits for the
last person before closing its doors. The search page asks only after you stop
typing for 0.3 seconds, rather than once for every letter.

## Learning and remembering

**Spaced repetition (the box system).** Reviewing what you're about to forget,
not what you already know. Picture five boxes of flash cards: a card you know
moves up a box and waits longer before it comes back (a day, three days, a
week, two weeks); a card you miss goes back to the first box and comes back
today. This version is the Leitner system, described by the German writer
Sebastian Leitner in the 1970s, with real cardboard boxes.
*Here:* Logos's Review mode for the Thai consonants.

**Browser storage (localStorage).** A small notebook each website may keep
inside your browser. It's private to that site, that browser and that device,
and nothing in it is sent anywhere unless the page sends it. It isn't a safe:
private browsing, clearing site data, or (in Safari) a week without visiting
can wipe it.
*Here:* which box each Logos card is in, and switches like "Slow voice".

**A file, not a database.** Not everything needs a database. A database earns
its keep when information changes often, is shared, or needs searching; a small
list that changes only when you edit it can simply be a file delivered with the
pages.
*Here:* the 44 Thai cards are one file, `logos/thai.json`.

**Romanization.** Writing one language's sounds in another's letters, so a
learner can read them before learning the script. There are many systems; what
matters is using one consistently.
*Here:* Pray uses kh/ph/th for breathy sounds; Logos follows a Thai learner's
workbook (g/k, bp/dt, and a dot over short syllables).

**Tone and pitch.** Pitch is how high or low a voice is at each moment;
drawn over time, it makes a line. In a tonal language like Thai, the shape of
that line is part of the word: the same syllable said level, low, falling, high
or rising means different things.

**Declination.** Pitch drifts down toward the end of anything said, in every
language, as the breath runs out. A program judging tones has to allow for it,
or every last syllable sounds "falling".
*Here:* the first tone check in the Logos lab forgot this and flagged nearly
every card; comparing each syllable with the same voice's other syllables of
each tone fixed it.

**Second opinion (a cross-check).** Checking one machine's work with another,
independent one before trusting it, especially where you can't judge yourself.
Where both agree, you can be fairly confident; where they disagree, look
closer.
*Here:* Azure's Thai speech recognition listened to every Logos sound. The
three names it heard wrongly now have spellings the voice can't misread.

**Speech-to-text (speech recognition).** A computer listening and writing
down what it hears. Think of a careful stranger: it knows common words very
well and rare ones badly, so it may "hear" a familiar word in place of an
unfamiliar one, the way you might hear a song lyric wrong.
*Here:* in the Pray voice check it wrote โดยเฉพาะ ("especially") for the rare
เดชะ, while the voice was fine.

**Pronunciation assessment.** Speech-to-text that is told what *should* be
said. It scores each word and sound against native speakers (0 to 100) and
reports words missing ("omitted"), added, or said wrong. It needs the text cut
into words first (see word breaking), and it trips over words it doesn't
know. Azure's version doesn't grade Thai tones.
*Here:* the second check on every Pray line; with spaces between the words,
most of its alarms went away.

**Homophone.** Words that sound the same but are spelled differently: "there"
and "their" in English, กาล and การ (both *gaan*) in Thai. A listening machine
may write either, and that is not a pronunciation mistake.

**Respelling (for a computer voice).** Writing a word the way it sounds, for
the voice only, when the voice misreads the real spelling: ประกาศก
("prophets") becomes ประกา สก, so it isn't read as ประกาศ ("announce"). The
page still shows the real spelling.
*Here:* Logos's `say`, and the `say` list in `pray/prayers.json`'s audio
settings.

**A control (in a test).** The "nothing changed" version you test next to
your change. If the control still goes wrong and your version doesn't, your
change is what fixed it. And change one thing at a time, or you won't know
which change did it.
*Here:* every respelling trial also recorded the line as written. The first
round changed the sound *and* the word-cutting at once, and gave one wrong
answer (ปฐมกาล); spacing every syllable fixed the test.

**Unicode normalization (NFC).** The same accented letter can be stored two
ways in a computer: as one character, or as a letter plus a separate accent.
They look identical but don't match when compared. NFC is the agreed "one
character where possible" form, so stored text always compares cleanly.
*Here:* a test checks every Logos card's Thai and romanization are stored in
NFC.

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

**Spike (a throwaway experiment).** A quick, disposable trial of the risky part
before building the real thing, like a test patch of paint before doing the
whole wall. Whatever it teaches goes into the plan; the trial is thrown away.
*Here:* the network test (Phase 2), the sound test (Phase 4) and the search lab
(Phase 5), which caught that a broad role could change search indexes even
though the documentation said it couldn't.

**Verification (check the result, not the report).** "Succeeded" means the
steps ran, not that the outcome is right. After a change, look at the thing
itself: is the role really there, does the live search really find Agnes?

**Flaky test.** A test that sometimes fails without anything being wrong, often
because it checks something timed on a slow, busy machine. Run once more to
tell a flake from a real fault; then fix the test, because a test that cries
wolf stops being believed. Automatic retries can hide one: the run shows green
even though the first try failed, so read the log, not just the tick.
*Here:* one of Eden's water checks gave the ripples 5 real seconds to fade, but
they fade on the garden's own clock, which slows down on GitHub's small test
machines; CI's second try passed often enough to hide it. The check now reads
the garden's clock and waits until 2 garden seconds have passed, however long
that takes in real time (AB#95).
