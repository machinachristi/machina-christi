# Azure platform (infrastructure as code)

Everything Machina Christi runs in Azure, beyond the Static Web App that serves
the site itself, is described here in Bicep. The rule: if it isn't in these files,
it shouldn't exist. (One exception: Azure adds a free "Failure Anomalies" alert
and its "Smart Detection" action group to every new Application Insights.)

## What runs

| Piece | Name | Why |
|---|---|---|
| Resource groups | `rg-machina-platform`, `rg-machina-ci` (East US 2) | The platform, and apart from it, the identities CI signs in as |
| Budget | `budget-machina-monthly` ($1, subscription-wide) | Email at 50% / 100% / forecast 100%. Any spend at all is a signal |
| Function app | `func-machina-<suffix>` (Flex Consumption, Node 24, 512 MB) | The API. Scales to zero; one instance at most for now |
| Managed identity | `id-machina-func` | How the API proves who it is to storage and App Insights. No keys exist |
| Storage | `stmachina<suffix>` | Function host state and deployment packages. Account keys are switched off |
| Log Analytics | `log-machina` | Where all telemetry lands. 30-day retention, 0.15 GB/day cap |
| Application Insights | `appi-machina` | Requests, failures, timings for the API. Accepts only Entra-signed senders |
| Application Insights (browser) | `appi-machina-web` | Page views, time on page, script errors, CSP reports. Accepts the public connection string, so it has its own 0.05 GB/day cap |
| CI identities | `id-machina-github-deploy`, `id-machina-github-preview` | What GitHub Actions signs in as (OIDC). See below |

`<suffix>` is a stable 6-character hash of the resource group ID, needed because
storage and Function app names must be unique across all of Azure.

## Two files, two levels of trust

- **`bootstrap.bicep`** (subscription scope): both resource groups, the budget,
  and CI's identities with their permissions. A person deploys it by hand, once,
  and again only when one of those changes.
- **`main.bicep`** (resource group scope): the platform. GitHub Actions applies it
  on every merge to main.

GitHub Actions signs in with OIDC (no stored secret) as one of two identities:

| Identity | Who may use it | What it may do in `rg-machina-platform` |
|---|---|---|
| `id-machina-github-deploy` | Runs on `main` only | **Contributor**, plus **Role Based Access Control Administrator** with a condition: it may grant or remove only the roles in `platform-roles.json`, and only for service principals (managed identities included) |
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
- **Merge to main:** the same tests, then apply `main.bicep`, deploy the API with
  a build stamp, and wait until `/api/health` reports the new commit. A manual
  re-run is available from the Actions tab (on main).

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

- `GET /api/health` returns `{ status, service, commit, builtAt, time }`. It proves
  the whole chain (code → deploy → running → telemetry) and tells you which commit
  is live.
- `cd functions && npm test` runs the unit tests (Node's built-in test runner).
- Run it locally with Azure Functions Core Tools: in `functions/`, copy
  `local.settings.example.json` to `local.settings.json` (git ignores it), then
  `npm install` and `func start`. The health endpoint is at
  `http://localhost:7071/api/health`.

## Reading the telemetry (KQL)

Portal → `log-machina` → **Logs** → **Queries** → category **Machina Christi**.
The starter queries are defined in `main.bicep`:

- API requests by endpoint, last 24 hours
- API failures and exceptions, last 7 days
- Health endpoint: calls per hour and speed
- Free allowance watch: GB ingested this month, by table
- Site: page views, referrers, countries, time on page, CSP reports, script errors

## Staying free

| Allowance (monthly) | Our guardrail |
|---|---|
| Functions Flex: 250,000 executions + 100,000 GB-s | 512 MB instances, one at a time (raise once Cloudflare rate-limits the API) |
| Log Analytics: 5 GB ingestion | 0.15 GB/day cap (about 4.6 GB/month). Traces are sampled; requests are always kept |
| Storage | Not free, but cents: a few MB of packages and host state |
