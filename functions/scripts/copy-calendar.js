// Copies the Ordo calendar files (ordo/calendar-<year>.json, made by
// scripts/fetch-calendar.mjs) and the site's saint bios (ordo/saints.json,
// the API's fallback when the saints snapshot can't be read) into src/data/
// so they ship inside the API package. One source of truth for the site and
// the API; the copy is gitignored. Runs before tests, local start, and the
// deploy's packaging.
const fs = require('node:fs');
const path = require('node:path');

const from = path.join(__dirname, '..', '..', 'ordo');
const to = path.join(__dirname, '..', 'src', 'data');

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
const files = fs.readdirSync(from).filter(f => /^calendar-\d{4}\.json$/.test(f) || f === 'saints.json');
for (const f of files) fs.copyFileSync(path.join(from, f), path.join(to, f));
console.log(`copied ${files.length} data file(s) to src/data/: ${files.join(', ')}`);
