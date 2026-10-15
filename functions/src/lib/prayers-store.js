// Where the API reads the prayers and their recordings: Cosmos DB (the
// `prayers` container) and the private `pray-audio` blob container. Both with
// the Function app's managed identity (FUNC_IDENTITY_CLIENT_ID), which may
// only read them (infra/modules/pray.bicep). There are no keys to leak: both
// accounts have key access switched off.
//
// Unlike the saints' database, Cosmos DB never sleeps: it has a fixed budget
// of request units every second (1000 RU/s, free), so the API reads it live.
// Answers are still kept in memory for a few minutes, and Cloudflare keeps
// them too, so most visits never reach the database.
const { ManagedIdentityCredential } = require('@azure/identity');
const { stripSystemFields } = require('./prayers');

const FRESH_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5000;

let credential;
const identity = () => (credential ??= new ManagedIdentityCredential({ clientId: process.env.FUNC_IDENTITY_CLIENT_ID }));

// ── Cosmos DB ────────────────────────────────────────────────────────────────

function cosmosContainer() {
  const { COSMOS_ENDPOINT, COSMOS_DATABASE, PRAYERS_CONTAINER } = process.env;
  if (!COSMOS_ENDPOINT) return null; // local runs and tests: no database
  const { CosmosClient } = require('@azure/cosmos');
  const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, aadCredentials: identity() });
  return client.database(COSMOS_DATABASE).container(PRAYERS_CONTAINER);
}

// The list query and each point read, remembered for FRESH_MS. If the
// database can't be reached, the last good answer is used (the prayers change
// rarely); with nothing remembered, the caller says "unavailable" and the
// site falls back to its own copy.
function prayersStore(container = cosmosContainer(), { log = () => {} } = {}) {
  const memory = new Map(); // key → { value, at }

  async function remembered(key, read) {
    const hit = memory.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.value;
    if (!container) throw new Error('prayers database is not configured');
    try {
      const { value, ru } = await read();
      log(`prayers read: ${key}; ${ru.toFixed(2)} RU`);
      memory.set(key, { value, at: Date.now() });
      return value;
    } catch (err) {
      if (hit) {
        log(`prayers read failed (${err.message}); using the copy from ${new Date(hit.at).toISOString()}`);
        return hit.value;
      }
      throw err;
    }
  }

  const options = () => ({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });

  return {
    // [{ id, title, title_th, about }] in the order prayers.json lists them.
    list: () => remembered('list', async () => {
      const res = await container.items
        .query('SELECT c.id, c.title, c.title_th, c.about, c["order"] FROM c WHERE c.type = "prayer"', options())
        .fetchAll();
      const value = res.resources
        .sort((a, b) => a.order - b.order)
        .map(({ id, title, title_th, about }) => ({ id, title, title_th, about }));
      return { value, ru: res.requestCharge ?? 0 };
    }),

    // The whole document (null if there's no such prayer): a point read by
    // id, which is also the partition key, so about 1 RU.
    get: id => remembered(`prayer:${id}`, async () => {
      const res = await container.item(id, id).read(options());
      const value = res.resource ? stripSystemFields(res.resource) : null;
      return { value, ru: res.requestCharge ?? 0 };
    }),
  };
}

// ── Recordings ───────────────────────────────────────────────────────────────

// A recording's name contains a fingerprint of its words, so its bytes never
// change: once read, it's kept in memory (all forty together are a few MB),
// and byte ranges are served from there.
const MAX_REMEMBERED_BYTES = 50 * 1024 * 1024;

function audioStore(containerUrl = process.env.PRAY_AUDIO_URL) {
  let container = null;
  const files = new Map();
  let bytes = 0;

  return {
    // The file's bytes, or null if there's no such recording.
    async read(name) {
      if (files.has(name)) return files.get(name);
      if (!containerUrl) throw new Error('recordings storage is not configured');
      if (!container) {
        const { ContainerClient } = require('@azure/storage-blob');
        container = new ContainerClient(containerUrl, identity());
      }
      let body;
      try {
        body = await container.getBlockBlobClient(name).downloadToBuffer(0, undefined, { abortSignal: AbortSignal.timeout(10_000) });
      } catch (err) {
        if (err.statusCode === 404) return null;
        throw err;
      }
      if (bytes + body.length <= MAX_REMEMBERED_BYTES) {
        files.set(name, body);
        bytes += body.length;
      }
      return body;
    },
  };
}

module.exports = { prayersStore, audioStore, FRESH_MS };
