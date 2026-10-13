const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listMigrations, checksum, splitBatches, substitute, pending } = require('../scripts/migrations');

function dirWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

test('migrations are listed in number order, ignoring other files', () => {
  const dir = dirWith({ '0002_b.sql': 'B', '0001_a.sql': 'A', 'README.md': 'x' });
  assert.deepEqual(listMigrations(dir).map(m => m.id), ['0001_a', '0002_b']);
});

test('badly named or duplicate-numbered migrations are refused', () => {
  assert.throws(() => listMigrations(dirWith({ 'schema.sql': '' })), /0001_short_name/);
  assert.throws(() => listMigrations(dirWith({ '0001_a.sql': '', '0001_b.sql': '' })), /share the number/);
});

test('the real db/migrations folder is valid', () => {
  listMigrations(path.join(__dirname, '..', '..', 'db', 'migrations'));
});

test('GO on its own line separates batches', () => {
  const text = 'CREATE TABLE t (id int)\nGO\nCREATE VIEW v AS SELECT 1 AS x\n  go  \n\nGO\nSELECT 1 -- GOOD is not GO';
  assert.deepEqual(splitBatches(text), ['CREATE TABLE t (id int)', 'CREATE VIEW v AS SELECT 1 AS x', 'SELECT 1 -- GOOD is not GO']);
});

test('placeholders are filled, and an unknown one is an error', () => {
  assert.equal(substitute("CREATE USER [$(NAME)] WITH OBJECT_ID = '$(ID)'", { NAME: 'id-x', ID: '42' }),
    "CREATE USER [id-x] WITH OBJECT_ID = '42'");
  assert.throws(() => substitute('$(MISSING)', {}), /no value for \$\(MISSING\)/);
});

test('pending: only what has not run, and never an edited or vanished migration', () => {
  const ms = [{ id: '0001_a', checksum: checksum('A') }, { id: '0002_b', checksum: checksum('B') }];
  assert.deepEqual(pending(ms, []).map(m => m.id), ['0001_a', '0002_b']);
  assert.deepEqual(pending(ms, [{ id: '0001_a', checksum: checksum('A') }]).map(m => m.id), ['0002_b']);
  assert.throws(() => pending(ms, [{ id: '0001_a', checksum: checksum('A edited') }]), /edited after it was applied/);
  assert.throws(() => pending(ms, [{ id: '0000_gone', checksum: 'x' }]), /file is gone/);
});

test('a checksum ignores Windows line endings', () => {
  assert.equal(checksum('a\r\nb'), checksum('a\nb'));
});
