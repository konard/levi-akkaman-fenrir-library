'use strict';

// Applies db/schema.sql against the configured database.
// Usage: `npm run migrate`
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function migrate() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Applying schema from', schemaPath);
  await pool.query(sql);
  console.log('✓ Schema applied successfully.');
}

migrate()
  .catch((err) => {
    console.error('✗ Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
