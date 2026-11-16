const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/lib/prayers');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'pray', 'prayers.json'), 'utf8'));
const settings = { voices: { th: 'th-TH-NiwatNeural', en: 'en-US-AndrewNeural' }, slowRate: '-30%', breakMs: 600, format: 'Audio24Khz48KBitRateMonoMp3' };
const prayer = {
  id: 'test-prayer', title: 'Test', title_th: 'ทดสอบ', about: 'a test', source: { name: 'x', url: 'https://example.org' },
  lines: [
    { th: 'เดชะพระนาม', rom: 'dee-chá', en: 'In the name & "power"' },
    { th: 'อาเมน', rom: 'aa-meen', en: 'Amen.' },
  ],
};

test('the published settings are complete, and every prayer has both languages on every line', () => {
  const { prayers } = P.expand(DATA);
  P.checkSettings(DATA.audio, prayers);
  for (const p of prayers) for (const l of p.lines) for (const lang of P.LANGS) assert.ok(l[lang], `${p.id}: ${lang}`);
});

// ── A prayer made of other prayers ───────────────────────────────────────────

const line = (th, en = th) => ({ th, rom: 'r', en });
const part = (id, lines, extra = {}) => ({ id, title: id.toUpperCase(), title_th: 'ท', about: `about ${id}`, source: { name: 's', url: 'https://example.org' }, lines, ...extra });
const ICEL = { name: 'The Roman Missal (ICEL, 2010)', notice: 'Excerpts from the English translation of The Roman Missal © 2010, International Commission on English in the Liturgy Corporation. All rights reserved.' };
const sample = () => ({
  audio: settings,
  prayers: [
    { id: 'whole', title: 'Whole', title_th: 'ทั้งหมด', aka: ['All'], about: 'all of it', parts: ['a', { id: 'b', amen: false }, 'c'] },
    part('a', [line('ก'), line('ข')]),
    part('b', [line('ค'), line('อาเมน', 'Amen.')], { source_en: ICEL }),
    part('c', [line('ง')], { listed: false }),
  ],
});

test('a prayer made of parts gets their lines in order, and notes where each part starts', () => {
  const data = sample();
  const whole = P.expand(data).prayers[0];
  assert.deepEqual(whole.lines.map(l => l.th), ['ก', 'ข', 'ค', 'ง'], 'b is said without its Amen');
  assert.deepEqual(whole.parts.map(p => [p.id, p.start]), [['a', 0], ['b', 2], ['c', 3]]);
  assert.deepEqual(whole.parts[1], { id: 'b', title: 'B', title_th: 'ท', about: 'about b', source: data.prayers[2].source, source_en: ICEL, start: 2 });
  assert.equal(whole.lines[0], data.prayers[1].lines[0], 'the very same lines, not copies');
  assert.deepEqual(P.expand(data).prayers[2].lines.map(l => l.th), ['ค', 'อาเมน'], 'its own page keeps the Amen');
  assert.deepEqual(P.expand(P.expand(data)), P.expand(data), 'expanding twice changes nothing');
  assert.equal(P.expand(data).audio, settings, 'everything else in the file passes through');
});

test('expanding refuses a missing part, a part made of parts, a shared id, and an Amen that isn\'t there', () => {
  const refuse = (edit, message) => { const d = sample(); edit(d); assert.throws(() => P.expand(d), message); };
  refuse(d => { d.prayers[0].parts.push('nope'); }, /no prayer "nope"/);
  refuse(d => { d.prayers.push({ id: 'bigger', title: 'x', parts: ['whole'] }); }, /"whole" is itself made of parts/);
  refuse(d => { d.prayers.push(part('a', [line('จ')])); }, /two prayers share the id "a"/);
  refuse(d => { d.prayers[0].parts[0] = { id: 'a', amen: false }; }, /"a" has no closing Amen/);
  refuse(d => { d.prayers[0].lines = [line('ฉ')]; }, /no lines of its own/);
  refuse(d => { d.prayers[0].parts = []; }, /"parts" is empty/);
});

test('the Mass in prayers.json: its parts in Mass order, the Our Father without its Amen', () => {
  const { prayers } = P.expand(DATA);
  const mass = prayers.find(p => p.id === 'mass');
  const byId = id => prayers.find(p => p.id === id);
  assert.deepEqual(mass.parts.map(p => p.id), ['sign-of-the-cross', 'i-confess', 'nicene-creed', 'our-father', 'lamb-of-god', 'lord-i-am-not-worthy']);
  const expected = mass.parts.flatMap(p => (p.id === 'our-father' ? byId(p.id).lines.slice(0, -1) : byId(p.id).lines));
  assert.deepEqual(mass.lines, expected);
  for (const [i, p] of mass.parts.entries()) {
    assert.equal(mass.lines[p.start], expected[p.start]);
    assert.equal(p.start, mass.parts.slice(0, i).reduce((n, q) => n + (q.id === 'our-father' ? byId(q.id).lines.length - 1 : byId(q.id).lines.length), 0));
  }
  assert.equal(mass.lines.at(-1).th, byId('lord-i-am-not-worthy').lines.at(-1).th);
});

