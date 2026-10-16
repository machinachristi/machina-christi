const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// HTTP and timer triggers are built into the Functions host; every other
// trigger (queues, blobs, …) comes from the extension bundle, which host.json
// must ask for. Without it the host loads fine, the unit tests pass, and the
// function silently never runs (seen with the saints-publish queue, AB#81).
test('host.json asks for the extension bundle whenever a function uses a non-HTTP, non-timer trigger', () => {
  const dir = path.join(__dirname, '..', 'src', 'functions');
  const others = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .filter(f => /app\.(?!http\b|timer\b|get\b|post\b)[a-zA-Z]+\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.ok(others.length > 0, 'expected the saints queue trigger');
  const host = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'host.json'), 'utf8'));
  assert.equal(host.extensionBundle?.id, 'Microsoft.Azure.Functions.ExtensionBundle', `needed by ${others.join(', ')}`);
  assert.match(host.extensionBundle.version, /^\[4\./);
});
