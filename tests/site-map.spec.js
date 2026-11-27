// No room without a door (three gates, AB#172).
//
// Every page the sitemap lists must be reachable from the front door by
// following links, the way a visitor would: start at "/", open each page,
// note every link on it, and keep going until nothing new turns up. The walk
// runs in a browser, so links a page's script draws (the prayer cards, Ordo's
// prayer of the day) count too. A page nobody can reach this way is an
// "orphan page": it exists, but only someone who already knows its address
// can find it.
//
// Written before the front door changes from six gates to three, so the
// change has to keep this promise: "expand, then contract".
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://machinachristi.com';

// The sitemap's addresses, as paths on this copy of the site ("/", "/pray.html"…).
const SITEMAP = [...fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => m[1].trim());
const PAGES = SITEMAP.map(loc => loc.slice(SITE.length));

// The 3D pages draw a whole world and only link back home, so the walk notes
// them as reached without opening them. They have tests of their own.
const END_ROOMS = new Set(['/world.html', '/workshop.html', '/game.html']);

// A prayer said only inside The Mass ("listed": false in pray/prayers.json)
// has no card on the Pray page, by design (AB#151): a visitor finds its words
// in The Mass, through the numbered list of parts at the top of that page.
// Its own page is in the sitemap for search engines and shared links. So it
// counts as reached when The Mass is reached and the Mass's list links to it.
const { prayers } = JSON.parse(fs.readFileSync(path.join(ROOT, 'pray', 'prayers.json'), 'utf8'));
const SAID_IN_THE_MASS = new Set(prayers.filter(p => p.listed === false).map(p => p.id));

// "/index.html" and "/" are the same page; anything after ? or # is the same page too.
const pageOf = url => {
  const p = decodeURIComponent(new URL(url).pathname);
  return p === '/index.html' ? '/' : p;
};
const isPage = p => p === '/' || p.endsWith('.html');

test('the sitemap lists only this site\'s own pages, each once', () => {
  expect(SITEMAP.length).toBeGreaterThan(20);
  for (const loc of SITEMAP) expect(loc.startsWith(SITE + '/'), loc).toBe(true);
  expect(new Set(PAGES).size).toBe(PAGES.length);
});

test('every sitemap address opens without an error', async ({ request }) => {
  for (const p of PAGES) {
    const res = await request.get(p);
    expect(res.status(), p).toBe(200);
    expect(res.headers()['content-type'], p).toContain('text/html');
  }
});

test('every page in the sitemap can be reached from the front door', async ({ page, baseURL }) => {
  test.setTimeout(240000);
  const origin = new URL(baseURL).origin;
  const errors = [];
  page.on('pageerror', e => errors.push(`${pageOf(page.url())}: ${e.message}`));

  const from = new Map([['/', null]]);   // each page reached, and the page it was first found on
  const queue = ['/'];
  const reach = (p, on) => { if (!from.has(p)) { from.set(p, on); queue.push(p); } };

  while (queue.length) {
    const here = queue.shift();
    if (END_ROOMS.has(here)) continue;
    await page.goto(here, { waitUntil: 'networkidle' });
    const links = await page.$$eval('a[href]', as => as.map(a => a.href));
    for (const href of links) {
      const url = new URL(href);
      if (url.origin !== origin) continue;
      const p = pageOf(href);
      if (p === here && url.hash.startsWith('#part-')) {
        // A link to a part of The Mass, on The Mass itself.
        const id = url.hash.slice('#part-'.length);
        if (SAID_IN_THE_MASS.has(id)) reach(`/pray/${id}.html`, `${here}${url.hash}`);
        continue;
      }
      if (isPage(p)) reach(p, here);
    }
  }

  // How each sitemap page was reached, shown with the test's results.
  const trail = p => { const t = []; for (let at = p; at !== null && at !== undefined; at = from.get(at.split('#')[0])) t.push(at); return t.join(' ‹ '); };
  await test.info().attach('routes from the front door', {
    body: PAGES.filter(p => from.has(p)).map(trail).join('\n'),
    contentType: 'text/plain',
  });

  const orphans = PAGES.filter(p => !from.has(p));
  expect(orphans, 'sitemap pages no link leads to from the front door').toEqual([]);
  expect(errors).toEqual([]);
});
