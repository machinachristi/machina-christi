// Logos: the shared engine behind the Logos pages (logos.html and cards.html).
//
//   window.mcLogos.load()            → the Thai cards (logos/thai.json)
//   window.mcLogos.lesson(data, id)  → { lesson, cards } for middle/high/low/all
//   window.mcLogos.progress          → the box system (spaced repetition)
//   window.mcLogos.speak(card, slow) → say a card's name aloud
//
// The cards are one small file in the site, not a database: 44 cards that
// never change while someone studies them. Progress (which box each card is
// in) stays in this browser only (localStorage); nothing is sent anywhere.
(() => {
  'use strict';

  let loaded = null;
  function load() {
    loaded ??= fetch('/logos/thai.json').then(r => (r.ok ? r.json() : Promise.reject(new Error(`thai.json ${r.status}`))));
    loaded.catch(() => { loaded = null; }); // a failed read is tried again next time
    return loaded;
  }

  function lesson(data, id) {
    const found = data.lessons.find(l => l.id === id);
    if (!found) return null;
    return { lesson: found, cards: data.cards.filter(c => !found.class || c.class === found.class) };
  }

  // ── The box system (Leitner boxes) ─────────────────────────────────────────
  // Five boxes. A card you get right moves up a box and comes back later; one
  // you miss goes back to box 1 and comes back today. Box n waits DAYS[n-1]
  // days. A card never seen yet waits in "box 0" and counts as due.
  const KEY = 'logos.thai.v1';
  const DAYS = [0, 1, 3, 7, 14];
  const MAX_BOX = DAYS.length;

  // The learner's own calendar day, not UTC: a box "comes back tomorrow"
  // after their midnight.
  const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (n, d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() + n); return day(x); };

  // Storage can be missing or refused (private mode, blocked site data):
  // every touch is guarded, and the cards still work, just without memory.
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function write(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
  }

  const progress = {
    get(id) { return read()[id] || { box: 0, due: day() }; },
    isDue(id, today = day()) { const s = read()[id]; return !s || s.due <= today; },
    // "Got it": up a box, back after that box's wait. "Again": box 1, today.
    // A card never seen counts as box 1, so knowing it at first sight sends
    // it to box 2: back tomorrow.
    mark(id, knew) {
      const all = read();
      const from = Math.max(1, all[id]?.box || 0);
      const box = knew ? Math.min(MAX_BOX, from + 1) : 1;
      all[id] = { box, due: addDays(DAYS[box - 1]) };
      write(all);
      return all[id];
    },
    // For a lesson: how many are due today, and how many are well learned
    // (box 3 or higher: remembered at least three times in a row).
    summary(cards) {
      const all = read(), today = day();
      return {
        due: cards.filter(c => !all[c.id] || all[c.id].due <= today).length,
        learned: cards.filter(c => (all[c.id]?.box || 0) >= 3).length,
        seen: cards.filter(c => all[c.id]).length,
      };
    },
    reset(cards) { const all = read(); for (const c of cards) delete all[c.id]; write(all); },
  };

  // ── Saying a card's name ───────────────────────────────────────────────────
  // Recordings, when the card has them: a synthetic Thai voice (Azure AI
  // Speech), normal and slow, kept with the site (logos/audio/). Otherwise the
  // device's own Thai voice reads the name. One <audio> element, started inside
  // the tap: iPhones only let sound start from a tap.
  let audio = null;
  const synth = ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) ? window.speechSynthesis : null;
  const audioUrl = file => `/logos/audio/${file.split('/').map(encodeURIComponent).join('/')}`;

  function stop() {
    if (audio && !audio.paused) audio.pause();
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  }

  function deviceVoice(card, slow) {
    if (!synth) return Promise.resolve(false);
    synth.cancel();
    const u = new SpeechSynthesisUtterance(card.say);
    u.lang = 'th-TH';
    const thai = synth.getVoices().find(v => /^th(-|_|$)/i.test(v.lang));
    if (thai) u.voice = thai;
    u.rate = slow ? 0.7 : 1;
    synth.speak(u);
    return Promise.resolve(true);
  }

  // Resolves true once sound has started (or been handed to the device voice).
  function speak(card, slow = false) {
    stop();
    const file = card.audio && card.audio[slow ? 'slow' : 'normal'];
    if (!file) return deviceVoice(card, slow);
    if (!audio) { audio = new Audio(); audio.preload = 'none'; }
    const url = audioUrl(file);
    if (audio.dataset.src !== url) { audio.src = url; audio.dataset.src = url; }
    try { audio.currentTime = 0; } catch (e) { /* not loaded yet: it starts at 0 anyway */ }
    const playing = audio.play();
    return (playing && playing.then ? playing : Promise.resolve())
      .then(() => true)
      .catch(err => (err && err.name === 'AbortError' ? true : deviceVoice(card, slow)));
  }

  window.addEventListener('pagehide', stop);

  window.mcLogos = { load, lesson, progress, speak, stop, audioUrl, day };
})();
