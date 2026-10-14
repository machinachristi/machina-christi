// The saints snapshot: everything Ordo knows about its saints, in one JSON
// file. The publish job builds it from the database and stores it in blob
// storage; /api/season reads it from there. Visitors never wake the database.
//
// Pure functions only (no database, no network), so they can be tested.

// Where a fact came from, as the API shows it.
const source = (title, url, license) => (url ? { title, url, license: license ?? null } : null);

// Rows from the database (see functions/publish-saints.js for the queries):
//   feasts:     id, calendar_name, month, day, bio, bio_title, bio_url, bio_license
//   people:     feast_id, slug, name, wikidata_id, death_year, death_precision,
//               death_century, facts_title, facts_url, facts_license
//   patronages: slug, patronage
// Every bio, death date and patronage carries the source it came from.
function buildSnapshot({ feasts, people, patronages }, publishedAt) {
  const patronsOf = new Map();
  for (const p of patronages) {
    if (!patronsOf.has(p.slug)) patronsOf.set(p.slug, []);
    patronsOf.get(p.slug).push(p.patronage);
  }
  const peopleOf = new Map();
  for (const p of people) {
    if (!peopleOf.has(p.feast_id)) peopleOf.set(p.feast_id, []);
    peopleOf.get(p.feast_id).push({
      name: p.name,
      slug: p.slug,
      wikidata: p.wikidata_id ?? null,
      died: p.death_year == null ? null
        : { year: p.death_year, precision: p.death_precision, century: p.death_century ?? null },
      patronages: (patronsOf.get(p.slug) ?? []).sort(),
      // Death date and patronages both come from the person's Wikidata item.
      factsSource: source(p.facts_title, p.facts_url, p.facts_license),
    });
  }

  const out = {};
  for (const f of [...feasts].sort((a, b) => a.calendar_name.localeCompare(b.calendar_name))) {
    out[f.calendar_name] = {
      month: f.month,
      day: f.day,
      bio: f.bio ?? null,
      bioSource: source(f.bio_title, f.bio_url, f.bio_license),
      people: (peopleOf.get(f.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  return {
    about: 'Ordo\'s saints, published from the Machina Christi database. Every bio, death date and patronage names its source.',
    publishedAt,
    counts: { feasts: feasts.length, people: new Set(people.map(p => p.slug)).size, patronages: patronages.length },
    feasts: out,
  };
}

// ordo/saints.json, the site's own bios, names its source only by URL (and
// sometimes source_name); the titles match what the database calls them.
function staticSource(entry) {
  if (!entry.source_url) return null;
  if (entry.source_name === 'Wikipedia') return source('Wikipedia', entry.source_url, 'CC BY-SA 4.0');
  if (entry.source_name === 'Vatican.va') return source('Vatican.va', entry.source_url);
  return source("Summary based on Butler's Lives of the Saints (1894), via catholicsaints.info", entry.source_url, 'Public domain (1894)');
}

// The saint for a celebration name, from the snapshot when there is one, else
// from the bundled bios. null when neither knows the celebration.
function saintFor(name, snapshot, staticBios) {
  const f = snapshot?.feasts?.[name];
  if (f) {
    return { feast: name, bio: f.bio, bioSource: f.bioSource, people: f.people, from: 'database', publishedAt: snapshot.publishedAt };
  }
  const s = staticBios?.[name];
  if (s) {
    return { feast: name, bio: s.excerpt ?? null, bioSource: staticSource(s), people: [], from: 'static', publishedAt: null };
  }
  return null;
}

module.exports = { buildSnapshot, saintFor, staticSource };
