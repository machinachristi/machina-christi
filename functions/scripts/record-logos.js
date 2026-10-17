// Records the Logos cards' sounds: each Thai consonant's name, read by the
// synthetic voice named in logos/thai.json, at normal speed and slowly. The
// MP3s live with the site (logos/audio/th/), and each card's file names are
// written back into logos/thai.json.
//
// Run by a person, not by CI: the cards rarely change, and a person listens
// to the new sounds before they're committed. It signs in as you (az login),
// with no keys; your identity needs Cognitive Services Speech User on the
// studio for the length of the run (give it for a moment, then remove it):
//
//   SPEECH_ENDPOINT=https://speech-machina-<suffix>.cognitiveservices.azure.com/ \
//     node scripts/record-logos.js [--dry-run]
//
// Same recipe as the prayers (src/lib/prayers.js): a file's name holds a
// fingerprint of its words, voice and settings, so unchanged sounds are kept
// and a changed one gets a new name (and can be cached forever). Files no card
// uses any more are deleted.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/lib/prayers');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'logos', 'thai.json');
const AUDIO = path.join(ROOT, 'logos', 'audio');
const SPEEDS = ['normal', 'slow'];
const GAP_MS = 3200; // the free tier allows about 20 requests a minute

const dryRun = process.argv.includes('--dry-run');

// thai.json is edited by hand too, so it's written back the way it's laid out:
// one card per line.
function writeData(data) {
  const { cards, ...rest } = data;
  const head = JSON.stringify({ ...rest, cards: '__CARDS__' }, null, 2);
  const line = c => '    ' + JSON.stringify(c).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/\{"/g, '{ "').replace(/"\}/g, '" }').replace(/\}$/, ' }');
  fs.writeFileSync(DATA, head.replace('"__CARDS__"', `[\n${cards.map(line).join(',\n')}\n  ]`) + '\n');
}

function settingsFor(data) {
  const a = data.audio || {};
  if (!a.voice) throw new Error('logos/thai.json has no audio.voice');
  // A card is recorded the way a one-line prayer is (no pauses to add).
  const settings = { voices: { th: a.voice, en: a.voice }, slowRate: a.slowRate, breakMs: 0, format: a.format };
  P.checkSettings(settings);
  return settings;
}

function planFor(data, settings) {
  return data.cards.flatMap(card => SPEEDS.map(speed => {
    const asPrayer = { lines: [{ th: card.say }] };
    const hash = P.recordingHash(asPrayer, 'th', speed, settings);
    const file = `th/${card.id}-${speed}-${hash}.mp3`;
    return { card, speed, file, asPrayer, exists: fs.existsSync(path.join(AUDIO, file)) };
  }));
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const settings = settingsFor(data);
  const items = planFor(data, settings);
  const todo = items.filter(i => !i.exists);
  const chars = todo.reduce((s, i) => s + Array.from(i.card.say).length, 0);
  console.log(`${data.cards.length} cards, ${items.length} sounds; ${todo.length} to record (${chars} characters of the free 500,000 a month), voice ${settings.voices.th}.`);
  if (dryRun) { todo.forEach(i => console.log(`  would record ${i.file}  (${i.card.say})`)); return; }

  if (todo.length) {
    const sdk = require('microsoft-cognitiveservices-speech-sdk');
    const { AzureCliCredential } = require('@azure/identity');
    const endpoint = process.env.SPEECH_ENDPOINT;
    if (!endpoint) throw new Error('SPEECH_ENDPOINT is not set');
    const config = sdk.SpeechConfig.fromEndpoint(new URL(endpoint), new AzureCliCredential());
    config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat[settings.format];
    fs.mkdirSync(path.join(AUDIO, 'th'), { recursive: true });
    let last = 0;
    for (const item of todo) {
      for (let attempt = 1; ; attempt++) {
        const wait = last + GAP_MS - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        last = Date.now();
        const synth = new sdk.SpeechSynthesizer(config, null);
        const result = await new Promise((ok, no) => synth.speakSsmlAsync(P.buildSsml(item.asPrayer, 'th', item.speed, settings), ok, no)).finally(() => synth.close());
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          fs.writeFileSync(path.join(AUDIO, item.file), Buffer.from(result.audioData));
          console.log(`  recorded ${item.file} (${result.audioData.byteLength} bytes)`);
          break;
        }
        const details = sdk.CancellationDetails.fromResult(result);
        const busy = /429|throttl|too many|unable to contact server|1006/i.test(details.errorDetails ?? '');
        if (!busy || attempt >= 5) throw new Error(`${item.file}: ${details.errorDetails ?? sdk.ResultReason[result.reason]}`);
        console.log(`  the free tier is busy; waiting before trying ${item.file} again`);
        await new Promise(r => setTimeout(r, 20_000 * attempt));
      }
    }
  }

  // Each card's file names, and nothing left over.
  for (const card of data.cards) {
    card.audio = Object.fromEntries(SPEEDS.map(speed => [speed, items.find(i => i.card === card && i.speed === speed).file]));
  }
  writeData(data);
  const used = new Set(items.map(i => i.file));
  const dir = path.join(AUDIO, 'th');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!used.has(`th/${f}`)) { fs.rmSync(path.join(dir, f)); console.log(`  removed ${f} (no card uses it)`); }
  }
  console.log('logos/thai.json updated. Listen to the new sounds before committing them.');
}

module.exports = { planFor, settingsFor, writeData };
if (require.main === module) main().catch(err => { console.error(err.message); process.exit(1); });
