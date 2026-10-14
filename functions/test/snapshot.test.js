const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSnapshot, saintFor } = require('../src/lib/snapshot');
const { season } = require('../src/functions/season');

const get = qs => season({ query: new URLSearchParams(qs) });

// Rows shaped like the publish job's queries return them.
const rows = {
  feasts: [
    { id: 2, calendar_name: 'Saints Peter and Paul, Apostles', month: 6, day: 29, bio: 'Two pillars.', bio_title: 'Vatican.va', bio_url: 'https://www.vatican.va/x', bio_license: null },
    { id: 1, calendar_name: 'Saint Agnes, Virgin and Martyr', month: 1, day: 21, bio: 'A Roman girl.', bio_title: 'Butler', bio_url: 'https://catholicsaints.info/agnes', bio_license: 'Public domain (1894)' },
    { id: 3, calendar_name: 'Saint Nobody', month: 2, day: 2, bio: null, bio_title: null, bio_url: null, bio_license: null },
  ],
  people: [
    { feast_id: 2, slug: 'saint-peter', name: 'Saint Peter', wikidata_id: 'Q33923', death_year: 64, death_precision: 'year', death_century: 1, facts_title: 'Wikidata: Saint Peter', facts_url: 'https://www.wikidata.org/wiki/Q33923', facts_license: 'CC0' },
    { feast_id: 2, slug: 'paul-the-apostle', name: 'Paul the Apostle', wikidata_id: 'Q9200', death_year: null, death_precision: null, death_century: null, facts_title: 'Wikidata: Paul', facts_url: 'https://www.wikidata.org/wiki/Q9200', facts_license: 'CC0' },
    { feast_id: 1, slug: 'agnes-of-rome', name: 'Agnes of Rome', wikidata_id: 'Q229574', death_year: 304, death_precision: 'year', death_century: 4, facts_title: 'Wikidata: Agnes of Rome', facts_url: 'https://www.wikidata.org/wiki/Q229574', facts_license: 'CC0' },
  ],
  patronages: [
    { slug: 'agnes-of-rome', patronage: 'virgins' },
    { slug: 'agnes-of-rome', patronage: 'girls' },
    { slug: 'saint-peter', patronage: 'fishermen' },
  ],
};

test('the snapshot groups people and patronages under each feast, with their sources', () => {
  const s = buildSnapshot(rows, '2026-10-14T04:00:00.000Z');
  assert.equal(s.publishedAt, '2026-10-14T04:00:00.000Z');
  assert.deepEqual(s.counts, { feasts: 3, people: 3, patronages: 3 });
  assert.deepEqual(Object.keys(s.feasts), ['Saint Agnes, Virgin and Martyr', 'Saint Nobody', 'Saints Peter and Paul, Apostles']);

  const agnes = s.feasts['Saint Agnes, Virgin and Martyr'];
  assert.equal(agnes.bio, 'A Roman girl.');
  assert.deepEqual(agnes.bioSource, { title: 'Butler', url: 'https://catholicsaints.info/agnes', license: 'Public domain (1894)' });
  assert.deepEqual(agnes.people[0].died, { year: 304, precision: 'year', century: 4 });
  assert.deepEqual(agnes.people[0].patronages, ['girls', 'virgins']);
  assert.equal(agnes.people[0].factsSource.url, 'https://www.wikidata.org/wiki/Q229574');

  const pp = s.feasts['Saints Peter and Paul, Apostles'];
  assert.deepEqual(pp.people.map(p => p.name), ['Paul the Apostle', 'Saint Peter']);
  assert.equal(pp.people[0].died, null, 'no death date: none is made up');
  assert.deepEqual(pp.people[0].patronages, []);

  const nobody = s.feasts['Saint Nobody'];
  assert.equal(nobody.bioSource, null);
  assert.deepEqual(nobody.people, []);
});

test('a saint comes from the snapshot first, then the bundled bios, else nothing', () => {
  const snap = buildSnapshot(rows, '2026-10-14T04:00:00.000Z');
  const bios = { 'Saint Agnes, Virgin and Martyr': { excerpt: 'Old bio.', source_url: 'https://catholicsaints.info/agnes' } };

  const fromDb = saintFor('Saint Agnes, Virgin and Martyr', snap, bios);
  assert.equal(fromDb.from, 'database');
  assert.equal(fromDb.bio, 'A Roman girl.');
  assert.equal(fromDb.publishedAt, '2026-10-14T04:00:00.000Z');

  const fromStatic = saintFor('Saint Agnes, Virgin and Martyr', null, bios);
  assert.equal(fromStatic.from, 'static');
  assert.equal(fromStatic.bio, 'Old bio.');
  assert.match(fromStatic.bioSource.title, /Butler/);
  assert.deepEqual(fromStatic.people, []);

  assert.equal(saintFor('Unknown feast', snap, bios), null);
});

test('every bundled bio names its source', () => {
  const bios = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ordo', 'saints.json'), 'utf8'));
  for (const name of Object.keys(bios)) {
    const s = saintFor(name, null, bios);
    assert.ok(s.bio, `${name}: bio`);
    assert.ok(s.bioSource?.url, `${name}: source`);
  }
});

test('/api/season names the day\'s saint, from the bundled bios when there is no snapshot', async () => {
  const agnes = await get('date=2026-01-21');
  assert.equal(agnes.jsonBody.saint.feast, 'Saint Agnes, Virgin and Martyr');
  assert.equal(agnes.jsonBody.saint.from, 'static');
  assert.ok(agnes.jsonBody.saint.bioSource.url);

  // A plain weekday has no celebration, so no saint.
  const weekday = await get('date=2026-10-13');
  assert.equal(weekday.jsonBody.celebration, null);
  assert.equal(weekday.jsonBody.saint, null);
});
