'use strict';

const { Pool } = require('pg');
const config = require('./config');

// A single shared connection pool for the whole application.
// When DATABASE_URL is provided we let pg parse it; otherwise we pass the
// discrete connection parameters.
const poolConfig = config.database.connectionString
  ? { connectionString: config.database.connectionString, ssl: config.database.ssl }
  : {
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      ssl: config.database.ssl,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  // Surface unexpected idle-client errors instead of crashing silently.
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

module.exports = {
  pool,
  // Thin helper so callers can `const { rows } = await query(sql, params)`.
  query: (text, params) => pool.query(text, params),
};
