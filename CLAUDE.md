# Working on this repo

- Always create and check out a new feature branch before editing any files. Never edit files while on `main`.

# Planning board (Azure DevOps)

- Work is tracked in Azure DevOps: https://dev.azure.com/machinachristi/Machina%20Christi (Epic > Issue > Task). Areas: Eden, Camino, Ordo, Pray, Infra, Outreach. Releases are iterations (e.g. `world-v26`, `camino-music`).
- Every PR must reference a work item: put `AB#<id>` in the PR description (use `Fixes AB#<id>` when the PR completes it) so the board stays in sync.
- Before starting work, check the board for the active iteration instead of guessing what is next. Don't start unlisted work without adding an Issue first.
- **Exception — the weekly Eden `update-world` routine is not connected to Azure DevOps.** Unattended routine runs must not try to reach the board, look up work items, or add an `AB#` link, and should not note the missing link as a problem in the PR text or the run summary. The routine's scope is defined by its own prompt, not the board.

# Explain as we build

The user is learning software through this project, so explaining the work is part of the job, not an extra.

- **In chat, while building:** before each step, say in plain words what you are about to do and why, using an everyday comparison; afterwards, say what it shows about how software works in general (what a cache, test, API, deploy, branch is, and why it matters). Write for someone with zero technical background. Never leave a technical word unexplained the first time it appears.
- **In every PR:** open the description with an "In plain words" paragraph before the technical detail.
- **In the repo:** `docs/explained/` holds the lasting record — one "explained like you're 5" write-up per phase or big feature, plus `foundations.md`, a plain-language glossary of software basics that grows as new ideas come up. Add to both when work introduces something new.
- **On the site:** the Workshop page's map (`workshop/glass.json`) shows every technology the site uses. Any PR that puts a technology to work, retires one, or changes what it does updates its pane in the same PR (`status`, `here`, `touches`). `tests/workshop.spec.js` fails if an Azure pane's status disagrees with what `infra/` builds, but only a person can keep the descriptions true.
- Prefer the big picture: tie each change back to a foundation of software development rather than just listing what changed.
