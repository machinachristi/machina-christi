// Applies the search index's layout from git (src/lib/search-schema.js) to
// the search service, like a database migration: the synonym map first, then
// the index. Run by the deploy (azure-platform.yml) before the new API code,
// as the deploy identity, whose Machina Search Schema Writer role covers
// indexes and synonym maps and nothing else. No keys: it signs in with the
// Azure CLI's login (OIDC in CI).
//
//   SEARCH_ENDPOINT=https://srch-machina-<suffix>.search.windows.net \
//     node scripts/apply-search-schema.js            create or update
//   … node scripts/apply-search-schema.js --retire   delete old site-v* indexes
//
// A change Azure can't make in place (an existing field's analyzer, type or
// key) fails here, before the API is deployed, with what to do about it.
const fs = require('node:fs');
const { AzureCliCredential } = require('@azure/identity');
const { SearchIndexClient } = require('@azure/search-documents');
const { INDEX_NAME, INDEX_PATTERN, indexDefinition, synonymMapDefinition } = require('../src/lib/search-schema');

const summary = line => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};

async function main() {
  const endpoint = process.env.SEARCH_ENDPOINT;
  if (!endpoint) throw new Error('SEARCH_ENDPOINT is not set');
  const client = new SearchIndexClient(endpoint, new AzureCliCredential());

  if (process.argv.includes('--retire')) {
    const old = [];
    for await (const name of client.listIndexesNames()) if (INDEX_PATTERN.test(name) && name !== INDEX_NAME) old.push(name);
    for (const name of old) await client.deleteIndex(name);
    summary(old.length ? `### Search: retired ${old.join(', ')}` : '### Search: no old indexes to retire');
    return;
  }

  await client.createOrUpdateSynonymMap(synonymMapDefinition());
  try {
    await client.createOrUpdateIndex(indexDefinition());
  } catch (err) {
    if (err.statusCode === 400 && /cannot be changed/i.test(err.message)) {
      throw new Error(`${err.message}\nThis change can't be made to ${INDEX_NAME} in place: bump SEARCH_SCHEMA_VERSION in src/lib/search-schema.js so a new index is built beside it.`);
    }
    throw err;
  }
  summary(`### Search: index layout \`${INDEX_NAME}\` applied`);
}

main().catch(err => {
  console.error(`::error::${err.message}`);
  process.exit(1);
});
