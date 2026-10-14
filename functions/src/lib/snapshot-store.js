// Where the saints snapshot lives: one blob (a file in Azure Storage), at
// SAINTS_SNAPSHOT_URL. The Function app reads and writes it with its own
// managed identity (FUNC_IDENTITY_CLIENT_ID); there's no key to leak.
const { BlobClient } = require('@azure/storage-blob');
const { ManagedIdentityCredential } = require('@azure/identity');

let client = null;
function blob() {
  const url = process.env.SAINTS_SNAPSHOT_URL;
  if (!url) return null; // local runs and tests: no snapshot, the static bios answer
  client ??= new BlobClient(url, new ManagedIdentityCredential({ clientId: process.env.FUNC_IDENTITY_CLIENT_ID }));
  return client;
}

async function writeSnapshot(snapshot) {
  const b = blob();
  if (!b) throw new Error('SAINTS_SNAPSHOT_URL is not set');
  const body = JSON.stringify(snapshot);
  await b.getBlockBlobClient().upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' },
  });
  return Buffer.byteLength(body);
}

// The snapshot is kept in memory for a while, so a busy day reads the blob a
// handful of times, not once per request. When the blob can't be read, the
// last good copy (or none) is used and the read is tried again a minute later.
const FRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;
let cached = null;
let nextReadAt = 0;

async function readSnapshot({ log = () => {} } = {}) {
  const b = blob();
  if (!b || Date.now() < nextReadAt) return cached;
  try {
    const buf = await b.downloadToBuffer(0, undefined, { abortSignal: AbortSignal.timeout(5000) });
    cached = JSON.parse(buf.toString('utf8'));
    nextReadAt = Date.now() + FRESH_MS;
  } catch (err) {
    log(`saints snapshot unavailable (${err.statusCode ?? err.name}: ${String(err.message).split('\n')[0]}); ${cached ? 'keeping the last copy' : 'using the bundled bios'}`);
    nextReadAt = Date.now() + RETRY_MS;
  }
  return cached;
}

module.exports = { readSnapshot, writeSnapshot };
