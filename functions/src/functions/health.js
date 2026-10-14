const { app } = require('@azure/functions');
const build = require('../build');

// GET /api/health: proves the whole pipeline (code → deploy → running →
// telemetry) and says which commit is live, and in which Azure region. It
// reports no secrets and no internals, just enough to tell "up, which build,
// where".
async function health() {
  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: {
      status: 'ok',
      service: 'machina-christi-api',
      commit: build.commit,
      builtAt: build.builtAt,
      region: process.env.API_REGION ?? 'dev',
      time: new Date().toISOString(),
    },
  };
}

app.http('health', {
  methods: ['GET', 'HEAD'],
  authLevel: 'anonymous',
  handler: health,
});

module.exports = { health };
