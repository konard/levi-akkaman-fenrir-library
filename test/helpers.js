'use strict';

// Shared setup for the integration tests. Resets the configured database to a
// known state (schema + the bundled seed books) so every run starts clean.
//
// SAFETY: resetting TRUNCATEs every table. To avoid wiping a real development
// database by accident we refuse to run unless the target database name looks
// like a test database (contains "test") or ALLOW_DB_RESET=1 is set.

const fs = require('fs');
const path = require('path');

const config = require('../src/config');
const { pool } = require('../src/db');
const { importBooks } = require('../scripts/lib/books');
const { createApp } = require('../src/app');

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');
const SEED_PATH = path.join(__dirname, '..', 'db', 'seed-books.json');

// Work out which database we are about to touch, from either the connection
// string or the discrete settings.
function targetDatabaseName() {
  if (config.database.connectionString) {
    try {
      return new URL(config.database.connectionString).pathname.replace(/^\//, '');
    } catch {
      return config.database.connectionString;
    }
  }
  return config.database.database;
}

function assertSafeToReset() {
  const name = targetDatabaseName();
  const looksLikeTest = /test/i.test(name);
  if (!looksLikeTest && process.env.ALLOW_DB_RESET !== '1') {
    throw new Error(
      `Refusing to reset database "${name}" because its name does not contain "test".\n` +
        'Point the tests at a dedicated test database, e.g.\n' +
        '  DATABASE_URL=postgres://fenrir:fenrir@localhost:5432/fenrir_library_test npm test\n' +
        'or set ALLOW_DB_RESET=1 to override this safeguard.'
    );
  }
}

// Apply the schema, clear every table and load the bundled seed books.
async function resetDatabase() {
  assertSafeToReset();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schema);
  await pool.query(
    'TRUNCATE reactions, comments, book_genres, books, genres, users RESTART IDENTITY CASCADE'
  );
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  await importBooks(seed);
}

async function closePool() {
  await pool.end();
}

// Monotonic-ish unique suffix so each registered user gets a distinct email.
let counter = 0;
function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.com`;
}

module.exports = {
  app: createApp(),
  resetDatabase,
  closePool,
  uniqueEmail,
  targetDatabaseName,
};
