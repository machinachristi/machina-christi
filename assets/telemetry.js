// Site telemetry → Azure Application Insights: page views (with referrer),
// time on page, script errors, and Content Security Policy reports.
//
// Privacy by design:
//   - no cookies and no browser storage. The SDK's user and session IDs are
//     random for each page and never stored, so nothing ties one page view
//     to the next, or one visit to another;
//   - page URLs, referrers and CSP reports are sent without query strings;
//   - nothing is sent when the browser asks not to be tracked (Global Privacy
//     Control or Do Not Track);
//   - nothing is sent anywhere but the live site, so local runs, tests and PR
//     previews stay silent;
//   - App Insights keeps no IP addresses; it uses them only to guess a country.
//
// The SDK loads only after the page has finished loading, so it never slows a
// page down. It is Microsoft's Application Insights JavaScript SDK (MIT),
// vendored and pinned: assets/vendor/ai.3.4.5.gbl.min.js from the npm package
// @microsoft/applicationinsights-web@3.4.5, checked against Microsoft's
// published integrity hash. To upgrade, replace the file and SDK_URL together.
(function () {
  'use strict';

  var LIVE_HOSTS = ['machinachristi.com', 'www.machinachristi.com'];
  // Public by design: a browser connection string only says where to send.
  // It belongs to appi-machina-web, which writes to its own capped workspace.
  var CONNECTION_STRING =
    'InstrumentationKey=a83d7739-afff-406a-a9f7-bb5ca5fbfc17;' +
    'IngestionEndpoint=https://eastus2-3.in.applicationinsights.azure.com/';
  var SDK_URL = '/assets/vendor/ai.3.4.5.gbl.min.js';
  var MAX_CSP_REPORTS = 10; // per page view: enough to diagnose, too few to flood

  function withoutQuery(url) {
    return String(url || '').split(/[?#]/)[0].slice(0, 200);
  }

  if (LIVE_HOSTS.indexOf(location.hostname) === -1) return;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;

  // Eden's garden runs in a frame inside world.html. The frame reports only
  // its CSP problems (and loads the SDK only if it has one); world.html
  // already counts the page view.
  var framed = window.top !== window;
  var loaded = false;
  var page = location.pathname;

  var ai = null;
  var waiting = []; // events seen before the SDK is ready
  function track(name, properties, measurements) {
    var event = { name: name, properties: properties, measurements: measurements };
    if (ai) ai.trackEvent(event);
    else waiting.push(event);
  }

  // The CSP ships report-only first. Every would-be block is recorded so the
  // policy can be enforced once the reports are clean.
  var cspReports = 0;
  document.addEventListener('securitypolicyviolation', function (e) {
    if (++cspReports > MAX_CSP_REPORTS) return;
    track('csp-violation', {
      page: page,
      directive: e.effectiveDirective || e.violatedDirective,
      blocked: withoutQuery(e.blockedURI),
      source: withoutQuery(e.sourceFile),
      line: String(e.lineNumber || ''),
      disposition: e.disposition
    });
    if (framed && loaded) start();
  });

  // Time on page: seconds the page was actually visible, recorded each time
  // it is hidden (tab switch, app switch, leaving). Sum per view in KQL.
  // Sending is left to the SDK: when the page goes away it sends with a
  // request the browser lets finish, where a flush of our own would be
  // cancelled by the navigation.
  var visibleMs = 0;
  var visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
  function recordVisibleTime() {
    if (visibleSince !== null) visibleMs += performance.now() - visibleSince;
    visibleSince = null;
    if (framed || visibleMs < 500) return;
    track('page-time', { page: page }, { visibleSeconds: Math.round(visibleMs / 100) / 10 });
    visibleMs = 0;
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') visibleSince = performance.now();
    else recordVisibleTime();
  });
  // Leaving fires pagehide before visibilitychange, and the SDK sends on it.
  // Registered before the SDK's own listener, so the time is in that send.
  addEventListener('pagehide', recordVisibleTime);
  addEventListener('pageshow', function (e) {
    if (e.persisted) visibleSince = performance.now(); // back from the bfcache
  });

  var started = false;
  function start() {
    if (started) return;
    started = true;
    var s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }

  function init() {
    var sdk = window.Microsoft && window.Microsoft.ApplicationInsights;
    if (!sdk) return;
    ai = new sdk.ApplicationInsights({
      config: {
        connectionString: CONNECTION_STRING,
        disableCookiesUsage: true,
        isStorageUseDisabled: true,
        enableSessionStorageBuffer: false,
        // Only what's asked for: no request tracking (and no correlation
        // headers added to the site's own fetches), no automatic visit timer.
        disableAjaxTracking: true,
        disableFetchTracking: true,
        disableCorrelationHeaders: true,
        autoTrackPageVisitTime: false,
        enableAutoRouteTracking: false,
        enableUnhandledPromiseRejectionTracking: true,
        // pagehide/visibilitychange are enough to send on the way out, and
        // unload listeners keep pages out of the back/forward cache.
        disablePageUnloadEvents: ['unload', 'beforeunload'],
        // Don't fetch remote SDK settings from Microsoft's CDN.
        extensionConfig: { AppInsightsCfgSyncPlugin: { blkCdnCfg: true, syncMode: 0 } }
      }
    });
    ai.loadAppInsights();
    if (!framed) {
      // Path only: query strings can carry things that aren't ours to keep.
      ai.trackPageView({
        name: document.title,
        uri: location.origin + page,
        refUri: withoutQuery(document.referrer) || undefined
      });
    }
    waiting.splice(0).forEach(function (event) { ai.trackEvent(event); });
  }

  function whenIdle() {
    loaded = true;
    if (framed && !waiting.length) return; // nothing to send from the frame
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 3000 });
    else setTimeout(start, 1);
  }
  if (document.readyState === 'complete') whenIdle();
  else addEventListener('load', whenIdle);
})();
