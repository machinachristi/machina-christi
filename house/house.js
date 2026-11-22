// The show home's shared threads (experiment, never merged: AB#171).
//
// One small script that every page of the show home loads. Each idea that
// runs through the whole house adds its own section below, in the order the
// ideas were built (X3 verses, X8 hallway, X9 next doors, X11 season, X18
// Angelus, X21 passport), so each idea's commit shows exactly what it adds.
//
// Preview-only parts (the "show home" sign, the switches on the tour page)
// appear only away from machinachristi.com. Nothing here sends anything
// anywhere: what it remembers stays in this phone's own storage.
(() => {
  'use strict';

  const LIVE = ['machinachristi.com', 'www.machinachristi.com'].includes(location.hostname);
  const PAGE = location.pathname === '/' ? '/index.html' : location.pathname;
  const DOOR = PAGE === '/index.html';
  const wrap = document.querySelector('.wrap');

  // This phone's own notebook. It can refuse (private mode, blocked site
  // data); then the show home simply forgets.
  const store = {
    get(key, fallback = null) {
      try {
        const v = JSON.parse(localStorage.getItem('house_' + key));
        return v === null ? fallback : v;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('house_' + key, JSON.stringify(value)); } catch { /* fine: it forgets */ }
    },
    clear(key) {
      try { localStorage.removeItem('house_' + key); } catch { /* fine */ }
    },
  };

  const make = (tag, attrs = {}, html = '') => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (html) el.innerHTML = html;
    return el;
  };

  window.mcHouse = { LIVE, PAGE, DOOR, store, make };

  // ── The "show home" sign (preview only) ─────────────────────────────
  // A small dashed sign at the top of every page, so a screenshot of the
  // preview can never be mistaken for the live site; it opens the tour.
  if (!LIVE && (DOOR || wrap) && PAGE !== '/house/tour.html') {
    const pill = make('a', {
      class: 'house-pill' + (DOOR ? ' house-pill--door' : ''),
      href: '/house/tour.html',
      'aria-label': 'Show home: the tour of every idea (preview only)',
    }, 'show home &rsaquo;');
    (DOOR ? document.body : wrap).appendChild(pill);
  }
})();
