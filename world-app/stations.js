// Stations (AB#165): places in the garden he walks to that open something to
// play, and bring him back to the same spot when it is over. Play and delight
// belong in the garden.
//
// The whole pattern lives in the one small list below. Adding another game
// is one more entry here (its name, its place, its verse, its address); the
// landmark, the tap that walks him to it, the caption, the opening and the
// coming back all follow from the entry.
//
// How a station opens: he walks into its landmark (as he walks into the
// ladder's foot), a veil of light gathers, and the game is laid over the
// garden as its own page in a frame filling the screen. The garden is not
// unloaded — its drawing and its sound are only paused — so when the game
// says it is over, the frame is taken away and he is standing exactly where
// he stood. The game stays a separate page that also works by itself.
//
// Like heaven (realm.js), a station can never take the garden down: if the
// game does not say it is ready in time (it never loads, or what loads is
// broken), the veil lifts on the garden again, a quiet
// warning is noted in the console, and that station rests for the visit.

import { createWaymarker } from './scenes/waymarker.js';
import { GATE_POS } from './scenes/gate.js';

export const STATIONS = [
  {
    id: 'camino',
    // The caption beside it (Hebrew derekh, "way").
    name: 'Derekh',
    label: 'the pilgrim road',
    verse: {
      text: 'And an highway shall be there, and a way, and it shall be called The way of holiness.',
      source: 'Isaiah 35:8',
    },
    // Beside the eastward gate, on the garden's side: the road leads out.
    at: { x: 46.6, z: 4.9 },
    faces: { x: 30, z: 2 },
    road: { x: GATE_POS.x, z: GATE_POS.z },
    // The game's address, from this folder. `from=eden` tells the game it
    // was opened here, so its way home leads back to the garden.
    game: '../game.html?from=eden',
    title: 'Camino — the pilgrim road',
    landmark: createWaymarker,
  },
];

const TRIGGER = 1.3;       // m from the landmark: walking into it opens the station
const MIN_SPEED = 0.3;     // m/s — walked into, not merely set down beside it
const REARM = 3;           // m away again before it opens again
const NEAR = 5;            // m: its name is given
const VEIL_IN = 700;       // ms for the veil to gather before the game is laid over
const VEIL_CLOSE = 380;    // ms for it to gather over the game on the way back
const LOAD_MAX = 12000;    // ms for the game to say it is ready, under the full veil

const HOLD = { move: { x: 0, z: 0, quick: false }, world: true };

