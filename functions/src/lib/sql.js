const sql = require('mssql');

// A paused database wakes on the first connection, which is refused while it
// starts (error 40613, usually under a minute). Keep knocking for a while.
async function connectWithRetry(config, { log = console.log, minutes = 4, waitMs = 15000 } = {}) {
  const deadline = Date.now() + minutes * 60 * 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await new sql.ConnectionPool(config).connect();
    } catch (err) {
      if (Date.now() > deadline) throw err;
      log(`connect attempt ${attempt} failed (${err.message.split('\n')[0]}); the database may be waking, retrying in ${waitMs / 1000} s`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

module.exports = { sql, connectWithRetry };
