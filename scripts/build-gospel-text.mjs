#!/usr/bin/env node
// Cuts the four Gospels out of the Douay-Rheims Bible (Challoner revision,
// public domain) into one small file per chapter, ordo/gospel/<book>-<n>.json,
// so the Ordo page only downloads the chapter it is showing.
//
//   node scripts/build-gospel-text.mjs path/to/pg8300.txt
//
// The input is Project Gutenberg's plain-text edition, ebook #8300
// (https://www.gutenberg.org/ebooks/8300). It is not kept in the repo: this is
// a run-once script, like scripts/build-saints.py, and its output is committed.
//
// Each chapter file is a list of verses; verse 1 is item 0. The Mass readings
// are cited by the modern verse numbers, and in six chapters the Douay-Rheims
// counts differently, so those are renumbered here to match (see renumber below).
// An empty string means "this verse's words are printed with the verse before".

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'ordo', 'gospel');
const src = process.argv[2];
if (!src) { console.error('usage: build-gospel-text.mjs path/to/pg8300.txt'); process.exit(1); }

const BOOKS = [
  ['mt', /^THE HOLY GOSPEL OF JESUS CHRIST ACCORDING TO SAINT MATTHEW$/],
  ['mk', /^THE HOLY GOSPEL OF JESUS CHRIST ACCORDING TO ST\. MARK$/],
  ['lk', /^THE HOLY GOSPEL OF JESUS CHRIST ACCORDING TO ST\. LUKE$/],
  ['jn', /^THE HOLY GOSPEL OF JESUS CHRIST ACCORDING TO ST\. JOHN$/],
];
const END = /^THE ACTS OF THE APOSTLES$/;

// How many verses each chapter has in the modern numbering the lectionary uses.
// The build stops if the result disagrees, so a parsing slip cannot pass quietly.
const MODERN = {
  mt: [25, 23, 17, 25, 48, 34, 29, 34, 38, 42, 30, 50, 58, 36, 39, 28, 27, 35, 30, 34, 46, 46, 39, 51, 46, 75, 66, 20],
  mk: [45, 28, 35, 41, 43, 56, 37, 38, 50, 52, 33, 44, 37, 72, 47, 20],
  lk: [80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43, 48, 47, 38, 71, 56, 53],
  jn: [51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40, 42, 31, 25],
};

// Douay-Rheims (book, chapter, verse) -> modern (chapter, verse).
// "merge" joins the verse onto the one before; "blank" leaves an empty verse
// after it because the Douay-Rheims prints two modern verses as one.
function renumber(book, c, v) {
  if (book === 'mt' && c === 17) {            // DR 17:14 holds modern 14 and 15
    if (v === 14) return { c, v, blankAfter: true };
    if (v > 14) return { c, v: v + 1 };
  }
  if (book === 'mk' && c === 4 && v === 40) return { c, v, blankAfter: true };   // DR 4:40 holds modern 40 and 41
  if (book === 'jn' && c === 11 && v === 56) return { c, v, blankAfter: true };  // DR 11:56 holds modern 56 and 57
  if (book === 'mk' && c === 8 && v === 39) return { c: 9, v: 1 };   // DR 8:39 is modern 9:1
  if (book === 'mk' && c === 9) return { c, v: v + 1 };
  if (book === 'jn' && c === 6) {             // modern 6:51 is DR 51 and 52
    if (v === 52) return { c, v: 51, merge: true };
    if (v > 52) return { c, v: v - 1 };
  }
  return { c, v };
}

// Slips of the typist in the Gutenberg file, put right: [found, meant].
const FIXES = [['Amen f say to you', 'Amen I say to you']];

const paras = readFileSync(src, 'utf8').replace(/\r/g, '').split(/\n\s*\n/);
const text = {};   // text[book][chapter][verse] = words
let book = null;
for (const p of paras) {
  const one = p.trim().replace(/\s+/g, ' ');
  const head = BOOKS.find(([, re]) => re.test(one));
  if (head) { book = head[0]; text[book] = {}; continue; }
  if (END.test(one)) { if (book) break; continue; }
  if (!book) continue;
  const m = one.match(/^(\d+):(\d+)\. (.+)$/);
  if (!m) continue;                           // chapter headings, summaries, Challoner's notes
  for (const [bad, good] of FIXES) m[3] = m[3].replace(bad, good);
  const to = renumber(book, +m[1], +m[2]);
  const ch = (text[book][to.c] ||= {});
  if (to.merge) ch[to.v] += ' ' + m[3];
  else {
    if (ch[to.v] !== undefined) throw new Error(`${book} ${to.c}:${to.v} seen twice`);
    ch[to.v] = m[3];
  }
  if (to.blankAfter) ch[to.v + 1] = '';
}

mkdirSync(OUT, { recursive: true });
let files = 0, bytes = 0;
for (const [b] of BOOKS) {
  const want = MODERN[b];
  if (Object.keys(text[b] || {}).length !== want.length) throw new Error(`${b}: expected ${want.length} chapters`);
  want.forEach((n, i) => {
    const ch = text[b][i + 1];
    const verses = [];
    for (let v = 1; v <= n; v++) {
      if (ch[v] === undefined) throw new Error(`${b} ${i + 1}:${v} missing`);
      verses.push(ch[v]);
    }
    if (Object.keys(ch).length !== n) throw new Error(`${b} ${i + 1}: has ${Object.keys(ch).length} verses, expected ${n}`);
    const body = JSON.stringify(verses) + '\n';
    writeFileSync(join(OUT, `${b}-${i + 1}.json`), body);
    files++; bytes += body.length;
  });
}
console.log(`wrote ${files} chapter files, ${(bytes / 1024).toFixed(0)} kB in all`);
