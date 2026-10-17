const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../src/lib/search-query');

test('queries are tidied: lowercase, single spaces, at most 64 characters', () => {
  assert.equal(Q.normalizeQuery('  Saint   AGNES '), 'saint agnes');
  assert.equal(Q.normalizeQuery('a'.repeat(100)).length, 64);
  assert.equal(Q.normalizeQuery(undefined), '');
  assert.equal(Q.normalizeQuery('Thére\u0300se'), 'thérèse', 'composed (NFC)');
});

test('a query needs two characters and a letter or digit', () => {
  assert.equal(Q.isSearchable('a'), false);
  assert.equal(Q.isSearchable('--'), false);
  assert.equal(Q.isSearchable('ag'), true);
  assert.equal(Q.isSearchable('พร'), true);
});

test('strict first, with the last word also as a prefix, accents folded on the prefix only', () => {
  const [exact] = Q.queryPlan('saint thérè');
  assert.deepEqual(exact, { step: 'exact', search: 'saint (thérè | there*)', queryType: 'simple', searchMode: 'all' });
});

test('small English words are dropped, unless they are all there is', () => {
  assert.equal(Q.queryPlan('martyrs of japan')[0].search, 'martyrs (japan | japan*)');
  assert.equal(Q.queryPlan('of the')[0].search, 'of (the | the*)');
});

test('then one letter wrong for words of four letters or more, then any word', () => {
  const plan = Q.queryPlan('fransis assisi');
  assert.deepEqual(plan.map(p => p.step), ['exact', 'typo', 'any']);
  assert.equal(plan[1].search, 'fransis~1 (assisi~1 OR assisi*)');
  assert.equal(plan[1].queryType, 'full');
  assert.equal(plan[2].searchMode, 'any');
  assert.deepEqual(Q.queryPlan('ag').map(p => p.step), ['exact'], 'nothing to relax for one short word');
});

test('query syntax typed by a visitor is just text: no NOT, OR, phrases, wildcards or fields', () => {
  for (const evil of ['-mary', 'mary | joseph', '"x" title:y', 'a* (b)', 'x~5 \\ y', 'm+a&&r!y']) {
    for (const step of Q.queryPlan(Q.normalizeQuery(evil))) {
      const words = step.search.replace(/\((\S+) (\||OR) (\S+)\*\)/g, '$1').replace(/~1/g, '');
      assert.doesNotMatch(words, /[-+|"\\:!&^~{}[\]/?]|\bAND\b|\bNOT\b/, `${evil} → ${step.search}`);
    }
  }
});

test('Thai words are quoted, so they must match as that exact run; the last one may also be a prefix', () => {
  assert.equal(Q.queryPlan('พระแม่มารีย์')[0].search, '("พระแม่มารีย์" | พระแม่มารีย์*)');
  assert.equal(Q.queryPlan('พระบิดา ข้าพเจ้า')[0].search, '"พระบิดา" ("ข้าพเจ้า" | ข้าพเจ้า*)');
  // Thai vowels and tone marks are combining marks: never folded away.
  assert.ok(Q.queryPlan('ทั้งหลาย')[0].search.includes('ทั้งหลาย*'));
  assert.deepEqual(Q.queryPlan('พระบิดา').map(p => p.step), ['exact'], 'no typo step for Thai');
});

test('a highlight becomes text plus ranges, with touching Thai pieces merged', () => {
  const { PRE: a, POST: b } = Q;
  assert.deepEqual(Q.parseFragment(`${a}Agnes${b} was ${a}martyred${b}.`), { text: 'Agnes was martyred.', marks: [[0, 5], [10, 8]] });
  assert.deepEqual(Q.parseFragment(`วันทา${a}มา${b}${a}รี${b}${a}ย์${b} เปี่ยม`), { text: 'วันทามารีย์ เปี่ยม', marks: [[5, 6]] });
  assert.deepEqual(Q.parseFragment('<img src=x onerror=alert(1)>'), { text: '<img src=x onerror=alert(1)>', marks: [] }, 'HTML is just text');
});

test('the snippet comes from the most telling field, with its language', () => {
  const { PRE: a, POST: b } = Q;
  assert.equal(Q.snippetFrom({ title: [`${a}x${b}`], lines_th: [`${a}ก${b}`] }).lang, 'th');
  assert.equal(Q.snippetFrom({ body: [`${a}x${b}`], lines_rom: [`${a}phra${b}`] }).lang, 'th-Latn');
  assert.equal(Q.snippetFrom({ title: [`${a}x${b}`] }), null, 'a title match needs no snippet');
  assert.equal(Q.snippetFrom(undefined), null);
});
