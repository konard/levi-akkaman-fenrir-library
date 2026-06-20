'use strict';

// Load environment variables from a local .env file when present.
require('dotenv').config();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,

  // Database: prefer a single connection string, fall back to discrete parts.
  database: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    user: process.env.PGUSER || 'fenrir',
    password: process.env.PGPASSWORD || 'fenrir',
    database: process.env.PGDATABASE || 'fenrir_library',
    ssl: bool(process.env.PGSSL) ? { rejectUnauthorized: false } : false,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-to-a-long-random-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  scrape: {
    limit: parseInt(process.env.SCRAPE_LIMIT, 10) || 48,
    gutendexUrl: process.env.GUTENDEX_URL || 'https://gutendex.com/books',
  },
};

module.exports = config;
