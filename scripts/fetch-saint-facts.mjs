#!/usr/bin/env node
// Looks up each saint's date of death and patronages on Wikidata and writes
// db/seed/saint-facts.json, with the Wikidata page for every fact so the
// database can say where it came from. Wikidata's data is public domain (CC0).
//
// Who the saints are comes from db/seed/feast-persons.json (each Ordo feast
// and the people it celebrates). For each person:
//   1. find their Wikipedia article (the exact one when the Ordo bio already
//      cites Wikipedia; otherwise a search), and from it the Wikidata item;
//   2. accept the item only if Wikidata calls it a human with a canonization
//      status (or an archangel);
//   3. keep the death date with its precision, and the patronages.
// Anything not matched with confidence is listed for a person to check, and
// db/seed/saint-facts-overrides.json can pin the right item by hand.
//
// Run by hand, rarely: node scripts/fetch-saint-facts.mjs
import fs from 'node:fs/promises';

const UA = 'MachinaChristi/1.0 (https://github.com/machinachristi/machina-christi)';
const WIKI = 'https://en.wikipedia.org/w/api.php';
const WD = 'https://www.wikidata.org/w/api.php';
const HUMAN = 'Q5';
const ARCHANGEL = 'Q235113';

async function get(base, params) {
  const url = `${base}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (attempt >= 4) throw new Error(`${res.status} for ${url}`);
    await new Promise(r => setTimeout(r, 2000 * attempt));
  }
}

async function qidForTitle(title) {
  const data = await get(WIKI, { action: 'query', titles: title, prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1' });
  return data.query.pages[0]?.pageprops?.wikibase_item ?? null;
}

async function searchTitles(query) {
  const data = await get(WIKI, { action: 'query', list: 'search', srsearch: query, srlimit: '5' });
  return data.query.search.map(r => r.title);
}

async function entities(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const data = await get(WD, { action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'claims|labels', languages: 'en' });
    Object.assign(out, data.entities);
  }
  return out;
}

const values = (e, p) => (e.claims?.[p] ?? [])
  .filter(c => c.rank !== 'deprecated' && c.mainsnak.datavalue)
  .map(c => c.mainsnak.datavalue.value);
const ids = (e, p) => values(e, p).map(v => v.id);
const isSaint = e => (ids(e, 'P31').includes(HUMAN) && values(e, 'P411').length > 0) || ids(e, 'P31').includes(ARCHANGEL);

// Wikidata dates: "+0258-09-14T00:00:00Z" with a precision (9 year, 8 decade,
// 7 century, 11 day). Years before 1 are negative.
function deathOf(e) {
  const v = values(e, 'P570')[0];
  if (!v) return null;
  const year = Number(v.time.slice(0, v.time.indexOf('-', 1)));
  const precision = { 11: 'day', 10: 'month', 9: 'year', 8: 'decade', 7: 'century' }[v.precision] ?? 'unknown';
  return { year, precision, ...(precision === 'day' ? { date: v.time.slice(1, 11) } : {}) };
}

// Words that say little about who someone is.
const STOP = new Set(['saint', 'saints', 'st', 'of', 'the', 'and', 'de', 'la', 'da', 'di', 'von', 'pope', 'bishop', 'priest', 'virgin', 'martyr', 'martyrs', 'abbot', 'doctor', 'church']);
const words = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]+/g)?.filter(w => !STOP.has(w)) ?? [];
function overlap(person, label) {
  const a = new Set(words(person));
  const b = new Set(words(label));
  if (!a.size) return 0;
  return [...a].filter(w => b.has(w)).length / a.size;
}

async function main() {
  const feasts = JSON.parse(await fs.readFile('db/seed/feast-persons.json', 'utf8'));
  const saints = JSON.parse(await fs.readFile('ordo/saints.json', 'utf8'));
  const overrides = JSON.parse(await fs.readFile('db/seed/saint-facts-overrides.json', 'utf8').catch(() => '{}'));

  // Person → the Wikipedia article its Ordo bio cites, when it cites one and
  // the feast celebrates a single person.
  const cited = {};
  for (const [feast, persons] of Object.entries(feasts)) {
    const url = saints[feast]?.source_url ?? '';
    if (persons.length === 1 && url.includes('wikipedia.org/wiki/')) {
      cited[persons[0]] = decodeURIComponent(url.split('/wiki/')[1]);
    }
  }

  const persons = [...new Set(Object.values(feasts).flat())];
  const found = {};
  const review = [];
  for (const person of persons) {
    let qid = overrides[person]?.qid ?? null;
    let how = qid ? 'pinned by hand (saint-facts-overrides.json)' : null;
    if (!qid && cited[person]) {
      qid = await qidForTitle(cited[person]);
      how = qid && `the Wikipedia article the Ordo bio cites (${cited[person]})`;
    }
    if (!qid) {
      for (const title of await searchTitles(`${person} saint`)) {
        const candidate = await qidForTitle(title);
        if (!candidate) continue;
        const e = (await entities([candidate]))[candidate];
        if (isSaint(e) && overlap(person, e.labels?.en?.value ?? title) >= 0.5) {
          qid = candidate;
          how = `Wikipedia search, article "${title}"`;
          break;
        }
      }
    }
    if (!qid) {
      review.push(`${person}: no confident match (pin a QID in db/seed/saint-facts-overrides.json)`);
      continue;
    }
    found[person] = { qid, how };
    process.stdout.write('.');
  }
  console.log();

  const ents = await entities(Object.values(found).map(f => f.qid));
  const patronIds = [...new Set(Object.values(ents).flatMap(e => ids(e, 'P2925')))];
  const patronEnts = await entities(patronIds);
  const label = q => patronEnts[q]?.labels?.en?.value ?? null;

  const retrieved = new Date().toISOString().slice(0, 10);
  const facts = {};
  for (const [person, { qid, how }] of Object.entries(found)) {
    const e = ents[qid];
    if (!isSaint(e) && !overrides[person]) review.push(`${person}: ${qid} isn't a human with a canonization status on Wikidata`);
    const label_ = e.labels?.en?.value ?? null;
    if (label_ && overlap(person, label_) < 0.5 && !overrides[person]) review.push(`${person}: matched "${label_}" (${qid}), check it`);
    facts[person] = {
      wikidata: qid,
      wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
      label: label_,
      matched_by: how,
      death: deathOf(e),
      patronages: ids(e, 'P2925').map(q => ({ wikidata: q, label: label(q) })).filter(p => p.label),
      retrieved,
    };
  }

  const out = {
    _about: 'Facts about Ordo\'s saints from Wikidata (public domain, CC0). Each person links to the Wikidata item the facts came from. Made by scripts/fetch-saint-facts.mjs; do not edit by hand (pin items in saint-facts-overrides.json instead).',
    ...Object.fromEntries(Object.entries(facts).sort()),
  };
  await fs.writeFile('db/seed/saint-facts.json', JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote db/seed/saint-facts.json: ${Object.keys(facts).length} of ${persons.length} people`);
  if (review.length) console.log(`\nto check by hand:\n  ${review.join('\n  ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
