// Where the Pray pages get their prayers: the API (which reads them from
// Cosmos DB, with each prayer's recordings and line timings) on the live site,
// and the site's own copy, pray/prayers.json, everywhere else and whenever
// the API can't answer. The bundled copy has the words but no recordings, so
// then the page reads aloud with the device's own voice, as before.
//
//   window.mcPray.list()          → [{ id, title, title_th, about }]
//   window.mcPray.get(id)         → the prayer, or null if there's no such one
//   window.mcPray.audioUrl(file)  → where a recording is played from
//
// The recordings themselves live in private storage; visitors hear them
// through the API (/api/audio/…), never from storage directly.
(() => {
  'use strict';

  const LIVE_HOSTS = ['machinachristi.com', 'www.machinachristi.com'];
  const live = LIVE_HOSTS.includes(location.hostname);
  const API = 'https://api.machinachristi.com/api';
  const TIMEOUT_MS = 5000;

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
    bundled ??= fetch('/pray/prayers.json').then(r => (r.ok ? r.json() : Promise.reject(new Error(`prayers.json ${r.status}`))));
    bundled.catch(() => { bundled = null; }); // a failed read is tried again next time
    return bundled;
  }

  async function list() {
    if (live) {
      try {
        const prayers = await fromApi('/prayers');
        if (Array.isArray(prayers) && prayers.length) return prayers;
      } catch (e) { /* the bundled copy answers */ }
    }
    const data = await bundle();
    return data.prayers.map(({ id, title, title_th, about }) => ({ id, title, title_th, about }));
  }

  async function get(id) {
    if (live) {
      try {
        const prayer = await fromApi(`/prayers/${encodeURIComponent(id)}`);
        if (prayer && Array.isArray(prayer.lines)) return prayer;
      } catch (e) { /* not published (yet), or the API is down: the bundled copy answers */ }
    }
    const data = await bundle();
    return data.prayers.find(p => p.id === id) || null;
  }

  const audioUrl = file => `${API}/audio/${file.split('/').map(encodeURIComponent).join('/')}`;

  window.mcPray = { list, get, audioUrl };
})();
