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

  // ── X3: a verse over every door, and a "why" line ───────────────────
  // "And thou shalt write them in the entry, and on the doors of thy house"
  // (Deuteronomy 6:9). Today's rooms get theirs here, in one table that is
  // easy to read and change; the new wing pages carry their own. Verses are
  // Douay-Rheims, checked word for word. Eden itself is left alone in the
  // show home, so Wander's verse hangs on Eden's About page instead.
  const DOORS = {
    '/ordo.html': {
      verse: 'This is the day which the Lord hath made: let us be glad and rejoice therein.',
      ref: 'Psalm 117:24',
      why: 'The quietest room in the house: what the Church keeps today, its Gospel, and a prayer for the day.',
    },
    '/pray.html': {
      verse: 'Lord, teach us to pray, as John also taught his disciples.',
      ref: 'Luke 11:1',
      why: 'The Church’s own prayers in Thai and English, line by line, so they can be prayed together.',
    },
    '/pray/mass.html': {
      verse: 'This is my body, which is given for you.',
      ref: 'Luke 22:19',
      why: 'The people’s prayers at Mass in Thai and English, in the order they come, to follow in a Thai church.',
    },
    '/logos.html': {
      verse: 'Faith then cometh by hearing; and hearing by the word of Christ.',
      ref: 'Romans 10:17',
      why: 'The schoolroom: Thai letters, heard and then read, so the prayers next door can be read.',
    },
    '/about-eden.html': {
      verse: 'I John saw the holy city, the new Jerusalem, coming down out of heaven from God…',
      ref: 'Apocalypse 21:2',
      why: 'The garden at the Bible’s beginning, the city at its end, and the road between them to wander.',
    },
  };
  const door = DOORS[PAGE];
  const title = document.querySelector('.wrap h1');
  if (door && title) {
    const after = title.nextElementSibling && title.nextElementSibling.classList.contains('subtitle')
      ? title.nextElementSibling : title;
    const fig = make('figure', { class: 'house-verse' });
    fig.append(make('blockquote'), make('figcaption'));
    fig.firstChild.textContent = door.verse;
    fig.lastChild.textContent = '— ' + door.ref + ' (Douay-Rheims)';
    const why = make('p', { class: 'house-why' });
    why.textContent = door.why;
    after.after(fig, why);
  }

  // ── X8: the hallway ─────────────────────────────────────────────────
  // The same footer at the foot of every room: the five wings, then home,
  // about and search. The wing you are in is lit. (Not on the front door,
  // which is the hallway's own hub, nor on full-screen rooms without a
  // .wrap column, which keep their own way out.)
  const WINGS = [
    ['Pray', '/house/pray.html'],
    ['Learn', '/logos.html'],
    ['Wander', '/world.html#enter'],
    ['Gather', '/house/gather.html'],
    ['Build', '/house/build.html'],
  ];
  const WING_OF = [
    [/^\/(house\/pray|ordo|pray|prayer|about-ordo|about-pray)\.html$|^\/pray\//, 'Pray'],
    [/^\/(logos|about-logos|house\/hornbook)\.html$/, 'Learn'],
    [/^\/(about-eden|about-camino)\.html$/, 'Wander'],
    [/^\/house\/(gather|chiang-mai|candles|angelus|seasons|invitations|passport)\.html$/, 'Gather'],
    [/^\/(house\/(build|take-a-section|builders|rule|new)|workshop|about-workshop)\.html$/, 'Build'],
  ];
  const wingHere = (WING_OF.find(([re]) => re.test(PAGE)) || [])[1];
  if (wrap && !DOOR) {
    const hall = make('footer', { class: 'hall', id: 'hall' });
    const nav = make('nav', { class: 'hall__wings', 'aria-label': 'The wings of the house' });
    WINGS.forEach(([name, href], i) => {
      const a = make('a', { href });
      a.textContent = name;
      if (name === wingHere) a.setAttribute('aria-current', href === PAGE ? 'page' : 'true');
      nav.append(a);
      if (i === 2) nav.append(make('span', { class: 'hall__br', 'aria-hidden': 'true' }));
    });
    const more = make('p', { class: 'hall__more' },
      '<a href="/index.html">home</a> &middot; <a href="/about.html">about</a> &middot; <a href="/search.html">search</a>');
    hall.append(nav, more);
    wrap.append(hall);
    // A link to #hall (from the tour) finds it even though it arrived late.
    if (location.hash === '#hall') addEventListener('load', () => hall.scrollIntoView({ block: 'end' }));
  }
})();
