// Security headers and site telemetry, checked the way production serves them.
//
// The local test server doesn't apply staticwebapp.config.json, and the
// telemetry script stays silent anywhere but the live site. So these tests
// serve the repo *as* https://machinachristi.com through Playwright routing,
// adding the same global headers Azure adds. Azure's telemetry endpoint is
// intercepted too: no test ever sends anything to Application Insights.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = 'https://machinachristi.com';
const INGESTION = /\.in\.applicationinsights\.azure\.com$/;
const SDK_PATH = /\/assets\/vendor\/ai\.[\d.]+\.gbl\.min\.js$/;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'staticwebapp.config.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

// Every page except Eden, which has its own test (it needs its intro dismissed).
const PAGES = [
  '/',
  '/about.html',
  '/about-camino.html',
  '/about-eden.html',
  '/about-ordo.html',
  '/about-pray.html',
  '/game.html',
  '/ordo.html',
  '/pray.html',
  '/prayer.html',
];

// Serve the repo as the live site, with production's headers; capture what
// telemetry would send, every CSP violation (in any frame), and any request
// that leaves the site.
async function asLiveSite(page) {
  const seen = { sent: [], violations: [], offsite: [] };

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => {
      const log = (window.top.__cspViolations = window.top.__cspViolations || []);
      log.push(`${e.disposition} ${e.effectiveDirective} blocked=${e.blockedURI} at ${location.pathname}:${e.lineNumber}`);
    });
  });
  page.on('console', m => {
    if (/Content Security Policy/i.test(m.text())) seen.violations.push(`console: ${m.text()}`);
  });
  page.on('request', r => {
    const url = new URL(r.url());
    if (!/^https?:$/.test(url.protocol)) return;
    if (INGESTION.test(url.host)) {
      // Recorded when the browser *sends*, not when the route answers: the
      // SDK's last send happens as the page is left, and Playwright can drop
      // a route for a request issued during navigation.
      const body = r.postData() || '';
      try {
        const items = JSON.parse(body);
        seen.sent.push(...(Array.isArray(items) ? items : [items]));
      } catch {
        for (const line of body.split('\n')) if (line.trim()) seen.sent.push(JSON.parse(line));
      }
    } else if (url.origin !== LIVE) {
      seen.offsite.push(r.url());
    }
  });

  await page.route(`${LIVE}/**`, route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, body: 'not found' });
    }
    return route.fulfill({
      status: 200,
      headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...config.globalHeaders },
      body: fs.readFileSync(file),
    });
  });
  // Answer for App Insights, so nothing ever reaches Azure.
  await page.route(url => INGESTION.test(url.host), route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ itemsReceived: 1, itemsAccepted: 1, errors: [] }),
    }));
  // Anything else off-site never leaves the test machine.
  await page.route(url => url.origin !== LIVE && !INGESTION.test(url.host) && /^https?:/.test(url.protocol),
    route => route.abort());

  seen.pageViews = () => seen.sent.filter(e => e.data && e.data.baseType === 'PageviewData');
  seen.events = name => seen.sent.filter(e => e.data && e.data.baseType === 'EventData' && e.data.baseData.name === name);
  seen.cspFromPage = () => page.evaluate(() => window.__cspViolations || []);
  return seen;
}

