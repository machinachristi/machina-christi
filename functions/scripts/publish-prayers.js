// Publishes the prayers: records any prayer whose words, voice or settings
// changed, stores the recordings, and writes every prayer's document to
// Cosmos DB. Run by .github/workflows/pray-publish.yml on main.
//
//   node scripts/publish-prayers.js                 publish
//   node scripts/publish-prayers.js --rerecord-all  record everything again
//   node scripts/publish-prayers.js --dry-run [--base <prayers.json>]
//       no Azure at all: list which recordings would be made, compared with
//       another copy of prayers.json (a pull request compares with main's)
//
// Signs in as whoever the Azure CLI is signed in as: in CI, the deploy
// identity (a managed identity, via OIDC). There are no keys: Cosmos DB,
// Speech and the recordings storage all have key access switched off, and
// that identity holds just the data roles it needs (infra/modules/pray.bicep).
//
// Settings come from the environment (main.bicep's outputs): COSMOS_ENDPOINT,
// COSMOS_DATABASE, PRAYERS_CONTAINER, SPEECH_ENDPOINT, AUDIO_CONTAINER_URL.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/lib/prayers');

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => (i => (i >= 0 ? args[i + 1] : undefined))(args.indexOf(name));

const DATA_PATH = option('--data') ?? path.join(__dirname, '..', '..', 'pray', 'prayers.json');
// The free tier is 500,000 characters a month; one run never needs more than
// a fraction of that. Anything bigger is a mistake (a loop, a wrong file).
const MAX_CHARS_PER_RUN = 50_000;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const summaryLines = [];
const say = line => { console.log(line); summaryLines.push(line); };
function writeSummary() {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n') + '\n');
}

function table(items, extra = () => '') {
  say('| Prayer | Recording | Characters | |');
  say('|---|---|---:|---|');
  for (const i of items) say(`| ${i.id} | ${i.lang} ${i.speed} | ${i.chars} | ${i.reuse ? 'kept' : '**new**'}${extra(i)} |`);
}

// Published documents keyed by id, shaped enough for plan() to compare.
function asPublished(data) {
  if (!data?.audio) return {};
  const out = {};
  for (const p of data.prayers) {
    out[p.id] = { audio: {} };
    for (const lang of P.LANGS) {
      out[p.id].audio[lang] = {};
      for (const speed of P.SPEEDS) out[p.id].audio[lang][speed] = { hash: P.recordingHash(p, lang, speed, data.audio) };
    }
  }
  return out;
}

function dryRun(data) {
  const base = option('--base');
  const items = P.plan(data, base ? asPublished(readJson(base)) : {});
  const fresh = items.filter(i => !i.reuse);
  const chars = fresh.reduce((s, i) => s + i.chars, 0);
  say(`### Prayers: what publishing would do`);
  say(`${data.prayers.length} prayers, ${items.length} recordings; **${fresh.length} to make** (${chars.toLocaleString('en')} characters of the free 500,000 a month)${base ? ', compared with main' : ''}.`);
  say('');
  if (fresh.length) table(fresh);
  if (chars > MAX_CHARS_PER_RUN) throw new Error(`${chars} characters is more than one run may use (${MAX_CHARS_PER_RUN})`);
}

// ── Talking to Azure ─────────────────────────────────────────────────────────

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function record(sdk, credential, prayer, item, settings) {
  const config = sdk.SpeechConfig.fromEndpoint(new URL(env('SPEECH_ENDPOINT')), credential);
  const format = sdk.SpeechSynthesisOutputFormat[settings.format];
  if (format === undefined) throw new Error(`unknown audio format ${settings.format}`);
  config.speechSynthesisOutputFormat = format;
  const ssml = P.buildSsml(prayer, item.lang, item.speed, settings);

  // The free tier allows about 20 requests a minute. Requests are spaced out
  // (see pace()), and if the service still refuses or hangs up (seen as
  // "Unable to contact server", WebSocket code 1006), wait and try again.
  for (let attempt = 1; ; attempt++) {
    await pace();
    const synth = new sdk.SpeechSynthesizer(config, null);
    const marks = [];
    synth.bookmarkReached = (_, e) => marks.push({ name: e.text, offsetTicks: e.audioOffset });
    const result = await new Promise((ok, no) => synth.speakSsmlAsync(ssml, ok, no)).finally(() => synth.close());
    if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
      const timing = P.timingsFromBookmarks(marks, prayer.lines.length, result.audioDuration);
      return { audio: Buffer.from(result.audioData), ...timing };
    }
    const details = sdk.CancellationDetails.fromResult(result);
    const busy = /429|throttl|too many|unable to contact server|1006/i.test(details.errorDetails ?? '');
    if (!busy || attempt >= 5) throw new Error(`${item.file}: ${details.errorDetails ?? sdk.ResultReason[result.reason]}`);
    console.log(`  the free tier is busy; waiting before trying ${item.file} again`);
    await new Promise(r => setTimeout(r, 20_000 * attempt));
  }
}

