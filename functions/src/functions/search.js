const { app } = require('@azure/functions');
const { searchStore } = require('../lib/search-store');
const { normalizeQuery, isSearchable, snippetFrom, MAX_CHARS } = require('../lib/search-query');
const { ordoDayFor } = require('../lib/ordo-dates');

// GET /api/search?q=agnes
//   → { q, step, indexedAt, results: [{ kind, id, title, title_th, summary,
//        url, date, snippet: { text, marks: [[start, length]], lang } }] }
//
// Searches the site index (Azure AI Search) with the Function app's
// identity; visitors never reach the search service itself. The page sends
// the query already tidied (lowercase, single spaces), so the same search
// from many visitors shares one Cloudflare copy for five minutes. Answers
// with no results aren't kept anywhere (they may just be a rebuild gap), nor
// are errors: 503, and the search page falls back to its own simple search.
//
// Privacy: what people search for is never logged, here or in Azure's
// request log (which records the path without the query string).

const CACHE = { 'Cache-Control': 'public, max-age=300' };
const NO_STORE = { 'Cache-Control': 'no-store' };

const todayKey = () => new Date().toISOString().slice(0, 10);
// The SDK may hand dates back as Date objects; answers carry ISO strings.
const iso = t => (t instanceof Date ? t.toISOString() : t ?? null);

function toResult({ document: d, highlights }, today) {
  const day = d.kind === 'saint' ? ordoDayFor(d.title, today) : null;
  return {
    kind: d.kind,
    id: d.id,
    title: d.title,
    title_th: d.title_th ?? null,
    summary: d.summary ?? null,
    url: day?.url ?? d.url ?? (d.kind === 'saint' ? '/ordo.html' : null),
    date: day?.date ?? null,
    snippet: snippetFrom(highlights),
  };
}

function handlers(store) {
  async function search(request, context) {
    const raw = request.query.get('q') ?? '';
    const q = normalizeQuery(raw);
    if (raw.length > MAX_CHARS * 4 || !isSearchable(q)) {
      return { status: 400, headers: NO_STORE, jsonBody: { error: 'q must be 2 to 64 letters or digits' } };
    }
    const s = store(context);
    if (!s) {
      context?.error?.('search unavailable: SEARCH_ENDPOINT is not set');
      return { status: 503, headers: NO_STORE, jsonBody: { error: 'search is unavailable just now' } };
    }
    try {
      const { results, step } = await s.query(q);
      const today = todayKey();
      const out = results.map(r => toResult(r, today));
      const indexedAt = results.map(r => iso(r.document.indexedAt)).filter(Boolean).sort().pop() ?? null;
      if (!out.length) context?.log?.('search found nothing'); // never the words searched for
      return {
        status: 200,
        headers: out.length ? CACHE : NO_STORE,
        jsonBody: { q, step, indexedAt, results: out },
      };
    } catch (err) {
      // The status or error code only: an SDK message can quote the query.
      context?.error?.(`search unavailable: ${err.statusCode ?? err.code ?? err.name}`);
      return { status: 503, headers: NO_STORE, jsonBody: { error: 'search is unavailable just now' } };
    }
  }
  return { search };
}

// One store for the life of the app instance (one connection, reused).
let shared;
const live = handlers(() => (shared ??= searchStore()));

app.http('search', { route: 'search', methods: ['GET', 'HEAD'], authLevel: 'anonymous', handler: live.search });

module.exports = { handlers, toResult };
