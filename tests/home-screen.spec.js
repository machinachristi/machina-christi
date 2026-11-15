// The home-screen icon: an iPhone shows /assets/apple-touch-icon.png when a
// visitor adds the site to their home screen (without it, a tiny screenshot).
// Every page links it, except Eden's door, which the Eden build looks after.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'world.html');

test('every page links the 180x180 home-screen icon', async ({ request }) => {
  const png = fs.readFileSync(path.join(ROOT, 'assets', 'apple-touch-icon.png'));
  expect(png.readUInt32BE(16)).toBe(180); // width, from the PNG header
  expect(png.readUInt32BE(20)).toBe(180); // height
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    expect(html, page).toContain('<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />');
  }
  expect((await request.get('/assets/apple-touch-icon.png')).ok()).toBe(true);
});
