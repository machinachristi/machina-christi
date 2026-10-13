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
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const sql = require('mssql');
const { listMigrations, splitBatches, substitute, pending } = require('./migrations');

const DIR = path.join(__dirname, '..', '..', 'db', 'migrations');
const dryRun = process.argv.includes('--dry-run');

function token() {
  if (process.env.SQL_ACCESS_TOKEN) return process.env.SQL_ACCESS_TOKEN;
  return execFileSync('az', ['account', 'get-access-token', '--resource', 'https://database.windows.net/',
    '--query', 'accessToken', '-o', 'tsv'], { encoding: 'utf8' }).trim();
}

// A paused database wakes on the first connection, which is refused while it
// starts (error 40613, usually under a minute). Keep knocking for a while.
async function connect(config) {
  const deadline = Date.now() + 4 * 60 * 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await new sql.ConnectionPool(config).connect();
    } catch (err) {
      if (Date.now() > deadline) throw err;
      console.log(`connect attempt ${attempt} failed (${err.message.split('\n')[0]}); the database may be waking, retrying in 15 s`);
      await new Promise(r => setTimeout(r, 15000));
    }
  }
}

async function main() {
  const server = process.env.SQL_SERVER;
  const database = process.env.SQL_DATABASE;
  if (!server || !database) throw new Error('set SQL_SERVER and SQL_DATABASE');
  const vars = Object.fromEntries(Object.entries(process.env)
    .filter(([k]) => k.startsWith('SQLVAR_'))
    .map(([k, v]) => [k.slice('SQLVAR_'.length), v]));

  const migrations = listMigrations(DIR);
  const pool = await connect({
    server,
    database,
    authentication: { type: 'azure-active-directory-access-token', options: { token: token() } },
    options: { encrypt: true },
    connectionTimeout: 60000,
    requestTimeout: 300000,
  });

  try {
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
