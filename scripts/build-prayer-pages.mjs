#!/usr/bin/env node
// Gives every prayer a page of its own, pray/<id>.html, and lists those pages
// in sitemap.xml.
//
//   node scripts/build-prayer-pages.mjs           write the pages and the sitemap
//   node scripts/build-prayer-pages.mjs --check   change nothing; fail if any is out of date
//
// Why: when a link is pasted into a chat app, the app fetches the page and
// reads its <head> for a title, a description and a picture. It never runs the
// page's code, so prayer.html?p=hail-mary looked like every other prayer.
// Each page made here is prayer.html word for word, except that its <head>
// names that one prayer (with its own picture from assets/share/, drawn by
// scripts/build-share-cards.mjs) and <html> carries the prayer's id, which
// the page's code reads instead of the ?p= in the address.
//
// So: edit prayer.html or pray/prayers.json, then run this script.
// tests/prayer-pages.spec.js fails if anyone forgets.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://machinachristi.com';
const MARK_START = '  <!-- Each prayer\'s own page: made by scripts/build-prayer-pages.mjs -->';
const MARK_END = '  <!-- end of the prayers\' pages -->';

const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const pagePath = id => `pray/${id}.html`;
export const cardPath = id => `assets/share/${id}.jpg`;

// What a link preview says about a prayer.
export function shareText(p) {
  const about = p.about ? ` — ${p.about}` : '';
  return {
    title: `${p.title} · Pray · Machina Christi`,
    description: `${p.title} · ${p.title_th}${about}. In Thai and English, line by line, with a pronunciation guide and read-aloud in both languages.`,
    alt: `${p.title} and ${p.title_th} in gold on a dark background, under the Machina Christi sprig.`,
  };
}

function swap(html, re, to, what) {
  if (!re.test(html)) throw new Error(`prayer.html: couldn't find ${what}`);
  return html.replace(re, to);
}

export function prayerPage(template, p) {
  const t = shareText(p);
  const url = `${SITE}/${pagePath(p.id)}`;
  let h = template;
  h = swap(h, /<html lang="en">/, `<html lang="en" data-prayer="${attr(p.id)}">`, '<html lang="en">');
  h = swap(h, /<head>\n/, `<head>\n  <!-- Made by scripts/build-prayer-pages.mjs from prayer.html: edit that file, then run the script. -->\n`, '<head>');
  h = swap(h, /(<meta name="description" content=")[^"]*(")/, `$1${attr(t.description)}$2`, 'the description');
  h = swap(h, /(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`, 'og:url');
  h = swap(h, /(<meta property="og:title" content=")[^"]*(")/, `$1${attr(t.title)}$2`, 'og:title');
  h = swap(h, /(<meta property="og:description" content=")[^"]*(")/, `$1${attr(t.description)}$2`, 'og:description');
  h = swap(h, /(<meta property="og:image" content=")[^"]*(")/, `$1${SITE}/${cardPath(p.id)}$2`, 'og:image');
  h = swap(h, /(<meta property="og:image:alt" content=")[^"]*(")/, `$1${attr(t.alt)}$2`, 'og:image:alt');
  h = swap(h, /<title>[^<]*<\/title>/, `<title>${attr(t.title)}</title>\n  <link rel="canonical" href="${url}" />`, '<title>');
  return h;
}

export function sitemap(current, prayers) {
  const block = [MARK_START, ...prayers.map(p => `  <url>\n    <loc>${SITE}/${pagePath(p.id)}</loc>\n  </url>`), MARK_END].join('\n');
  const at = current.indexOf(MARK_START);
  if (at >= 0) {
    const end = current.indexOf(MARK_END, at);
    if (end < 0) throw new Error('sitemap.xml: the prayers\' block has no end mark');
    return current.slice(0, at) + block + current.slice(end + MARK_END.length);
  }
  const close = current.lastIndexOf('</urlset>');
  if (close < 0) throw new Error('sitemap.xml: no </urlset>');
  return current.slice(0, close) + block + '\n' + current.slice(close);
}

// Every file this script owns, as { path: contents }.
export function build(root = ROOT) {
  const template = readFileSync(join(root, 'prayer.html'), 'utf8');
  const { prayers } = JSON.parse(readFileSync(join(root, 'pray', 'prayers.json'), 'utf8'));
  const out = {};
  for (const p of prayers) out[pagePath(p.id)] = prayerPage(template, p);
  out['sitemap.xml'] = sitemap(readFileSync(join(root, 'sitemap.xml'), 'utf8'), prayers);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [path, text] of Object.entries(build())) {
    let now = null;
    try { now = readFileSync(join(ROOT, path), 'utf8'); } catch {}
    if (now === text) continue;
    stale.push(path);
    if (!check) writeFileSync(join(ROOT, path), text);
  }
  if (check && stale.length) {
    console.error(`Out of date (run node scripts/build-prayer-pages.mjs):\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log(stale.length ? `${check ? 'Out of date' : 'Wrote'}: ${stale.join(', ')}` : 'Everything already up to date.');
}
