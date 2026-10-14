// Applies db/migrations to the Azure SQL database.
//
//   SQL_SERVER=sql-machina-xxxx.database.windows.net SQL_DATABASE=machina \
//     node scripts/migrate.js [--dry-run]
//
// Sign-in is an Entra token for whoever is signed in to the Azure CLI (the
// deploy identity in CI; a member of sql-machina-admins locally), or
// SQL_ACCESS_TOKEN if set. Values for $(NAME) placeholders come from
// environment variables named SQLVAR_NAME.
//
// --dry-run applies every pending migration inside one transaction and then
// rolls it all back: a rehearsal against the real database that changes nothing.
//
// --bootstrap instead runs db/bootstrap.sql (who may do what in the database).
// Only a member of sql-machina-admins can; it isn't recorded as a migration.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { sql, connectWithRetry } = require('../src/lib/sql');
const { listMigrations, splitBatches, substitute, pending } = require('./migrations');

const fs = require('node:fs');

const DB = path.join(__dirname, '..', '..', 'db');
const DIR = path.join(DB, 'migrations');
const dryRun = process.argv.includes('--dry-run');
const bootstrap = process.argv.includes('--bootstrap');

function token() {
  if (process.env.SQL_ACCESS_TOKEN) return process.env.SQL_ACCESS_TOKEN;
  return execFileSync('az', ['account', 'get-access-token', '--resource', 'https://database.windows.net/',
    '--query', 'accessToken', '-o', 'tsv'], { encoding: 'utf8' }).trim();
}

async function main() {
  const server = process.env.SQL_SERVER;
  const database = process.env.SQL_DATABASE;
  if (!server || !database) throw new Error('set SQL_SERVER and SQL_DATABASE');
  const vars = Object.fromEntries(Object.entries(process.env)
    .filter(([k]) => k.startsWith('SQLVAR_'))
    .map(([k, v]) => [k.slice('SQLVAR_'.length), v]));

  const migrations = listMigrations(DIR);
  const pool = await connectWithRetry({
    server,
    database,
    authentication: { type: 'azure-active-directory-access-token', options: { token: token() } },
    options: { encrypt: true },
    connectionTimeout: 60000,
    requestTimeout: 300000,
  });

  try {
    if (bootstrap) {
      const text = fs.readFileSync(path.join(DB, 'bootstrap.sql'), 'utf8');
      for (const b of splitBatches(substitute(text, vars))) await pool.request().batch(b);
      const users = await pool.request().query(`SELECT p.name, STRING_AGG(r.name, ', ') AS roles
        FROM sys.database_principals p
        LEFT JOIN sys.database_role_members m ON m.member_principal_id = p.principal_id
        LEFT JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
        WHERE p.type IN ('E', 'X') GROUP BY p.name`);
      for (const u of users.recordset) console.log(`${u.name}: ${u.roles ?? '(no roles)'}`);
      return;
    }

    const whole = new sql.Transaction(pool); // one transaction for a dry run
    if (dryRun) await whole.begin();
    const run = () => new sql.Request(dryRun ? whole : pool);

    await run().batch(`IF OBJECT_ID('dbo.schema_migrations') IS NULL
      CREATE TABLE dbo.schema_migrations (
        id varchar(200) NOT NULL PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME()
      )`);
    const applied = (await run().query('SELECT id, checksum FROM dbo.schema_migrations ORDER BY id')).recordset;
    const todo = pending(migrations, applied);
    console.log(`${applied.length} applied, ${todo.length} pending${dryRun ? ' (dry run: nothing will be kept)' : ''}`);

    for (const m of todo) {
      const batches = splitBatches(substitute(m.text, vars));
      const tx = dryRun ? whole : new sql.Transaction(pool);
      if (!dryRun) await tx.begin();
      try {
        for (const b of batches) await new sql.Request(tx).batch(b);
        await new sql.Request(tx)
          .input('id', sql.VarChar(200), m.id)
          .input('checksum', sql.Char(64), m.checksum)
          .query('INSERT dbo.schema_migrations (id, checksum) VALUES (@id, @checksum)');
        if (!dryRun) await tx.commit();
        console.log(`✓ ${m.id} (${batches.length} batch${batches.length === 1 ? '' : 'es'})`);
      } catch (err) {
        if (!dryRun) await tx.rollback().catch(() => {});
        throw new Error(`${m.id} failed, nothing from it was kept: ${err.message}`);
      }
    }

    // The deploy republishes the saints snapshot when anything was applied.
    if (process.env.GITHUB_OUTPUT && !dryRun) fs.appendFileSync(process.env.GITHUB_OUTPUT, `applied=${todo.length}\n`);

    if (dryRun) {
      await whole.rollback();
      console.log('dry run complete: every pending migration ran, then all of it was rolled back');
    }
  } finally {
    await pool.close();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
