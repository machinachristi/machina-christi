const test = require('node:test');
const assert = require('node:assert/strict');
const { handlers } = require('../src/functions/search');
const { PRE, POST } = require('../src/lib/search-query');

const req = q => ({ query: new URLSearchParams(q === undefined ? {} : { q }), params: {}, method: 'GET', headers: new Headers() });
const context = () => {
  const lines = [];
  return { lines, log: m => lines.push(String(m)), error: m => lines.push(String(m)) };
};

const agnes = {
  document: { id: 'saint-saint-agnes-virgin-and-martyr', kind: 'saint', title: 'Saint Agnes, Virgin and Martyr', summary: 'A Roman girl.', indexedAt: '2026-10-17T05:00:00.000Z' },
  highlights: { body: [`${PRE}Agnes${POST} was a Roman girl.`] },
};
const hail = {
  document: { id: 'prayer-hail-mary', kind: 'prayer', title: 'The Hail Mary', title_th: 'บทวันทามารีย์', url: '/prayer.html?p=hail-mary', indexedAt: new Date('2026-10-17T05:01:00.000Z') }, // the SDK may give a Date
  highlights: { lines_th: [`วันทา${PRE}มารีย์${POST}`] },
};

function fakeStore({ results = [], fail = false } = {}) {
  const asked = [];
  return { asked, query: async q => { asked.push(q); if (fail) throw Object.assign(new Error(`boom for ${q}`), { statusCode: 503 }); return { results, step: results.length ? 'exact' : null }; } };
}

test('a search answers with results, safe snippets and the newest card time, kept 5 minutes', async () => {
  const store = fakeStore({ results: [agnes, hail] });
  const res = await handlers(() => store).search(req('  Saint AGNES '), context());
  assert.equal(res.status, 200);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=300');
  assert.deepEqual(store.asked, ['saint agnes'], 'the store gets the tidied query');
  const body = res.jsonBody;
  assert.equal(body.q, 'saint agnes');
  assert.equal(body.indexedAt, '2026-10-17T05:01:00.000Z');
  assert.deepEqual(body.results[0].snippet, { text: 'Agnes was a Roman girl.', marks: [[0, 5]], lang: 'en' });
  assert.match(body.results[0].url, /^\/ordo\.html\?date=\d{4}-01-21$/, 'a saint opens the Ordo day of their feast');
  assert.equal(body.results[1].url, '/prayer.html?p=hail-mary');
  assert.equal(body.results[1].snippet.lang, 'th');
  assert.doesNotMatch(JSON.stringify(body), /[<]/);
});

test('nothing found: 200 with no results, never kept, and the log says so without the words', async () => {
  const ctx = context();
  const res = await handlers(() => fakeStore()).search(req('zzqx private words'), ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.jsonBody.results, []);
  assert.deepEqual(ctx.lines, ['search found nothing']);
});

test('a bad query is refused and never reaches the store', async () => {
  const store = fakeStore();
  for (const q of [undefined, '', 'a', '--', 'x'.repeat(300)]) {
    const res = await handlers(() => store).search(req(q), context());
    assert.equal(res.status, 400, `q=${q}`);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  assert.deepEqual(store.asked, []);
});

test('when search is down: 503, not kept, and the log has the status but never the query', async () => {
  const ctx = context();
  const res = await handlers(() => fakeStore({ fail: true })).search(req('secret intention'), ctx);
  assert.equal(res.status, 503);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(ctx.lines.some(l => l.includes('503')));
  assert.ok(ctx.lines.every(l => !l.includes('secret') && !l.includes('intention')), ctx.lines.join('\n'));
});

test('not configured (no SEARCH_ENDPOINT): 503', async () => {
  const res = await handlers(() => null).search(req('agnes'), context());
  assert.equal(res.status, 503);
});
