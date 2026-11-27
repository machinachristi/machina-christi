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
  test('structure: three gates, labels, hrefs, waymarks', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/index.html');
    expect(await page.title()).toBe('Machina Christi');

    // Three gates (AB#172): Pray, Wander, Build. Every other room stands
    // behind one of them (tests/site-map.spec.js proves each can be reached):
    // Ordo inside Pray; Camino inside the garden and on the Build page; Logos
    // and the Workshop on the Build page. About is the book in the corner.
    await expect(page.locator('.portal')).toHaveCount(3);
    for (const gone of ['about', 'ordo', 'logos', 'camino', 'workshop']) {
      await expect(page.locator(`.portal--${gone}`), `no ${gone} gate`).toHaveCount(0);
    }
    await expect(page.locator('.portal--pray')).toHaveAttribute('href', 'pray.html');
    await expect(page.locator('.portal--eden')).toHaveAttribute('href', 'world.html#enter');
    await expect(page.locator('.portal--build')).toHaveAttribute('href', 'build.html');
    await expect(page.locator('.portal--pray .portal__title')).toHaveText('Pray');
    await expect(page.locator('.portal--eden .portal__title')).toHaveText('Wander');
    await expect(page.locator('.portal--build .portal__title')).toHaveText('Build');
    await expect(page.locator('.portal--pray .portal__desc')).toHaveText('prayers in Thai & English');
    await expect(page.locator('.portal--eden .portal__desc')).toHaveText('the digital garden');
    await expect(page.locator('.portal--build .portal__desc')).toHaveText('the workshop & projects');

    // Gate order: Wander (Eden's gate, which keeps its portal--eden tag) in
    // the middle, so Pray and Build are each one swipe from the opening gate.
    const order = await page.$$eval('.portal', ps => ps.map(p => p.className.match(/portal--(\w+)/)[1]));
    expect(order).toEqual(['pray', 'eden', 'build']);

    // One waymark dot per gate; Wander stands centered on arrival, so the
    // middle dot is the current one.
    await expect(page.locator('.waymarks button')).toHaveCount(3);
    await expect(page.locator('.waymarks button').nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.portal--eden')).toHaveClass(/is-active/);

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

  test('the front door says what this place is (AB#143)', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.hero .tagline')).toHaveText('A little place to pray, to learn, and to wander');
  });

  // Each weekday's "Pray today" opens a prayer that really exists, by its
  // own name. 2026-11-15 was a Sunday; the clock is set to noon each day.
  const WEEK = ['mass', 'glory-be', 'angel-of-god', 'our-father', 'lord-i-am-not-worthy', 'o-blood-and-water', 'hail-mary'];
  for (const [day, id] of WEEK.entries()) {
    test(`Pray today on weekday ${day} opens ${id}`, async ({ page, request }) => {
      await page.clock.setFixedTime(new Date(2026, 10, 15 + day, 12));
      await page.goto('/index.html');
      const link = page.locator('[data-pray-today]');
      await expect(link).toHaveAttribute('href', `/pray/${id}.html`);
      const prayers = await (await request.get('/pray/prayers.json')).json();
      const list = Array.isArray(prayers) ? prayers : prayers.prayers;
      const prayer = list.find(p => p.id === id);
      expect(prayer, `${id} is in pray/prayers.json`).toBeTruthy();
      await expect(link).toContainText(prayer.title);
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    });
  }

  test('Pray today walks into the prayer', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 21, 12));   // a Saturday
    await page.goto('/index.html');
    await page.locator('[data-pray-today]').click();
    await page.waitForURL('**/pray/hail-mary.html');
  });

  test('a small phone (375×667) still sees the whole front door without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/lit/);
    const fit = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight - innerHeight,
      today: document.querySelector('.today a').getBoundingClientRect().bottom,
      dots: document.querySelector('.waymarks').getBoundingClientRect().bottom,
      card: document.querySelector('.portal.is-active').offsetWidth,   // its size, not mid-glow scale
    }));
    expect(fit.scroll).toBeLessThanOrEqual(0);
    expect(fit.dots).toBeLessThanOrEqual(667);
    expect(fit.card).toBe(195);   // the gate keeps its full size
  });

  // The gate's width comes from the screen, not from how many gates there
  // are, so taking three away left it exactly as wide as before.
  test('a common phone (390×844) sees gates exactly 203px wide', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/lit/);
    expect(await page.locator('.portal.is-active').evaluate(el => el.offsetWidth)).toBe(203);
  });

  // The site's floor for text is 14px (the audience is mostly on phones).
  // The gate lines and the "Pray today" label were 13px before AB#172.
  for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    test(`no text on the door is under 14px at ${size.width}×${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/index.html');
      await expect(page.locator('body')).toHaveClass(/lit/);
      const small = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter(e => e.getClientRects().length)
        .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 14)
        .map(e => `${e.tagName}.${e.className}: ${getComputedStyle(e).fontSize}`));
      expect(small).toEqual([]);
    });
  }

  // About left the row of gates for the corner opposite Search (AB#172).
  test('the open book in the top-left corner opens About', async ({ page }) => {
    await page.goto('/index.html');
    const book = page.locator('.about-link');
    await expect(book).toHaveAttribute('href', 'about.html');
    await expect(book).toHaveAttribute('aria-label', /About/);
    const box = await book.boundingBox();
    const search = await page.locator('.search-link').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeLessThan(page.viewportSize().width / 4);   // the left side…
    expect(box.y).toBeLessThan(60);                              // …at the very top,
    expect(Math.abs(box.y - search.y)).toBeLessThanOrEqual(1);   // level with the glass
    await book.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/about.html');
    await expect(page.locator('h1')).toHaveText('About');
  });

  test('the Build gate opens the Build page', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.portal--build').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/build.html');
    await expect(page.locator('h1')).toHaveText('Build');
  });

  test('portals are keyboard-focusable', async ({ page }) => {
    await page.goto('/index.html');
    const focused = await page.evaluate(() => {
      document.querySelector('.portal--build').focus();
      return document.activeElement.classList.contains('portal--build');
    });
    expect(focused).toBe(true);
  });

  test('the centered portal opens its experience', async ({ page }) => {
    await page.goto('/index.html');
    // Wander, Eden's gate, stands centered on arrival, so a tap walks straight through.
    await expect(page.locator('.portal--eden')).toHaveClass(/is-active/);
    await page.locator('.portal--eden').click();
    await page.waitForURL('**/world.html#enter');
  });

  test('tapping a side portal centers it instead of entering', async ({ page }) => {
    await page.goto('/index.html');
    // Pray peeks in at the left edge (Wander is centered). Tap its right-hand
    // sliver with raw coordinates — locator.click() would auto-scroll it into
    // view first and defeat the very behavior under test.
    const box = await page.locator('.portal--pray').boundingBox();
    await page.mouse.click(Math.max(12, box.x + box.width - 24), box.y + box.height / 2);
    await expect(page.locator('.portal--pray')).toHaveClass(/is-active/);
    expect(page.url()).toContain('index.html');
    // A second tap, now that it is centered, walks through.
    await page.locator('.portal--pray').click();
    await page.waitForURL('**/pray.html');
  });

  test('a tap on the gate you just swiped toward enters it, even mid-settle', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.portal--eden')).toHaveClass(/is-active/);

    // Reproduce the beat right after a swipe: the strip is still coasting from
    // Wander leftward toward Pray and has covered only ~40% of the gap, so Pray
    // is not yet the strict-nearest gate — Wander still is. (Pray stands to the
    // left, so the spacing below is negative and the sum moves left.) `scroll-snap-type: x mandatory`
    // snaps a programmatic scrollLeft straight back, so hold the in-between spot
    // by turning snapping off for the beat, exactly the un-snapped state the strip
    // sits in while a real momentum scroll settles.
    await page.evaluate(() => {
      const strip = document.querySelector('.strip');
      const c = el => el.offsetLeft + el.offsetWidth / 2;
      const eden  = document.querySelector('.portal--eden');
      const pray  = document.querySelector('.portal--pray');
      const spacing = c(pray) - c(eden);
      strip.style.scrollSnapType = 'none';
      strip.scrollLeft = c(eden) - strip.clientWidth / 2 + 0.4 * spacing;
    });

    // A genuine tap (detail: 1, so it isn't taken for keyboard activation) on the
    // gate being settled onto must walk through. Under the old nearest()-only
    // check this first tap was eaten by center() until the strip crossed the 50%
    // mark — the "swipe, tap does nothing; wait, then tap works" bug.
    await page.locator('.portal--pray').dispatchEvent('click', { detail: 1, bubbles: true, cancelable: true });
    await page.waitForURL('**/pray.html');
  });

  test('keyboard: Enter on a focused portal navigates', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.portal--pray').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/pray.html');
  });

  test('the browser back button restores a fully visible, interactive home page after entering', async ({ page }) => {
    await page.goto('/index.html');
    // Focus+Enter enters the focused gate outright, independent of which gate
    // is centered — deterministic across the back-button round trip.
    await page.locator('.portal--eden').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/world.html#enter');
    await page.goBack();
    await page.waitForURL('**/index.html');

    expect(await page.evaluate(() => getComputedStyle(document.body).opacity)).toBe('1');
    expect(await page.evaluate(() =>
      document.querySelector('.portal--eden').classList.contains('opening'))).toBe(false);

    // Prove the gate isn't just visually reset but still actually works.
    await page.locator('.portal--eden').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/world.html#enter');
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
    await page.waitForURL('**/world.html#enter', { waitUntil: 'commit' });
  });

  test('a plain click on a side gate centers it, then enters', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.portal--eden')).toHaveClass(/is-active/);
    // A click on a side gate steps up to it; the next click walks in. On a
    // busy runner the first click can already land close enough to walk in,
    // which is fine for a visitor, so click until the gate has opened rather
    // than assume exactly two clicks. ('commit': only the visit's start is
    // needed; a full load can outlast the timeout.)
    await expect.poll(async () => {
      if (!/pray\.html/.test(page.url())) await page.locator('.portal--pray').click({ timeout: 3000 }).catch(() => {});
      return page.url();
    }, { timeout: 30000, intervals: [600] }).toContain('pray.html');
  });

  test('the arrows walk between gates', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.arrow--next').click();
    await expect(page.locator('.portal--build')).toHaveClass(/is-active/);
    await page.locator('.arrow--prev').click();
    await expect(page.locator('.portal--eden')).toHaveClass(/is-active/);
    // One step back reaches Pray, the first gate; one more loops to Build,
    // the last.
    await page.locator('.arrow--prev').click();
    await expect(page.locator('.portal--pray')).toHaveClass(/is-active/);
    await page.locator('.arrow--prev').click();
    await expect(page.locator('.portal--build')).toHaveClass(/is-active/);
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

// Some browsers block site storage outright (Safari's "Block All Cookies",
// locked-down in-app browsers): touching localStorage throws. The runner must
// still start and play — it just won't remember the best distance.
test.describe('runner with site storage blocked', () => {
  test('the game still starts and plays', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
      });
    });
    const errors = watchErrors(page);
    await page.goto('/game.html');
    await page.waitForFunction(() => typeof startButton !== 'undefined' && startButton);
    const tap = await page.evaluate(() => ({ x: startButton.x + startButton.w / 2, y: startButton.y + startButton.h / 2 }));
    await page.mouse.click(tap.x, tap.y);
    await expect.poll(() => page.evaluate(() => gameState)).toBe('playing');
    await page.evaluate(() => endGame());   // writes the best distance
    expect(await page.evaluate(() => gameState)).toBe('gameover');
    expect(errors).toEqual([]);
  });
});