test('a change in any part records The Mass again, and only The Mass and that part', () => {
  const data = sample();
  const first = P.plan(data);
  assert.deepEqual([...new Set(first.map(i => i.id))], ['whole', 'a', 'b', 'c'], 'The Mass is planned like any prayer');
  assert.equal(first.find(i => i.id === 'whole' && i.lang === 'th').chars, Array.from('กขคง').length);
  const published = {};
  for (const i of first) {
    published[i.id] ??= { audio: { th: {}, en: {} } };
    published[i.id].audio[i.lang][i.speed] = { hash: i.hash, starts: [0], duration: 1 };
  }
  assert.ok(P.plan(data, published).every(i => i.reuse), 'nothing changed: everything kept');
  data.prayers[3].lines[0].th = 'งู';
  const fresh = P.plan(data, published).filter(i => !i.reuse);
  assert.deepEqual(fresh.map(i => `${i.id} ${i.lang}/${i.speed}`), ['whole th/normal', 'whole th/slow', 'c th/normal', 'c th/slow']);
});

test('the published document carries where the English comes from, whether it\'s listed, and the parts', () => {
  const recs = {};
  for (const lang of P.LANGS) for (const speed of P.SPEEDS) recs[`${lang}/${speed}`] = { file: 'f', hash: 'h', starts: [0], duration: 1 };
  const [whole, a, b, c] = P.expand(sample()).prayers;
  const doc = P.buildDoc(whole, 0, recs, settings);
  assert.deepEqual(doc.parts.map(p => [p.id, p.start]), [['a', 0], ['b', 2], ['c', 3]]);
  assert.deepEqual(doc.parts[1].source_en, ICEL);
  assert.equal(doc.lines.length, 4);
  assert.equal(doc.listed, true);
  assert.deepEqual(P.buildDoc(b, 2, recs, settings).source_en, ICEL);
  assert.equal(P.buildDoc(a, 1, recs, settings).source_en, undefined);
  assert.equal(P.buildDoc(a, 1, recs, settings).parts, undefined);
  assert.equal(P.buildDoc(c, 3, recs, settings).listed, false);
  // As stored: the fields that aren't there are left out, not written as null.
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(P.buildDoc(a, 1, recs, settings)))),
    ['id', 'type', 'order', 'title', 'title_th', 'aka', 'about', 'lines', 'source', 'listed', 'audio']);
});

test('every English credit names its source', () => {
  const credited = DATA.prayers.filter(p => p.source_en);
  assert.deepEqual(credited.map(p => p.id).sort(), ['apostles-creed', 'i-confess', 'lamb-of-god', 'lord-i-am-not-worthy', 'nicene-creed']);
  for (const p of credited) assert.deepEqual(p.source_en, ICEL, p.id);
});

test('the script marks the start of every line, pauses between lines, and escapes the words', () => {
  const ssml = P.buildSsml(prayer, 'en', 'normal', settings);
  assert.match(ssml, /^<speak version="1.0" xmlns="http:\/\/www.w3.org\/2001\/10\/synthesis" xml:lang="en-US">/);
  assert.match(ssml, /<voice name="en-US-AndrewNeural">/);
  assert.equal((ssml.match(/<bookmark mark="s\d+"\/>/g) || []).length, 2);
  assert.equal((ssml.match(/<break time="600ms"\/>/g) || []).length, 1, 'a pause between lines, none after the last');
  assert.match(ssml, /In the name &amp; &quot;power&quot;/);
  assert.doesNotMatch(ssml, /prosody/);

  const slow = P.buildSsml(prayer, 'th', 'slow', settings);
  assert.match(slow, /xml:lang="th-TH"><voice name="th-TH-NiwatNeural"><prosody rate="-30%"><bookmark mark="s0"\/>เดชะพระนาม/);
});

