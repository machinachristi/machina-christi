// Where the Pray pages get their prayers: the site's own copy,
// pray/prayers.json, answers first and at once, everywhere. On the live site
// the API (which reads the prayers from Cosmos DB, with each prayer's
// recordings and line timings) is asked at the same time, quietly, and its
// answer is handed to the page when it arrives. The API sleeps when nobody
// calls and can take seconds to wake, so the page never waits for it.
//
//   window.mcPray.list(onNewer)        → [{ id, title, title_th, about, listed }]
//       onNewer(list) is called later only if the API's list differs.
//       `listed` is false for a part shown only inside The Mass.
//   window.mcPray.get(id, onNewer)     → the prayer, or null if there's no such one
//       onNewer(prayer) is called later with the API's copy, which carries
//       the recordings the bundled copy doesn't have.
//   window.mcPray.audioUrl(file)       → where a recording is played from
//   window.mcPray.expand(data)         → prayers.json with The Mass expanded
//
// The recordings themselves live in private storage; visitors hear them
// through the API (/api/audio/…), never from storage directly.
(() => {
  'use strict';

  // A prayer made of other prayers (The Mass): its `parts` name them by id,
  // or as { id, amen: false } to leave out a part's closing Amen. Expanded
  // exactly as the publisher does (functions/src/lib/prayers.js, expand): the
  // parts' lines in order, and where each part starts with what its heading
  // needs. tests/pray.spec.js checks the two give the same lines.
  const AMEN = /^(อาเมน|อาแมน)$/;
  const partRef = x => (typeof x === 'string' ? { id: x } : x);
  const madeOfParts = p => Array.isArray(p.parts) && p.parts.every(x => typeof x === 'string' || (x && typeof x.id === 'string' && !('start' in x)));
  function expand(data) {
    const byId = new Map(data.prayers.map(p => [p.id, p]));
    const prayers = data.prayers.map(p => {
      if (!madeOfParts(p)) return p;
      const lines = [];
      const parts = p.parts.map(partRef).map(({ id, amen }) => {
        const part = byId.get(id);
        if (!part || part.parts) throw new Error(`${p.id}: no plain prayer "${id}" to be its part`);
        let own = part.lines;
        if (amen === false && AMEN.test((own[own.length - 1] || {}).th || '')) own = own.slice(0, -1);
        const { title, title_th, about, source, source_en } = part;
        const at = { id, title, title_th, about, source, source_en, start: lines.length };
        lines.push(...own);
        return at;
      });
      return { ...p, lines, parts };
    });
    return { ...data, prayers };
  }

  const LIVE_HOSTS = ['machinachristi.com', 'www.machinachristi.com'];
  const live = LIVE_HOSTS.includes(location.hostname);
  const API = 'https://api.machinachristi.com/api';
  // Nobody waits on this any more; it only stops a call that never answers.
  const TIMEOUT_MS = 20000;

  async function fromApi(pathname) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(API + pathname, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`API ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  let bundled = null;
  function bundle() {
    bundled ??= fetch('/pray/prayers.json').then(r => (r.ok ? r.json() : Promise.reject(new Error(`prayers.json ${r.status}`)))).then(expand);
    bundled.catch(() => { bundled = null; }); // a failed read is tried again next time
    return bundled;
  }

  // Show the bundled answer now; on the live site, ask the API alongside and
  // pass its answer to onNewer when it is a real one that differs. If the
  // bundled copy can't be read, the API's answer is shown instead. `adopt`
  // shapes the API's answer like the bundled one before they're compared.
  function bundledFirst({ path, valid, pick, same, adopt = a => a }, onNewer) {
    const api = live ? fromApi(path).then(a => (valid(a) ? a : Promise.reject(new Error('empty')))) : null;
    if (api) api.catch(() => {}); // an API that doesn't answer is no error: the bundled copy stands
    return bundle().then(pick, err => (api ? api.then(a => adopt(a, null)) : Promise.reject(err))).then(shown => {
      if (api && onNewer) api.then(a => { const b = adopt(a, shown); if (!same(b, shown)) onNewer(b); }, () => {});
      return shown;
    });
  }

  const card = ({ id, title, title_th, about, listed }) => ({ id, title, title_th, about, listed: listed !== false });
  const cards = list => JSON.stringify(list.map(card));

  // An API that predates `listed` (for a few minutes after a deploy, the
  // pages and the API change at different moments) says nothing about it:
  // then the bundled copy's word stands, so a part shown only inside The Mass
  // never appears on the list.
  const list = onNewer => bundledFirst({
    path: '/prayers',
    valid: a => Array.isArray(a) && a.length > 0,
    pick: data => data.prayers.map(card),
    adopt: (a, shown) => a.map(p => card(p.listed !== undefined ? p : { ...p, listed: ((shown || []).find(s => s.id === p.id) || {}).listed })),
    same: (a, b) => cards(a) === cards(b),
  }, onNewer);

  const get = (id, onNewer) => bundledFirst({
    path: `/prayers/${encodeURIComponent(id)}`,
    valid: a => !!a && Array.isArray(a.lines),
    pick: data => data.prayers.find(p => p.id === id) || null,
    same: (a, b) => a === b, // the API's copy adds the recordings, so the page always hears of it
  }, onNewer);

  const audioUrl = file => `${API}/audio/${file.split('/').map(encodeURIComponent).join('/')}`;

  window.mcPray = { list, get, audioUrl, expand };
})();
