// The prayers' recordings and published documents, worked out from
// pray/prayers.json. Pure functions: no network, so they're tested directly
// (test/prayers.test.js) and shared by the publisher (scripts/publish-prayers.js)
// and, later, the API.
//
// Each prayer is recorded four times: Thai and English, at normal speed and
// slow. One recording is one MP3 of the whole prayer, with a bookmark at the
// start of every line; the speech service reports when it reaches each one,
// which gives the line timings the page's highlight follows. (A bookmark at
// the end of a line isn't reported reliably by every voice, so a line runs
// from its own start to the next line's.)
const crypto = require('node:crypto');

// Bump when the way recordings are made changes in a way the settings don't
// show (the SSML shape, say): every recording's name changes, so all are
// made again.
const GENERATOR_VERSION = 1;

const LANGS = ['th', 'en'];
const SPEEDS = ['normal', 'slow'];
const LOCALE = { th: 'th-TH', en: 'en-US' };

const xml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function rateFor(speed, settings) {
  return speed === 'slow' ? settings.slowRate : null;
}

function buildSsml(prayer, lang, speed, settings) {
  const n = prayer.lines.length;
  const body = prayer.lines.map((l, i) =>
    `<bookmark mark="s${i}"/>${xml(l[lang])}` + (i < n - 1 ? `<break time="${settings.breakMs}ms"/>` : '')).join('');
  const rate = rateFor(speed, settings);
  const inner = rate ? `<prosody rate="${xml(rate)}">${body}</prosody>` : body;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LOCALE[lang]}">` +
    `<voice name="${xml(settings.voices[lang])}">${inner}</voice></speak>`;
}

// A fingerprint of everything that shapes a recording. Same words, voice and
// settings: same name, so the existing file is reused. Anything different: a
// new name, so caches can keep every file forever.
function recordingHash(prayer, lang, speed, settings) {
  const recipe = {
    v: GENERATOR_VERSION,
    voice: settings.voices[lang],
    rate: rateFor(speed, settings),
    breakMs: settings.breakMs,
    format: settings.format,
    lines: prayer.lines.map(l => l[lang]),
  };
  return crypto.createHash('sha256').update(JSON.stringify(recipe)).digest('hex').slice(0, 10);
}

const recordingName = (id, lang, speed, hash) => `${id}/${lang}-${speed}-${hash}.mp3`;

// What a recording costs from the free 500,000 characters a month: the words
// read (SSML tags aren't counted).
const characters = (prayer, lang) => prayer.lines.reduce((sum, l) => sum + Array.from(l[lang]).length, 0);

// Bookmark offsets arrive in ticks (100 ns). Every line's start must be there.
const TICKS_PER_SECOND = 1e7;
function timingsFromBookmarks(marks, lineCount, durationTicks) {
  const at = new Map(marks.map(m => [m.name, m.offsetTicks]));
  const starts = [];
  for (let i = 0; i < lineCount; i++) {
    if (!at.has(`s${i}`)) throw new Error(`no timing for line ${i + 1}`);
    starts.push(Math.round(at.get(`s${i}`) / TICKS_PER_SECOND * 1000) / 1000);
  }
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] < starts[i - 1]) throw new Error(`line ${i + 1} starts before line ${i}`);
  }
  const duration = Math.round(durationTicks / TICKS_PER_SECOND * 1000) / 1000;
  return { starts, duration };
}

// Which recordings to make, and which can be reused from what's published.
// `published` maps prayer id → its document as stored (or nothing).
function plan(data, published = {}, { rerecordAll = false } = {}) {
  const settings = data.audio;
  const items = [];
  for (const prayer of data.prayers) {
    for (const lang of LANGS) {
      for (const speed of SPEEDS) {
        const hash = recordingHash(prayer, lang, speed, settings);
        const have = published[prayer.id]?.audio?.[lang]?.[speed];
        const reuse = !rerecordAll && have?.hash === hash ? have : null;
        items.push({
          id: prayer.id, lang, speed, hash,
          file: recordingName(prayer.id, lang, speed, hash),
          chars: characters(prayer, lang),
          reuse,
        });
      }
    }
  }
  return items;
}

// The published document: the prayer as written in prayers.json (with `aka`,
// its other names, which search finds it by), its place in the list, and its
// four recordings. `recordings` maps "lang/speed" →
// { file, hash, starts, duration }.
function buildDoc(prayer, order, recordings, settings) {
  const audio = {};
  for (const lang of LANGS) {
    audio[lang] = { voice: settings.voices[lang] };
    for (const speed of SPEEDS) {
      const r = recordings[`${lang}/${speed}`];
      if (!r) throw new Error(`${prayer.id}: missing ${lang} ${speed} recording`);
      audio[lang][speed] = { file: r.file, hash: r.hash, starts: r.starts, duration: r.duration };
    }
  }
  const { id, title, title_th, aka = [], about, lines, source } = prayer;
  return { id, type: 'prayer', order, title, title_th, aka, about, lines, source, audio };
}

// Cosmos DB adds its own bookkeeping fields (_rid, _etag, _ts…); they never
// leave the API.
const stripSystemFields = doc => Object.fromEntries(Object.entries(doc).filter(([k]) => !k.startsWith('_')));

function checkSettings(settings) {
  if (!settings) throw new Error('prayers.json has no "audio" settings');
  for (const lang of LANGS) if (!settings.voices?.[lang]) throw new Error(`no ${lang} voice in "audio" settings`);
  if (!/^-\d{1,2}%$/.test(settings.slowRate ?? '')) throw new Error('slowRate must look like "-30%"');
  if (!Number.isInteger(settings.breakMs) || settings.breakMs < 0 || settings.breakMs > 3000) throw new Error('breakMs must be 0–3000');
  if (!settings.format) throw new Error('no audio format');
}

module.exports = {
  GENERATOR_VERSION, LANGS, SPEEDS,
  buildSsml, recordingHash, recordingName, characters,
  timingsFromBookmarks, plan, buildDoc, stripSystemFields, checkSettings,
};
