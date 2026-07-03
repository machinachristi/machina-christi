// Smoke-test config. NOTE: there is deliberately no package.json committed at
// the repo root — Azure SWA's Oryx build detection would auto-run npm builds
// on deploy if one existed. Playwright is installed ad hoc, locally and in CI:
//   npm i -D @playwright/test && npx playwright install --with-deps chromium
//   npx playwright test -c tests/playwright.config.js
const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: __dirname,
  timeout: 45000,
  expect: { timeout: 10000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Phone-first, like the site's audience.
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 2,
    hasTouch: true,
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    cwd: path.join(__dirname, '..'),
    reuseExistingServer: !process.env.CI,
  },
});
