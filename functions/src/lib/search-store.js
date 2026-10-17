// The API's door to the search index (Azure AI Search, SEARCH_ENDPOINT), with
// the Function app's managed identity (FUNC_IDENTITY_CLIENT_ID): Search Index
// Data Contributor, so it can fill and search the cards but not change the
// index's layout, its keys or the service (infra/modules/search.bicep). The
// service has keys switched off, so there are none to leak.
const { ManagedIdentityCredential } = require('@azure/identity');
const { INDEX_NAME, SELECT, HIGHLIGHT } = require('./search-schema');
const { queryPlan, PRE, POST } = require('./search-query');

const TIMEOUT_MS = 5000;
const TOP = 10;
const BATCH = 500; // Azure takes up to 1,000 cards per request

function searchClient({ endpoint = process.env.SEARCH_ENDPOINT, indexName = INDEX_NAME } = {}) {
  if (!endpoint) return null; // local runs and tests: no search service
  const { SearchClient } = require('@azure/search-documents');
  return new SearchClient(endpoint, indexName, new ManagedIdentityCredential({ clientId: process.env.FUNC_IDENTITY_CLIENT_ID }));
}

function searchStore(client = searchClient()) {
  if (!client) return null;

  // One query: try each step of the plan until one finds something.
  // → { results: [{ document, highlights, score }], step } (step null: none).
  async function query(q) {
    for (const attempt of queryPlan(q)) {
      const res = await client.search(attempt.search, {
        queryType: attempt.queryType,
        searchMode: attempt.searchMode,
        top: TOP,
        select: SELECT,
        highlightFields: HIGHLIGHT.join(','),
        highlightPreTag: PRE,
        highlightPostTag: POST,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const results = [];
      for await (const r of res.results) results.push({ document: r.document, highlights: r.highlights, score: r.score });
      if (results.length) return { results, step: attempt.step };
    }
    return { results: [], step: null };
  }

  // Make the index hold exactly these cards: upload them all (replacing any
  // with the same id), then remove the cards whose ids aren't among them.
  // Stale cards are found by comparing ids, not by an "indexed before"
  // filter, which could catch a card uploaded a moment ago that the index
  // hasn't shown yet.
  async function replaceAll(docs) {
    for (let i = 0; i < docs.length; i += BATCH) {
      await client.uploadDocuments(docs.slice(i, i + BATCH), { throwOnAnyFailure: true });
    }
    const keep = new Set(docs.map(d => d.id));
    const stale = [];
    const res = await client.search('*', { select: ['id'] });
    for await (const r of res.results) if (!keep.has(r.document.id)) stale.push(r.document.id);
    for (let i = 0; i < stale.length; i += BATCH) {
      await client.deleteDocuments('id', stale.slice(i, i + BATCH), { throwOnAnyFailure: true });
    }
    return { uploaded: docs.length, removed: stale.length };
  }

  return { query, replaceAll };
}

module.exports = { searchStore, searchClient };
