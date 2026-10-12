# Bug audit — mobile first (AB#58)

Audit date: 2026-10-12 · branch `fix/mobile-audit`

## How the audit was done

- **Test suite:** `npx playwright test -c tests/playwright.config.js` → **118/118 passing** at baseline.
- **Page sweep (scripted):** every top-level page plus `world-app/index.html`.
  - Chromium at 320×568, 375×667, 390×844, 844×390 (landscape) and 1280×800.
  - WebKit (Safari's engine, iPhone profile) at 375×667 and 390×844.
  - Captured console errors and warnings, uncaught JS errors, HTTP ≥400, broken images, sideways overflow, text under 12.5px and tap targets under 32px.
- **Real iOS Safari:** iPhone 17 simulator (iOS 27).
  - Hub carousel, Camino (start + tutorial), Eden (intro → garden boot), Ordo, Workshop, Pray → a prayer.
- **Static link check:** every internal `href`/`src` in the HTML pages resolves.
- **Edge cases:**
  - site storage blocked (Safari "Block All Cookies" / locked-down in-app browsers);
  - bad `?date=` and `?p=` URLs, and a year with no calendar file;
  - rotating the phone mid-game;
  - Back to the hub after leaving it (bfcache).

**Overall:** the site is in good shape. There are no 404s, no uncaught errors on load and no sideways scrolling at any size. Every gate works in real iOS Safari. One real high-severity bug was found; the rest are low-severity polish. 7 fixed, 4 left open (see below).

## Severity key

- **High:** a feature is broken or unusable for some phone users.
- **Med:** visible breakage or a console error.
- **Low:** cosmetic, copy, or edge case.

## Findings (ranked)

### Fixed (7)

Each fix is its own commit on `fix/mobile-audit`. Every fix was re-checked the way it was found (simulator screenshot, scripted before/after, or test), and the full suite passes: **119/119**, the 118 existing tests plus 1 new regression test.

| # | Sev | Where | Bug → fix | Commit |
|---|-----|-------|-----------|--------|
| 1 | **High** | Camino `game.js` | `localStorage` wasn't guarded. With site storage blocked (Safari "Block All Cookies", locked-down in-app browsers) it threw `SecurityError` and **the game never started**. All four reads/writes are now wrapped in `try/catch`, as `camino-music.js` already does. New test: *runner with site storage blocked* (fails before the fix, passes after). | `9959dae` |
| 2 | Low | Ordo Gospel button | On a phone the label wrapped with its second line left-aligned. It is now centred (checked in iOS Safari). | `fed61ab` |
| 3 | Low | Ordo Gospel button | It said "today's gospel" on every day. It now says "the day's gospel" when you've paged away from today. | `e87192d` |
| 4 | Low | Ordo `?date=` | An impossible date (`2026-02-30`) rolled over to 2 March. It now falls back to today, like other bad dates. | `2cfdfae` |
| 5 | Low | Ordo no-calendar notice | The USCCB link opened in the same tab. It now opens a new tab like the main button. | `f21b8c5` |
| 6 | Low | `prayer.html` | `.toggles`/`.chip` display rules overrode the `hidden` attribute. So the switches showed on "Prayer not found", and **"Slow voice" stayed as a dead button on browsers that can't read aloud**. Added `[hidden] { display: none !important; }`. A whole-site sweep found no other page with this problem. | `c6d3e12` |
| 7 | Low | Back links on 9 pages | "‹ home / ‹ about / ‹ prayers" were 28px tap targets. An invisible `::before` now extends the hit area to ~46px. Before/after screenshots are pixel-identical. | `b9f5190` |

### Still open

| # | Sev | Where | Bug | Why left |
|---|-----|-------|-----|----------|
| 8 | Low | Eden boot (17 scene modules: willows, vine, almond, camphire, spices, rocks, ram, …) | 207 one-time `BufferGeometry.toNonIndexed(): already non-indexed` console warnings. The world works fine. | Touching 17 modules the weekly `update-world` routine owns is a refactor. Simplest fix: drop `.toNonIndexed()` where three.js already builds the geometry non-indexed, or use a `g.index ? g.toNonIndexed() : g` helper in `util.js`. Better done in an interactive Eden session. |
| 9 | Low | Eden | `THREE.Clock` deprecation warning (r185 wants `THREE.Timer`). | Same reason; harmless today. |
| 10 | Low | Ordo day arrows (30px circles); Workshop tier buttons (40×31 on ≤375px phones) | Smaller than the 44px guideline. | Unsure: unlike the text links, these are visible shapes, so enlarging them is a design change. Your call. |
| 11 | Low | Ordo data | Calendars exist for 2026–2027 only. From 1 Jan 2028 every day shows the "isn't available yet" notice (handled gracefully). | Upkeep, not a bug yet. Run `scripts/fetch-calendar.mjs` for 2028 sometime in 2027. |

### Things I was unsure about

- **Rotating the phone mid-game (Camino):** the pilgrim stays on the road through portrait → landscape → portrait, with no errors. Obstacles already on screen keep their old x-positions after a resize, which could briefly put one off the road. I didn't treat that as a bug.
- **Tap targets inside paragraphs** (e.g. "Vatican.va", "Psalm 127:1" in the About pages) are ~20px tall. That's normal and acceptable for inline text links, so they're not listed.
- The local python server doesn't apply `staticwebapp.config.json` (headers, CSP, routes). Anything production-only should be checked on the Azure preview URL.

### Checked and not bugs

- **Muted sound icon in Camino** in the simulator: a saved `camino_sound=off` preference in that Safari profile, not the default.
- **"AudioContext was not allowed to start"** when `world-app/index.html` is opened standalone without a tap: expected browser autoplay policy. world.html starts audio from the "Enter the garden" tap.
- **Small "GENESIS 2 : 8" citation** on world.html (~11px uppercase): an intentional design detail, left alone.
- **Back to the hub after entering a gate:** already handled by the `pageshow` handler.
