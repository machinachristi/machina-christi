// Camino's synthesized background music: sound is ON by default, the speaker
// button / M key toggle it, the choice is remembered, and the chant is really
// audible while a journey is under way (and silent when muted).
// Timing rule (see CI-flake notes): poll for state, never sample after a fixed delay.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// The 44px speaker button sits at the bottom-right (see muteRect()).
const MUTE_TAP = { x: 352, y: 723 };

// The Start button on the first screen (see startButton in game.js).
const startTap = async page => {
  await page.waitForFunction(() => typeof startButton !== 'undefined' && startButton);   // drawn on the first frame
  return page.evaluate(() => ({ x: startButton.x + startButton.w / 2, y: startButton.y + startButton.h / 2 }));
};

const level = page => page.evaluate(() => window.CaminoMusic.level());

test.describe('camino music', () => {
  test('sound is on by default; the speaker button toggles and remembers it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/game.html');
    expect(await page.evaluate(() => window.CaminoMusic.isMuted())).toBe(false);

    // Tapping the button mutes — and must not start the game.
    await page.touchscreen.tap(MUTE_TAP.x, MUTE_TAP.y);
    await expect.poll(() => page.evaluate(() => window.CaminoMusic.isMuted())).toBe(true);
    expect(await page.evaluate(() => gameState)).toBe('start');
    expect(await page.evaluate(() => localStorage.getItem('camino_sound'))).toBe('off');

    // The choice survives a reload.
    await page.reload();
    expect(await page.evaluate(() => window.CaminoMusic.isMuted())).toBe(true);

    // M turns it back on.
    await page.keyboard.press('m');
    await expect.poll(() => page.evaluate(() => window.CaminoMusic.isMuted())).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('camino_sound'))).toBe('on');
    expect(errors).toEqual([]);
  });

  test('the chant is audible during a journey and silent when muted', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/game.html');

    // A key press is the user gesture that lets audio start, and begins the game.
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => gameState)).toBe('playing');

    await expect.poll(async () => (await level(page)).rms, { timeout: 20000 }).toBeGreaterThan(0.002);
    // Loud enough to hear, never clipping.
    for (let i = 0; i < 5; i++) expect((await level(page)).peak).toBeLessThan(0.99);

    await page.keyboard.press('m');
    await expect.poll(async () => (await level(page)).rms, { timeout: 10000 }).toBeLessThan(0.0005);
    expect(errors).toEqual([]);
  });

  test('a muted player gets a silent journey', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('camino_sound', 'off'));
    const errors = watchErrors(page);
    await page.goto('/game.html');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => gameState)).toBe('playing');
    // Let the game run a little by waiting on in-game progress, not wall time.
    await expect.poll(() => page.evaluate(() => frame)).toBeGreaterThan(60);
    expect((await level(page)).rms).toBeLessThan(0.0005);
    expect(errors).toEqual([]);
  });

  // Phones only unlock audio from a completed *tap*, never from a swipe — so the
  // first journey must begin with a tap, or the music can't start.
  test('the first journey begins by tapping the Start button, not by swiping', async ({ page }) => {
    await page.goto('/game.html');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent',
      { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

    const s0 = await startTap(page);
    await touch('touchStart', s0.x, s0.y);
    for (let i = 1; i <= 8; i++) await touch('touchMove', s0.x - i * 8, s0.y);
    await touch('touchEnd', s0.x, s0.y);
    // The swipe is ignored — poll a few frames to be sure it didn't start late.
    const f0 = await page.evaluate(() => frameCount);
    await expect.poll(() => page.evaluate(f => frameCount > f + 20, f0)).toBe(true);
    expect(await page.evaluate(() => gameState)).toBe('start');

    // A tap that misses the Start button does nothing either.
    await page.touchscreen.tap(195, 300);
    expect(await page.evaluate(() => gameState)).toBe('start');

    const start = await startTap(page);
    await page.touchscreen.tap(start.x, start.y);
    await expect.poll(() => page.evaluate(() => gameState)).toBe('playing');
  });
});

