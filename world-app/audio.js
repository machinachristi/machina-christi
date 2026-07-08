// The garden's voice, woven from nothing: no sound files, only WebAudio
// oscillators and filtered noise shaped live — wind moving in slow gusts,
// the river heard as a low soft brook near its banks, birdsong scattered
// through the day (hushed while rain falls), a soft patter when the shower
// passes over, the hum of bees near their beds of blossom, crickets after
// dark in short phrases (never a drone), and a quiet chime of reverence
// near the sacred trees. Everything passes through one mellowing low-pass,
// so nothing in Eden ever hisses or bites. Silent until invited: the garden
// starts muted, and the corner toggle (persisted) is how a visitor asks
// for its voice.

import { clamp, smoothstep } from './util.js';
import { riverEdgeDist } from './scenes/terrain.js';
import { BEE_PATCHES } from './scenes/creatures.js';
import { SPRING_POS } from './scenes/spring.js';

const PREF_KEY = 'camino_sound';

export function createAmbience() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let supported = typeof AC === 'function';
  // Quiet by default: only an explicit, persisted "on" wakes the ambience.
  let muted = true;
  try { muted = localStorage.getItem(PREF_KEY) !== 'on'; } catch (_) { /* private mode etc. */ }

  let ctx = null;
  let master = null;
  let refs = null;        // live gain nodes the update loop steers
  let acc = 0;            // update throttle — audio params need ~4Hz, not 60
  let birdIn = 2.0;       // seconds until the next possible chirp
  let cricketIn = 1.5;    // seconds until the next possible cricket phrase
  let lowIn = 10.0;       // seconds until the next possible lowing
  let night = 0;

  // ── The toggle: a small pill in the world's corner ──
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sound' + (muted ? ' sound--off' : '');
  btn.setAttribute('aria-label', 'Toggle sound');
  btn.setAttribute('aria-pressed', String(!muted));
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 9.5v5h3.2L12 19V5L7.2 9.5H4Z"/>' +
    '<path class="wave" d="M15 9.6a4 4 0 0 1 0 4.8"/>' +
    '<path class="wave" d="M17.6 7.4a7 7 0 0 1 0 9.2"/>' +
    '<path class="slash" d="M15 9l6 6M21 9l-6 6"/>' +
    '</svg>';
  document.body.appendChild(btn);
  btn.addEventListener('click', () => setMuted(!muted));

  function noiseBuffer(shape) {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (shape === 'deep') {          // brown-ish, for wind
        b0 = (b0 + 0.02 * w) / 1.02;
        d[i] = b0 * 3.5;
      } else if (shape === 'rain') {   // lighter, with a soft patter of hiss
        b0 = 0.96 * b0 + w * 0.08;
        d[i] = b0 * 1.4 + w * 0.22;
      } else {                          // deep-brushed brown, for gentle water
        b0 = 0.99 * b0 + w * 0.02;
        b1 = 0.8 * b1 + w * 0.25;
        d[i] = b0 * 2.2 + b1 * 0.5 + w * 0.02;
      }
    }
    return buf;
  }

  function loopNoise(buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = 0;
    // One mellowing low-pass over everything: the air of the garden.
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = 5600;
    air.Q.value = 0.4;
    master.connect(air);
    air.connect(ctx.destination);

    // Wind: deep noise through a low-pass whose cutoff and level breathe
    // together on one slow LFO — gusts, not a steady hiss.
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 0.4;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.045;
    loopNoise(noiseBuffer('deep')).connect(windFilter);
    windFilter.connect(windGain).connect(master);
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.06;
    const gustToFreq = ctx.createGain();
    gustToFreq.gain.value = 90;
    gust.connect(gustToFreq).connect(windFilter.frequency);
    const gustToGain = ctx.createGain();
    gustToGain.gain.value = 0.012;
    gust.connect(gustToGain).connect(windGain.gain);
    gust.start();

    // The river: a low brook, not a hiss — dark water-noise kept under a
    // gentle low-pass, its cutoff swaying slowly so the flow murmurs. Its
    // level is set each update from the walker's true distance to the
    // water's edge — the same riverEdgeDist the terrain is carved with.
    const waterLP = ctx.createBiquadFilter();
    waterLP.type = 'lowpass';
    waterLP.frequency.value = 460;
    waterLP.Q.value = 0.7;
    const waterGain = ctx.createGain();
    waterGain.gain.value = 0;
    loopNoise(noiseBuffer('water')).connect(waterLP);
    waterLP.connect(waterGain).connect(master);
    const lap = ctx.createOscillator();
    lap.frequency.value = 0.32;
    const lapAmt = ctx.createGain();
    lapAmt.gain.value = 110;
    lap.connect(lapAmt).connect(waterLP.frequency);
    lap.start();

    // Rain: a soft patter, brighter than the brook but kept gentle under
    // its own low-pass; its level simply follows the sky's shower.
    const rainLP = ctx.createBiquadFilter();
    rainLP.type = 'lowpass';
    rainLP.frequency.value = 2300;
    rainLP.Q.value = 0.4;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    loopNoise(noiseBuffer('rain')).connect(rainLP);
    rainLP.connect(rainGain).connect(master);

    // The bees: one soft triangle hum with a slow wobble, heard only near
    // their two beds of blossom, by day, and never above a murmur.
    const beeLP = ctx.createBiquadFilter();
    beeLP.type = 'lowpass';
    beeLP.frequency.value = 700;
    beeLP.Q.value = 0.5;
    const beeGain = ctx.createGain();
    beeGain.gain.value = 0;
    const bee = ctx.createOscillator();
    bee.type = 'triangle';
    bee.frequency.value = 172;
    const beeWobble = ctx.createOscillator();
    beeWobble.frequency.value = 5.7;
    const beeWobbleAmt = ctx.createGain();
    beeWobbleAmt.gain.value = 9;
    beeWobble.connect(beeWobbleAmt).connect(bee.frequency);
    bee.connect(beeLP);
    beeLP.connect(beeGain).connect(master);
    bee.start();
    beeWobble.start();

    // The spring's first murmur (Genesis 2:10): brighter than the river's
    // low brook, heard only right where the water is first found rising.
    const springBP = ctx.createBiquadFilter();
    springBP.type = 'bandpass';
    springBP.frequency.value = 1400;
    springBP.Q.value = 0.8;
    const springGain = ctx.createGain();
    springGain.gain.value = 0;
    loopNoise(noiseBuffer('rain')).connect(springBP);
    springBP.connect(springGain).connect(master);

    refs = { windGain, windFilter, waterGain, rainGain, beeGain, springGain };
    master.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  }

  // One short birdcall: a few quick rising notes, softly panned somewhere.
  function chirp() {
    const t0 = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const base = 1600 + Math.random() * 1000;
    const notes = 2 + Math.floor(Math.random() * 4);
    g.gain.setValueAtTime(0, t0);
    let tt = t0;
    for (let n = 0; n < notes; n++) {
      const f = base * (1 + (Math.random() - 0.5) * 0.18);
      osc.frequency.setValueAtTime(f, tt);
      osc.frequency.exponentialRampToValueAtTime(f * (1.12 + Math.random() * 0.2), tt + 0.055);
      g.gain.linearRampToValueAtTime(0.032, tt + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0008, tt + 0.1);
      tt += 0.1 + Math.random() * 0.08;
    }
    osc.connect(g);
    if (pan) {
      pan.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(pan).connect(master);
    } else {
      g.connect(master);
    }
    osc.start(t0);
    osc.stop(tt + 0.15);
    osc.onended = () => { osc.disconnect(); g.disconnect(); if (pan) pan.disconnect(); };
  }

  // One cricket phrase: a few soft pulses of one high-but-hushed tone,
  // rounded by its own low-pass and panned into the grass somewhere.
  // Phrases with silences between them — night music, not a constant beep.
  function cricketPhrase() {
    const t0 = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4300;
    lp.Q.value = 0.5;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    osc.frequency.value = 3350 + Math.random() * 480;
    const pulses = 3 + Math.floor(Math.random() * 3);
    g.gain.setValueAtTime(0.0001, t0);
    let tt = t0;
    for (let p = 0; p < pulses; p++) {
      g.gain.linearRampToValueAtTime(0.011, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.085);
      tt += 0.115 + Math.random() * 0.02;
    }
    osc.connect(lp);
    lp.connect(g);
    if (pan) {
      pan.pan.value = Math.random() * 1.4 - 0.7;
      g.connect(pan).connect(master);
    } else {
      g.connect(master);
    }
    osc.start(t0);
    osc.stop(tt + 0.1);
    osc.onended = () => { osc.disconnect(); lp.disconnect(); g.disconnect(); if (pan) pan.disconnect(); };
  }

  // A flock begun (Genesis 1:24): the cattle low softly to one another —
  // one breathy, low-pitched tone that swells and settles, panned softly
  // somewhere in the western meadow they keep to.
  function low() {
    const t0 = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const base = 90 + Math.random() * 35;
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.linearRampToValueAtTime(base * 0.82, t0 + 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.18);
    g.gain.linearRampToValueAtTime(0.035, t0 + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + 1.1);
    osc.connect(lp);
    lp.connect(g);
    if (pan) {
      pan.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(pan).connect(master);
    } else {
      g.connect(master);
    }
    osc.start(t0);
    osc.stop(t0 + 1.2);
    osc.onended = () => { osc.disconnect(); lp.disconnect(); g.disconnect(); if (pan) pan.disconnect(); };
  }

  // The reverence chime: two soft bell tones, a fifth apart, when a walker
  // draws near the sacred trees — felt more than heard.
  function chime() {
    if (!ctx || ctx.state !== 'running' || muted) return;
    const t0 = ctx.currentTime + 0.03;
    for (const [f, at, amp] of [[659.25, 0, 0.03], [987.77, 0.4, 0.018]]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.linearRampToValueAtTime(amp, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + at + 2.6);
      osc.connect(g).connect(master);
      osc.start(t0 + at);
      osc.stop(t0 + at + 2.8);
      osc.onended = () => { osc.disconnect(); g.disconnect(); };
    }
  }

  function ensureStarted() {
    if (!supported || muted) return;
    if (!ctx) {
      try {
        ctx = new AC();
        buildGraph();
      } catch (_) {
        supported = false;
        return;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* not yet allowed — a later gesture will */ });
    if (master) master.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  }

  // Waking the sound is itself a click on the toggle (already a gesture);
  // these cover the case of a persisted "on" from an earlier visit.
  window.addEventListener('pointerdown', ensureStarted);
  window.addEventListener('keydown', ensureStarted);
  ensureStarted();

  // Sleep with the tab: no ambience from a background tab, and the clock
  // of gusts and crickets simply resumes where it left off.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (!muted) ctx.resume().catch(() => {});
  });

  function setMuted(next) {
    muted = !!next;
    try { localStorage.setItem(PREF_KEY, muted ? 'off' : 'on'); } catch (_) { /* fine */ }
    btn.classList.toggle('sound--off', muted);
    btn.setAttribute('aria-pressed', String(!muted));
    if (muted) {
      if (ctx && master) {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        setTimeout(() => { if (muted && ctx) ctx.suspend().catch(() => {}); }, 900);
      }
    } else {
      ensureStarted();
    }
  }

  function update(dt, skyNight, pos, rain = 0, wind = 0) {
    night = skyNight;
    if (!refs || !ctx || ctx.state !== 'running' || muted) return;
    acc += dt;
    if (acc < 0.22) return;
    const step = acc;
    acc = 0;
    const tc = ctx.currentTime;

    // The cool of the day (Genesis 3:8, foreshadowed): the wind bed swells
    // and brightens as the evening gust passes over — heard moving through
    // the garden, not just present in it.
    refs.windGain.gain.setTargetAtTime(0.045 + 0.1 * wind, tc, 0.6);
    refs.windFilter.frequency.setTargetAtTime(340 + 260 * wind, tc, 0.6);

    // The river grows on the ear as the walker nears the water — and now it
    // carries from farther off, so it is heard before it is seen: a faint
    // brook still murmurs a good stretch of meadow away, swelling as the bank
    // (and the swaying reeds along it) come into view.
    const d = riverEdgeDist(pos.x, pos.z);
    const nearness = 1 - clamp(d / 26, 0, 1);
    refs.waterGain.gain.setTargetAtTime(0.006 + 0.062 * Math.pow(nearness, 1.35), tc, 0.5);

    // The spring's murmur is a small discovery: heard only right at the
    // place where the river rises, west of everything else in the garden.
    const dSpring = Math.hypot(pos.x - SPRING_POS.x, pos.z - SPRING_POS.z);
    const springNear = 1 - clamp((dSpring - 2) / 9, 0, 1);
    refs.springGain.gain.setTargetAtTime(0.05 * Math.pow(springNear, 1.5), tc, 0.4);

    // The patter follows the shower; the bees are heard near their beds of
    // blossom, by day and in dry air.
    refs.rainGain.gain.setTargetAtTime(0.034 * rain, tc, 0.6);
    let dBee = Infinity;
    for (const b of BEE_PATCHES) dBee = Math.min(dBee, Math.hypot(pos.x - b.x, pos.z - b.z));
    const beeNear = 1 - clamp((dBee - 1) / 8, 0, 1);
    const beeDay = 1 - smoothstep(0.3, 0.5, night);
    refs.beeGain.gain.setTargetAtTime(0.012 * Math.pow(beeNear, 1.5) * beeDay * (1 - 0.7 * rain), tc, 0.4);

    // Crickets keep the night watch in phrases; birds keep the day, and
    // hold their peace while the rain falls.
    cricketIn -= step;
    if (cricketIn <= 0) {
      cricketIn = 1.2 + Math.random() * 2.8;
      if (night > 0.5) cricketPhrase();
    }
    birdIn -= step;
    if (birdIn <= 0) {
      birdIn = 2.5 + Math.random() * 5.5;
      if (night < 0.45 && rain < 0.35) chirp();
    }

    // The cattle keep to dusk, the same watch the crickets take up after.
    lowIn -= step;
    if (lowIn <= 0) {
      lowIn = 22 + Math.random() * 38;
      if (night > 0.15 && night < 0.75 && rain < 0.35) low();
    }
  }

  function state() {
    return {
      supported,
      muted,
      running: !!(ctx && ctx.state === 'running'),
    };
  }

  return { update, setMuted, chime, state };
}
