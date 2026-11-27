# Machina Christi

A small Catholic website: a place to pray, to follow the Church's day, to learn
Thai, and to wander. It lives at **[machinachristi.com](https://machinachristi.com)**.

## The gates

The homepage has three gates, and every room of the site stands behind one of
them:

- **Pray** (`pray.html`): classic Catholic prayers in Thai and English, line by
  line, with how to say each Thai line, its literal meaning, and a voice that
  reads it aloud. At the top, **Ordo**: today in the Church, with the season,
  the day's Gospel, and the saint of the day from Butler's *Lives of the Saints*.
- **Wander** (`world.html`): **Eden**, a living 3D garden, with Jacob's ladder
  up to a first heaven, and a waymarker at its gate that opens **Camino**, an
  endless runner about walking the narrow way.
- **Build** (`build.html`): the **Workshop**, a map of every technology the
  site is built with, and **Projects**, the side projects built along the way:
  **Camino**, and **Logos**, learning to read Thai letter by letter.

Two small signs stand in the corners: an open book for **About** (the story
behind each room) and a glass for **Search**.

**Adding a side project:** one more line on the Projects card in `build.html`,
an About story if it has one, its pages in `sitemap.xml`, and a line in the
`ROOMS` list of `tests/build.spec.js`. The test `tests/site-map.spec.js` then
proves it can be reached from the front door. The steps are in
[`docs/explained/three-gates.md`](docs/explained/three-gates.md).

## How it is built, in five lines

1. The pages are plain HTML, CSS and JavaScript, with no build step.
2. They are served by Azure Static Web Apps, behind Cloudflare.
3. A small API on Azure Functions (`functions/`) answers the day, the saints,
   the prayers with their recordings, and search; the pages carry their own
   copy of the prayers and saints, so they still work if it is asleep or down.
4. Every change goes through a pull request, a preview and the browser tests in
   `tests/` (Playwright) before it goes live.
5. Its Azure pieces are written down as code in `infra/`.

## Explained in plain words

The site is built by someone with no technical background, learning as it goes,
with an AI assistant. Every phase is explained in plain words in
[`docs/explained/`](docs/explained/README.md), starting with
[`foundations.md`](docs/explained/foundations.md), a glossary of software basics
with everyday comparisons.
