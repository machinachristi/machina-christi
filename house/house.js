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
  // The owner's choice (25 Nov): three wings. Logos belongs to Wander now,
  // found in the garden like Camino; Gather's rooms are set aside for now,
  // so they light no wing.
  const WINGS = [
    ['Pray', '/house/pray.html'],
    ['Wander', '/world.html#enter'],
    ['Build', '/house/build.html'],
  ];
  const WING_OF = [
    [/^\/(house\/pray|ordo|pray|prayer|about-ordo|about-pray)\.html$|^\/pray\//, 'Pray'],
    [/^\/(about-eden|about-camino|logos|about-logos|house\/hornbook)\.html$/, 'Wander'],
    [/^\/(house\/(build|take-a-section|builders|rule|new)|workshop|about-workshop)\.html$/, 'Build'],
  ];
  const wingHere = (WING_OF.find(([re]) => re.test(PAGE)) || [])[1];
  if (wrap && !DOOR) {
    const hall = make('footer', { class: 'hall', id: 'hall' });
    const nav = make('nav', { class: 'hall__wings', 'aria-label': 'The wings of the house' });
    WINGS.forEach(([name, href]) => {
      const a = make('a', { href });
      a.textContent = name;
      if (name === wingHere) a.setAttribute('aria-current', href === PAGE ? 'page' : 'true');
      nav.append(a);
    });
    const more = make('p', { class: 'hall__more' },
      '<a href="/index.html">home</a> &middot; <a href="/about.html">about</a> &middot; <a href="/search.html">search</a>');
    hall.append(nav, more);
    wrap.append(hall);
    // A link to #hall (from the tour) finds it even though it arrived late.
    if (location.hash === '#hall') addEventListener('load', () => hall.scrollIntoView({ block: 'end' }));
  }

  // ── X9: rooms that point to their neighbours ────────────────────────
  // Letters lead to prayers, a prayer leads to its letters, and the
  // Church's day leads to the day's prayer. One quiet "next door" card at
  // the end of the room, just before the hallway.
  const nextDoor = ({ label, title, desc, href, glow }) => {
    const a = make('a', { class: 'house-next', href, style: `--next: var(${glow})` });
    a.append(make('span', { class: 'house-next__label' }), make('span', { class: 'house-next__title' }), make('span', { class: 'house-next__desc' }));
    a.children[0].textContent = label;
    a.children[1].textContent = title;
    a.children[2].textContent = desc;
    return a;
  };
  const beforeHall = (el, anchor) => {
    if (anchor) anchor.before(el);
    else if (document.getElementById('hall')) document.getElementById('hall').before(el);
    else if (wrap) wrap.append(el);
  };
  // The same weekday prayers as "Pray today" on the front door (AB#143).
  const PRAY_TODAY = [
    ['mass', 'The Mass'], ['glory-be', 'Glory Be'], ['angel-of-god', 'Angel of God'],
    ['our-father', 'The Our Father'], ['lord-i-am-not-worthy', 'Lord, I Am Not Worthy'],
    ['o-blood-and-water', 'O Blood and Water'], ['hail-mary', 'The Hail Mary'],
  ];

  if (PAGE === '/logos.html') {
    beforeHall(nextDoor({
      label: 'Next door', title: 'The prayers, in Thai',
      desc: 'read them with the letters you learn here', href: '/pray.html', glow: '--marian',
    }), document.querySelector('.wrap .foot'));
  }

  if (PAGE === '/ordo.html') {
    const [id, name] = PRAY_TODAY[new Date().getDay()];
    beforeHall(nextDoor({
      label: 'Next door', title: 'Pray today: ' + name,
      desc: 'one prayer for each day of the week', href: '/pray/' + id + '.html', glow: '--marian',
    }));
  }

  // A prayer's own page: its first letter, with that letter's key word from
  // Logos (only Thai already on the site), leading to the alphabet.
  if (/^\/pray\/[a-z-]+\.html$/.test(PAGE)) {
    const card = nextDoor({
      label: 'Next door', title: 'Its letters',
      desc: 'learn to read this prayer, letter by letter, in Logos', href: '/logos.html#alphabet', glow: '--lacquer',
    });
    beforeHall(card, null);
    const lines = document.getElementById('lines');
    const firstLetter = () => {
      const th = lines && lines.querySelector('.line [lang="th"]');
      const m = th && th.textContent.match(/[ก-ฮ]/);   // skip vowels written before it
      return m && m[0];
    };
    const name = letter => fetch('/logos/thai.json')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const c = data && data.consonants.find(x => x.letter === letter);
        if (!c) return;
        const desc = card.querySelector('.house-next__desc');
        desc.textContent = '';
        desc.append('It begins with ', make('span', { lang: 'th' }), ', as in ', make('span', { lang: 'th' }),
          ` (${c.meaning}): learn its letters in Logos`);
        desc.children[0].textContent = c.letter;
        desc.children[1].textContent = c.word;
      })
      .catch(() => { /* the plain words stay */ });
    // The prayer's lines are drawn by the page a moment after it opens.
    const tryNow = () => { const l = firstLetter(); if (l) { name(l); return true; } return false; };
    if (lines && !tryNow()) {
      const watch = new MutationObserver(() => { if (tryNow()) watch.disconnect(); });
      watch.observe(lines, { childList: true, subtree: true });
    }
  }

  // ── X11: the Church's season through the whole house ────────────────
  // On machinachristi.com, assets/season.js asks the season service and
  // colours the house (the thin glow at the top, the season line). house.css
  // carries that colour further: the gold rules under every title, the
  // verse bars and the hallway. Previews can't ask the service, so the tour
  // has a switch; the choice stays on this phone while you walk room to room.
  const SEASON_RGB = {
    green: '120, 178, 116', violet: '156, 118, 206', rose: '226, 150, 178',
    white: '238, 232, 214', red: '206, 74, 64',
  };
  const PREVIEW_SEASONS = {
    advent:    { key: 'advent', name: 'Advent', week: 1, feast: 'First Sunday of Advent', color: 'violet' },
    gaudete:   { key: 'advent', name: 'Advent', week: 3, feast: 'Gaudete Sunday', color: 'rose' },
    christmas: { key: 'christmas', name: 'Christmas', feast: 'The Nativity of the Lord', color: 'white' },
    lent:      { key: 'lent', name: 'Lent', week: 1, feast: 'First Sunday of Lent', color: 'violet' },
    easter:    { key: 'easter', name: 'Easter', week: 1, feast: 'Easter Sunday', color: 'white' },
    pentecost: { key: 'easter', name: 'Easter', week: 8, feast: 'Pentecost Sunday', color: 'red' },
    ordinary:  { key: 'ordinary', name: 'Ordinary Time', week: 33, color: 'green' },
  };
  const root = document.documentElement;
  const showSeason = choice => {
    const s = PREVIEW_SEASONS[choice];
    for (const el of document.querySelectorAll('.mc-season-glow')) el.remove();
    if (!s) {
      delete root.dataset.season; delete root.dataset.seasonColor;
      root.style.removeProperty('--season');
      for (const el of document.querySelectorAll('[data-season-line]')) el.hidden = true;
      return;
    }
    root.style.setProperty('--season', SEASON_RGB[s.color]);
    root.dataset.season = s.key;
    root.dataset.seasonColor = s.color;
    document.body.append(make('div', { class: 'mc-season-glow', 'aria-hidden': 'true' }));
    for (const el of document.querySelectorAll('[data-season-line]')) {
      el.textContent = s.week ? `${s.name} · Week ${s.week}` : s.name;
      if (s.feast) {
        const f = make('span', { class: 'mc-season-feast' });
        f.textContent = s.feast;
        el.append(f);
      }
      el.hidden = false;
    }
  };
  window.mcHouse.seasons = Object.keys(PREVIEW_SEASONS);
  window.mcHouse.setSeason = choice => {
    if (choice) store.set('season', choice); else store.clear('season');
    showSeason(choice);
  };
  if (!LIVE) showSeason(store.get('season'));

  // ── X12: "what's new in the house", one step from every room ────────
  const hallMore = document.querySelector('.hall__more');
  if (hallMore) hallMore.insertAdjacentHTML('beforeend', ' &middot; <a href="/house/new.html">what&rsquo;s new</a>');

  // ── X14: Logos as a hornbook, one tap from the schoolroom ───────────
  if (PAGE === '/logos.html') {
    const why = document.querySelector('.wrap .house-why');
    const link = make('a', { class: 'house-go house-hornbook', href: '/house/hornbook.html' },
      '<svg viewBox="0 0 14 18" aria-hidden="true"><path d="M7 1.5 V16.5 M2.5 6 H11.5" /></svg> The hornbook: from the cross to the Our Father &rsaquo;');
    if (why) why.after(link);
  }

  // ── X18: the Angelus bell, at six, noon and six in Chiang Mai ────────
  // For a quarter of an hour after each, a slim banner on every page
  // invites a minute's prayer. The bell itself sounds only when tapped
  // (phones never let a page make sound on its own), drawn in the browser
  // from a bell's own overtones, so there is no sound file to download.
  // Robots driving a browser (navigator.webdriver: the tests) never see it.
  const ANGELUS = [[360, 'six in the morning', '06:00'], [720, 'noon', '12:00'], [1080, 'six in the evening', '18:00']];
  const chiangMai = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return { min: +p.hour * 60 + +p.minute, date: `${p.year}-${p.month}-${p.day}` };
  };
  window.mcHouse.nextAngelus = () => {
    const t = chiangMai();
    const next = ANGELUS.find(([at]) => at > t.min) || ANGELUS[0];
    let wait = next[0] - t.min;
    if (wait <= 0) wait += 1440;
    const h = Math.floor(wait / 60), m = wait % 60;
    const inText = 'in ' + [h && `${h} hour${h > 1 ? 's' : ''}`, m && `${m} minute${m > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
    return { time: next[2], inText };
  };

  // The bell: the Angelus pattern, three strokes three times, then nine.
  let bell = null;
  window.mcHouse.stopBell = () => {
    if (bell) { bell.close().catch(() => {}); bell = null; }
    if (window.mcHouse.onBellStop) window.mcHouse.onBellStop();
  };
  window.mcHouse.ringBell = () => {
    window.mcHouse.stopBell();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return 0;
    bell = new AC();
    const ctx = bell;
    const out = ctx.createGain();
    out.gain.value = 0.2;
    out.connect(ctx.destination);
    // A church bell's partials: hum, prime, tierce, quint, nominal and above.
    const PARTIALS = [[0.5, 0.5, 4.5], [1, 0.8, 3.2], [1.2, 0.45, 2.6], [1.5, 0.3, 2.2], [2, 0.55, 2.4], [2.5, 0.22, 1.6], [3, 0.18, 1.3], [4, 0.1, 1]];
    const strike = (at, f) => {
      for (const [ratio, gain, decay] of PARTIALS) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f * ratio;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        o.connect(g); g.connect(out);
        o.start(at); o.stop(at + decay + 0.05);
      }
    };
    let t = ctx.currentTime + 0.1;
    [3, 3, 3, 9].forEach((n, group) => {
      for (let i = 0; i < n; i++) { strike(t, 392); t += group === 3 ? 1.25 : 1.5; }
      if (group < 3) t += 2.2;
    });
    const seconds = t - ctx.currentTime + 2;
    setTimeout(() => { if (bell === ctx) window.mcHouse.stopBell(); }, seconds * 1000);
    return seconds;
  };

  const angelusNow = () => {
    if (navigator.webdriver) return null;
    if (!LIVE && store.get('angelus_until', 0) > Date.now()) return { key: 'switch', label: 'rung from the show home’s switch' };
    const t = chiangMai();
    const hit = ANGELUS.find(([at]) => t.min >= at && t.min < at + 15);
    return hit && { key: `${t.date}-${hit[0]}`, label: `${hit[1]} in Chiang Mai` };
  };
  const ringing = PAGE !== '/house/angelus.html' && angelusNow();
  if (ringing && store.get('angelus_closed') !== ringing.key) {
    const bar = make('div', { class: 'house-angelus', role: 'region', 'aria-label': 'The Angelus' });
    bar.innerHTML = '<svg viewBox="0 0 48 64" aria-hidden="true"><circle cx="24" cy="12.5" r="2.4" /><path d="M24 15 V18.5" /><path d="M14.5 44 C15 32 17 18.5 24 18.5 C31 18.5 33 32 33.5 44" /><path d="M11 44 H37" /><circle cx="24" cy="49.5" r="2.6" /></svg>';
    const text = make('span', { class: 'house-angelus__text' });
    text.textContent = 'The Angelus · ' + ringing.label;
    const pray = make('a', { href: '/house/angelus.html' }, 'Pray it &rsaquo;');
    const close = make('button', { type: 'button', 'aria-label': 'Close the Angelus banner' }, '&times;');
    close.addEventListener('click', () => { store.set('angelus_closed', ringing.key); bar.remove(); });
    bar.append(text, pray, close);
    document.body.append(bar);
  }
  // The preview's switch (on the tour): ring now, and show the banner on
  // every page for ten minutes.
  window.mcHouse.ringNow = () => {
    store.set('angelus_until', Date.now() + 10 * 60e3);
    store.clear('angelus_closed');
    return window.mcHouse.ringBell();
  };

  // ── X21: a pilgrim passport, a stamp in each room ───────────────────
  // Like the credencial pilgrims carry on the Camino: visiting a room
  // stamps it, with the day. Kept only on this phone, never sent anywhere.
  // Eden itself is left alone, so its stamp is given on the way in. The
  // Chiang Mai list never stamps: a visit there is nobody's business.
  const ROOMS = [
    ['ordo', 'Ordo', '/ordo.html', /^\/ordo\.html$/],
    ['prayers', 'Prayers', '/pray.html', /^\/pray\.html$/],
    ['mass', 'The Mass', '/pray/mass.html', /^\/pray\/mass\.html$/],
    ['a-prayer', 'A prayer', '/pray/our-father.html', /^\/pray\/(?!mass\.html)[a-z-]+\.html$/],
    ['logos', 'Logos', '/logos.html', /^\/logos\.html$/],
    ['hornbook', 'The hornbook', '/house/hornbook.html', /^\/house\/hornbook\.html$/],
    ['eden', 'Eden', '/world.html#enter', null],
    ['workshop', 'Workshop', '/workshop.html', /^\/workshop\.html$/],
    ['about', 'About', '/about.html', /^\/about\.html$/],
    ['rule', 'The rule', '/house/rule.html', /^\/house\/rule\.html$/],
    ['hall', 'The hall', '/house/gather.html', /^\/house\/gather\.html$/],
    ['candles', 'Candles', '/house/candles.html', /^\/house\/candles\.html$/],
    ['angelus', 'The Angelus', '/house/angelus.html', /^\/house\/angelus\.html$/],
    ['seasons', 'The seasons', '/house/seasons.html', /^\/house\/seasons\.html$/],
    ['invitations', 'Invitations', '/house/invitations.html', /^\/house\/invitations\.html$/],
    ['take-a-section', 'Take a section', '/house/take-a-section.html', /^\/house\/take-a-section\.html$/],
    ['builders', 'Builders', '/house/builders.html', /^\/house\/builders\.html$/],
  ];
  const stamp = id => {
    const book = store.get('passport', {});
    if (book[id]) return;
    book[id] = chiangMai().date;
    store.set('passport', book);
  };
  const roomHere = ROOMS.find(r => r[3] && r[3].test(PAGE));
  if (roomHere) stamp(roomHere[0]);
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href*="world.html"]');
    if (a) stamp('eden');
  }, true);
  window.mcHouse.passport = {
    rooms: ROOMS.map(([id, name, href]) => ({ id, name, href })),
    read: () => store.get('passport', {}),
    clear: () => store.clear('passport'),
  };
})();
