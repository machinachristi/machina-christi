# Azure platform (infrastructure as code)

Everything Machina Christi runs in Azure, beyond the Static Web App that serves
the site itself, is described here in Bicep. The rule: if it isn't in these files,
it shouldn't exist. (One exception: Azure adds a free "Failure Anomalies" alert
and its "Smart Detection" action group to every new Application Insights.)

## What runs

| Piece | Name | Why |
|---|---|---|
| Resource groups | `rg-machina-platform`, `rg-machina-ci` (East US 2; the API, its network and the database run in Central US) | The platform, and apart from it, the identities CI signs in as |
| Budget | `budget-machina-monthly` ($1, subscription-wide) | Email at 50% / 100% / forecast 100%. Any spend at all is a signal |
| Function app | `func-machina-cus-<suffix>` (Central US; Flex Consumption, Node 24, 512 MB) | The API. Scales to zero; one instance at most for now. Runs inside `vnet-machina` |
| Virtual network | `vnet-machina` (Central US, `10.50.0.0/24`), subnet `func` (`/27`) | The API's private network. The subnet carries a `Microsoft.Sql` service endpoint, and the database admits only it (see "The API's network") |
| Managed identity | `id-machina-func` | How the API proves who it is to storage and App Insights. No keys exist |
| Storage | `stmachina<suffix>` | Function host state, deployment packages and the saints snapshot (`ordo-snapshot/saints.json`). Account keys are switched off |
| Log Analytics | `log-machina`, `log-machina-web` | Where telemetry lands: the API's and the browser's, apart. 30-day retention; hard daily caps of 0.10 and 0.05 GB |
| Application Insights | `appi-machina` | Requests, failures, timings for the API. Accepts only Entra-signed senders |
| Application Insights (browser) | `appi-machina-web` | Page views, time on page, script errors, CSP reports. Accepts the public connection string, so it writes to its own workspace: a flood can't touch the API's data |
| CI identities | `id-machina-github-deploy`, `id-machina-github-preview` | What GitHub Actions signs in as (OIDC). See below |
| SQL server + database | `sql-machina-cus-<suffix>` / `machina` (Central US; free offer, serverless, auto-pause) | Ordo's saints. Entra sign-in only; visitors never query it (see below) |
| Entra group (by hand) | `sql-machina-admins` | The SQL server's admin: people only (the owner) |

`<suffix>` is a stable 6-character hash of the resource group ID, needed because
storage and Function app names must be unique across all of Azure.

## Two files, two levels of trust

