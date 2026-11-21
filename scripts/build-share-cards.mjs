#!/usr/bin/env node
// Draws the pictures chat apps show when a Machina Christi link is shared:
//
//   assets/share/machina-christi.jpg   the site's card (the sprig, the name,
//                                      the tagline), used by every page but Eden's
//   assets/share/<id>.jpg              one card for each prayer in pray/prayers.json
//
//   node scripts/build-share-cards.mjs
//
// It opens scripts/share-card.html in Playwright's browser (the one the tests
// use) at 1200x630 and photographs it. Run it on the Mac: the card's fonts
// (Iowan Old Style, and Thonburi for Thai) come with macOS. Run it again when
// a prayer is added or renamed; tests/prayer-pages.spec.js fails if a
// prayer's card is missing. Eden's pages keep assets/og.png, a view of the garden.

import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('@playwright/test');
const { prayers } = JSON.parse(readFileSync(join(ROOT, 'pray', 'prayers.json'), 'utf8'));
const card = pathToFileURL(join(ROOT, 'scripts', 'share-card.html')).href;
const OUT = join(ROOT, 'assets', 'share');
mkdirSync(OUT, { recursive: true });

const shots = [['machina-christi', { k: 'home' }],
  ...prayers.map(p => [p.id, { k: 'prayer', t: p.title, th: p.title_th }])];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [name, q] of shots) {
  await page.goto(`${card}?${new URLSearchParams(q)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 88 });
  console.log(`assets/share/${name}.jpg`);
}
await browser.close();
