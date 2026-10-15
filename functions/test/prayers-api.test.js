const test = require('node:test');
const assert = require('node:assert/strict');
const { prayersStore } = require('../src/lib/prayers-store');
const { handlers } = require('../src/functions/prayers');
const { handler: audioHandler, parseRange } = require('../src/functions/audio');

// A stand-in for the Cosmos DB container: just the calls the store makes.
function fakeContainer(docs, { fail = false } = {}) {
  const calls = { query: 0, read: 0 };
  return {
    calls,
    items: {
      query: () => ({
        fetchAll: async () => {
          calls.query++;
          if (fail) throw new Error('down');
          return { resources: docs.map(({ id, title, title_th, about, order }) => ({ id, title, title_th, about, order })), requestCharge: 2.9 };
        },
      }),
    },
    item: id => ({
      read: async () => {
        calls.read++;
        if (fail) throw new Error('down');
        const d = docs.find(x => x.id === id);
        return { resource: d ? { ...d, _rid: 'r', _etag: 'e', _ts: 1 } : undefined, requestCharge: 1 };
      },
    }),
  };
}

const docs = [
  { id: 'hail-mary', type: 'prayer', order: 2, title: 'The Hail Mary', title_th: 'บทวันทามารีย์', about: 'b', lines: [{ th: 'ก', rom: 'g', en: 'x' }] },
  { id: 'sign-of-the-cross', type: 'prayer', order: 0, title: 'The Sign of the Cross', title_th: 'เครื่องหมายกางเขน', about: 'a', lines: [] },
];
const req = (params = {}, headers = {}, method = 'GET') => ({ params, method, headers: new Headers(headers), query: new URLSearchParams() });

test('the list comes in prayers.json order, with only what the list page needs', async () => {
  const c = fakeContainer(docs);
  const api = handlers(() => prayersStore(c));
  const res = await api.list(req());
  assert.equal(res.status, 200);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=300');
  assert.deepEqual(res.jsonBody.map(p => p.id), ['sign-of-the-cross', 'hail-mary']);
  assert.deepEqual(Object.keys(res.jsonBody[0]), ['id', 'title', 'title_th', 'about']);
});

test('one prayer is a point read, without Cosmos DB\'s own fields; unknown is 404 and a bad id is 400', async () => {
  const store = prayersStore(fakeContainer(docs));
  const api = handlers(() => store);
  const ok = await api.prayer(req({ id: 'hail-mary' }));
  assert.equal(ok.status, 200);
  assert.equal(ok.jsonBody.title, 'The Hail Mary');
  assert.ok(!Object.keys(ok.jsonBody).some(k => k.startsWith('_')));
  assert.equal((await api.prayer(req({ id: 'nope' }))).status, 404);
  for (const bad of ['Hail', '../x', '', 'a'.repeat(65)]) {
    const r = await api.prayer(req({ id: bad }));
    assert.equal(r.status, 400, bad);
    assert.equal(r.headers['Cache-Control'], 'no-store');
  }
});

test('answers are remembered, so repeat visits don\'t reach the database', async () => {
  const c = fakeContainer(docs);
  const store = prayersStore(c);
  await store.list(); await store.list();
  await store.get('hail-mary'); await store.get('hail-mary');
  assert.deepEqual(c.calls, { query: 1, read: 1 });
});

test('with the database down and nothing remembered, the answer is 503 and kept nowhere', async () => {
  const api = handlers(() => prayersStore(fakeContainer(docs, { fail: true })));
  for (const res of [await api.list(req()), await api.prayer(req({ id: 'hail-mary' }))]) {
    assert.equal(res.status, 503);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  // Not configured at all (local runs): the same.
  assert.equal((await handlers(() => prayersStore(null)).list(req())).status, 503);
});

// ── The recording relay ──────────────────────────────────────────────────────

const FILE = 'our-father/th-slow-0123456789.mp3';
const bytes = Buffer.from('0123456789abcdefghij'); // 20 bytes
const fakeAudio = (files = { [FILE]: bytes }, { fail = false } = {}) => ({
  read: async name => { if (fail) throw new Error('down'); return files[name] ?? null; },
});
const audioReq = (name, headers = {}, method = 'GET') => {
  const [id, file] = name.split('/');
  return req({ id, file }, headers, method);
};

test('a whole recording comes back as MP3, kept for a year, with its fingerprint as ETag', async () => {
  const res = await audioHandler(fakeAudio())(audioReq(FILE));
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'audio/mpeg');
  assert.equal(res.headers['Accept-Ranges'], 'bytes');
  assert.equal(res.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(res.headers.ETag, '"0123456789"');
  assert.equal(res.headers['Content-Length'], '20');
  assert.deepEqual(res.body, bytes);
});

test('a byte range comes back as 206 with the right Content-Range (what iPhones ask for first)', async () => {
  const h = audioHandler(fakeAudio());
  const first = await h(audioReq(FILE, { range: 'bytes=0-1' }));
  assert.equal(first.status, 206);
  assert.equal(first.headers['Content-Range'], 'bytes 0-1/20');
  assert.equal(first.body.toString(), '01');
  const rest = await h(audioReq(FILE, { range: 'bytes=15-' }));
  assert.equal(rest.headers['Content-Range'], 'bytes 15-19/20');
  assert.equal(rest.body.toString(), 'fghij');
  const tail = await h(audioReq(FILE, { range: 'bytes=-3' }));
  assert.equal(tail.body.toString(), 'hij');
  const past = await h(audioReq(FILE, { range: 'bytes=10-999' }));
  assert.equal(past.headers['Content-Range'], 'bytes 10-19/20');
});

test('an impossible range is 416; several ranges or other units get the whole file', async () => {
  const h = audioHandler(fakeAudio());
  const bad = await h(audioReq(FILE, { range: 'bytes=50-60' }));
  assert.equal(bad.status, 416);
  assert.equal(bad.headers['Content-Range'], 'bytes */20');
  assert.equal((await h(audioReq(FILE, { range: 'bytes=0-1,5-6' }))).status, 200);
  assert.equal((await h(audioReq(FILE, { range: 'items=0-1' }))).status, 200);
  assert.equal(parseRange('bytes=5-2', 20), 'unsatisfiable');
  assert.equal(parseRange('bytes=-0', 20), 'unsatisfiable');
});

test('HEAD sends headers only; a matching ETag gets 304', async () => {
  const h = audioHandler(fakeAudio());
  const head = await h(audioReq(FILE, {}, 'HEAD'));
  assert.equal(head.status, 200);
  assert.equal(head.headers['Content-Length'], '20');
  assert.equal(head.body, undefined);
  assert.equal((await h(audioReq(FILE, { 'if-none-match': '"0123456789"' }))).status, 304);
});

test('only recording names are served: anything else, or a missing file, is 404; storage down is 503', async () => {
  const h = audioHandler(fakeAudio());
  for (const name of ['our-father/th-slow-012345678.mp3', 'our-father/de-slow-0123456789.mp3', 'our-father/th-fast-0123456789.mp3', 'Our-Father/th-slow-0123456789.mp3', 'our-father/th-slow-0123456789.wav', '../x/th-slow-0123456789.mp3']) {
    assert.equal((await h(audioReq(name))).status, 404, name);
  }
  assert.equal((await h(audioReq('hail-mary/en-normal-abcdef0123.mp3'))).status, 404, 'well-formed but not there');
  const down = await audioHandler(fakeAudio({}, { fail: true }))(audioReq(FILE));
  assert.equal(down.status, 503);
  assert.equal(down.headers['Cache-Control'], 'no-store');
});
