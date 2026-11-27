// Where the API reads its data files: the Ordo calendars (calendar-<year>.json)
// and the site's saint bios (saints.json).
//
// They're made in the site's ordo/ folder and copied into src/data/ by
// scripts/copy-calendar.js, which runs before `npm test`, `npm start` and the
// deploy's packaging. That copy is what ships, so the live API always reads
// src/data/.
//
// A fresh checkout (a new worktree, say) has no copy until one of those runs,
// and plain `node --test` doesn't make one. Rather than quietly finding no
// calendar there (no feasts, no saints, and tests failing in ways that look
// like a calendar bug), the API then reads the files where they're made.
// Only a missing src/data/ falls back: an empty one means the copy step ran
// and broke, and that should still show.
const fs = require('node:fs');
const path = require('node:path');

const COPIED = path.join(__dirname, '..', 'data');
const SOURCE = path.join(__dirname, '..', '..', '..', 'ordo');

const DATA_DIR = fs.existsSync(COPIED) ? COPIED : SOURCE;

module.exports = { DATA_DIR };
