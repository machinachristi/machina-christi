const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSnapshot } = require('../src/lib/snapshot');
const { buildSearchDocs, slug, joinSyllables, summaryOf } = require('../src/lib/search-docs');
const { SITE_PAGES } = require('../src/lib/site-pages');

const ROOT = path.join(__dirname, '..', '..');
const prayers = JSON.parse(fs.readFileSync(path.join(ROOT, 'pray', 'prayers.json'), 'utf8')).prayers;
const at = '2026-10-17T05:00:00.000Z';

// A snapshot made the way the publish job makes it, from rows like its queries'.
const snapshot = buildSnapshot({
  feasts: [
    { id: 1, calendar_name: 'Saint Agnes, Virgin and Martyr', month: 1, day: 21, bio: 'Agnes was a Roman girl. She refused marriage.', bio_title: 'Butler', bio_url: 'https://catholicsaints.info/agnes', bio_license: null },
    { id: 2, calendar_name: 'Saint Thérèse of the Child Jesus, Virgin and Doctor of the Church', month: 10, day: 1, bio: null, bio_title: null, bio_url: null, bio_license: null },
  ],
  people: [
    { feast_id: 1, slug: 'agnes-of-rome', name: 'Agnes of Rome', wikidata_id: 'Q1', death_year: 304, death_precision: 'year', death_century: 4, facts_title: 'W', facts_url: 'https://w/1', facts_license: 'CC0' },
  ],
  patronages: [{ slug: 'agnes-of-rome', patronage: 'girls' }, { slug: 'agnes-of-rome', patronage: 'virgins' }],
}, at);

const docs = buildSearchDocs({ snapshot, prayers, pages: SITE_PAGES, indexedAt: at });
const byId = new Map(docs.map(d => [d.id, d]));

test('one card per feast, prayer and page, all stamped with the rebuild time', () => {
  assert.equal(docs.filter(d => d.kind === 'saint').length, 2);
  assert.equal(docs.filter(d => d.kind === 'prayer').length, prayers.length);
  assert.equal(docs.filter(d => d.kind === 'page').length, SITE_PAGES.length);
  for (const d of docs) assert.equal(d.indexedAt, at);
});

test('a saint card carries the exact Ordo feast name, its people and their patronages', () => {
  const agnes = byId.get('saint-saint-agnes-virgin-and-martyr');
  assert.equal(agnes.title, 'Saint Agnes, Virgin and Martyr');
  assert.deepEqual(agnes.people, ['Agnes of Rome']);
  assert.deepEqual(agnes.patronages, ['girls', 'virgins']);
  assert.equal(agnes.summary, 'Agnes was a Roman girl.');
  assert.deepEqual([agnes.month, agnes.day], [1, 21]);
  assert.ok(byId.has('saint-saint-therese-of-the-child-jesus-virgin-and-doctor-of-the-church'), 'accents folded in the id');
});

test('a prayer card has its Thai, romanization (also joined), English and other names, and links to its page', () => {
  const hail = byId.get('prayer-hail-mary');
  const source = prayers.find(p => p.id === 'hail-mary');
  assert.equal(hail.title_th, source.title_th);
  assert.deepEqual(hail.aka, ['Ave Maria']);
  assert.deepEqual(hail.lines_th, source.lines.map(l => l.th));
  assert.equal(hail.lines_rom_joined[0], joinSyllables(source.lines[0].rom));
  assert.equal(hail.url, '/prayer.html?p=hail-mary');
});

test('romanization syllables are joined so "sawan" finds sà-wǎn; words stay apart', () => {
  assert.equal(joinSyllables('thûut-sà-wǎn khǎwng phrá-jâo'), 'thûutsàwǎn khǎwng phrájâo');
  assert.equal(joinSyllables('wan-thaa maa-rii, bpìam'), 'wanthaa maarii, bpìam');
});

test('the highlight markers can never appear in a card', () => {
  const sneaky = buildSearchDocs({
    snapshot: { feasts: { 'Saint X': { month: 1, day: 1, bio: 'ab', people: [] } } },
    prayers: [{ id: 'p', title: 'P', lines: [{ th: 'ก', rom: 'r', en: 'e' }] }],
    pages: [],
    indexedAt: at,
  });
  assert.doesNotMatch(JSON.stringify(sneaky), /[]/);
});

test('a missing snapshot or no prayers refuses to build (the old cards stay)', () => {
  assert.throws(() => buildSearchDocs({ snapshot: null, prayers, pages: [], indexedAt: at }), /no saints/);
  assert.throws(() => buildSearchDocs({ snapshot, prayers: [], pages: [], indexedAt: at }), /no prayers/);
  assert.throws(() => buildSearchDocs({ snapshot, prayers, pages: [], indexedAt: null }), /indexedAt/);
});

test('two cards with one id are refused', () => {
  const twice = { feasts: { 'Saint A!': { people: [] }, 'Saint A?': { people: [] } } };
  assert.throws(() => buildSearchDocs({ snapshot: twice, prayers, pages: [], indexedAt: at }), /share the id/);
});

test('ids are what Azure allows', () => {
  for (const d of docs) assert.match(d.id, /^[A-Za-z0-9_=-]+$/);
  assert.equal(slug('Saints Cyril, Monk, and Methodius, Bishop'), 'saints-cyril-monk-and-methodius-bishop');
});

test('a summary is the first sentence, cut at a word when long', () => {
  assert.equal(summaryOf('One. Two.'), 'One.');
  const long = summaryOf(`${'word '.repeat(60)}end.`);
  assert.ok(long.length <= 180 && long.endsWith('…'));
  assert.equal(summaryOf(null), null);
});

test('every site page card points at a real page that is in the sitemap', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  for (const p of SITE_PAGES) {
    const file = p.url === '/' ? 'index.html' : p.url.slice(1);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${p.url} exists`);
    assert.ok(sitemap.includes(`<loc>https://machinachristi.com${p.url}</loc>`), `${p.url} is in sitemap.xml`);
  }
});
