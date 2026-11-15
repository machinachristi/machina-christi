// The daily live-site check (AB#118): the same phone-sized robot visitor as
// the smoke tests, walking the real site, https://machinachristi.com, instead
// of a copy served from this folder.
//   npx playwright test -c tests/live/playwright.config.js
//
// It runs from the builder's Mac (the scheduled task "live-site-check"), not
// from GitHub: Cloudflare's Bot Fight Mode turns GitHub's runners away.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  timeout: 60000,
  expect: { timeout: 15000 },
  // After a quiet night the API's first answer can be slow while it wakes
  // (a cold start), so each check gets one more try. Something really
  // broken fails both.
  retries: 1,
  // One visitor at a time: Cloudflare allows 20 API requests per 10 seconds
  // from one address, and a real visitor never opens every page at once.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://machinachristi.com',
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 2,
    hasTouch: true,
  },
});
