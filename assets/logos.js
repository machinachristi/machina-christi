// Logos: the shared engine behind the Logos page (logos.html).
//
//   window.mcLogos.load()            → the Thai cards (logos/thai.json)
//   window.mcLogos.play(sound, btn)  → play { audio, say } aloud; btn shows it playing
//   window.mcLogos.stop()            → stop whatever is playing
//   window.mcLogos.vowelShown(form)  → a vowel as the cards show it
//   window.mcLogos.store             → this browser's notebook, guarded
//   window.mcLogos.shuffle(list)     → a shuffled copy
//
// The cards are one small file in the site, not a database: 44 consonants,
// 32 vowels, which never change while someone studies them.
// Practice marks stay in this browser only (localStorage); nothing is sent
// anywhere.
(() => {
  'use strict';

  let loaded = null;
  function load() {
    loaded ??= fetch('/logos/thai.json').then(r => (r.ok ? r.json() : Promise.reject(new Error(`thai.json ${r.status}`))));
    loaded.catch(() => { loaded = null; }); // a failed read is tried again next time
    return loaded;
  }

  // A vowel is written with a dash where the consonant goes (-ะ, เ-าะ). Where
  // its mark sits on the consonant itself (ิ ี ึ ื ุ ู ั ำ) the dash is left
  // out: Thai fonts draw their own dotted circle there, while a mark written
  // on a dash gets a stray circle after it.
  const ON_CONSONANT = /-(?=[ัำ-ฺ็-๎])/g;
  const vowelShown = form => form.replace(ON_CONSONANT, '');

  // Storage can be missing or refused (private mode, blocked site data):
  // every touch is guarded, and the cards still work, just without memory.
  const store = {
    get(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* nothing to clear */ } },
  };

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ── Sounds ──────────────────────────────────────────────────────────────────
  // Every sound is a recording of a synthetic Thai voice (Azure AI Speech),
  // kept with the site (logos/audio/). If one can't play, the device's own
  // Thai voice reads the same words. One <audio> element for the whole page,
  // so only one sound plays at a time, started inside the tap: iPhones only
  // let sound start from a tap.
  let audio = null;
  let button = null; // the play button showing the sound now playing
  let turn = 0;      // which play() is the latest
  const synth = ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) ? window.speechSynthesis : null;
  const audioUrl = file => `/logos/audio/${file.split('/').map(encodeURIComponent).join('/')}`;

  function settle(t) {
    if (t !== turn || !button) return;
    button.classList.remove('is-playing');
    button = null;
  }

  function stop() {
    turn++;
    if (audio && !audio.paused) audio.pause();
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
    if (button) { button.classList.remove('is-playing'); button = null; }
  }

  function deviceVoice(say, t) {
    if (!synth || !say) { settle(t); return false; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(say);
    u.lang = 'th-TH';
    const thai = synth.getVoices().find(v => /^th(-|_|$)/i.test(v.lang));
    if (thai) u.voice = thai;
    u.onend = u.onerror = () => settle(t);
    synth.speak(u);
    return true;
  }

  // Resolves true once sound has started (or been handed to the device voice).
  function play(sound, btn = null) {
    stop();
    const t = turn;
    if (btn) { button = btn; btn.classList.add('is-playing'); }
    if (!sound.audio) return Promise.resolve(deviceVoice(sound.say, t));
    if (!audio) {
      audio = new Audio();
      audio.preload = 'none';
      audio.addEventListener('ended', () => settle(turn));
      // Paused from outside (a phone call, the lock screen): not a new sound.
      audio.addEventListener('pause', () => { if (audio.paused && !audio.ended) settle(turn); });
    }
    const url = audioUrl(sound.audio);
    if (audio.dataset.src !== url) { audio.src = url; audio.dataset.src = url; }
    try { audio.currentTime = 0; } catch (e) { /* not loaded yet: it starts at 0 anyway */ }
    const playing = audio.play();
    return (playing && playing.then ? playing : Promise.resolve())
      .then(() => true)
      .catch(err => (err && err.name === 'AbortError' ? true : t === turn && deviceVoice(sound.say, t)));
  }

  window.addEventListener('pagehide', stop);

  window.mcLogos = { load, play, stop, audioUrl, vowelShown, store, shuffle };
})();
