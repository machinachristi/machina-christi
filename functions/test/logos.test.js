const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planFor, settingsFor, soundsFor } = require('../scripts/record-logos');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'logos', 'thai.json'), 'utf8'));
const copy = () => JSON.parse(JSON.stringify(DATA));

test('every Logos sound plays the file its words and voice call for (re-run record-logos.js after changing them)', () => {
  const items = planFor(DATA, settingsFor(DATA));
  for (const item of items) {
    assert.equal(item.owner[item.key], item.file, `${item.id}: "${item.say}" in ${DATA.audio.voice} should play ${item.file}`);
  }
  assert.equal(items.filter(i => !i.exists).length, 0, 'every sound is recorded');
});

test('every card is heard: names and tones of the consonants, vowels and their words, the five tones', () => {
  const ids = new Set(soundsFor(DATA).map(s => s.id));
  for (const t of DATA.tones) assert.ok(ids.has(`tone-${t.id}`));
  for (const c of DATA.consonants) {
    assert.ok(ids.has(c.id));
    for (const row of c.tones) assert.ok(ids.has(`${c.id}-${row.tone}`));
  }
  for (const v of DATA.vowels) {
    assert.ok(ids.has(`vowel-${v.id}`));
    assert.equal(ids.has(`vowel-${v.id}-word`), Boolean(v.word));
  }
});

test('the same words are recorded once, however many cards say them', () => {
  const items = planFor(DATA, settingsFor(DATA));
  const files = new Map();
  for (const i of items) {
    const key = `${i.say}|${i.rate || ''}`;
    if (files.has(key)) assert.equal(i.file, files.get(key), `"${i.say}" is one file`);
    else files.set(key, i.file);
  }
  assert.ok(items.some(i => i.shared), 'some words are shared (ขอ is said by ข and ฃ)');
});

test('a changed word, voice or pace changes the sound\'s name, so caches never serve the old one', () => {
  const settings = settingsFor(DATA);
  const before = planFor(DATA, settings).find(i => i.id === 'ko-kai');
  const newWords = copy(); newWords.consonants[0].say = 'กอ ไก่ ไก่';
  const newVoice = { ...settings, voices: { th: 'th-TH-NiwatNeural', en: 'th-TH-NiwatNeural' } };
  assert.notEqual(planFor(newWords, settings).find(i => i.id === 'ko-kai').file, before.file);
  assert.notEqual(planFor(DATA, newVoice).find(i => i.id === 'ko-kai').file, before.file);
  assert.equal(planFor(DATA, settings).find(i => i.id === 'ko-kai').file, before.file, 'the same recipe gives the same name');

  const vowel = DATA.vowels.find(v => v.say_rate);
  const paced = planFor(DATA, settings).find(i => i.id === `vowel-${vowel.id}`);
  const unpaced = copy(); delete unpaced.vowels.find(v => v.id === vowel.id).say_rate;
  assert.notEqual(planFor(unpaced, settings).find(i => i.id === `vowel-${vowel.id}`).file, paced.file);
});
