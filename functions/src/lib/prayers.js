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
// from its own start to the next line's.) A few words the voice misreads are
// respelled for it (see spokenText).
const crypto = require('node:crypto');

// Bump when the way recordings are made changes in a way the settings don't
// show (the SSML shape, say): every recording's name changes, so all are
// made again.
const GENERATOR_VERSION = 1;

const LANGS = ['th', 'en'];
const SPEEDS = ['normal', 'slow'];
const LOCALE = { th: 'th-TH', en: 'en-US' };

const xml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// What the voice reads for a line. prayers.json's `audio.say` respells the
// words a voice gets wrong, the way they should sound, per language:
// { "th": { "ประกาศก": "ประกา สก" } }. Only the recording changes: the
// prayer's own text, which the pages show and search finds, stays as the
// Church wrote it. All words are replaced in one pass, longest first, so a
// longer entry wins over a shorter one inside it and a respelling is never
// respelled again.
function spokenText(text, lang, settings) {
  const say = settings?.say?.[lang];
  const words = Object.keys(say ?? {}).sort((a, b) => b.length - a.length);
  if (!words.length) return text;
  const any = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return text.replace(any, w => say[w]);
}

function rateFor(speed, settings) {
  return speed === 'slow' ? settings.slowRate : null;
}

function buildSsml(prayer, lang, speed, settings) {
  const n = prayer.lines.length;
  const body = prayer.lines.map((l, i) =>
    `<bookmark mark="s${i}"/>${xml(spokenText(l[lang], lang, settings))}` + (i < n - 1 ? `<break time="${settings.breakMs}ms"/>` : '')).join('');
  const rate = rateFor(speed, settings);
  const inner = rate ? `<prosody rate="${xml(rate)}">${body}</prosody>` : body;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LOCALE[lang]}">` +
    `<voice name="${xml(settings.voices[lang])}">${inner}</voice></speak>`;
}

// A fingerprint of everything that shapes a recording. Same words, voice and
// settings: same name, so the existing file is reused. Anything different: a
// new name, so caches can keep every file forever. The words are the ones the
// voice reads, so a new respelling re-records only the prayers that have it.
function recordingHash(prayer, lang, speed, settings) {
  const recipe = {
    v: GENERATOR_VERSION,
    voice: settings.voices[lang],
    rate: rateFor(speed, settings),
    breakMs: settings.breakMs,
    format: settings.format,
    lines: prayer.lines.map(l => spokenText(l[lang], lang, settings)),
  };
  return crypto.createHash('sha256').update(JSON.stringify(recipe)).digest('hex').slice(0, 10);
}

const recordingName = (id, lang, speed, hash) => `${id}/${lang}-${speed}-${hash}.mp3`;

// What a recording costs from the free 500,000 characters a month: the words
// read (SSML tags aren't counted).
const characters = (prayer, lang, settings) => prayer.lines.reduce((sum, l) => sum + Array.from(spokenText(l[lang], lang, settings)).length, 0);

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
          chars: characters(prayer, lang, settings),
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

// With `prayers`, every respelling must be for a word some prayer has: one
// that isn't is a typo, or left over from an edit to the text.
function checkSettings(settings, prayers) {
  if (!settings) throw new Error('prayers.json has no "audio" settings');
  for (const lang of LANGS) if (!settings.voices?.[lang]) throw new Error(`no ${lang} voice in "audio" settings`);
  if (!/^-\d{1,2}%$/.test(settings.slowRate ?? '')) throw new Error('slowRate must look like "-30%"');
  if (!Number.isInteger(settings.breakMs) || settings.breakMs < 0 || settings.breakMs > 3000) throw new Error('breakMs must be 0–3000');
  if (!settings.format) throw new Error('no audio format');
  if (settings.say === undefined) return;
  const isMap = x => x && typeof x === 'object' && !Array.isArray(x);
  if (!isMap(settings.say)) throw new Error('"say" must map a language to its respellings');
  for (const [lang, words] of Object.entries(settings.say)) {
    if (!LANGS.includes(lang)) throw new Error(`"say" has respellings for an unknown language "${lang}"`);
    if (!isMap(words)) throw new Error(`"say" ${lang} must map words to respellings`);
    for (const [word, as] of Object.entries(words)) {
      if (!word.trim() || typeof as !== 'string' || !as.trim()) throw new Error(`"say" ${lang}: "${word}" needs a respelling`);
      if (as === word) throw new Error(`"say" ${lang}: "${word}" is respelled as itself`);
      if (prayers && !prayers.some(p => p.lines.some(l => String(l[lang] ?? '').includes(word)))) throw new Error(`"say" ${lang}: no prayer has "${word}"`);
    }
  }
}

module.exports = {
  GENERATOR_VERSION, LANGS, SPEEDS,
  spokenText, buildSsml, recordingHash, recordingName, characters,
  timingsFromBookmarks, plan, buildDoc, stripSystemFields, checkSettings,
};
