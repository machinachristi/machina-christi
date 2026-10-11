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

// The 44px speaker button sits under the lives, top-right (see muteRect()).
const MUTE_TAP = { x: 352, y: 84 };

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
    expect(await page.evaluate(() => localStorage.getItem('camino_muted'))).toBe('1');

    // The choice survives a reload.
    await page.reload();
    expect(await page.evaluate(() => window.CaminoMusic.isMuted())).toBe(true);

    // M turns it back on.
    await page.keyboard.press('m');
    await expect.poll(() => page.evaluate(() => window.CaminoMusic.isMuted())).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('camino_muted'))).toBe('0');
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
    await page.addInitScript(() => localStorage.setItem('camino_muted', '1'));
    const errors = watchErrors(page);
    await page.goto('/game.html');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => gameState)).toBe('playing');
    // Let the game run a little by waiting on in-game progress, not wall time.
    await expect.poll(() => page.evaluate(() => frame)).toBeGreaterThan(60);
    expect((await level(page)).rms).toBeLessThan(0.0005);
    expect(errors).toEqual([]);
  });
});
