const { app } = require('@azure/functions');
const { audioStore } = require('../lib/prayers-store');

// GET /api/audio/{id}/{file}   one prayer recording, e.g.
//                              /api/audio/our-father/th-slow-0123456789.mp3
//
// The recordings are kept in a private container that no visitor can open;
// the API reads them with its own read-only identity and passes them on.
// A recording's name changes whenever its words do, so its bytes never
// change: browsers and Cloudflare may keep it for a year, and Cloudflare
// answers nearly every request without reaching this function.
//
// Byte ranges: media players (Safari on iPhones in particular) ask for a
// recording in pieces ("Range: bytes=0-1", then the rest) and won't play
// from a server that can't answer that way, so each piece is sent as
// 206 Partial Content.

const NAME = /^[a-z0-9-]{1,64}\/(th|en)-(normal|slow)-([0-9a-f]{10})\.mp3$/;
const KEEP = 'public, max-age=31536000, immutable';
const NO_STORE = { 'Cache-Control': 'no-store' };

// One range of a file of `size` bytes, as { start, end } (inclusive), or
// 'unsatisfiable', or null to send the whole file (no Range header, or one
// this server doesn't split: several ranges, other units).
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    // "bytes=-N": the last N bytes
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

function handler(store) {
  return async function audio(request, context) {
    const name = `${request.params.id}/${request.params.file}`;
    const m = NAME.exec(name);
    if (!m) return { status: 404, headers: NO_STORE };

    let body;
    try {
      body = await store.read(name);
    } catch (err) {
      context?.error?.(`recording unavailable: ${name}: ${err.message}`);
      return { status: 503, headers: NO_STORE };
    }
    if (!body) return { status: 404, headers: NO_STORE };

    const etag = `"${m[3]}"`;
    const common = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': KEEP, ETag: etag };
    if (request.headers.get('if-none-match') === etag) return { status: 304, headers: common };

    const head = request.method === 'HEAD';
    const range = parseRange(request.headers.get('range'), body.length);
    if (range === 'unsatisfiable') {
      return { status: 416, headers: { ...common, 'Content-Range': `bytes */${body.length}` } };
    }
    if (range) {
      const part = body.subarray(range.start, range.end + 1);
      return {
        status: 206,
        headers: { ...common, 'Content-Range': `bytes ${range.start}-${range.end}/${body.length}`, 'Content-Length': String(part.length) },
        body: head ? undefined : part,
      };
    }
    return { status: 200, headers: { ...common, 'Content-Length': String(body.length) }, body: head ? undefined : body };
  };
}

app.http('audio', {
  route: 'audio/{id}/{file}',
  methods: ['GET', 'HEAD'],
  authLevel: 'anonymous',
  handler: handler(audioStore()),
});

module.exports = { handler, parseRange };