test('a recording keeps its name until its words, voice or settings change', () => {
  const h = P.recordingHash(prayer, 'th', 'normal', settings);
  assert.match(h, /^[0-9a-f]{10}$/);
  assert.equal(P.recordingHash(structuredClone(prayer), 'th', 'normal', { ...settings }), h, 'stable');
  assert.notEqual(P.recordingHash(prayer, 'th', 'slow', settings), h, 'slow differs');
  assert.notEqual(P.recordingHash(prayer, 'en', 'normal', settings), h, 'English differs');
  const edited = structuredClone(prayer); edited.lines[0].th = 'เดชะพระนามพระบิดา';
  assert.notEqual(P.recordingHash(edited, 'th', 'normal', settings), h, 'new words');
  assert.notEqual(P.recordingHash(prayer, 'th', 'normal', { ...settings, voices: { ...settings.voices, th: 'th-TH-PremwadeeNeural' } }), h, 'new voice');
  // The English and romanization lines don't shape a Thai recording.
  const roman = structuredClone(prayer); roman.lines[0].rom = 'changed'; roman.lines[0].en = 'changed';
  assert.equal(P.recordingHash(roman, 'th', 'normal', settings), h);
  assert.equal(P.recordingName('our-father', 'th', 'slow', 'abcdef0123'), 'our-father/th-slow-abcdef0123.mp3');
});

test('a respelling changes what the voice reads, never the prayer as written', () => {
  const say = { ...settings, say: { th: { 'เดชะ': 'เด ชะ' } } };
  const th = P.buildSsml(prayer, 'th', 'normal', say);
  assert.match(th, /<bookmark mark="s0"\/>เด ชะพระนาม/);
  assert.doesNotMatch(th, /เดชะ/);
  assert.equal(P.buildSsml(prayer, 'en', 'normal', say), P.buildSsml(prayer, 'en', 'normal', settings), 'English untouched');
  const recs = {};
  for (const lang of P.LANGS) for (const speed of P.SPEEDS) recs[`${lang}/${speed}`] = { file: 'f', hash: 'h', starts: [0], duration: 1 };
  assert.deepEqual(P.buildDoc(prayer, 0, recs, say).lines, prayer.lines, 'the page shows the Church\'s spelling');
  // One pass, longest word first: a longer entry wins, and a respelling is never respelled again.
  const two = { say: { th: { 'มารีย์พรหมจารี': 'มารีย์ พรหมจารี', 'พรหมจารี': 'พรมมะจารี' } } };
  assert.equal(P.spokenText('มารีย์พรหมจารี', 'th', two), 'มารีย์ พรหมจารี');
  assert.equal(P.spokenText('พรหมจารีแห่งพรหมจารี', 'th', two), 'พรมมะจารีแห่งพรมมะจารี');
  assert.equal(P.spokenText('อาเมน', 'th', settings), 'อาเมน', 'no respellings: the words as written');
});

test('a respelling re-records only the prayers that have the word', () => {
  const say = { ...settings, say: { th: { 'เดชะ': 'เด ชะ' } } };
  assert.notEqual(P.recordingHash(prayer, 'th', 'normal', say), P.recordingHash(prayer, 'th', 'normal', settings));
  const other = structuredClone(prayer); other.lines[0].th = 'และพระบุตร';
  assert.equal(P.recordingHash(other, 'th', 'normal', say), P.recordingHash(other, 'th', 'normal', settings));
  assert.equal(P.recordingHash(prayer, 'en', 'normal', say), P.recordingHash(prayer, 'en', 'normal', settings));
  assert.equal(P.plan({ audio: say, prayers: [prayer] })[0].chars, Array.from('เด ชะพระนามอาเมน').length, 'the free-tier count is what the voice reads');
});

test('a respelling must be for a word a prayer has, and must change something', () => {
  const withSay = say => ({ ...settings, say });
  P.checkSettings(withSay({ th: { 'เดชะ': 'เด ชะ' } }), [prayer]);
  assert.throws(() => P.checkSettings(withSay({ th: { 'ปฐมกาล': 'ปะถมมะกาน' } }), [prayer]), /no prayer has "ปฐมกาล"/);
  assert.throws(() => P.checkSettings(withSay({ th: { 'เดชะ': ' ' } }), [prayer]), /needs a respelling/);
  assert.throws(() => P.checkSettings(withSay({ th: { 'เดชะ': 'เดชะ' } }), [prayer]), /as itself/);
  assert.throws(() => P.checkSettings(withSay({ fr: { a: 'b' } }), [prayer]), /unknown language/);
  assert.throws(() => P.checkSettings(withSay({ th: 'เดชะ' })), /must map words/);
  assert.throws(() => P.checkSettings(withSay(['เดชะ'])), /must map a language/);
});

