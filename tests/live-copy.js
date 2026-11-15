// Serve this repo *as* the live site (https://machinachristi.com) inside a
// test, so pages behave as they do for a real visitor: on the live host the
// Pray pages also ask the API. Each test decides how the API answers, through
// its own page.route for https://api.machinachristi.com. Every other address
// is refused, so nothing leaves the machine.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = 'https://machinachristi.com';
const API = 'https://api.machinachristi.com';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function serveLiveCopy(page) {
  await page.route(`${LIVE}/**`, route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.route(url => ![LIVE, API].includes(url.origin) && /^https?:/.test(url.protocol), route => route.abort());
}

// The API's answer, as the live site sends it: JSON the live origin may read.
const apiJson = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': LIVE }, body: JSON.stringify(body) });

module.exports = { ROOT, LIVE, API, serveLiveCopy, apiJson };