// At most one request every 3.2 seconds: under the free tier's 20 a minute.
const GAP_MS = 3200;
let lastRequestAt = 0;
async function pace() {
  const wait = lastRequestAt + GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function publish(data) {
  const sdk = require('microsoft-cognitiveservices-speech-sdk');
  const { CosmosClient } = require('@azure/cosmos');
  const { ContainerClient } = require('@azure/storage-blob');
  const { AzureCliCredential } = require('@azure/identity');

  const credential = new AzureCliCredential();
  const cosmos = new CosmosClient({ endpoint: env('COSMOS_ENDPOINT'), aadCredentials: credential });
  const container = cosmos.database(env('COSMOS_DATABASE')).container(env('PRAYERS_CONTAINER'));
  const audio = new ContainerClient(env('AUDIO_CONTAINER_URL'), credential);

  let ru = 0;
  const existing = await container.items.query('SELECT * FROM c').fetchAll();
  ru += existing.requestCharge ?? 0;
  const published = Object.fromEntries(existing.resources.map(d => [d.id, d]));

  const items = P.plan(data, published, { rerecordAll: flag('--rerecord-all') });
  const fresh = items.filter(i => !i.reuse);
  const chars = fresh.reduce((s, i) => s + i.chars, 0);
  if (chars > MAX_CHARS_PER_RUN) throw new Error(`${chars} characters is more than one run may use (${MAX_CHARS_PER_RUN})`);

  say(`### Prayers published`);
  say(`Read ${existing.resources.length} published prayers (${(existing.requestCharge ?? 0).toFixed(1)} RU).`);

  // One prayer at a time: its recordings, then its document. If a run stops
  // partway, every prayer already written keeps its recordings, and the next
  // run only makes what's still missing.
  const sizes = {};
  const charges = {};
  for (const [order, prayer] of data.prayers.entries()) {
    const recordings = {};
    for (const item of items.filter(i => i.id === prayer.id)) {
      const key = `${item.lang}/${item.speed}`;
      if (item.reuse) {
        recordings[key] = { file: item.file, hash: item.hash, starts: item.reuse.starts, duration: item.reuse.duration };
        continue;
      }
      const made = await record(sdk, credential, prayer, item, data.audio);
      await audio.getBlockBlobClient(item.file).uploadData(made.audio, {
        blobHTTPHeaders: { blobContentType: 'audio/mpeg', blobCacheControl: CACHE_CONTROL },
      });
      sizes[item.file] = made.audio.length;
      recordings[key] = { file: item.file, hash: item.hash, starts: made.starts, duration: made.duration };
      console.log(`  recorded ${item.file}: ${made.duration}s, ${Math.round(made.audio.length / 1024)} KB`);
    }
    const res = await container.items.upsert(P.buildDoc(prayer, order, recordings, data.audio));
    charges[prayer.id] = res.requestCharge ?? 0;
    ru += charges[prayer.id];
    console.log(`  published ${prayer.id} (${charges[prayer.id].toFixed(1)} RU)`);
  }

  // Prayers taken out of prayers.json come off the site too. Their
  // recordings stay in storage (a few KB each); nothing refers to them.
  const removed = Object.keys(published).filter(id => !data.prayers.some(p => p.id === id));
  for (const id of removed) {
    const res = await container.item(id, id).delete();
    ru += res.requestCharge ?? 0;
  }

  say(`${data.prayers.length} prayers written; ${fresh.length} recordings made (${chars.toLocaleString('en')} characters), ${items.length - fresh.length} kept${removed.length ? `; removed: ${removed.join(', ')}` : ''}.`);
  say(`Cosmos DB work: **${ru.toFixed(1)} RU** in all (the free tier allows 1,000 RU every second).`);
  say('');
  table(items, i => (i.reuse ? '' : ` · ${Math.round((sizes[i.file] ?? 0) / 1024)} KB`) + (charges[i.id] !== undefined && i.lang === 'th' && i.speed === 'normal' ? ` · doc write ${charges[i.id].toFixed(1)} RU` : ''));
}

(async () => {
  const data = readJson(DATA_PATH);
  P.checkSettings(data.audio);
  if (flag('--dry-run')) dryRun(data);
  else await publish(data);
})()
  .catch(err => { say(`**Publishing failed:** ${err.message}`); process.exitCode = 1; })
  .finally(writeSummary);
