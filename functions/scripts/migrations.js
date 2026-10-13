// The pure parts of the migration runner (scripts/migrate.js), kept apart so
// they can be tested without a database.
//
// A migration is a numbered .sql file in db/migrations, e.g. 0001_schema.sql.
// Each runs once, in number order, inside its own transaction, and is recorded
// with a checksum in dbo.schema_migrations. An applied migration is never
// edited: a later change is a new, higher-numbered file.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

function listMigrations(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const seen = new Map();
  for (const f of files) {
    const m = f.match(NAME);
    if (!m) throw new Error(`${f}: migration names look like 0001_short_name.sql`);
    if (seen.has(m[1])) throw new Error(`${f} and ${seen.get(m[1])} share the number ${m[1]}`);
    seen.set(m[1], f);
  }
  return files.map(f => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    return { id: f.replace(/\.sql$/, ''), text, checksum: checksum(text) };
  });
}

function checksum(text) {
  // Line endings don't count as a change.
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

// T-SQL tools separate batches with a line holding only GO; some statements
// (CREATE VIEW, CREATE PROCEDURE) must be alone in their batch.
function splitBatches(text) {
  return text
    .split(/^[ \t]*GO[ \t]*;?[ \t]*$/im)
    .map(b => b.trim())
    .filter(Boolean);
}

// $(NAME) placeholders, filled from values only known at deploy time (the
// Function app identity's name and ID). An unknown name is an error rather
// than silently left in the SQL.
function substitute(text, vars) {
  return text.replace(/\$\(([A-Z][A-Z0-9_]*)\)/g, (_, name) => {
    if (!(name in vars)) throw new Error(`no value for $(${name})`);
    return vars[name];
  });
}

// Which migrations still need to run, given the ledger rows already applied.
// Refuses to continue if an applied migration's file was edited or deleted.
function pending(migrations, applied) {
  const byId = new Map(migrations.map(m => [m.id, m]));
  for (const row of applied) {
    const m = byId.get(row.id);
    if (!m) throw new Error(`${row.id} was applied but its file is gone`);
    if (m.checksum !== row.checksum) {
      throw new Error(`${row.id} was edited after it was applied; add a new migration instead`);
    }
  }
  const done = new Set(applied.map(r => r.id));
  return migrations.filter(m => !done.has(m.id));
}

module.exports = { listMigrations, checksum, splitBatches, substitute, pending };
