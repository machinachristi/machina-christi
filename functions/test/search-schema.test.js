const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/lib/search-schema');
const { buildSearchDocs } = require('../src/lib/search-docs');
const { SITE_PAGES } = require('../src/lib/site-pages');

// Azure ignores property names it doesn't know (a typo like `analyzer` for
// the SDK's `analyzerName` would quietly leave a field on the default
// analyzer), so the layout may only use these.
const FIELD_KEYS = new Set(['name', 'type', 'key', 'searchable', 'filterable', 'sortable', 'facetable', 'hidden', 'analyzerName', 'synonymMapNames']);
const ANALYZERS = new Set(['standardasciifolding.lucene', 'en.microsoft', 'th.microsoft']);
const TYPES = new Set(['Edm.String', 'Collection(Edm.String)', 'Edm.Int32', 'Edm.DateTimeOffset']);

const index = S.indexDefinition();
const byName = new Map(index.fields.map(f => [f.name, f]));

test('the index is named site-v<version>, and the retire pattern matches it', () => {
  assert.equal(index.name, `site-v${S.SEARCH_SCHEMA_VERSION}`);
  assert.match(index.name, S.INDEX_PATTERN);
  assert.doesNotMatch('site-v1-old', S.INDEX_PATTERN);
});

test('fields use only known SDK property names, types and the lab-chosen analyzers', () => {
  for (const f of index.fields) {
    for (const k of Object.keys(f)) assert.ok(FIELD_KEYS.has(k), `${f.name}: unknown property ${k}`);
    assert.ok(TYPES.has(f.type), `${f.name}: type ${f.type}`);
    if (f.analyzerName) {
      assert.ok(ANALYZERS.has(f.analyzerName), `${f.name}: analyzer ${f.analyzerName}`);
      assert.equal(f.searchable, true, `${f.name}: an analyzer only matters on a searchable field`);
      assert.match(f.type, /Edm\.String/);
    }
    for (const m of f.synonymMapNames ?? []) assert.equal(m, S.SYNONYM_MAP);
  }
  assert.equal(new Set(index.fields.map(f => f.name)).size, index.fields.length, 'field names are unique');
});

test('exactly one key, a filterable string', () => {
  const keys = index.fields.filter(f => f.key);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].name, 'id');
  assert.equal(keys[0].type, 'Edm.String');
});

test('Thai fields are cut by the Thai analyzer, prose by English, names and romanization folded', () => {
  for (const name of ['title_th', 'lines_th']) assert.equal(byName.get(name).analyzerName, 'th.microsoft');
  for (const name of ['body', 'lines_en', 'patronages']) assert.equal(byName.get(name).analyzerName, 'en.microsoft');
  for (const name of ['title', 'aka', 'people', 'lines_rom', 'lines_rom_joined']) assert.equal(byName.get(name).analyzerName, 'standardasciifolding.lucene');
});

test('every weighted, selected and highlighted field exists, and the default profile is defined', () => {
  for (const name of Object.keys(S.WEIGHTS)) assert.equal(byName.get(name)?.searchable, true, `weight on ${name}`);
  for (const name of S.SELECT) assert.ok(byName.has(name), `select ${name}`);
  for (const name of S.HIGHLIGHT) assert.equal(byName.get(name)?.searchable, true, `highlight ${name}`);
  assert.ok(index.scoringProfiles.some(p => p.name === index.defaultScoringProfile));
  for (const f of index.fields.filter(x => x.searchable)) assert.ok(f.name in S.WEIGHTS, `${f.name} has no weight`);
});

test('synonym rules are single words, comma-separated (multi-word ones only match in quotes)', () => {
  const map = S.synonymMapDefinition();
  assert.equal(map.name, S.SYNONYM_MAP);
  for (const rule of map.synonyms) {
    const words = rule.replace(/\s*\/\/.*$/, '').split(',').map(w => w.trim());
    assert.ok(words.length >= 2, rule);
    for (const w of words) assert.match(w, /^[a-z]+$/, `"${w}" in "${rule}"`);
  }
});

test('every card the indexer builds fits the layout', () => {
  const snapshot = { feasts: { 'Saint Agnes, Virgin and Martyr': { month: 1, day: 21, bio: 'A Roman girl.', people: [{ name: 'Agnes of Rome', patronages: ['girls'] }] } } };
  const prayers = [{ id: 'hail-mary', title: 'The Hail Mary', title_th: 'บทวันทามารีย์', aka: ['Ave Maria'], about: 'x', lines: [{ th: 'ก', rom: 'wan-thaa', en: 'Hail' }] }];
  const docs = buildSearchDocs({ snapshot, prayers, pages: SITE_PAGES, indexedAt: '2026-10-17T00:00:00.000Z' });
  for (const d of docs) for (const k of Object.keys(d)) assert.ok(byName.has(k), `${d.id}: ${k} isn't in the index`);
});