// Camino and Eden share one saved sound setting (camino_sound): muting in one
// mutes the other, and unmuting in one unmutes the other.
test.describe('one sound setting for Camino and Eden', () => {
  test('muting in Camino mutes Eden', async ({ page }) => {
    await page.goto('/game.html');
    await page.evaluate(() => localStorage.setItem('camino_sound', 'on'));        // Eden "on" ...
    await page.reload();
    expect(await page.evaluate(() => window.CaminoMusic.isMuted())).toBe(false);  // ... Camino follows
    await page.keyboard.press('m');                                               // mute in Camino
    await expect.poll(() => page.evaluate(() => localStorage.getItem('camino_sound'))).toBe('off');
    await page.goto('/world-app/index.html');
    await expect(page.locator('.sound')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.sound')).toHaveClass(/sound--off/);
  });

  test('unmuting in Eden unmutes Camino', async ({ page }) => {
    await page.goto('/world-app/index.html');               // Eden starts muted until invited
    const btn = page.locator('.sound');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('camino_sound'))).toBe('on');
    await page.goto('/game.html');
    expect(await page.evaluate(() => window.CaminoMusic.isMuted())).toBe(false);

    // …and the other way round: Camino explicitly muted stays muted.
    await page.evaluate(() => localStorage.setItem('camino_sound', 'off'));
    await page.reload();
    expect(await page.evaluate(() => window.CaminoMusic.isMuted())).toBe(true);
  });
});

// A browser that refuses to start audio until it is "allowed" — what a phone
// does until it sees a real tap. Lets us test the not-yet-sounding states.
async function stubBlockedAudio(page) {
  await page.addInitScript(() => {
    window.__gestureOK = false;     // flip to true: the next resume() is "a real tap"
    window.__allowAudio = false;    // becomes true only once that resume() completes
    const Orig = window.AudioContext;
    // `state` is defined on a parent prototype (BaseAudioContext) — walk up to find it.
    let proto = Orig.prototype, desc;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'state'))) proto = Object.getPrototypeOf(proto);
    const realState = desc.get;
    window.AudioContext = class extends Orig {
      resume() {
        if (!window.__gestureOK) return Promise.reject(new Error('blocked'));
        return super.resume().then(() => { window.__allowAudio = true; });
      }
      get state() { return window.__allowAudio ? realState.call(this) : 'suspended'; }
    };
  });
}

test.describe('audio that the phone has not allowed yet', () => {
  test('camino: sound on but blocked pulses a hint, and a tap on the button wakes it (not mutes it)', async ({ page }) => {
    await stubBlockedAudio(page);
    const errors = watchErrors(page);
    await page.goto('/game.html');
    const start = await startTap(page);
    await page.touchscreen.tap(start.x, start.y);       // begin the journey
    await expect.poll(() => page.evaluate(() => gameState)).toBe('playing');
    await expect.poll(() => page.evaluate(() => window.CaminoMusic.blocked()), { timeout: 10000 }).toBe(true);

    // The speaker is "on but blocked": tapping it must NOT mute.
    await page.evaluate(() => { window.__gestureOK = true; });
    await page.touchscreen.tap(MUTE_TAP.x, MUTE_TAP.y);
    expect(await page.evaluate(() => window.CaminoMusic.isMuted())).toBe(false);
    await expect.poll(() => page.evaluate(() => window.CaminoMusic.blocked())).toBe(false);
    await expect.poll(async () => (await level(page)).rms, { timeout: 20000 }).toBeGreaterThan(0.002);
    expect(errors).toEqual([]);
  });

  test('eden: a persisted "on" that is not sounding says so, and a tap wakes it', async ({ page }) => {
    await stubBlockedAudio(page);
    await page.addInitScript(() => localStorage.setItem('camino_sound', 'on'));
    await page.goto('/world-app/index.html');
    const btn = page.locator('.sound');
    await expect(btn).toHaveClass(/sound--waiting/, { timeout: 20000 });
    await expect(btn).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate(() => { window.__gestureOK = true; });
    await btn.click();
    // Woken, not muted: still "on", no longer waiting.
    await expect(btn).not.toHaveClass(/sound--waiting/);
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(btn).not.toHaveClass(/sound--off/);
  });
});