- **`bootstrap.bicep`** (subscription scope): both resource groups, the budget,
  CI's identities with their permissions, and the SQL server and database
  (`modules/sql.bicep`, because a server's settings include who administers it).
  A person deploys it by hand, once, and again only when one of those changes.
  Its budget-alert address is passed at deploy time and never committed.
- **`main.bicep`** (resource group scope): the platform. GitHub Actions applies it
  on every merge to main.

GitHub Actions signs in with OIDC (no stored secret) as one of two identities:

| Identity | Who may use it | What it may do in `rg-machina-platform` |
|---|---|---|
| `id-machina-github-deploy` | Runs on `main` only | **Machina Deployer** (Contributor, except it may not create, change or delete SQL servers or databases), plus **Role Based Access Control Administrator** with a condition: it may grant or remove only the roles in `platform-roles.json`, and only for service principals (managed identities included). Inside the database: tables and data only (`db/bootstrap.sql`) |
| `id-machina-github-preview` | Pull request runs | **Reader** plus a custom **What-If Runner** role: it can preview changes and change nothing |

Why it's built this way:

- A pull request runs its *own* copy of the workflow, before anyone reviews it. So
  whatever a PR can sign in as, any pushed branch can. That is why PR runs get the
  read-only identity.
- Only code already on `main` gets the identity that can change things. Required
  checks guard main, so turn on "Do not allow bypassing the above settings" in
  the branch protection too, or an admin push could skip them.
- CI can grant data roles only to other service principals, never to its own
  identities.
- The identities live in `rg-machina-ci`, where CI has no rights at all. A
  compromised run can't add a new sign-in trust (a backdoor) to them or delete
  them, and it can't touch the budget or the subscription.
- Adding a role assignment to `main.bicep` means adding the role to
  `platform-roles.json` and re-running bootstrap. Widening CI's powers is meant
  to take a person.

## CI/CD (`.github/workflows/azure-platform.yml`)

Runs when `infra/`, `functions/` or the workflow itself changes:

- **Pull request:** API unit tests, Bicep compile/lint, then a what-if preview
  (as the read-only identity). The preview is in the run's summary page.
- **Merge to main:** the same tests, then apply `main.bicep`, apply any new
  database migrations, deploy the API with a build stamp, and wait until `/api/health` reports the new commit. If a
  migration ran, it then republishes the saints snapshot and waits until
  `/api/season` serves it. A manual re-run is available from the Actions tab (on
  main), with a "Republish the saints snapshot" box.

## API hostname and Cloudflare

`https://api.machinachristi.com` is proxied by Cloudflare (free plan) in front of
the Function app:

| Where | Setting |
|---|---|
| DNS | `api` CNAME → the Function app's `azurewebsites.net` name, proxied; `asuid.api` TXT = the app's domain-verification ID (proves ownership) |
| Azure | `hostNameBindings` in `main.bicep` (no certificate binding: Cloudflare in Full mode accepts Azure's default one) |
| Cache Rule | `api` host + GET → eligible for cache, honoring the origin's `Cache-Control` (bypass if absent). `/api/health` is `no-store`, so it is never cached; `/api/season?date=…` is `public, max-age=86400`, so each date is cached at the edge for a day (the query string is part of the cache key) |
| Rate limiting rule | `api` host: more than 20 requests per 10 s from one IP → block (429) for 10 s. The free plan allows one rule |
| Browser Cache TTL | Respect Existing Headers, so Cloudflare doesn't stretch the site's short cache times |

The Function app accepts requests only from Cloudflare's address ranges
(`cloudflare-ips.json`, refreshed with `scripts/refresh-cloudflare-ips.sh`), so
its `azurewebsites.net` address can't be used to bypass the rate limit. The
deployment site (scm) is separate and stays open to CI, which signs in with
Entra. The deploy's health check calls the app's `azurewebsites.net` address
directly, after briefly allow-listing the GitHub runner's IP (Cloudflare's Bot
Fight Mode blocks GitHub runners).

## Deploying by hand

```bash
# Bootstrap (subscription level). The alert email is never committed: the repo is public.
az deployment sub create -n machina-bootstrap -l eastus2 \
  -f infra/bootstrap.bicep -p budgetAlertEmail=<address>

# Platform (preview first, then apply)
az deployment group what-if -g rg-machina-platform -n machina-platform -f infra/main.bicep
az deployment group create  -g rg-machina-platform -n machina-platform -f infra/main.bicep
```

Never use `--mode Complete` on the resource group. Complete mode deletes anything
not in `main.bicep`.

what-if always shows a few "Modify" lines that are noise: values it can't know
until deploy time (principal IDs, storage endpoints) and defaults Azure fills in.

## The API (`functions/`)

Node.js, Azure Functions v4 programming model. Each file in
`functions/src/functions/` registers its endpoints.

- `GET /api/health` returns `{ status, service, commit, builtAt, region, time }`. It proves
  the whole chain (code → deploy → running → telemetry) and tells you which commit
  is live.
- `GET /api/season?date=YYYY-MM-DD` returns the liturgical day:
  `{ date, season: { key, name, week }, celebration, color, saint }`. The site sends the
  visitor's local date. Without `date` it answers for today in UTC (cached 5 min).
  - The **season** is computed (`functions/src/lib/season.js`): Easter by the
    Gregorian computus, every other boundary from Easter and Christmas. Works for
    any year 1583–4099.
  - The **celebration** and its colour come from the Ordo calendar files
    (`ordo/calendar-<year>.json`), which `npm run copy-data` copies into
    `functions/src/data/` before tests, local runs and deploys. `celebration` is
    `null` on a plain weekday or a year without a file. `optional: true` marks an
    optional memorial, which doesn't change the day's colour.
  - **Yearly upkeep:** before each new year, run `node scripts/fetch-calendar.mjs
    <next year>` and commit the file. Changing `ordo/calendar-*.json` redeploys
    the API. If it's forgotten, the season and colour still work; only the feast
    names disappear.
  - The tests cross-check the season and week number against litcal's own labels
    for every day in the calendar files.
  - The **saint** is the day's celebration looked up in the saints snapshot:
    `{ feast, bio, bioSource, people: [{ name, wikidata, died, patronages,
    factsSource }], from, publishedAt }`. Every fact names its source. `from` is
    `"database"` when it came from the snapshot, or `"static"` when the snapshot
    couldn't be read and the site's own bios (`ordo/saints.json`, bundled like the
    calendars) answered instead (bio and source only). `null` on days with no
    celebration, and on Sundays and feasts of the Lord, which aren't saints' days.
- **`publishSaints`** (timer, Sundays 04:00 UTC) reads the database as the
  Function app's identity (read-only) and writes the saints snapshot to
  `ordo-snapshot/saints.json` in the storage account. `/api/season` reads that
  blob, keeping it in memory for 5 minutes, never the database. If the database
  can't be reached the run fails and the last snapshot stays. The deploy also
  runs it after a migration, through the host's admin endpoint and the master key
  (`POST /admin/functions/publishSaints`); that adds no permission, since the
  deploy identity already deploys the app's code.
- `cd functions && npm test` runs the unit tests (Node's built-in test runner).
- Run it locally with Azure Functions Core Tools: in `functions/`, copy
  `local.settings.example.json` to `local.settings.json` (git ignores it), then
  `npm install` and `npm start`. The endpoints are at
  `http://localhost:7071/api/health` and `http://localhost:7071/api/season`.

## The API's network

The API (Central US) runs inside `vnet-machina`, subnet `func`: delegated to
`Microsoft.App/environments` (what Flex Consumption needs), with a
`Microsoft.Sql` service endpoint. The database has a virtual network rule for
that subnet, so reaching its door takes being inside this network, and getting
in still takes a badge with a database user.

- **Why Central US:** a service endpoint and a SQL virtual network rule work only
  within one region, and the database is in Central US. A private endpoint would
  work across regions but costs about $8 a month; this costs nothing.
- **Internet still works** (Application Insights, Entra) through Azure's own
  outbound addresses; no NAT gateway.
- **Proven first** with a throwaway copy (2026-10-14): a Flex app joins a subnet
  that carries the SQL service endpoint; with the rule, a knock gets as far as
  "login failed" (network passed); without it, "Client is not allowed"
  (error 40914); from outside Azure, refused even with an admin badge.
- **The move was blue-green** (2026-10-14): the new app ran beside the old East
  US 2 one (`func-machina-<suffix>`), both bound to `api.machinachristi.com`; the
  `api` CNAME in Cloudflare was switched to `func-machina-cus-<suffix>`, Azure's
  logs showed the old app idle, and then the old app, its plan and the database's
  "allow Azure services" rule were deleted by hand. (An incremental Bicep deploy
  never removes what a file stops declaring, so retiring something is always
  two steps: drop it from the file, then delete it.) `/api/health` reports
  `region`.
- **Moving again** works the same way: the settings live in shared variables
  (`apiSiteConfig`, `apiAppSettings`, `apiFunctionAppConfig`), so a second copy
  can run beside the first.
- The subscription needed `Microsoft.App` and `Microsoft.Network` registered
  (done by hand; CI can't register providers).

## The database (Azure SQL)

Ordo's saints live in the `machina` database on `sql-machina-cus-<suffix>`, on
the [free offer](https://learn.microsoft.com/azure/azure-sql/database/free-offer):
100,000 vCore-seconds of compute, 32 GB of data and 32 GB of backups a month.

- **Visitors never query it.** A job (`publishSaints`, see the API above)
  publishes what the site needs as JSON when the data changes, and weekly as a
  safety net. The database pauses after 60
  minutes idle (a free-offer database that auto-pauses at the allowance's end
  must keep Azure's default delay), so each wake costs at least 1,800
  vCore-seconds: roughly 5–8 wakes a month stays well inside the allowance.
- **It can't bill.** When the monthly allowance runs out it pauses until the next
  month (`freeLimitExhaustionBehavior: AutoPause`), and the site keeps its last
  published copy.
- **Region: Central US**, unlike the rest of the platform. SQL provisioning is
  restricted for this subscription in East US 2, East US and North Central US.
  Check a region before using it:
  `az rest --method get --url "https://management.azure.com/subscriptions/<sub>/providers/Microsoft.Sql/locations/<region>/capabilities?api-version=2023-08-01" --query "{status:status,reason:reason}"`.
  The first free database fixes the region for all free databases in the
  subscription. (The failed East US 2 attempt left the name
  `sql-machina-<suffix>` reserved there, hence `-cus-`.)
- **People own the server; CI works inside one room.**
  - The server and database are created by `bootstrap.bicep`, by hand, because a
    server's settings include who administers it and Azure can't let CI change
    one without the other. CI's role, *Machina Deployer*, may not write or delete
    SQL servers or databases (so it can't change the admin or switch the free
    database to billing). It may open and close SQL firewall rules.
  - Sign-in is Entra only; no SQL passwords exist. The server's admin is the
    `sql-machina-admins` group: people only (created with `az ad group create`).
  - Inside the database, `db/bootstrap.sql` (run once by an admin:
    `node scripts/migrate.js --bootstrap`) gives the deploy identity tables and
    data only (`db_ddladmin`, `db_datareader`, `db_datawriter`), and the Function
    app's identity read-only access (`api_reader`: `SELECT` on schema `dbo`).
- **Firewall:** default deny. One virtual network rule, for the API's subnet (see
  "The API's network"); nothing else in Azure can reach the door. The deploy
  adds its runner's address only while it migrates, and an admin does the same
  by hand to query it (see `db/README.md`).
- **Changes** are numbered T-SQL migrations in `db/migrations`, applied by the
  deploy before the API itself. See `db/README.md` for the rules and for
  rehearsing a migration (`--dry-run`) before merging.
- The subscription needed the `Microsoft.Sql` resource provider registered (done
  by hand once; CI can't register providers).

## Reading the telemetry (KQL)

Portal → `log-machina` (API) or `log-machina-web` (site) → **Logs** → **Queries** →
category **Machina Christi**.
The starter queries are defined in `main.bicep`:

- API requests by endpoint, last 24 hours
- API failures and exceptions, last 7 days
- Health endpoint: calls per hour and speed
- Season API: calls that reached Azure, per day (few calls = Cloudflare is caching well; Azure logs URLs without the `?date=` part, so dates asked aren't recorded)
- Saints publish runs: one row per run of `publishSaints`, with `ConnectMs` (how
  long the database took to answer: about a minute means it was asleep and woke
  for this run), `WakeRetries`, total time, feasts and snapshot size
- Saints snapshot: times the API couldn't read it and fell back to the bundled
  bios (empty is good; one entry right before a first-ever publish is expected)
- Free allowance watch: GB ingested this month, by table
- Site: page views, referrers, countries, time on page, CSP reports, script errors

## Staying free

| Allowance (monthly) | Our guardrail |
|---|---|
| Functions Flex: 250,000 executions + 100,000 GB-s | 512 MB instances, one at a time (raise once Cloudflare rate-limits the API) |
| Log Analytics: 5 GB ingestion (shared by both workspaces) | Hard daily caps of 0.10 + 0.05 GB (about 4.6 GB/month). Traces are sampled; requests are always kept |
| Storage | Not free, but cents: a few MB of packages and host state, plus the ~190 KB saints snapshot |
| Azure SQL free offer: 100,000 vCore-seconds, 32 GB data, 32 GB backups | Visitors never query it; it wakes only for the weekly publish, a deploy that migrates, or an admin. Each wake costs at least 1,800 vCore-seconds (an hour at 0.5 vCore). At the allowance's end it pauses until next month rather than billing |

**How much of the database's month is left:**

```bash
az monitor metrics list --resource $(az sql db show -g rg-machina-platform -s sql-machina-cus-<suffix> -n machina --query id -o tsv) \
  --metrics free_amount_remaining --interval PT1H --offset 1d --aggregation Minimum -o table
```

(vCore-seconds left this month. Hours with no number are hours the database was
asleep. On 2026-10-14, after two days of building and migrating: about 97,000.)

## Site security headers (`staticwebapp.config.json`)

Azure Static Web Apps adds these to every response (`globalHeaders`). HSTS and
`Referrer-Policy` aren't here because Static Web Apps and Cloudflare already send
them.

| Header | Value, in short | Why |
|---|---|---|
| `Content-Security-Policy` (enforced since 2026-10-15, AB#51) | the full policy: scripts, styles, images, fonts and frames from this site only, plus Cloudflare's analytics beacon; connections to this site, the API and App Insights; `frame-ancestors 'self'`, `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`, `upgrade-insecure-requests` | A script slipped into a page can't load code or send data anywhere else. Inline scripts are still allowed (many pages have them, and Cloudflare injects some). `frame-ancestors 'self'`, not `'none'`, because world.html frames Eden's garden |
| `X-Frame-Options` | `SAMEORIGIN` | Older browsers' version of frame-ancestors |
| `Permissions-Policy` | camera, microphone, location, motion sensors, payment, USB: off | The site uses none of them. Phase 6 (pronunciation) will turn the microphone on for Pray only |
| `Cross-Origin-Opener-Policy` | `same-origin` | Pages opened from elsewhere can't reach back into this one |

**How it was switched on (and how to change it):** the full policy ran in
report-only mode from Phase 0 until 2026-10-15. Before enforcing, the browser
telemetry query "Site: Content Security Policy reports" was empty over every
page view so far, and a sweep of the live site with each page's
`securitypolicyviolation` events recorded from before load (all 13 pages, plus
Listen on a prayer, the game, and entering Eden) found nothing that would be
blocked. (Note: the built-in browser pane's console doesn't show CSP
warnings; listen for the event instead.)

**Adding something new from another site** (a font, a script, an API) means
adding its address to the right directive here first; otherwise the browser
blocks it. `tests/security-and-telemetry.spec.js` loads every page, and Eden,
under these headers and fails on any violation; violations in production show
up in the telemetry query (now with disposition `enforce`), so a page the policy
breaks is visible.

## Browser telemetry (`assets/telemetry.js`)

Page views (with referrer), seconds each page was visible, script errors and
CSP reports, sent to the `appi-machina-web` component. It is private by design:

- no cookies and no browser storage. The SDK's user and session IDs are random
  for each page and never stored, so nothing links one page view to the next
  (the portal's "users" and "sessions" counts therefore equal page views);
- nothing is sent when the browser asks not to be tracked (Global Privacy Control
  or Do Not Track);
- only the live site sends anything. Local runs, tests and PR previews stay
  silent;
- page URLs, referrers and CSP reports are sent without query strings (script
  error stack traces may still include them);
- time on page is sent as the visitor leaves, using the SDK's keepalive send,
  and the SDK skips `unload` handlers so pages stay eligible for the
  back/forward cache.

Known gaps: script errors during page load (before the SDK loads) and errors
inside Eden's frame aren't captured. `assets/telemetry.js` is cached for an hour,
not the week other assets get, so fixes reach returning visitors quickly.

The SDK is vendored and pinned (`assets/vendor/`), and it loads only after the
page has finished loading. Browser telemetry goes to its own App Insights
component and its own workspace (`log-machina-web`, capped at 0.05 GB a day).
Its connection string is public (it's in the page), so a flood of fake
telemetry can fill only that workspace, never the API's.
