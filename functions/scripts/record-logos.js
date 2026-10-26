// Records the Logos sounds: every Thai consonant's name and each of its tones,
// every vowel and its example word, and the five tones, read by the synthetic
// voice named in logos/thai.json. The MP3s live with the site
// (logos/audio/th/), and each file's name is written back into logos/thai.json.
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
// and a changed one gets a new name (and can be cached forever). The same
// words are recorded once, however many cards say them. Files nothing uses
// any more are deleted.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/lib/prayers');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'logos', 'thai.json');
const AUDIO = path.join(ROOT, 'logos', 'audio');
const SPEED = 'normal'; // Logos has one speed
const GAP_MS = 3200; // the free tier allows about 20 requests a minute

const dryRun = process.argv.includes('--dry-run');

// thai.json is edited by hand too, so it's written back the way it's laid out:
// one tone, letter or vowel per line.
const LISTS = ['tones', 'consonants', 'vowels'];
function writeData(data) {
  const line = item => '    ' + JSON.stringify(item, null, 1).replace(/\n\s*/g, ' ');
  const head = JSON.stringify(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, LISTS.includes(k) ? `__${k}__` : v])), null, 2);
  const text = LISTS.reduce((t, k) => t.replace(`"__${k}__"`, () => `[\n${data[k].map(line).join(',\n')}\n  ]`), head);
  fs.writeFileSync(DATA, text + '\n');
}

function settingsFor(data) {
  const a = data.audio || {};
  if (!a.voice) throw new Error('logos/thai.json has no audio.voice');
  // A sound is recorded the way a one-line prayer is (no pauses to add). The
  // prayers' settings check wants a slow rate; Logos never uses it.
  const settings = { voices: { th: a.voice, en: a.voice }, slowRate: '-30%', breakMs: 0, format: a.format };
  P.checkSettings(settings);
  return settings;
}

// Every sound the cards play, in a fixed order: { id, say, rate, set }. id
// names the file, say is what the voice reads, rate (rarely) is its own pace,
// and set(file) stores the file's name.
function soundsFor(data) {
  const sounds = [];
  const add = (id, say, owner, key, rate) => sounds.push({ id, say, rate, owner, key, set: file => { owner[key] = file; } });
  add('tones', data.tone_series.say, data.tone_series, 'audio');
  for (const t of data.tones) add(`tone-${t.id}`, t.say, t, 'audio');
  for (const c of data.consonants) add(c.id, c.say, c, 'audio');
  for (const c of data.consonants) for (const row of c.tones) add(`${c.id}-${row.tone}`, row.say, row, 'audio');
  for (const v of data.vowels) add(`vowel-${v.id}`, v.say, v, 'audio', v.say_rate);
  for (const v of data.vowels) if (v.word) add(`vowel-${v.id}-word`, v.word_say || v.word, v, 'word_audio');
  return sounds;
}

// How to record one sound. One with its own pace is recorded the way a slow
// prayer is, at that pace (the voice stretches the three short gliding vowels
// to full length, so they are said faster), and the pace is in the fingerprint.
function recipeFor(sound, settings) {
  return sound.rate ? { speed: 'slow', settings: { ...settings, slowRate: sound.rate } } : { speed: SPEED, settings };
}

// Which file each sound plays. The first sound with given words names the
// file; later sounds with the same words share it.
function planFor(data, settings) {
  const first = new Map();
  return soundsFor(data).map(sound => {
    const asPrayer = { lines: [{ th: sound.say }] };
    const recipe = recipeFor(sound, settings);
    const hash = P.recordingHash(asPrayer, 'th', recipe.speed, recipe.settings);
    const owner = first.get(hash);
    const file = owner ? owner.file : `th/${sound.id}-${hash}.mp3`;
    const item = { ...sound, asPrayer, recipe, file, shared: Boolean(owner), exists: fs.existsSync(path.join(AUDIO, file)) };
    if (!owner) first.set(hash, item);
    return item;
  });
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const settings = settingsFor(data);
  const items = planFor(data, settings);
  const todo = items.filter(i => !i.shared && !i.exists);
  const files = new Set(items.map(i => i.file));
  const chars = todo.reduce((s, i) => s + Array.from(i.say).length, 0);
  console.log(`${items.length} sounds in ${files.size} files; ${todo.length} to record (${chars} characters of the free 500,000 a month), voice ${settings.voices.th}.`);
  if (dryRun) { todo.forEach(i => console.log(`  would record ${i.file}  (${i.say})`)); return; }

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
        const ssml = P.buildSsml(item.asPrayer, 'th', item.recipe.speed, item.recipe.settings);
        const result = await new Promise((ok, no) => synth.speakSsmlAsync(ssml, ok, no)).finally(() => synth.close());
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

  // Every sound's file name, and nothing left over.
  for (const item of items) item.set(item.file);
  writeData(data);
  const dir = path.join(AUDIO, 'th');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!files.has(`th/${f}`)) { fs.rmSync(path.join(dir, f)); console.log(`  removed ${f} (no card uses it)`); }
  }
  console.log('logos/thai.json updated. Listen to the new sounds before committing them.');
}

module.exports = { soundsFor, planFor, settingsFor, writeData };
if (require.main === module) main().catch(err => { console.error(err.message); process.exit(1); });
