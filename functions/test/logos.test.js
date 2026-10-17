const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planFor, settingsFor } = require('../scripts/record-logos');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'logos', 'thai.json'), 'utf8'));

test('every Logos card plays the sound its words and voice call for (re-run record-logos.js after changing them)', () => {
  const items = planFor(DATA, settingsFor(DATA));
  for (const card of DATA.cards) {
    for (const speed of ['normal', 'slow']) {
      const want = items.find(i => i.card === card && i.speed === speed).file;
      assert.equal(card.audio?.[speed], want, `${card.id} ${speed}: "${card.say}" in ${DATA.audio.voice} should be ${want}`);
    }
  }
  assert.equal(items.filter(i => !i.exists).length, 0, 'every sound is recorded');
});

test('a changed word or voice changes the sound\'s name, so caches never serve the old one', () => {
  const settings = settingsFor(DATA);
  const card = DATA.cards[0];
  const [before] = planFor({ ...DATA, cards: [card] }, settings);
  const [newWords] = planFor({ ...DATA, cards: [{ ...card, say: `${card.say} ${card.say}` }] }, settings);
  const [newVoice] = planFor({ ...DATA, cards: [card] }, { ...settings, voices: { th: 'th-TH-NiwatNeural', en: 'th-TH-NiwatNeural' } });
  assert.notEqual(before.file, newWords.file);
  assert.notEqual(before.file, newVoice.file);
  assert.equal(before.file, planFor({ ...DATA, cards: [card] }, settings)[0].file, 'the same recipe gives the same name');
});
