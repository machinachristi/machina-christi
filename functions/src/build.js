// Which build is running. The deploy writes build.json (commit + time) next to
// package.json; a local run without it reports "dev".
let info = { commit: 'dev', builtAt: null };
try {
  info = require('../build.json');
} catch {
  // not deployed: keep the defaults
}

module.exports = info;
