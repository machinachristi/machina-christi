// The garden's voice, woven from nothing: no sound files, only WebAudio
// oscillators and filtered noise shaped live — wind moving in slow gusts,
// the river heard when you stand near its banks (and fading as you leave),
// birdsong scattered through the day, crickets after dark. Autoplay-polite:
// sound begins only once the browser grants a user gesture (entering the
// garden usually is one; the first touch always is), and a small persisted
// toggle keeps Eden silent for those who prefer it that way.

import { clamp } from './util.js';
import { riverEdgeDist } from './scenes/terrain.js';

const PREF_KEY = 'camino_sound';

export function createAmbience() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let supported = typeof AC === 'function';
  let muted = false;
  try { muted = localStorage.getItem(PREF_KEY) === 'off'; } catch (_) { /* private mode etc. */ }

  let ctx = null;
  let master = null;
  let refs = null;        // live gain nodes the update loop steers
  let acc = 0;            // update throttle — audio params need ~4Hz, not 60
  let birdIn = 2.0;       // seconds until the next possible chirp
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
      } else {                          // pink-ish, for water
        b0 = 0.98 * b0 + w * 0.2;
        b1 = 0.7 * b1 + w * 0.5;
        d[i] = (b0 + b1 * 0.4 + w * 0.12) * 0.9;
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
    master.connect(ctx.destination);

    // Wind: deep noise through a low-pass whose cutoff and level breathe
    // together on one slow LFO — gusts, not a steady hiss.
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 0.4;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.05;
    loopNoise(noiseBuffer('deep')).connect(windFilter);
    windFilter.connect(windGain).connect(master);
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.06;
    const gustToFreq = ctx.createGain();
    gustToFreq.gain.value = 90;
    gust.connect(gustToFreq).connect(windFilter.frequency);
    const gustToGain = ctx.createGain();
    gustToGain.gain.value = 0.014;
    gust.connect(gustToGain).connect(windGain.gain);
    gust.start();

    // The river: pink noise through a wandering band-pass. Its level is set
    // each update from the walker's true distance to the water's edge — the
    // same riverEdgeDist the terrain itself is carved with.
    const waterBand = ctx.createBiquadFilter();
    waterBand.type = 'bandpass';
    waterBand.frequency.value = 700;
    waterBand.Q.value = 0.8;
    const waterGain = ctx.createGain();
    waterGain.gain.value = 0;
    loopNoise(noiseBuffer('pink')).connect(waterBand);
    waterBand.connect(waterGain).connect(master);
    const burble = ctx.createOscillator();
    burble.frequency.value = 0.5;
    const burbleAmt = ctx.createGain();
    burbleAmt.gain.value = 220;
    burble.connect(burbleAmt).connect(waterBand.frequency);
    burble.start();

    // Crickets: two detuned high sines, amplitude-trembled at cricket rate.
    // Silent by day; the night level is steered from the sky's cycle.
    const cricketGain = ctx.createGain();
    cricketGain.gain.value = 0;
    const tremble = ctx.createGain();
    tremble.gain.value = 0.5;
    const trembleOsc = ctx.createOscillator();
    trembleOsc.frequency.value = 33;
    const trembleAmt = ctx.createGain();
    trembleAmt.gain.value = 0.5;
    trembleOsc.connect(trembleAmt).connect(tremble.gain);
    trembleOsc.start();
    for (const f of [4250, 4630]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(tremble);
      osc.start();
    }
    tremble.connect(cricketGain).connect(master);

    refs = { windGain, waterGain, cricketGain };
    master.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
  }

  // One short birdcall: a few quick rising notes, softly panned somewhere.
  function chirp() {
    const t0 = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const base = 1900 + Math.random() * 1400;
    const notes = 2 + Math.floor(Math.random() * 4);
    g.gain.setValueAtTime(0, t0);
    let tt = t0;
    for (let n = 0; n < notes; n++) {
      const f = base * (1 + (Math.random() - 0.5) * 0.18);
      osc.frequency.setValueAtTime(f, tt);
      osc.frequency.exponentialRampToValueAtTime(f * (1.12 + Math.random() * 0.2), tt + 0.055);
      g.gain.linearRampToValueAtTime(0.05, tt + 0.014);
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

  // Entering the garden is usually already a user gesture; where the browser
  // disagrees, the first touch or keypress in the world unlocks it.
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

  function update(dt, skyNight, pos) {
    night = skyNight;
    if (!refs || !ctx || ctx.state !== 'running' || muted) return;
    acc += dt;
    if (acc < 0.22) return;
    const step = acc;
    acc = 0;
    const tc = ctx.currentTime;

    // The river grows on the ear as the walker nears the water.
    const d = riverEdgeDist(pos.x, pos.z);
    const nearness = 1 - clamp(d / 16, 0, 1);
    refs.waterGain.gain.setTargetAtTime(0.012 + 0.11 * Math.pow(nearness, 1.6), tc, 0.4);

    // Crickets keep the night watch; birds keep the day.
    refs.cricketGain.gain.setTargetAtTime(night * night * 0.05, tc, 0.6);
    birdIn -= step;
    if (birdIn <= 0) {
      birdIn = 2.5 + Math.random() * 5.5;
      if (night < 0.45) chirp();
    }
  }

  function state() {
    return {
      supported,
      muted,
      running: !!(ctx && ctx.state === 'running'),
    };
  }

  return { update, setMuted, state };
}
