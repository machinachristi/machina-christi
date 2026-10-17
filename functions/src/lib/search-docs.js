// Our own indexer's recipe: turns the saints snapshot, the published prayers
// and the site's pages into search cards (documents shaped like the index in
// search-schema.js). Pure: no Azure here, so it's tested with real data.
//
// Azure's built-in indexers would do this themselves, reading the data with
// the search service's own identity, but on the free tier the service can't
// have one, so they'd need keys. Instead the API, which can already read the
// snapshot and the prayers with its badges, builds the cards and uploads them
// (the "push" model).

// The two private-use characters the API asks Azure to put around each
// highlighted word (search-query.js). They must never appear in the text.
const MARKERS = /[]/g;
const clean = s => (typeof s === 'string' ? s.replace(MARKERS, '') : s);
const cleanAll = list => (list ?? []).map(clean).filter(Boolean);

// Card ids may use letters, digits, dashes, underscores and equals signs.
const slug = s => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// "sà-wǎn" → "sàwǎn" (the index then folds the accents), so a learner who
// types "sawan" finds it too.
const joinSyllables = rom => rom.replace(/(?<=\p{L}\p{M}*)-(?=\p{L})/gu, '');

// The first sentence (or so) of a bio, for the result's one-line summary.
function summaryOf(text, max = 180) {
  if (!text) return null;
  const sentence = text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function saintCards(snapshot, indexedAt) {
  return Object.entries(snapshot?.feasts ?? {}).map(([name, feast]) => {
    const people = feast.people ?? [];
    return {
      id: `saint-${slug(name)}`,
      kind: 'saint',
      title: clean(name),
      people: cleanAll(people.map(p => p.name)),
      patronages: cleanAll([...new Set(people.flatMap(p => p.patronages ?? []))]),
      body: clean(feast.bio) ?? null,
      summary: clean(summaryOf(feast.bio)),
      month: feast.month,
      day: feast.day,
      indexedAt,
    };
  });
}

function prayerCards(prayers, indexedAt) {
  return (prayers ?? []).map(p => {
    const lines = p.lines ?? [];
    return {
      id: `prayer-${p.id}`,
      kind: 'prayer',
      title: clean(p.title),
      title_th: clean(p.title_th) ?? null,
      aka: cleanAll(p.aka),
      body: clean(p.about) ?? null,
      lines_en: cleanAll(lines.map(l => l.en)),
      lines_th: cleanAll(lines.map(l => l.th)),
      lines_rom: cleanAll(lines.map(l => l.rom)),
      lines_rom_joined: cleanAll(lines.map(l => l.rom && joinSyllables(l.rom))),
      summary: clean(p.about) ?? null,
      url: `/prayer.html?p=${encodeURIComponent(p.id)}`,
      indexedAt,
    };
  });
}

function pageCards(pages, indexedAt) {
  return (pages ?? []).map(p => ({
    id: `page-${p.name}`,
    kind: 'page',
    title: clean(p.title),
    aka: cleanAll(p.keywords),
    body: clean(p.description),
    summary: clean(p.description),
    url: p.url,
    indexedAt,
  }));
}

// Every card for one rebuild. Refuses to answer with a missing source, so a
// failed read never empties the index (the old cards stay until next time).
function buildSearchDocs({ snapshot, prayers, pages, indexedAt }) {
  if (!indexedAt) throw new Error('indexedAt is required');
  const saints = saintCards(snapshot, indexedAt);
  const praying = prayerCards(prayers, indexedAt);
  if (!saints.length) throw new Error('no saints to index: the snapshot is missing or empty');
  if (!praying.length) throw new Error('no prayers to index');
  const docs = [...saints, ...praying, ...pageCards(pages, indexedAt)];
  const seen = new Set();
  for (const d of docs) {
    if (!/^[A-Za-z0-9_=-]{1,1024}$/.test(d.id)) throw new Error(`bad card id: ${d.id}`);
    if (seen.has(d.id)) throw new Error(`two cards share the id ${d.id}`);
    seen.add(d.id);
  }
  return docs;
}

module.exports = { buildSearchDocs, slug, joinSyllables, summaryOf };