// What a browser does as a visitor leaves: pagehide, then the page is hidden.
// Both the telemetry script and the SDK act on these (the SDK sends with a
// keepalive request that outlives the page). Fired in place, so the test can
// watch the send: Playwright can lose requests made during a real navigation.
async function leave(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('security headers', () => {
  test('the config sets the headers the site relies on', () => {
    const h = config.globalHeaders;
    // Enforced now: can't break a page, and stops clickjacking, base-tag and
    // plugin tricks. Eden's garden is framed by world.html, hence 'self'.
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'self'");
    expect(h['Content-Security-Policy']).toContain("object-src 'none'");
    expect(h['Content-Security-Policy']).toContain("base-uri 'self'");
    // The full policy is report-only until production reports are clean.
    expect(h['Content-Security-Policy-Report-Only']).toContain("default-src 'self'");
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Permissions-Policy']).toContain('camera=()');
  });

  for (const p of PAGES) {
    test(`${p} loads with no CSP violations and reports a page view`, async ({ page }) => {
      const seen = await asLiveSite(page);
      await page.goto(LIVE + p);
      await expect.poll(() => seen.pageViews().length, { timeout: 20000 }).toBe(1);
      expect([...seen.violations, ...(await seen.cspFromPage())]).toEqual([]);
      expect(seen.offsite).toEqual([]);
      expect(seen.pageViews()).toHaveLength(1); // and not a second one
    });
  }

  test('Eden (world.html and its garden frame) runs with no CSP violations', async ({ page }) => {
    const seen = await asLiveSite(page);
    await page.addInitScript(() => localStorage.setItem('camino_sound', 'off'));
    await page.goto(LIVE + '/world.html');
    await page.click('.intro__enter');
    await page.waitForSelector('body[data-world-state="ready"]', { timeout: 30000 });
    await expect.poll(() => seen.pageViews().length, { timeout: 20000 }).toBe(1);
    expect([...seen.violations, ...(await seen.cspFromPage())]).toEqual([]);
    expect(seen.offsite).toEqual([]);
  });
});

test.describe('telemetry is private', () => {
  test('path-only URL, no cookies, no storage, nothing fetched from Microsoft', async ({ page }) => {
    const seen = await asLiveSite(page);
    await page.goto(LIVE + '/pray.html?q=something-private#top');
    await expect.poll(() => seen.pageViews().length, { timeout: 20000 }).toBe(1);

    const view = seen.pageViews()[0].data.baseData;
    expect(view.url).toBe(LIVE + '/pray.html');
    expect(JSON.stringify(seen.sent)).not.toContain('something-private');

    expect(await page.evaluate(() => document.cookie)).toBe('');
    const stored = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
    expect(stored.filter(k => /^ai_|^AI_/i.test(k))).toEqual([]);
    expect(seen.offsite).toEqual([]); // e.g. no remote SDK config from js.monitor.azure.com
  });

  test('time on page survives leaving the page', async ({ page }) => {
    const seen = await asLiveSite(page);
    await page.goto(LIVE + '/about.html');
    await expect.poll(() => seen.pageViews().length, { timeout: 20000 }).toBe(1);
    await page.waitForTimeout(600); // at least half a second visible
    await leave(page);
    await expect.poll(() => seen.events('page-time').length, { timeout: 15000 }).toBe(1);
    const time = seen.events('page-time')[0].data.baseData;
    expect(time.properties.page).toBe('/about.html');
    expect(time.measurements.visibleSeconds).toBeGreaterThan(0.4);
  });

  test('a would-be CSP block is reported, so the policy can be enforced safely', async ({ page }) => {
    const seen = await asLiveSite(page);
    await page.goto(LIVE + '/about.html');
    await expect.poll(() => seen.pageViews().length, { timeout: 20000 }).toBe(1);
    await page.evaluate(() => { new Image().src = 'https://example.com/not-allowed.png?private=1'; });
    await expect.poll(() => seen.cspFromPage().then(v => v.length)).toBe(1);
    // The SDK batches events (up to 15 s); leaving the page sends the batch.
    await leave(page);
    await expect.poll(() => seen.events('csp-violation').length, { timeout: 15000 }).toBe(1);
    const report = seen.events('csp-violation')[0].data.baseData.properties;
    expect(report.directive).toBe('img-src');
    expect(report.disposition).toBe('report');
    expect(report.blocked).toBe('https://example.com/not-allowed.png'); // no query string
  });

  test('nothing loads off the live site, or when the browser asks not to be tracked', async ({ page }) => {
    const sdkRequests = [];
    page.on('request', r => { if (SDK_PATH.test(new URL(r.url()).pathname)) sdkRequests.push(r.url()); });
    // Run "when idle" work at once, so a short wait is a real test.
    await page.addInitScript(() => { window.requestIdleCallback = cb => setTimeout(cb, 0); });

    // Local server: silent.
    await page.goto('/about.html');
    await page.waitForLoadState('load');
    await page.waitForTimeout(1000); // idle work runs at once (stubbed above)

    // Live site with Global Privacy Control on: silent.
    const seen = await asLiveSite(page);
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
    await page.goto(LIVE + '/about.html');
    await page.waitForLoadState('load');
    await page.waitForTimeout(1000); // idle work runs at once (stubbed above)

    expect(sdkRequests).toEqual([]);
    expect(seen.sent).toEqual([]);
  });
});
