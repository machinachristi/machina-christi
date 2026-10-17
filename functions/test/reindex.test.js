const test = require('node:test');
const assert = require('node:assert/strict');
const { searchStore } = require('../src/lib/search-store');
const { reindex } = require('../src/functions/reindex-search');

// A stand-in for the SDK's SearchClient: just the calls the store makes.
function fakeClient(existingIds, { failUpload = false } = {}) {
  const calls = { uploads: [], deletes: [], searches: [] };
  const results = list => ({ results: (async function* () { for (const x of list) yield x; })() });
  return {
    calls,
    async uploadDocuments(docs, options) {
      assert.equal(options?.throwOnAnyFailure, true, 'a partial upload must fail the rebuild');
      if (failUpload) throw new Error('upload failed');
      calls.uploads.push(docs.map(d => d.id));
    },
    async deleteDocuments(key, ids, options) {
      assert.equal(key, 'id');
      assert.equal(options?.throwOnAnyFailure, true);
      calls.deletes.push(ids);
    },
    async search(text, options) {
      calls.searches.push({ text, options });
      if (text === '*') return results(existingIds.map(id => ({ document: { id } })));
      return results([]);
    },
  };
}

const snapshot = { feasts: { 'Saint Agnes, Virgin and Martyr': { month: 1, day: 21, bio: 'A Roman girl.', people: [] } } };
const prayers = [{ id: 'hail-mary', title: 'The Hail Mary', lines: [{ th: 'ก', rom: 'r', en: 'e' }] }];
const now = () => new Date('2026-10-17T05:00:00.000Z');

test('a rebuild uploads every card, then removes only cards no longer made', async () => {
  const client = fakeClient(['saint-saint-agnes-virgin-and-martyr', 'prayer-old-one', 'page-gone']);
  const lines = [];
  const out = await reindex({ snapshot, prayers, store: searchStore(client), log: m => lines.push(m), now });
  const uploaded = client.calls.uploads.flat();
  assert.ok(uploaded.includes('saint-saint-agnes-virgin-and-martyr') && uploaded.includes('prayer-hail-mary') && uploaded.includes('page-eden'));
  assert.deepEqual(client.calls.deletes, [['prayer-old-one', 'page-gone']]);
  assert.equal(out.removed, 2);
  assert.match(lines[0], /^search reindexed: \d+ cards \(1 saint, 1 prayer, \d+ page\), 2 removed, \d+ ms$/);
});

test('nothing stale: nothing removed', async () => {
  const client = fakeClient([]);
  await reindex({ snapshot, prayers, store: searchStore(client), log: () => {}, now });
  assert.deepEqual(client.calls.deletes, []);
});

test('a failed upload stops before anything is removed', async () => {
  const client = fakeClient(['prayer-old-one'], { failUpload: true });
  await assert.rejects(reindex({ snapshot, prayers, store: searchStore(client), log: () => {}, now }), /upload failed/);
  assert.deepEqual(client.calls.deletes, []);
});

test('a missing source refuses to rebuild, so the old cards stay', async () => {
  const client = fakeClient(['saint-x']);
  await assert.rejects(reindex({ snapshot: null, prayers, store: searchStore(client), log: () => {}, now }), /no saints/);
  await assert.rejects(reindex({ snapshot, prayers: [], store: searchStore(client), log: () => {}, now }), /no prayers/);
  assert.deepEqual(client.calls.uploads, []);
  await assert.rejects(reindex({ snapshot, prayers, store: null, log: () => {}, now }), /SEARCH_ENDPOINT/);
});

test('a query climbs the ladder: strict first, then typos, until something is found', async () => {
  const client = fakeClient([]);
  let calls = 0;
  client.search = async (text, options) => {
    calls++;
    const hit = options.queryType === 'full' ? [{ document: { id: 'saint-francis' }, highlights: {}, score: 1 }] : [];
    return { results: (async function* () { yield* hit; })() };
  };
  const { results, step } = await searchStore(client).query('fransis');
  assert.equal(step, 'typo');
  assert.equal(results[0].document.id, 'saint-francis');
  assert.equal(calls, 2);
});

test('no search service configured: no store', () => {
  delete process.env.SEARCH_ENDPOINT;
  assert.equal(searchStore(undefined ?? null), null);
});
