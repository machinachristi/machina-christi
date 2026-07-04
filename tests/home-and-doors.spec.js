// Regression suite for the home page portal gallery and the runner game's
// game-over navigation — formalizing the ad hoc checks that shipped those
// features, so they can't silently rot as the site grows.
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
  test('structure: three portals, labels, hrefs, waymarks', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/index.html');
    expect(await page.title()).toBe('Machina Christi');

    await expect(page.locator('.portal')).toHaveCount(3);
    await expect(page.locator('.portal--camino')).toHaveAttribute('href', 'game.html');
    await expect(page.locator('.portal--eden')).toHaveAttribute('href', 'world.html');
    await expect(page.locator('.portal--about')).toHaveAttribute('href', 'about.html');
    await expect(page.locator('.portal--camino .portal__title')).toContainText('Camino');
    await expect(page.locator('.portal--eden .portal__title')).toContainText('Eden');
    await expect(page.locator('.portal--about .portal__title')).toContainText('About');

    // One waymark dot per portal; Eden, the middle gate, stands centered on
    // arrival, so its (second) dot is the current one.
    await expect(page.locator('.waymarks button')).toHaveCount(3);
    await expect(page.locator('.waymarks button').nth(1)).toHaveAttribute('aria-current', 'true');

    // The strip itself must be swipeable (its content overflows it)…
    const stripOverflow = await page.evaluate(() => {
      const s = document.querySelector('.strip');
      return s.scrollWidth - s.clientWidth;
    });
    expect(stripOverflow).toBeGreaterThan(0);

    // …while the document itself must not scroll sideways.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('portals are keyboard-focusable', async ({ page }) => {
    await page.goto('/index.html');
    const focused = await page.evaluate(() => {
      document.querySelector('.portal--camino').focus();
      return document.activeElement.classList.contains('portal--camino');
    });
    expect(focused).toBe(true);
  });

  test('the centered portal opens its experience', async ({ page }) => {
    await page.goto('/index.html');
    // Eden stands centered on arrival, so a tap walks straight through.
    await expect(page.locator('.portal--eden')).toHaveClass(/is-active/);
    await page.locator('.portal--eden').click();
    await page.waitForURL('**/world.html');
  });

  test('tapping a side portal centers it instead of entering', async ({ page }) => {
    await page.goto('/index.html');
    // About peeks in at the right edge (Eden is centered). Tap its sliver with
    // raw coordinates — locator.click() would auto-scroll it into view first
    // and defeat the very behavior under test.
    const box = await page.locator('.portal--about').boundingBox();
    const vw = page.viewportSize().width;
    await page.mouse.click(Math.min(vw - 12, box.x + 24), box.y + box.height / 2);
    await expect(page.locator('.portal--about')).toHaveClass(/is-active/);
    expect(page.url()).toContain('index.html');
    // A second tap, now that it is centered, walks through.
    await page.locator('.portal--about').click();
    await page.waitForURL('**/about.html');
  });

  test('keyboard: Enter on a focused portal navigates', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.portal--about').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/about.html');
  });

  test('the browser back button restores a fully visible, interactive home page after entering', async ({ page }) => {
    await page.goto('/index.html');
    // Focus+Enter enters the focused gate outright, independent of which gate
    // is centered — deterministic across the back-button round trip.
    await page.locator('.portal--eden').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/world.html');
    await page.goBack();
    await page.waitForURL('**/index.html');

    expect(await page.evaluate(() => getComputedStyle(document.body).opacity)).toBe('1');
    expect(await page.evaluate(() =>
      document.querySelector('.portal--eden').classList.contains('opening'))).toBe(false);

    // Prove the gate isn't just visually reset but still actually works.
    await page.locator('.portal--eden').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/world.html');
  });
});

// The default project runs on a touch phone; these run on a hover/fine pointer
// so the desktop-only code path (arrows + drag-to-scroll) is actually exercised.
// A regression guard for the bug where capturing the pointer on pointerdown
// made Chromium retarget the click to the strip and the gates stopped opening.
test.describe('home page on a desktop pointer', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('the centered gate is clickable and enters', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.portal--eden')).toHaveClass(/is-active/);
    await page.locator('.portal--eden').click();
    await page.waitForURL('**/world.html');
  });

  test('a plain click on a side gate centers it, then enters', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.portal--camino').click();
    await expect(page.locator('.portal--camino')).toHaveClass(/is-active/);
    expect(page.url()).toContain('index.html');
    await page.locator('.portal--camino').click();
    await page.waitForURL('**/game.html');
  });

  test('the arrows walk between gates', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.arrow--next').click();
    await expect(page.locator('.portal--about')).toHaveClass(/is-active/);
    await page.locator('.arrow--prev').click();
    await expect(page.locator('.portal--eden')).toHaveClass(/is-active/);
  });

  test('dragging the strip scrolls without walking through a gate', async ({ page }) => {
    await page.goto('/index.html');
    const box = await page.locator('.portal--eden').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 220, cy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(page.url()).toContain('index.html');
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
