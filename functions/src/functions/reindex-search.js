const { app } = require('@azure/functions');
const { readSnapshot } = require('../lib/snapshot-store');
const { prayersStore } = require('../lib/prayers-store');
const { searchStore } = require('../lib/search-store');
const { buildSearchDocs } = require('../lib/search-docs');
const { SITE_PAGES } = require('../lib/site-pages');

// Our own indexer (Phase 5): rebuild the site search index from the saints
// snapshot (blob), the published prayers (Cosmos DB) and the site's pages,
// all read with the Function app's identity. On the free tier Azure's
// built-in indexers would need keys to read these, so the API does their job
// and uploads the cards itself (the "push" model).
//
// Runs when asked (a message on the search-reindex queue: the deploy, after
// the saints publish; the prayers publisher, after a prayer changes) and every
// Sunday an hour after the weekly saints publish, which also keeps the free
// service in use (Azure may remove free services left unused for long).

async function reindex({ snapshot, prayers, store, log, now = () => new Date() }) {
  if (!store) throw new Error('SEARCH_ENDPOINT is not set');
  const started = Date.now();
  const docs = buildSearchDocs({ snapshot, prayers, pages: SITE_PAGES, indexedAt: now().toISOString() });
  const { uploaded, removed } = await store.replaceAll(docs);
  const kinds = docs.reduce((n, d) => ({ ...n, [d.kind]: (n[d.kind] ?? 0) + 1 }), {});
  log(`search reindexed: ${uploaded} cards (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}), ${removed} removed, ${Date.now() - started} ms`);
  return { uploaded, removed };
}

async function reindexSearch(_trigger, context) {
  const log = m => context.log(m);
  // Both read fresh, and a failed read throws: the old cards stay, and a
  // queued request is retried (five times, then search-reindex-poison).
  const [snapshot, prayers] = await Promise.all([
    readSnapshot({ log, fresh: true }),
    prayersStore(undefined, { log }).forSearch(),
  ]);
  return reindex({ snapshot, prayers, store: searchStore(), log });
}

app.timer('reindexSearch', {
  schedule: '0 0 5 * * 0', // Sundays 05:00 UTC, an hour after publishSaints
  handler: reindexSearch,
});

// As with saints-publish, the message's content doesn't matter: its arrival
// is the request. Read through the host's own storage connection.
app.storageQueue('reindexSearchOnRequest', {
  queueName: 'search-reindex',
  connection: 'AzureWebJobsStorage',
  handler: (_message, context) => reindexSearch(null, context),
});

module.exports = { reindex, reindexSearch };
