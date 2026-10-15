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
  // The Eden world is drawn in software on CI's small two-core runners, so two
  // gardens running side by side each get about half the speed — and the
  // world's clock slows with its frame rate, so timed checks (the rain easing
  // in) miss their window. Before the split (PR #90) every Eden test lived in
  // one file, which always runs one test at a time; these projects keep that
  // true: the feature checks start once the core checks are done, while the
  // rest of the site's tests still share the second worker. (If a core check
  // fails, the feature checks are skipped rather than run on a broken garden.)
  projects: [
    { name: 'site', testIgnore: /world-(core|features)\.spec\.js$/ },
    { name: 'world-core', testMatch: /world-core\.spec\.js$/ },
    { name: 'world-features', testMatch: /world-features\.spec\.js$/, dependencies: ['world-core'] },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    cwd: path.join(__dirname, '..'),
    reuseExistingServer: !process.env.CI,
  },
});