test('bookmark ticks become line start times in seconds, and a missing line is an error', () => {
  const t = P.timingsFromBookmarks([{ name: 's1', offsetTicks: 23_375_000 }, { name: 's0', offsetTicks: 500_000 }], 2, 362_000_000);
  assert.deepEqual(t, { starts: [0.05, 2.338], duration: 36.2 });
  assert.throws(() => P.timingsFromBookmarks([{ name: 's0', offsetTicks: 0 }], 2, 1e7), /no timing for line 2/);
  assert.throws(() => P.timingsFromBookmarks([{ name: 's0', offsetTicks: 9e7 }, { name: 's1', offsetTicks: 1e7 }], 2, 1e8), /starts before/);
});

test('the plan reuses recordings whose fingerprint matches, and records the rest', () => {
  const data = { audio: settings, prayers: [prayer] };
  const first = P.plan(data);
  assert.equal(first.length, 4);
  assert.deepEqual(first.map(i => `${i.lang}/${i.speed}`), ['th/normal', 'th/slow', 'en/normal', 'en/slow']);
  assert.ok(first.every(i => !i.reuse));
  assert.equal(first[0].chars, Array.from('เดชะพระนามอาเมน').length);

  const doc = P.buildDoc(prayer, 0, Object.fromEntries(first.map(i => [`${i.lang}/${i.speed}`, { file: i.file, hash: i.hash, starts: [0, 1], duration: 2 }])), settings);
  const again = P.plan(data, { [prayer.id]: doc });
  assert.ok(again.every(i => i.reuse), 'nothing changed: everything reused');
  assert.ok(P.plan(data, { [prayer.id]: doc }, { rerecordAll: true }).every(i => !i.reuse), 'unless asked to record again');

  const edited = structuredClone(prayer); edited.lines[1].en = 'Amen!';
  const partly = P.plan({ audio: settings, prayers: [edited] }, { [prayer.id]: doc });
  assert.deepEqual(partly.filter(i => !i.reuse).map(i => `${i.lang}/${i.speed}`), ['en/normal', 'en/slow']);
});

test('the published document carries the prayer, its order and all four recordings, and system fields never leave', () => {
  const recs = {};
  for (const lang of P.LANGS) for (const speed of P.SPEEDS) recs[`${lang}/${speed}`] = { file: `f-${lang}-${speed}`, hash: 'h', starts: [0], duration: 1 };
  const doc = P.buildDoc(prayer, 3, recs, settings);
  assert.equal(doc.id, 'test-prayer');
  assert.equal(doc.type, 'prayer');
  assert.equal(doc.order, 3);
  assert.deepEqual(doc.lines, prayer.lines);
  assert.equal(doc.audio.th.voice, 'th-TH-NiwatNeural');
  assert.equal(doc.audio.en.slow.file, 'f-en-slow');
  delete recs['en/slow'];
  assert.throws(() => P.buildDoc(prayer, 3, recs, settings), /missing en slow/);

  assert.deepEqual(P.stripSystemFields({ id: 'a', _rid: 'x', _etag: 'y', _ts: 1, title: 't' }), { id: 'a', title: 't' });
});

test('bad settings are refused before anything is recorded', () => {
  assert.throws(() => P.checkSettings(undefined), /no "audio" settings/);
  assert.throws(() => P.checkSettings({ ...settings, voices: { th: 'x' } }), /no en voice/);
  assert.throws(() => P.checkSettings({ ...settings, slowRate: 'slow' }), /slowRate/);
  assert.throws(() => P.checkSettings({ ...settings, breakMs: 99999 }), /breakMs/);
});

test('the published document carries the prayer\'s other names (search finds it by them), and adding them re-records nothing', () => {
  const recs = {};
  for (const lang of P.LANGS) for (const speed of P.SPEEDS) recs[`${lang}/${speed}`] = { file: 'f', hash: 'h', starts: [0], duration: 1 };
  assert.deepEqual(P.buildDoc({ ...prayer, aka: ['Ave Maria'] }, 0, recs, settings).aka, ['Ave Maria']);
  assert.deepEqual(P.buildDoc(prayer, 0, recs, settings).aka, []);
  for (const lang of P.LANGS) for (const speed of P.SPEEDS) {
    assert.equal(P.recordingHash({ ...prayer, aka: ['Ave Maria'] }, lang, speed, settings), P.recordingHash(prayer, lang, speed, settings));
  }
});

test('every prayer in prayers.json has a list of other names', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'pray', 'prayers.json'), 'utf8'));
  for (const p of data.prayers) {
    assert.ok(Array.isArray(p.aka), `${p.id}: aka should be a list`);
    for (const name of p.aka) assert.ok(typeof name === 'string' && name.trim() === name && name.length > 1, `${p.id}: "${name}"`);
  }
});
