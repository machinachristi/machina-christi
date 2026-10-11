# Azure platform (infrastructure as code)

Everything Machina Christi runs in Azure, beyond the Static Web App that serves
the site itself, is described here in Bicep. The rule: if it isn't in these files,
it shouldn't exist.

## What runs

| Piece | Name | Why |
|---|---|---|
| Resource group | `rg-machina-platform` (East US 2) | One box for the whole platform |
| Budget | `budget-machina-monthly` ($1, subscription-wide) | Email at 50% / 100% / forecast 100%. Any spend at all is a signal |
| Function app | `func-machina-<suffix>` (Flex Consumption, Node 24, 512 MB) | The API. Scales to zero; at most 5 instances |
| Managed identity | `id-machina-func` | How the API proves who it is to storage and App Insights. No keys exist |
| Storage | `stmachina<suffix>` | Function host state and deployment packages. Account keys are switched off |
| Log Analytics | `log-machina` | Where all telemetry lands. 30-day retention, 0.15 GB/day cap |
| Application Insights | `appi-machina` | Requests, failures, timings for the API (and the browser, from Phase 0 PR 3) |
| CI identity | `id-machina-github` | What GitHub Actions signs in as (OIDC). See below |

`<suffix>` is a stable 6-character hash of the resource group ID, needed because
storage and Function app names must be unique across all of Azure.

## Two files, two levels of trust

- **`bootstrap.bicep`** (subscription scope): the resource group, the budget, and
  the CI identity with its permissions. A person deploys it by hand, once, and
  again only when one of those changes.
- **`main.bicep`** (resource group scope): everything else. GitHub Actions
  applies it on every merge to main.

The split exists so that CI's identity can only touch what lives inside the
resource group. It is **Contributor** there, plus **Role Based Access Control
Administrator** with a condition: it may grant only the roles listed in
`modules/ci-identity.bicep`, and only to managed identities. So adding a role
assignment to `main.bicep` means adding the role to that list and re-running
bootstrap. Widening CI's powers is meant to take a person.

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
not in `main.bicep`, and that includes the CI identity, which `bootstrap.bicep`
owns.

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

## Staying free

| Allowance (monthly) | Our guardrail |
|---|---|
| Functions Flex: 250,000 executions + 100,000 GB-s | 512 MB instances, max 5 at once, Cloudflare rate limit in front (Phase 0 PR 4) |
| Log Analytics: 5 GB ingestion | 0.15 GB/day cap (about 4.6 GB/month), request sampling |
| Storage | Not free, but cents: a few MB of packages and host state |
