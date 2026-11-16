# Machina Christi

A small Catholic website: a place to pray, to follow the Church's day, to learn
Thai, and to wander. It lives at **[machinachristi.com](https://machinachristi.com)**.

## The gates

The homepage is a row of gates, each one a small experience of its own:

- **Pray**: classic Catholic prayers in Thai and English, line by line, with
  how to say each Thai line, its literal meaning, and a voice that reads it aloud.
- **Ordo**: today in the Church: the season, the day's Gospel, and the saint of
  the day from Butler's *Lives of the Saints*.
- **Logos**: learning to read Thai, letter by letter.
- **Eden**: a living 3D garden, with Jacob's ladder up to a first heaven, and
  a waymarker at its gate that opens **Camino**, an endless runner about
  walking the narrow way (also reachable directly at `/game.html`).
- **Workshop**: a map of every technology the site is built with.
- **About**: the story behind each gate.

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
