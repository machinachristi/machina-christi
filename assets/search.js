// The search page: results as you type, from the API's search
// (/api/search, Azure AI Search behind it) on the live site, and from a
// simple search of the site's own files everywhere else, or whenever the API
// can't answer.
//
// Every result is built with DOM calls and textContent: no text from the
// API or the data files is ever treated as HTML. Highlights arrive as text
// plus [start, length] ranges and become <mark> elements here.
//
// Privacy: the search words never go in the page title (telemetry records
// it) or in storage. They do go in the address (?q=), so a search can be
// shared or reloaded; telemetry never sends the query string.
(() => {
  'use strict';

  const LIVE_HOSTS = ['machinachristi.com', 'www.machinachristi.com'];
  const live = LIVE_HOSTS.includes(location.hostname);
  const API = 'https://api.machinachristi.com/api/search';
  const TIMEOUT_MS = 5000;
  const PAUSE_MS = 300; // wait for a pause in typing before asking
  const MAX_CHARS = 64;

  const input = document.getElementById('q');
  const status = document.getElementById('status');
  const list = document.getElementById('results');
  const fallbackNote = document.getElementById('fallback');

  // The same tidying the API does, so the same search from many people is
  // one address (and one copy in Cloudflare's cache).
  function normalize(raw) {
    const q = String(raw || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    return Array.from(q).slice(0, MAX_CHARS).join('').trim();
  }
  const searchable = q => Array.from(q).length >= 2 && /[\p{L}\p{N}]/u.test(q);

  // ── Asking the API ────────────────────────────────────────────────────────

  const memo = new Map(); // q → answer, for this visit only
  let inFlight = null;

  async function fromApi(q) {
    if (memo.has(q)) return memo.get(q);
    inFlight?.abort();
    const ctrl = new AbortController();
    inFlight = ctrl;
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${API}?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`API ${r.status}`);
      const answer = await r.json();
      if (!Array.isArray(answer.results)) throw new Error('unexpected answer');
      memo.set(q, answer);
      return answer;
    } finally {
      clearTimeout(timer);
      if (inFlight === ctrl) inFlight = null;
    }
  }

  // ── The simple search, from the site's own files ──────────────────────────

  // Accents off Latin letters only (U+0300–036F): Thai vowels and tone marks
  // are combining marks too, and must stay.
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  let entries = null;
  async function simpleEntries() {
    if (entries) return entries;
    const json = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const year = new Date().getFullYear();
    const [prayers, saints, ...calendars] = await Promise.all([
      json('/pray/prayers.json'), json('/ordo/saints.json'),
      json(`/ordo/calendar-${year}.json`), json(`/ordo/calendar-${year + 1}.json`), json(`/ordo/calendar-${year - 1}.json`),
    ]);
    // Each feast's dates in the calendars this site has, to open the right day.
    const dates = new Map();
    for (const cal of calendars) {
      for (const [date, e] of Object.entries(cal || {})) {
        if (!e || !e.name) continue;
        if (!dates.has(e.name)) dates.set(e.name, []);
        dates.get(e.name).push(date);
      }
    }
    const today = todayKey();
    const dayOf = name => {
      const list = (dates.get(name) || []).sort();
      return list.find(d => d >= today) || list[list.length - 1] || null;
    };
    const out = [];
    for (const p of (prayers && prayers.prayers) || []) {
      out.push({
        kind: 'prayer', title: p.title, title_th: p.title_th, summary: p.about,
        url: `/prayer.html?p=${encodeURIComponent(p.id)}`,
        hay: fold([p.title, p.title_th, ...(p.aka || []), p.about].join(' ')),
      });
    }
    for (const name of Object.keys(saints || {})) {
      const date = dayOf(name);
      out.push({
        kind: 'saint', title: name, date,
        url: date ? `/ordo.html?date=${date}` : '/ordo.html',
        hay: fold(name),
      });
    }
    entries = out;
    return out;
  }

  async function simpleSearch(q) {
    const words = fold(q).split(' ').filter(Boolean);
    const all = await simpleEntries();
    return all.filter(e => words.every(w => e.hay.includes(w))).slice(0, 10);
  }

  // ── Drawing results ───────────────────────────────────────────────────────

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // "Agnes was…" + [[0, 5]] → <mark>Agnes</mark> was…
  function snippetNode(snippet) {
    const span = el('span', 'snippet');
    if (snippet.lang) span.lang = snippet.lang;
    let at = 0;
    const text = String(snippet.text || '');
    for (const [start, length] of Array.isArray(snippet.marks) ? snippet.marks : []) {
      if (!(start >= at && length > 0 && start + length <= text.length)) continue;
      span.append(text.slice(at, start), el('mark', null, text.slice(start, start + length)));
      at = start + length;
    }
    span.append(text.slice(at));
    return span;
  }

  const KIND = { saint: 'Saint', prayer: 'Prayer', page: 'Page' };
  function kindLabel(r) {
    const label = KIND[r.kind] || 'Page';
    if (r.kind !== 'saint' || !r.date) return label;
    const d = new Date(`${r.date}T12:00:00Z`);
    return `${label} · ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
  }

  // Only the site's own pages: a result's address must start with "/" (and
  // not "//", which would leave the site).
  const safeUrl = url => (typeof url === 'string' && /^\/(?!\/)/.test(url) ? url : '/');

  function draw(results) {
    list.replaceChildren(...results.map(r => {
      const a = el('a', 'result');
      a.href = safeUrl(r.url);
      a.append(el('span', 'kind', kindLabel(r)), el('span', 'title', r.title));
      if (r.title_th) {
        const th = el('span', 'title-th', r.title_th);
        th.lang = 'th';
        a.append(th);
      }
      if (r.snippet && r.snippet.text) a.append(snippetNode(r.snippet));
      else if (r.summary) a.append(el('span', 'summary', r.summary));
      const li = el('li');
      li.append(a);
      return li;
    }));
  }

  // ── Wiring ────────────────────────────────────────────────────────────────

  let shown = ''; // the query whose results are on screen
  let timer = null;

  function remember(q) {
    const url = q ? `${location.pathname}?q=${encodeURIComponent(q)}` : location.pathname;
    history.replaceState(null, '', url);
  }

  async function run(q) {
    if (q === shown) return;
    shown = q;
    remember(q);
    if (!searchable(q)) {
      list.replaceChildren();
      status.textContent = '';
      fallbackNote.hidden = true;
      return;
    }
    status.textContent = 'Searching…';
    let results;
    let simple = !live;
    if (live) {
      try {
        results = (await fromApi(q)).results;
      } catch (e) {
        if (e.name === 'AbortError' && shown !== q) return; // a newer search took over
        simple = true;
      }
    }
    if (simple) results = await simpleSearch(q);
    if (shown !== q) return; // typed on meanwhile
    draw(results);
    fallbackNote.hidden = !simple;
    status.textContent = results.length
      ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
      : 'Nothing found. Try a saint’s name, a prayer, or a word in Thai.';
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(normalize(input.value)), PAUSE_MS);
  });
  input.form.addEventListener('submit', e => {
    e.preventDefault();
    clearTimeout(timer);
    input.blur(); // on phones, put the keyboard away to show the results
    run(normalize(input.value));
  });

  // A shared or reloaded search: ?q=… fills the box and searches at once.
  const start = new URLSearchParams(location.search).get('q');
  if (start) {
    input.value = start;
    run(normalize(start));
  } else {
    input.focus({ preventScroll: true });
  }
})();
