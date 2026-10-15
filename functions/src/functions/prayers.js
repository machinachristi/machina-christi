const { app } = require('@azure/functions');
const { prayersStore } = require('../lib/prayers-store');

// GET /api/prayers            the list: [{ id, title, title_th, about }]
// GET /api/prayers/{id}       one prayer: its lines, source and recordings
//
// Read from Cosmos DB (store above), with the Function app's read-only
// identity. Answers are public and change only when the prayers are
// published, so browsers and Cloudflare may keep them for five minutes. If
// the database can't answer, the response says so (503, not kept anywhere)
// and the Pray pages fall back to their own copy of prayers.json.

const ID = /^[a-z0-9-]{1,64}$/;
const CACHE = { 'Cache-Control': 'public, max-age=300' };
const NO_STORE = { 'Cache-Control': 'no-store' };

function handlers(store) {
  const unavailable = (context, err) => {
    context?.error?.(`prayers unavailable: ${err.message}`);
    return { status: 503, headers: NO_STORE, jsonBody: { error: 'prayers are unavailable just now' } };
  };

  async function list(request, context) {
    try {
      return { status: 200, headers: CACHE, jsonBody: await store(context).list() };
    } catch (err) {
      return unavailable(context, err);
    }
  }

  async function prayer(request, context) {
    const id = request.params.id;
    if (!ID.test(id ?? '')) return { status: 400, headers: NO_STORE, jsonBody: { error: 'id must be lowercase letters, digits and dashes' } };
    try {
      const doc = await store(context).get(id);
      if (!doc) return { status: 404, headers: CACHE, jsonBody: { error: 'no such prayer' } };
      return { status: 200, headers: CACHE, jsonBody: doc };
    } catch (err) {
      return unavailable(context, err);
    }
  }

  return { list, prayer };
}

// One store for the life of the app instance, so its memory is shared by
// every request; it logs through whichever request first created it.
let shared;
const live = handlers(context => (shared ??= prayersStore(undefined, { log: m => context?.log?.(m) })));

app.http('prayers', { route: 'prayers', methods: ['GET', 'HEAD'], authLevel: 'anonymous', handler: live.list });
app.http('prayer', { route: 'prayers/{id}', methods: ['GET', 'HEAD'], authLevel: 'anonymous', handler: live.prayer });

module.exports = { handlers };
