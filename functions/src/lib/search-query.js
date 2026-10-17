// From what a visitor typed to what we ask Azure AI Search, and from Azure's
// highlights back to safe snippets. Pure: tested without Azure.
//
// What the lab taught (infra/README.md, "Search"):
//   - Strict first: every word must match (searchMode "all"), with small
//     English words dropped ("martyrs of japan" failed only because of "of").
//   - The last word is still being typed, so it's also tried as a prefix
//     ("agn" → Agnes). Prefix words aren't run through the analyzer, so the
//     prefix copy has its accents folded here (Latin words only).
//   - Thai has no spaces, so a Thai "word" is a run of several words; quoted,
//     it must match as that exact run (พระแม่มารีย์ finds only the Memorare).
//   - Nothing found → retry allowing one letter wrong ("fransis~1" →
//     Francis), then with any word matching.
//
// Safety: only letters, combining marks and digits survive from the input,
// so no one can type query syntax ("-mary" must not mean NOT mary).

const MAX_CHARS = 64;
const MIN_CHARS = 2;
const PRE = ''; // highlight markers: private-use characters, never in
const POST = ''; // the text (search-docs.js strips them)

const STOP_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
const THAI = /\p{Script=Thai}/u;
const TERM = /[\p{L}\p{M}\p{N}]+/gu;

// The form sent to the API and used as the cache key: NFC, lowercase, single
// spaces, at most 64 characters. '' when there's nothing to search for.
function normalizeQuery(raw) {
  if (typeof raw !== 'string') return '';
  const q = raw.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  return [...q].slice(0, MAX_CHARS).join('').trim();
}

const isSearchable = q => [...q].length >= MIN_CHARS && (q.match(TERM) ?? []).length > 0;

function termsOf(q) {
  const terms = q.match(TERM) ?? [];
  const kept = terms.filter(t => !STOP_WORDS.has(t));
  return kept.length ? kept : terms;
}

// Fold accents for a prefix: "thérè" → "there". Only for Latin words: Thai
// vowels and tone marks are combining marks too, and must stay.
const fold = t => t.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

function simpleText(terms) {
  return terms
    .map((t, i) => {
      const last = i === terms.length - 1;
      if (THAI.test(t)) return last ? `("${t}" | ${t}*)` : `"${t}"`;
      return last ? `(${t} | ${fold(t)}*)` : t;
    })
    .join(' ');
}

// Full Lucene syntax, for typo tolerance: words of four letters or more may
// be one letter off. Terms hold only letters, marks and digits, so nothing
// here needs escaping.
function fuzzyText(terms) {
  return terms
    .map((t, i) => {
      const last = i === terms.length - 1;
      if (THAI.test(t)) return `"${t}"`;
      const f = [...t].length >= 4 ? `${t}~1` : t;
      return last ? `(${f} OR ${fold(t)}*)` : f;
    })
    .join(' ');
}

// The ladder of attempts for one query, strictest first. The store stops at
// the first one that finds anything.
function queryPlan(q) {
  const terms = termsOf(q);
  if (!terms.length) return [];
  const plan = [{ step: 'exact', search: simpleText(terms), queryType: 'simple', searchMode: 'all' }];
  if (terms.some(t => !THAI.test(t) && [...t].length >= 4)) {
    plan.push({ step: 'typo', search: fuzzyText(terms), queryType: 'full', searchMode: 'all' });
  }
  if (terms.length > 1) plan.push({ step: 'any', search: simpleText(terms), queryType: 'simple', searchMode: 'any' });
  return plan;
}

// Which highlighted field makes the best snippet, best first. Titles aren't
// here: the result shows its title anyway.
const SNIPPET_FIELDS = ['lines_en', 'lines_th', 'lines_rom', 'patronages', 'people', 'aka', 'body'];
const LANG = { lines_th: 'th', lines_rom: 'th-Latn' };

// Azure's fragment "…⟦Agnes⟧ was a Roman girl…" → { text, marks, lang }:
// plain text plus [start, length] ranges to mark. The browser builds it with
// textContent and <mark> elements, so no HTML ever crosses the API. Thai
// pieces arrive marked one by one (⟦มา⟧⟦รี⟧⟦ย์⟧); touching marks are merged.
function parseFragment(fragment) {
  let text = '';
  const marks = [];
  let open = null;
  for (const ch of fragment) {
    if (ch === PRE) open = text.length;
    else if (ch === POST) {
      if (open !== null && text.length > open) {
        const prev = marks[marks.length - 1];
        if (prev && prev[0] + prev[1] === open) prev[1] += text.length - open;
        else marks.push([open, text.length - open]);
      }
      open = null;
    } else text += ch;
  }
  return { text, marks };
}

function snippetFrom(highlights) {
  if (!highlights) return null;
  for (const field of SNIPPET_FIELDS) {
    const fragment = highlights[field]?.[0];
    if (fragment) return { ...parseFragment(fragment), lang: LANG[field] ?? 'en' };
  }
  return null;
}

module.exports = { normalizeQuery, isSearchable, queryPlan, snippetFrom, parseFragment, PRE, POST, MAX_CHARS, MIN_CHARS };
