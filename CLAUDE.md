# Working on this repo

- Always create and check out a new feature branch before editing any files. Never edit files while on `main`.

# Planning board (Azure DevOps)

- Work is tracked in Azure DevOps: https://dev.azure.com/machinachristi/Machina%20Christi (Epic > Issue > Task). Areas: Eden, Camino, Ordo, Pray, Infra, Outreach. Releases are iterations (e.g. `world-v26`, `camino-music`).
- Every PR must reference a work item: put `AB#<id>` in the PR description (use `Fixes AB#<id>` when the PR completes it) so the board stays in sync.
- Before starting work, check the board for the active iteration instead of guessing what is next. Don't start unlisted work without adding an Issue first.
- **Exception — the weekly Eden `update-world` routine is not connected to Azure DevOps.** Unattended routine runs must not try to reach the board, look up work items, or add an `AB#` link, and should not note the missing link as a problem in the PR text or the run summary. The routine's scope is defined by its own prompt, not the board.
