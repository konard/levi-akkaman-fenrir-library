'use strict';

// Imports books into the database.
//
//   npm run scrape              # fetch the most popular books from Gutendex
//   npm run scrape -- --offline # import the bundled db/seed-books.json only
//
// If the live API cannot be reached the script automatically falls back to the
// bundled dataset, so it always leaves you with a populated library.
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { pool } = require('../src/db');
const { normalizeGutendexBook, importBooks } = require('./lib/books');

// Pull `limit` English books from Gutendex, following pagination as needed.
async function fetchFromGutendex(limit) {
  const books = [];
  let url = `${config.scrape.gutendexUrl}?languages=en`;
  while (books.length < limit && url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gutendex responded with HTTP ${res.status}`);
    const data = await res.json();
    for (const raw of data.results || []) {
      books.push(normalizeGutendexBook(raw));
      if (books.length >= limit) break;
    }
    url = data.next;
  }
  return books.slice(0, limit);
}

function loadBundled() {
  const file = path.join(__dirname, '..', 'db', 'seed-books.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const offline = process.argv.includes('--offline');
  const limit = config.scrape.limit;
  let books;

  if (offline) {
    console.log('Offline mode: importing the bundled dataset.');
    books = loadBundled();
  } else {
    try {
      console.log(`Fetching up to ${limit} books from ${config.scrape.gutendexUrl} ...`);
      books = await fetchFromGutendex(limit);
      console.log(`Fetched ${books.length} books from Project Gutenberg.`);
    } catch (err) {
      console.warn(`! Could not reach the catalogue API (${err.message}).`);
      console.warn('  Falling back to the bundled dataset (db/seed-books.json).');
      books = loadBundled();
    }
  }

  const stats = await importBooks(books);
  console.log(
    `✓ Done. ${stats.inserted} new, ${stats.updated} updated, ${stats.failed} skipped ` +
      `(out of ${stats.processed}).`
  );
}

main()
  .catch((err) => {
    console.error('✗ Scrape failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