// pause(true|false): the garden's drawing and sound are stopped or started
// again (main.js). tell(msg): a word to the page that holds the garden.
export function createStations({ scene, character, cancelWalk, pause, tell }) {
  const stations = STATIONS.map(def => ({ def, armed: true, failed: false, mesh: def.landmark(scene, def) }));
  const pos = character.group.position;
  const distTo = s => Math.hypot(pos.x - s.def.at.x, pos.z - s.def.at.z);

  // null | 'entering' (veil gathering) | 'loading' (game under the veil)
  // | 'open' (playing; the garden paused) | 'closing' (veil gathering again)
  let phase = null;
  let current = null;
  let frame = null;
  let pushed = false;        // a step of browser history stands for the open game
  let visits = 0;
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const forget = () => { for (const id of timers) clearTimeout(id); timers.clear(); };

  const layer = document.createElement('div');
  layer.className = 'station';
  layer.hidden = true;
  const veil = document.createElement('div');
  veil.className = 'station-veil';
  document.body.append(layer, veil);
  const setVeil = on => veil.classList.toggle('station-veil--on', on);

  function begin(s) {
    current = s;
    phase = 'entering';
    cancelWalk();
    setVeil(true);
    later(mount, VEIL_IN);
  }

  // Under the full veil: the game's page is laid over the garden, and the
  // garden pauses. The veil lifts once the game says it is ready.
  function mount() {
    phase = 'loading';
    frame = document.createElement('iframe');
    frame.className = 'station__frame';
    frame.title = current.def.title;
    frame.setAttribute('allow', 'autoplay');
    // The veil does not lift when a page merely arrives in the frame (it
    // could be an error page): it lifts when the game itself says it is
    // drawn and ready ('station:ready', below).
    frame.src = current.def.game;
    layer.hidden = false;
    layer.appendChild(frame);
    pause(true);
    tell({ type: 'world:station', open: true, id: current.def.id });
    // The browser's back button closes the game rather than leaving the garden.
    try { history.pushState({ station: current.def.id }, ''); pushed = true; } catch (_) { pushed = false; }
    later(() => {
      if (phase !== 'loading') return;
      console.warn(`station: ${current.def.id} was not ready in time, so he stays in the garden`);
      current.failed = true;
      requestClose();
    }, LOAD_MAX);
  }

  function opened() {
    if (phase !== 'loading') return;
    forget();
    phase = 'open';
    visits++;
    setVeil(false);
    try { frame.focus(); } catch (_) { /* fine */ }
  }

  // The way back, asked for by the game's own button or the back button.
  // The history step is given back first, so "back" afterwards leaves the
  // garden as it always did.
  function requestClose() {
    if (phase !== 'open' && phase !== 'loading') return;
    if (pushed) {
      later(leave, 400);          // if the browser never answers
      try { history.back(); } catch (_) { leave(); }
    } else {
      leave();
    }
  }

  function leave() {
    if (phase !== 'open' && phase !== 'loading') return;
    forget();
    pushed = false;
    phase = 'closing';
    setVeil(true);
    later(unmount, VEIL_CLOSE);
  }

  function unmount() {
    if (frame) { frame.remove(); frame = null; }
    layer.hidden = true;
    current.armed = false;
    // He stands where he stood, turned from the landmark toward the garden;
    // it will not open again until he has walked off a little way.
    const s = current.def;
    character.group.rotation.y = Math.atan2(-s.at.x, -s.at.z);
    phase = null;
    current = null;
    pause(false);
    tell({ type: 'world:station', open: false, id: s.id });
    try { window.focus(); } catch (_) { /* fine */ }
    setVeil(false);
  }

  window.addEventListener('message', e => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    if (!e.data) return;
    if (e.data.type === 'station:ready') opened();
    else if (e.data.type === 'station:close') requestClose();
  });
  window.addEventListener('popstate', () => {
    if (!pushed) return;
    pushed = false;
    leave();
  });

  // Once a frame, after the walker has moved. `free`: he is in the garden
  // and his own master (not on the ladder, lying back, or dancing).
  function update(dt, free) {
    if (phase) return;
    for (const s of stations) {
      const d = distTo(s);
      if (!s.armed && d > REARM) s.armed = true;
      if (s.armed && !s.failed && free && d < TRIGGER && character.speed > MIN_SPEED) { begin(s); return; }
    }
  }

  // What he is made to do this frame, or null when he is free: held still
  // while the veil gathers and the game is open.
  function drive() {
    return phase ? HOLD : null;
  }

  function caption() {
    for (const s of stations) {
      if (distTo(s) < NEAR) return { name: s.def.name, label: s.def.label };
    }
    return null;
  }

  return {
    update,
    drive,
    caption,
    close: requestClose,
    // Where a tap may be meant for (main.js, snapTap).
    places: () => stations.map(s => ({ x: s.def.at.x, z: s.def.at.z, id: s.def.id })),
    get idle() { return phase === null; },
    state() {
      return {
        phase,
        open: phase === 'open' ? current.def.id : null,
        visits,
        list: stations.map(s => ({
          id: s.def.id, name: s.def.name, x: s.def.at.x, z: s.def.at.z,
          verse: s.def.verse.source, armed: s.armed, failed: s.failed,
        })),
      };
    },
  };
}
