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
  P.checkSettings(DATA.audio);
  for (const p of DATA.prayers) for (const l of p.lines) for (const lang of P.LANGS) assert.ok(l[lang], `${p.id}: ${lang}`);
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
