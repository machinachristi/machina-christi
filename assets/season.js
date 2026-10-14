// The Church's season, shown as a quiet accent: a thin glow along the top of
// the page in the day's liturgical colour, and the season's name wherever a
// page has a [data-season-line] element. The answer comes from the season API
// (/api/season), which Cloudflare caches per date.
//
// Gold stays the brand colour; this only adds to it. Any failure (offline,
// preview hosts the API doesn't serve, blocked storage) leaves the page
// exactly as it was.
//
// Only on the live site, like telemetry.js: the API answers only
// machinachristi.com (CORS), so anywhere else (local, previews, tests) the
// page simply stays as it is. Tests that need the accent serve the pages as
// the live site and stand in for the API.
//
// By default it shows the visitor's own today. A page that shows another day
// (Ordo's date browser) sets <html data-season-date="YYYY-MM-DD">, and the
// accent follows it.
//
// The answer also names the day's saint, when there is one (from the saints
// snapshot the API publishes from the database). The season line links it to
// Ordo, and Ordo reads the saint's bio through window.mcSeason.get(date).
(() => {
  'use strict';

  const LIVE_HOSTS = ['machinachristi.com', 'www.machinachristi.com'];
  if (!LIVE_HOSTS.includes(location.hostname)) return;

  const API = 'https://api.machinachristi.com/api/season';
  const TIMEOUT_MS = 5000;
  const STORE_PREFIX = 'mc_season_';

  // Liturgical colours tuned for the site's near-black background
  // (rgb parts, used as rgba(var(--season), a) like the pages' own colours).
  const RGB = {
    green: '120, 178, 116',
    violet: '156, 118, 206',
    rose: '226, 150, 178',
    white: '238, 232, 214',
    red: '206, 74, 64',
  };

  const root = document.documentElement;
  const pad = n => String(n).padStart(2, '0');
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // localStorage can throw (private mode, blocked site data); it's only a
  // convenience so a second page in the same day doesn't ask again.
  function readStored(key) {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_PREFIX + key));
      return valid(v) ? v : null;
    } catch { return null; }
  }
  function store(key, v) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORE_PREFIX) && k !== STORE_PREFIX + key) localStorage.removeItem(k);
      }
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(v));
    } catch { /* fine: it's only a convenience */ }
  }

  function valid(v) {
    return Boolean(v && v.season && typeof v.season.name === 'string' && RGB[v.color]);
  }

  const pending = new Map();
  function get(key) {
    const stored = readStored(key);
    if (stored) return Promise.resolve(stored);
    if (!pending.has(key)) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      pending.set(key, fetch(`${API}?date=${key}`, { signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : null))
        .then(v => {
          if (!valid(v)) return null;
          if (key === today()) store(key, v);
          return v;
        })
        .catch(() => null)
        .finally(() => { clearTimeout(timer); pending.delete(key); }));
    }
    return pending.get(key);
  }

  // "Ordinary Time · Week 28", "Lent · Week 4", "Christmas" — plus the day's
  // feast when one replaces the weekday, unless it only restates the season
  // ("28th Sunday of Ordinary Time"). A saint's day (optional memorials too)
  // becomes a link to Ordo, under the saint's short name ("Saint Agnes").
  function label(v) {
    const { name, week } = v.season;
    const season = week ? `${name} · Week ${week}` : name;
    const c = v.celebration;
    const saint = v.saint && v.saint.feast;
    if (saint && /^Saints?\b/.test(saint)) return { season, feast: saint.replace(/,.*$/, ''), full: saint };
    if (c && !c.optional && !/Sunday of |Weekday/.test(c.name)) return { season, feast: c.name };
    return { season };
  }

  function ensureStyle() {
    if (document.getElementById('mc-season-style')) return;
    const style = document.createElement('style');
    style.id = 'mc-season-style';
    style.textContent = `
      .mc-season-glow {
        position: fixed; top: 0; left: 0; right: 0; height: 2px;
        pointer-events: none; z-index: 2147483000;
        background: linear-gradient(90deg, transparent, rgba(var(--season), 0.85) 30%, rgba(var(--season), 0.85) 70%, transparent);
        box-shadow: 0 0 14px 1px rgba(var(--season), 0.4);
        opacity: 0; transition: opacity 1.2s ease, background 1.2s ease;
      }
      html[data-season] .mc-season-glow { opacity: 1; }
      [data-season-line] {
        font-size: 14px; letter-spacing: 0.08em; line-height: 1.5;
        color: rgba(var(--season), 0.92);
        opacity: 0; transition: opacity 1s ease;
      }
      html[data-season] [data-season-line]:not([hidden]) { opacity: 1; }
      [data-season-line] .mc-season-feast { display: block; color: rgba(232, 213, 163, 0.72); }
      [data-season-line] .mc-season-feast a {
        display: inline-block; padding: 4px 10px; min-height: 32px;
        color: rgba(232, 213, 163, 0.88); text-decoration: none;
        text-decoration-line: underline; text-decoration-color: rgba(var(--season), 0.45);
        text-underline-offset: 4px;
      }
      [data-season-line] .mc-season-feast a:hover,
      [data-season-line] .mc-season-feast a:focus-visible { color: #f3e3b4; text-decoration-color: rgba(var(--season), 0.9); }
      @media (prefers-reduced-motion: reduce) {
        .mc-season-glow, [data-season-line] { transition: none; }
      }`;
    document.head.appendChild(style);
  }

  function apply(v) {
    ensureStyle();
    if (!document.querySelector('.mc-season-glow')) {
      const glow = document.createElement('div');
      glow.className = 'mc-season-glow';
      glow.setAttribute('aria-hidden', 'true');
      document.body.appendChild(glow);
    }
    root.style.setProperty('--season', RGB[v.color]);
    root.dataset.season = v.season.key;
    root.dataset.seasonColor = v.color;
    const { season, feast, full } = label(v);
    for (const el of document.querySelectorAll('[data-season-line]')) {
      el.textContent = season;
      if (feast) {
        const f = document.createElement('span');
        f.className = 'mc-season-feast';
        if (full) {
          // A saint's day: a link to Ordo, open on the same day this line shows.
          const a = document.createElement('a');
          a.href = v.date === today() ? '/ordo.html' : `/ordo.html?date=${v.date}`;
          a.setAttribute('aria-label', `${full}: read about the saint of the day in Ordo`);
          a.textContent = feast;
          const arrow = document.createElement('span');
          arrow.setAttribute('aria-hidden', 'true');
          arrow.textContent = ' ›';
          a.appendChild(arrow);
          f.appendChild(a);
        } else {
          f.textContent = feast;
        }
        el.appendChild(f);
      }
      el.hidden = false;
    }
  }

  function clear() {
    delete root.dataset.season;
    delete root.dataset.seasonColor;
    for (const el of document.querySelectorAll('[data-season-line]')) el.hidden = true;
  }

  let shown = null;
  function refresh() {
    const key = /^\d{4}-\d{2}-\d{2}$/.test(root.dataset.seasonDate || '') ? root.dataset.seasonDate : today();
    if (key === shown) return;
    shown = key;
    get(key).then(v => {
      if (shown !== key) return; // a newer date was asked for meanwhile
      if (v) apply(v); else clear();
    });
  }

  // For pages that want the whole answer (Ordo's saint bios): a promise of
  // the API's answer for that date, or null.
  window.mcSeason = { get };

  refresh();
  new MutationObserver(refresh).observe(root, { attributes: true, attributeFilter: ['data-season-date'] });
})();
