const { app } = require('@azure/functions');
const { sql, connectWithRetry } = require('../lib/sql');
const { buildSnapshot } = require('../lib/snapshot');
const { writeSnapshot } = require('../lib/snapshot-store');

// The publish job: reads Ordo's saints from the database and stores them as
// one JSON snapshot that /api/season serves. Visitors never wake the database.
//
// When it runs:
//   - weekly, Sundays 04:00 UTC (the timer below);
//   - on change: after it applies a migration, the deploy posts a message to
//     the `saints-publish` storage queue, and the queue trigger below runs it.
//     (A mailbox instead of the app's admin endpoint: the deploy needs no
//     Function key, only the right to post to that one queue, AB#81.)
// Each run wakes the database, which then stays up for an hour (the free
// offer's fixed auto-pause delay): about 1,800 of the month's 100,000 free
// vCore-seconds. Hence weekly, not daily.
//
// If the database can't be reached, the run fails and the last snapshot
// stays as it was.

// Signs in as the Function app's own identity, whose database user may only
// read (role api_reader, db/bootstrap.sql).
function config() {
  return {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    authentication: {
      type: 'azure-active-directory-msi-app-service',
      options: { clientId: process.env.FUNC_IDENTITY_CLIENT_ID },
    },
    options: { encrypt: true },
    connectionTimeout: 60000,
    requestTimeout: 120000,
  };
}

const QUERIES = {
  feasts: `SELECT f.id, f.calendar_name, f.month, f.day, f.bio,
      s.title AS bio_title, s.url AS bio_url, s.license AS bio_license
    FROM dbo.feasts f LEFT JOIN dbo.sources s ON s.id = f.bio_source_id`,
  people: `SELECT fs.feast_id, p.slug, p.name, p.wikidata_id, p.death_year, p.death_precision, p.death_century,
      s.title AS facts_title, s.url AS facts_url, s.license AS facts_license
    FROM dbo.feast_saints fs
    JOIN dbo.saints p ON p.id = fs.saint_id
    LEFT JOIN dbo.sources s ON s.id = p.death_source_id`,
  patronages: `SELECT p.slug, pa.patronage
    FROM dbo.patronages pa JOIN dbo.saints p ON p.id = pa.saint_id`,
};

async function publishSaints(_timer, context) {
  const started = Date.now();
  const pool = await connectWithRetry(config(), { log: m => context.log(m) });
  // How long the database took to answer: about a minute when it was asleep,
  // under a second when awake. The "Saints publish runs" query charts it.
  const connectMs = Date.now() - started;
  let rows;
  try {
    rows = {};
    for (const [name, query] of Object.entries(QUERIES)) rows[name] = (await pool.request().query(query)).recordset;
  } finally {
    await pool.close();
  }
  const snapshot = buildSnapshot(rows, new Date().toISOString());
  if (!snapshot.counts.feasts) throw new Error('the database returned no feasts; keeping the last snapshot');
  const bytes = await writeSnapshot(snapshot);
  const c = snapshot.counts;
  context.log(`published saints snapshot: ${c.feasts} feasts, ${c.people} people, ${c.patronages} patronages, ${bytes} bytes; database connect ${connectMs} ms, total ${Date.now() - started} ms`);
}

app.timer('publishSaints', {
  schedule: '0 0 4 * * 0', // sec min hour day month weekday: Sundays 04:00 UTC
  handler: publishSaints,
});

// The message's content doesn't matter: its arrival is the request. The queue
// is read through the host's own storage connection (AzureWebJobsStorage, the
// app's managed identity). If a run fails (say the database won't wake), the
// message comes back and is tried again, up to five times, then set aside in
// saints-publish-poison.
app.storageQueue('publishSaintsOnRequest', {
  queueName: 'saints-publish',
  connection: 'AzureWebJobsStorage',
  handler: (_message, context) => publishSaints(null, context),
});

module.exports = { publishSaints, QUERIES };
