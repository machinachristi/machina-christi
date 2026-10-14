const test = require('node:test');
const assert = require('node:assert/strict');
const { health } = require('../src/functions/health');

test('health reports ok, the build, and is never cached', async () => {
  const res = await health();
  assert.equal(res.status, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.jsonBody.status, 'ok');
  assert.equal(res.jsonBody.service, 'machina-christi-api');
  assert.equal(typeof res.jsonBody.commit, 'string');
  assert.ok(!Number.isNaN(Date.parse(res.jsonBody.time)));
  assert.equal(res.jsonBody.region, 'dev'); // API_REGION isn't set outside Azure
});
