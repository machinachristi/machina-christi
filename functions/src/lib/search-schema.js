// The site search index's layout (its "schema"): the fields every card has,
// how each field's text is cut into words (its analyzer), and how much a
// match in each field counts. Kept in git like a database migration and
// applied by CI (scripts/apply-search-schema.js) with the narrow Machina
// Search Schema Writer role; the API only reads this file to know the index's
// name and which fields to ask for.
//
// Changing an existing field's analyzer (or type, or key) is refused by
// Azure ("Existing field cannot be changed"). For such a change, bump
// SEARCH_SCHEMA_VERSION: CI builds site-v<N+1> beside the old index, the
// API fills and uses it, and the old one is removed only after that works.
// Adding a field, synonyms or ranking weights is fine in place.
//
// Analyzers, chosen in the search lab (infra/README.md, "Search"):
//   standardasciifolding.lucene  names, titles, romanization: no stemming
//                                (so "agn*" finds Agnes as you type), and
//                                accents folded (Thérèse = Therese, phrá = phra)
//   en.microsoft                 English prose: lemmatization (lawyers =
//                                lawyer, praying = pray)
//   th.microsoft                 Thai, which has no spaces between words
//
// Property names are the SDK's (@azure/search-documents), not the REST API's:
// analyzerName, synonymMapNames, hidden. Azure silently ignores names it
// doesn't know, so test/search-schema.test.js checks them.

const SEARCH_SCHEMA_VERSION = 1;
const INDEX_NAME = `site-v${SEARCH_SCHEMA_VERSION}`;
const INDEX_PATTERN = /^site-v\d+$/;
const SYNONYM_MAP = 'site-synonyms';

// Single words only: the lab showed multi-word synonyms ("our lady") match
// only when typed in quotes. Other names for a prayer ("Ave Maria") are data,
// in pray/prayers.json's `aka`.
const SYNONYMS = [
  'st, saint',
  'sts, saints',
  'ghost, spirit', // "Holy Ghost" finds "Holy Spirit"
];

const NAMES = 'standardasciifolding.lucene';
const ENGLISH = 'en.microsoft';
const THAI = 'th.microsoft';

const text = (name, analyzerName, { collection = false, synonyms = false } = {}) => ({
  name,
  type: collection ? 'Collection(Edm.String)' : 'Edm.String',
  searchable: true,
  analyzerName,
  ...(synonyms ? { synonymMapNames: [SYNONYM_MAP] } : {}),
});
const shown = (name, type = 'Edm.String') => ({ name, type, searchable: false });

const fields = [
  { name: 'id', type: 'Edm.String', key: true, searchable: false, filterable: true }, // saint-<slug>, prayer-<id>, page-<name>
  { name: 'kind', type: 'Edm.String', searchable: false, filterable: true, facetable: true }, // saint | prayer | page
  text('title', NAMES, { synonyms: true }), // for saints: the feast's exact Ordo name
  text('title_th', THAI),
  text('aka', NAMES, { collection: true, synonyms: true }),
  text('people', NAMES, { collection: true }),
  text('patronages', ENGLISH, { collection: true }),
  text('body', ENGLISH, { synonyms: true }), // a saint's bio, a prayer's "about", a page's description
  text('lines_en', ENGLISH, { collection: true, synonyms: true }),
  text('lines_th', THAI, { collection: true }),
  text('lines_rom', NAMES, { collection: true }),
  text('lines_rom_joined', NAMES, { collection: true }), // "sà-wǎn" also as "sawan"
  shown('summary'),
  shown('url'),
  shown('month', 'Edm.Int32'),
  shown('day', 'Edm.Int32'),
  shown('indexedAt', 'Edm.DateTimeOffset'),
];

// BM25 (the built-in relevance score) times these weights: a match in a
// title counts five times one in a long bio.
const WEIGHTS = {
  title: 5,
  title_th: 5,
  aka: 4,
  people: 4,
  patronages: 2,
  lines_en: 1.5,
  lines_th: 1.5,
  lines_rom: 1,
  lines_rom_joined: 1,
  body: 1,
};
const SCORING_PROFILE = 'titles-first';

// What the API asks for in an answer, and which fields it may highlight.
const SELECT = ['id', 'kind', 'title', 'title_th', 'summary', 'url', 'month', 'day', 'indexedAt'];
const HIGHLIGHT = ['title', 'title_th', 'aka', 'people', 'patronages', 'body', 'lines_en', 'lines_th', 'lines_rom'];

function indexDefinition(name = INDEX_NAME) {
  return {
    name,
    fields: structuredClone(fields),
    scoringProfiles: [{ name: SCORING_PROFILE, textWeights: { weights: { ...WEIGHTS } } }],
    defaultScoringProfile: SCORING_PROFILE,
  };
}

const synonymMapDefinition = () => ({ name: SYNONYM_MAP, synonyms: [...SYNONYMS] });

module.exports = {
  SEARCH_SCHEMA_VERSION,
  INDEX_NAME,
  INDEX_PATTERN,
  SYNONYM_MAP,
  SYNONYMS,
  WEIGHTS,
  SELECT,
  HIGHLIGHT,
  indexDefinition,
  synonymMapDefinition,
};
