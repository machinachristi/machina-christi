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

**Overall:** the site is in good shape. There are no 404s, no uncaught errors on load and no sideways scrolling at any size. Every gate works in real iOS Safari. One real high-severity bug was found; the rest are low-severity polish.

## Severity key

- **High:** a feature is broken or unusable for some phone users.
- **Med:** visible breakage or a console error.
- **Low:** cosmetic, copy, or edge case.

## Findings (ranked)

| # | Sev | Where | Bug | Status |
|---|-----|-------|-----|--------|
| 1 | **High** | Camino `game.js:94,167,181,300` | `localStorage` is read and written without `try/catch`. When a browser blocks site storage, the script throws `SecurityError: The operation is insecure.` and **the game never starts** (tapping Start does nothing). Every other page already guards storage. | open |
| 2 | Low | Ordo `ordo.html` (`a.enter`) | At phone width the "Read today's Gospel · USCCB" pill wraps to two lines, and the second line is left-aligned under an indented first line. It looks broken. | open |
| 3 | Low | Ordo `ordo.html:332` | The button always says "read **today's** gospel", even when you've paged to another day. The link correctly goes to that day's readings; only the label is wrong. | open |
| 4 | Low | Ordo `ordo.html:272` | Impossible dates such as `?date=2026-02-30` silently roll over to 2 March instead of falling back to today. Other bad dates already fall back to today. | open |
| 5 | Low | Ordo `ordo.html:326` | On a year with no calendar file, the "day's Gospel at USCCB" link opens in the same tab. The main Gospel button opens a new tab. | open |
| 6 | Low | Pray `prayer.html?p=<unknown>` | "Prayer not found" still shows the *Slow voice* / *Pronunciation* toggles, which do nothing there. | open |
| 7 | Low | Eden boot (17 scene modules) | 207 `BufferGeometry.toNonIndexed(): already non-indexed` warnings at boot. `toNonIndexed()` is called on geometries three.js already builds non-indexed. One-time only; the world works fine. | open, deliberately left (see below) |
| 8 | Low | Eden `world-app` | `THREE.Clock: This module has been deprecated` warning. | open, deliberately left |
| 9 | Low | All sub-pages | The "‹ home", "‹ about" and "‹ prayers" back links are 28px-tall tap targets (Apple's guideline is 44px). The Ordo day arrows are 30px circles and the Workshop tier buttons 40×31 on small phones. | open (unsure: design) |
| 10 | Low | Ordo data | Calendars exist for 2026 and 2027 only. From 1 Jan 2028 the page will show the "calendar isn't available yet" notice every day. Not a bug yet; an upkeep reminder. | open (upkeep) |

### Checked and not bugs

- **Muted sound icon in Camino** in the simulator: a saved `camino_sound=off` preference in that Safari profile, not the default.
- **"AudioContext was not allowed to start"** when `world-app/index.html` is opened standalone without a tap: expected browser autoplay policy. world.html starts audio from the "Enter the garden" tap.
- **Small "GENESIS 2 : 8" citation** on world.html (~11px uppercase): an intentional design detail, left alone.
- **Back to the hub after entering a gate:** already handled by the `pageshow` handler.
