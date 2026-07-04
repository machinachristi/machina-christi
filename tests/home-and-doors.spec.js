// Regression suite for the home page doors and the runner game's game-over
// navigation — formalizing the ad hoc checks that shipped those features, so
// they can't silently rot as the site grows.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Drive the runner to its game-over screen with the restart lockout cleared,
// exactly as the original doors-PR test did (game.js exposes its state as
// script-level globals reachable from evaluate).
async function forceGameOver(page) {
  await page.evaluate(async () => {
    startGame();
    gameState = 'gameover';
    gameOverAt = frameCount - 100;
    restartReadyAt = frameCount - 1;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  return page.evaluate(() => gameOverButtons);
}

test.describe('home page', () => {
  test('structure: two doors, labels, fallback link', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/index.html');
    expect(await page.title()).toBe('Machina Christi');

    await expect(page.locator('.door')).toHaveCount(2);
    await expect(page.locator('.door--runner')).toHaveAttribute('href', 'game.html');
    await expect(page.locator('.door--world')).toHaveAttribute('href', 'world.html');
    await expect(page.locator('.door--runner .door__label')).toContainText('Camino');
    await expect(page.locator('.door--world .door__label')).toContainText('Eden');

    const fb = page.locator('.fallback a');
    await expect(fb).toHaveCount(1);
    await expect(fb).toHaveAttribute('href', 'about.html');

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('doors are keyboard-focusable', async ({ page }) => {
    await page.goto('/index.html');
    const focused = await page.evaluate(() => {
      document.querySelector('.door--runner').focus();
      return document.activeElement.classList.contains('door--runner');
    });
    expect(focused).toBe(true);
  });

  test('the runner door opens the game', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.door--runner').click();
    await page.waitForURL('**/game.html');
  });

  test('the fallback about link works', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.fallback a').click();
    await page.waitForURL('**/about.html');
  });

  test('the browser back button restores a fully visible, interactive home page after a door click', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.door--runner').click();
    await page.waitForURL('**/game.html');
    await page.goBack();
    await page.waitForURL('**/index.html');

    expect(await page.evaluate(() => getComputedStyle(document.body).opacity)).toBe('1');
    expect(await page.evaluate(() =>
      document.querySelector('.door--runner').classList.contains('opening'))).toBe(false);

    // Prove the door isn't just visually reset but still actually works.
    await page.locator('.door--runner').click();
    await page.waitForURL('**/game.html');
  });
});

test.describe('runner game-over navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game.html');
    await page.waitForFunction(() => typeof startGame === 'function');
  });

  test('game loads cleanly', async ({ page }) => {
    const errors = watchErrors(page);
    expect(await page.title()).toContain('Runner');
    await page.waitForTimeout(400);   // let a few frames run
    expect(errors).toEqual([]);
  });

  test('game over offers Walk again and Return home', async ({ page }) => {
    const btns = await forceGameOver(page);
    expect(btns && btns.again && btns.home).toBeTruthy();
    expect(btns.home.y).toBeGreaterThan(btns.again.y);
  });

  test('Walk again restarts without leaving the page', async ({ page }) => {
    const btns = await forceGameOver(page);
    await page.mouse.click(btns.again.x + btns.again.w / 2, btns.again.y + btns.again.h / 2);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => gameState)).toBe('playing');
    expect(page.url()).toContain('game.html');
  });

  test('clicking elsewhere on the game-over screen does not restart', async ({ page }) => {
    await forceGameOver(page);
    await page.mouse.click(20, 20);   // nowhere near either button
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => gameState)).toBe('gameover');
    expect(page.url()).toContain('game.html');
  });

  test('Return home navigates to the home page', async ({ page }) => {
    const btns = await forceGameOver(page);
    await page.mouse.click(btns.home.x + btns.home.w / 2, btns.home.y + btns.home.h / 2);
    await page.waitForURL('**/index.html');
  });

  test('the h key also returns home', async ({ page }) => {
    await forceGameOver(page);
    await page.keyboard.press('h');
    await page.waitForURL('**/index.html');
  });
});
