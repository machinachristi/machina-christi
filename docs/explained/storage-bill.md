# The letterbox that cost money — trimming the API's storage bill

*AB#126 · November 2026*

## What changed, in one sentence

Azure was checking the API's four mailboxes and alarm clocks every
10 seconds, day and night, and charging for each look; the two Sunday alarm
clocks now live in GitHub, which costs nothing, so Azure has half as much to
watch.

## The story, like you're five

**Almost free.** Nearly everything the site uses on Azure stays inside a free
allowance, like a phone plan's free minutes: the API, the prayer library, the
saints database, search and the logs all came to $0.00 in October. The whole
bill was $0.40, and every cent came from one place: the API's housekeeping
storage account (`stmachinakirjou`), the cupboard where the API keeps its code
and its notes to itself. Storage has no free allowance on a pay-as-you-go
account, so each thing done there costs a tiny amount.

**What was being done there.** The account's usage graphs showed the same
two operations exactly 720 times an hour, at 3 a.m. as at noon: one "how long
is this queue?" and one small file read every 5 seconds. Visitors don't keep
that kind of rhythm; a machine does. The API has four background jobs, two
**mailboxes** (queues the deploy drops a note in: "publish the saints",
"rebuild search") and two **alarm clocks** (timers: the same two jobs, every
Sunday). On the Flex plan, Azure's watcher asks each of them "any work?"
every 10 seconds, so it knows when to wake the API. That's **polling**, like
opening the letterbox every ten seconds instead of waiting for the doorbell.
Four jobs × 6 looks a minute adds up to about a million looks a month: around
40 cents, for work that arrives about once a week.

**The fix (part 1).** An alarm clock doesn't need to live inside the API.
GitHub can run a recipe on a schedule for free (a **scheduled workflow**), so
every Sunday GitHub now drops a note in the right mailbox, exactly as the
deploy does after a change, and the API does the job as before. Two alarm
clocks gone means two fewer things for Azure to watch: about 20 cents a month
saved, and nobody gained any new permission. GitHub signs in with the same
"may post a note in these two mailboxes, nothing else" badge the deploy
already uses.

**Part 2, next.** The cupboard is in East US 2, but the API moved to Central
US in October, so every time the API wakes it carries its code across the
country, and moving data between regions is charged (about 15 cents a month).
The plan is to build a new cupboard next door, with a single mailbox instead
of two, and then remove the old one. Together that brings the bill to about
11 cents a month.

## Why it was built this way

- **Mailboxes kept, alarm clocks moved.** The mailboxes are how the deploy
  asks the API for work without holding any key to the API (AB#81). Keeping
  them keeps that design; only the clocks moved.
- **GitHub, not a cheaper Azure clock.** Any clock inside the API is watched
  the same way. GitHub's schedules are free for a public project, and the
  sign-in is the one the deploy already uses, with no stored password.
- **Minute 07.** GitHub may delay or skip scheduled runs at the busy top of
  the hour, so the jobs ask at 04:07 and 05:07 on Sundays, an hour apart so
  the search cards include that week's saints.
- **A risk to remember.** GitHub pauses a project's schedules after 60 days
  with no activity. Eden's weekly update keeps the project active; if the
  Weekly Jobs workflow ever shows as disabled, switch it back on in the
  Actions tab.

## How we know it's right

The measure is the storage account's own counter: each alarm clock removed
should take away 360 looks an hour, so the hourly count of file reads should
drop from about 720 towards a handful once this is deployed, and the saints
and search should still refresh on Sunday.

## Things to remember

- Ask for a run by hand: Actions tab → **Weekly Jobs** → Run workflow, then
  pick the job.
- Before adding a new timer or queue trigger to the API, count the cost:
  about 10 cents a month each, just to be watched.

## New foundations met here

In [foundations.md](foundations.md): **polling (asking "anything yet?")**,
and an update to **scheduled job (timer)**.
