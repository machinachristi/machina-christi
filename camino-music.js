// Camino — holy background music, synthesized live with the Web Audio API.
// No audio files, so nothing to license: a soft drone under a slow modal
// chant, sung by detuned saw "voices" shaped through vowel (formant) filters
// and washed in a generated cathedral reverb. As the road quickens the chant
// moves faster and a second voice joins a fifth below (parallel organum).
//
// Browsers only allow audio after a user gesture, so nothing is created until
// unlock() is called from a tap / key press. Muting is remembered in
// localStorage (camino_muted); the default is sound ON.
//
// Everything is a safe no-op where Web Audio is missing or blocked.
(function () {
  'use strict';

  // ── Tuning knobs ─────────────────────────────────────────
  const LEVEL       = 0.6;    // master volume while playing (0–1)
  const VOICE_PEAK  = 0.11;   // lead voice loudness
  const BEAT_SLOW   = 1.55;   // seconds per beat at the start of a journey
  const BEAT_FAST   = 1.0;    // seconds per beat at full intensity
  const FADE_IN     = 1.5;    // seconds
  const FADE_OUT    = 2.4;    // seconds, after a journey ends
  const KEY         = 'camino_muted';

  const AC = window.AudioContext || window.webkitAudioContext;

  // D Dorian chant phrases: [semitones above D4, length in beats].
  const D4 = 293.66;
  const PHRASES = [
    [[0,1],[3,1],[5,1],[7,2],[5,1],[3,1],[2,1],[0,3]],
    [[7,1],[5,1],[3,1],[5,1],[7,1],[10,1],[7,1],[5,1],[3,1],[2,1],[0,3]],
    [[0,2],[2,1],[3,2],[2,1],[0,1],[-2,1],[0,3]],
    [[3,1],[5,1],[7,1],[9,1],[7,1],[5,1],[3,1],[2,1],[0,3]],
    // brighter, higher phrase for later in the journey
    [[7,1],[9,1],[10,1],[12,2],[10,1],[9,1],[7,2],[5,1],[3,1],[0,3]],
  ];
  const HIGH_PHRASE = PHRASES.length - 1;
  const CHIMES = [12, 15, 17, 19, 22];   // D Dorian pentatonic, an octave up

  // Vowel "ah": [centre Hz, gain, Q]
  const FORMANTS = [[700, 1, 8], [1220, 0.5, 10], [2600, 0.15, 12]];

  let ctx = null, master, bus, tone, wet, analyser;
  let droneBus = null;
  let active = false;           // a journey is under way
  let muted = false;
  let intensity = 0;            // 0 (start) → 1 (fast)
  let timer = null, suspendTimer = null;
  let nextTime = 0, queue = [], lastPhrase = -1, chimeIdx = 0;

  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }

  function build() {
    if (ctx || !AC) return !!ctx;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }

    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    analyser = ctx.createAnalyser();      // taps the output; used by tests
    analyser.fftSize = 2048;
    comp.connect(analyser);

    // Everything musical goes through `bus` → tone filter → dry + reverb.
    bus = ctx.createGain();
    tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    bus.connect(tone);

    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    tone.connect(dry);
    dry.connect(master);

    const verb = ctx.createConvolver();
    verb.buffer = impulse(3.2);
    wet = ctx.createGain();
    wet.gain.value = 0.5;
    tone.connect(verb);
    verb.connect(wet);
    wet.connect(master);

    // Drone: a quiet open fifth that never stops while the context runs.
    droneBus = ctx.createGain();
    droneBus.gain.value = 0.75;
    droneBus.connect(bus);
    [[73.42, 'sine', 0.10], [146.83, 'triangle', 0.13], [220, 'sine', 0.06]].forEach(function (d) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = d[1]; o.frequency.value = d[0]; g.gain.value = d[2];
      o.connect(g); g.connect(droneBus); o.start();
    });
    // Slow breathing on the drone.
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.11; lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(droneBus.gain); lfo.start();
    return true;
  }

  // Exponentially-decaying noise: a cheap, convincing stone-hall reverb.
  function impulse(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return buf;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
  }

  // Bring the sound in line with the current state (playing? muted? hidden?).
  function apply() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const on = active && !muted && !document.hidden;
    const g = master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    clearTimeout(suspendTimer);
    if (on) {
      resume();
      g.linearRampToValueAtTime(LEVEL, t + FADE_IN);
      startScheduler();
    } else {
      const fade = active ? 0.25 : FADE_OUT;     // muting is quick, a journey's end is slow
      g.linearRampToValueAtTime(0, t + fade);
      stopScheduler();
      suspendTimer = setTimeout(function () {
        if (!(active && !muted && !document.hidden) && ctx.state === 'running') ctx.suspend();
      }, fade * 1000 + 400);
    }
  }

  // ── Chant scheduler (looks ~0.8s ahead) ──────────────────
  function startScheduler() {
    if (timer) return;
    nextTime = Math.max(nextTime, ctx.currentTime + 0.3);
    timer = setInterval(tick, 150);
    tick();
  }
  function stopScheduler() { clearInterval(timer); timer = null; }

  function beat() { return BEAT_SLOW - (BEAT_SLOW - BEAT_FAST) * intensity; }

  function tick() {
    if (!ctx) return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.1;   // fell behind (tab was paused)
    while (nextTime < ctx.currentTime + 0.8) scheduleNext();
  }

  function scheduleNext() {
    if (!queue.length) {
      let p;
      do {
        p = Math.floor(Math.random() * (intensity > 0.45 ? PHRASES.length : HIGH_PHRASE));
      } while (p === lastPhrase);
      lastPhrase = p;
      queue = PHRASES[p].slice();
      queue.push([null, 2]);                 // a breath between phrases
    }
    const n = queue.shift();
    const len = n[1] * beat();
    if (n[0] !== null) {
      const f = D4 * Math.pow(2, n[0] / 12);
      voice(f, nextTime, len, VOICE_PEAK);
      if (intensity > 0.3) voice(f * 2 / 3, nextTime, len, VOICE_PEAK * 0.7);   // organum a fifth below
    }
    nextTime += len;
  }

  // One sung note: two detuned saws → vowel formants → slow-swelling envelope.
  function voice(freq, t, dur, peak) {
    const env = ctx.createGain();
    const sum = ctx.createGain();
    sum.gain.value = 0.5;
    FORMANTS.forEach(function (f) {
      const bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = f[0]; bp.Q.value = f[2];
      g.gain.value = f[1];
      sum.connect(bp); bp.connect(g); g.connect(env);
    });
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + Math.min(0.4, dur * 0.4));
    env.gain.setValueAtTime(peak, t + dur * 0.8);
    env.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    env.connect(bus);

    // Gentle vibrato that arrives after the note has bloomed.
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = 5.2;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(freq * 0.006, t + 0.7);
    vib.connect(vg);

    const stopAt = t + dur + 0.7;
    [-6, 6].forEach(function (cents) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = cents;
      vg.connect(o.frequency);
      o.connect(sum);
      o.start(t); o.stop(stopAt);
    });
    vib.start(t); vib.stop(stopAt);
    vib.onended = function () { env.disconnect(); };
  }

  // ── Public API ───────────────────────────────────────────
  window.CaminoMusic = {
    // Call from inside a tap / key handler so the browser allows audio.
    unlock: function () {
      if (!build()) return;
      if (!muted) resume();
    },
    // A journey begins: fade the chant in.
    start: function () {
      active = true;
      intensity = 0; queue = []; lastPhrase = -1;
      if (!build()) return;
      nextTime = ctx.currentTime + 0.3;
      apply();
    },
    // The journey ends: let the chant dissolve into the hall.
    stop: function () { active = false; apply(); },
    toggle: function () {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (build()) { resume(); apply(); }
      return muted;
    },
    isMuted: function () { return muted; },
    // 0 → 1 as the road gets faster; quickens the chant, adds the second voice.
    setIntensity: function (i) { intensity = Math.max(0, Math.min(1, i || 0)); },
    // Struck by a rock or water: muffle and duck the choir, add a soft thud.
    hit: function () {
      if (!ctx || !active || muted) return;
      const t = ctx.currentTime;
      tone.frequency.cancelScheduledValues(t);
      tone.frequency.setValueAtTime(tone.frequency.value, t);
      tone.frequency.exponentialRampToValueAtTime(450, t + 0.08);
      tone.frequency.exponentialRampToValueAtTime(3200, t + 1.7);
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0.45, t + 0.1);
      bus.gain.linearRampToValueAtTime(1, t + 1.7);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.28);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.35);
    },
    // Picked up a cross or shell: a small bell. Crosses ring a little longer.
    chime: function (isCross) {
      if (!ctx || !active || muted) return;
      const t = ctx.currentTime;
      const f = D4 * Math.pow(2, CHIMES[chimeIdx++ % CHIMES.length] / 12);
      const ring = isCross ? 1.6 : 0.9;
      [[1, 0.09], [2.76, 0.035]].forEach(function (p) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * p[0];
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(p[1], t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005, t + ring);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + ring + 0.1);
      });
    },
    // A verse appears: let the hall open up for a moment.
    swell: function () {
      if (!ctx || !active || muted) return;
      const t = ctx.currentTime;
      wet.gain.cancelScheduledValues(t);
      wet.gain.setValueAtTime(wet.gain.value, t);
      wet.gain.linearRampToValueAtTime(0.95, t + 1.5);
      wet.gain.linearRampToValueAtTime(0.5, t + 6);
    },
    // Test hook: current output level { peak, rms } (0 if audio isn't running).
    level: function () {
      if (!analyser) return { peak: 0, rms: 0 };
      const d = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(d);
      let peak = 0, sq = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sq += d[i] * d[i]; }
      return { peak: peak, rms: Math.sqrt(sq / d.length) };
    },
  };

  document.addEventListener('visibilitychange', apply);
})();
