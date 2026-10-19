// The new song (v33): heaven answers whoever walks in it.
//
// "I saw as it were a sea of glass mingled with fire: and them that had
// gotten the victory … stand on the sea of glass, having the harps of God"
// (Revelation 15:2). Every step he takes on the glass kindles a ring of fire
// in it that runs out round his foot and fades, and plucks a harp: walking
// toward the glory the notes climb, walking away from it they fall, and
// wandering they wander — "I heard the voice of harpers harping with their
// harps: and they sung as it were a new song" (14:2-3).
//
// Stand still a while and he lifts up his hands, and his prayer rises before
// him as incense, a thread of golden smoke going up and out toward the light
// (Psalm 141:2; Revelation 8:4; incense.js). Keep still while it rises, and
// heaven answers: a wave of light rolls out through the whole multitude round
// the glory, the glory itself brightens, and the voice of a great multitude
// is heard, "as the voice of many waters … saying, Alleluia" (19:6).
//
// This module only keeps the walker's steps and stillness and decides when
// each of those things happens; sea.js draws the fire, incense.js the smoke,
// glory.js the answer, and main.js hands the notes to the ambience.

import { mulberry32 } from '../util.js';
import { GLORY } from './layout.js';

const STRIDE = 0.85;           // metres between footfalls on the glass
const JUMP = 3;                // a move longer than this in one frame is a teleport
const STILL_SPEED = 0.2;       // m/s; slower than this he is standing
const PRAY_AFTER = 2.2;        // seconds standing still before his hands lift
const ANSWER_AFTER = 6.5;      // seconds of his prayer rising before heaven answers
const ANSWER_AGAIN = 26;       // …and again, if he stays, this long after
const ANSWER_HELD = 6;         // seconds the answer's word stays on the line
const SCALE = 11;              // notes in the harps' scale (see audio.js)
const HANDS_Y = 2.0;           // where his lifted hands are, above the glass
const HANDS_OUT = 0.35;        // …and how far before him

export function createSong({ sea, incense, glory }) {
  // Its own seeded stream for the harps' wandering, above every seed used.
  const rng = mulberry32(20260859);

  let last = null;
  let speed = 0;
  let travel = 0;
  let still = 0;
  let steps = 0;
  let note = 4;
  let notes = 0;
  let prayers = 0;
  let prayed = 0;              // seconds this prayer has been rising
  let nextAnswer = ANSWER_AFTER;
  let answers = 0;
  let answeredAt = -1e6;
  let clock = 0;
  const hands = { x: 0, y: HANDS_Y, z: 0 };

  // One footfall: the ring of fire, and a note on the harps that climbs as
  // he goes toward the glory and falls as he comes away from it.
  function footfall(x, z, dx, dz) {
    steps++;
    sea.kindle(x, z, clock);
    const len = Math.hypot(dx, dz) || 1;
    const toward = ((GLORY.x - x) * dx + (GLORY.z - z) * dz) / (len * (Math.hypot(GLORY.x - x, GLORY.z - z) || 1));
    let by;
    if (toward > 0.4) by = rng() < 0.8 ? 1 : (rng() < 0.5 ? 2 : -1);
    else if (toward < -0.4) by = rng() < 0.8 ? -1 : (rng() < 0.5 ? -2 : 1);
    else by = [-2, -1, -1, 1, 1, 2][Math.floor(rng() * 6)];
    note += by;
    // At either end of the harp the tune turns back on itself.
    if (note > SCALE - 1) note = SCALE - 3;
    if (note < 0) note = 2;
    notes++;
  }

  // dt: seconds; time: heaven's own clock; walker: his position; pace: the
  // speed he is walking at, or trying to (character.js) — so a walk held
  // against the rim or a trunk, which goes nowhere, is never taken for
  // standing still; facing: his yaw, for where his lifted hands are.
  function update(dt, time, walker, pace = 0, facing = 0) {
    clock = time;
    let prayer = null;
    if (walker) {
      if (!last) last = { x: walker.x, z: walker.z };
      const dx = walker.x - last.x, dz = walker.z - last.z;
      const moved = Math.hypot(dx, dz);
      last.x = walker.x; last.z = walker.z;
      if (moved > JUMP) {
        // Set down somewhere new (the arrival, or a test's teleport): no
        // step taken, and any stillness begins again from here.
        travel = 0; still = 0; speed = 0;
      } else {
        speed += (moved / Math.max(dt, 1e-4) - speed) * Math.min(1, dt * 10);
        travel += moved;
        while (travel >= STRIDE) {
          travel -= STRIDE;
          footfall(walker.x, walker.z, dx, dz);
        }
        still = speed < STILL_SPEED && pace < STILL_SPEED ? still + dt : 0;
      }

      if (still >= PRAY_AFTER) {
        if (prayed === 0) { prayers++; nextAnswer = ANSWER_AFTER; }
        prayed += dt;
        // His hands, lifted a little before him (the smoke then leans away
        // toward the glory, whichever way he faces — incense.js).
        hands.x = walker.x + Math.sin(facing) * HANDS_OUT;
        hands.z = walker.z + Math.cos(facing) * HANDS_OUT;
        prayer = hands;
        if (prayed >= nextAnswer) {
          nextAnswer += ANSWER_AGAIN;
          answers++;
          answeredAt = time;
          glory.answer(time);
        }
      } else {
        prayed = 0;
      }
    }
    incense.update(dt, time, prayer);
  }

  const praying = () => still >= PRAY_AFTER;
  const answering = () => clock - answeredAt < ANSWER_HELD;

  // The line under the screen: the multitude's word while it answers, and
  // the psalm's while his prayer rises (heaven.js decides which comes first,
  // among the saints' names and the rest).
  const ANSWER_WORD = { name: 'Hallelujah', label: 'the voice of a great multitude' };
  const PRAYER_WORD = { name: 'Ketoret', label: 'let my prayer be set forth as incense' };
  const answerWord = () => (answering() ? ANSWER_WORD : null);
  const prayerWord = () => (praying() ? PRAYER_WORD : null);

  // Read every frame by main.js, so it costs nothing: no count, no allocation.
  const sung = { notes: 0, note: 0, answers: 0, praying: false };
  function song() {
    sung.notes = notes;
    sung.note = note;
    sung.answers = answers;
    sung.praying = praying();
    return sung;
  }

  function state() {
    return {
      steps, notes, note, prayers, answers,
      praying: praying(),
      answering: answering(),
      rings: sea.rings(clock),
    };
  }

  return { update, answerWord, prayerWord, song, state };
}
