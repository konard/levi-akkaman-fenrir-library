'use strict';

// Unit tests for the pure book-normalisation helpers used by the scraper.
// These touch no network and no database.

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  slugify,
  deriveGenres,
  formatAuthors,
  normalizeGutendexBook,
} = require('../scripts/lib/books');
const { pool } = require('../src/db');

// Requiring the lib creates an (unused) pool; close it so the process exits.
after(async () => {
  await pool.end();
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    assert.equal(slugify('Science Fiction'), 'science-fiction');
    assert.equal(slugify('Mystery & Detective'), 'mystery-detective');
    assert.equal(slugify('  Trim  Me  '), 'trim-me');
  });
});

describe('formatAuthors', () => {
  it('flips "Last, First" into "First Last"', () => {
    assert.equal(formatAuthors([{ name: 'Shelley, Mary Wollstonecraft' }]), 'Mary Wollstonecraft Shelley');
  });

  it('joins up to two authors with an ampersand', () => {
    assert.equal(
      formatAuthors([{ name: 'Grimm, Jacob' }, { name: 'Grimm, Wilhelm' }]),
      'Jacob Grimm & Wilhelm Grimm'
    );
  });

  it('falls back to "Unknown" when there are no authors', () => {
    assert.equal(formatAuthors([]), 'Unknown');
    assert.equal(formatAuthors(undefined), 'Unknown');
  });
});

describe('deriveGenres', () => {
  it('maps subjects/bookshelves to canonical genres', () => {
    const genres = deriveGenres(['Science fiction', 'Horror tales'], [], 'Frankenstein');
    const names = genres.map((g) => g.name);
    assert.ok(names.includes('Science Fiction'));
    assert.ok(names.includes('Horror'));
    // Each genre carries a slug.
    assert.ok(genres.every((g) => g.slug === slugify(g.name)));
  });

  it('caps the list at four genres', () => {
    const genres = deriveGenres(
      ['Science fiction', 'Fantasy', 'Adventure', 'Detective', 'Romance', 'Horror'],
      [],
      ''
    );
    assert.ok(genres.length <= 4);
  });

  it('falls back to General when nothing matches', () => {
    const genres = deriveGenres(['Cooking recipes'], [], 'A Cookbook');
    assert.deepEqual(genres, [{ name: 'General', slug: 'general' }]);
  });
});

describe('normalizeGutendexBook', () => {
  it('shapes a raw Gutendex record into our book model', () => {
    const raw = {
      id: 84,
      title: 'Frankenstein; Or, The Modern Prometheus',
      authors: [{ name: 'Shelley, Mary Wollstonecraft' }],
      subjects: ['Science fiction', 'Horror tales', 'Gothic fiction'],
      bookshelves: ['Browsing: Fiction'],
      languages: ['en'],
      copyright: false,
      formats: { 'image/jpeg': 'https://example.com/cover.jpg' },
      download_count: 1234,
    };
    const book = normalizeGutendexBook(raw);

    assert.equal(book.title, 'Frankenstein; Or, The Modern Prometheus');
    assert.equal(book.author, 'Mary Wollstonecraft Shelley');
    assert.equal(book.language, 'English');
    assert.equal(book.source, 'gutenberg');
    assert.equal(book.external_id, '84');
    assert.equal(book.source_url, 'https://www.gutenberg.org/ebooks/84');
    assert.equal(book.cover_url, 'https://example.com/cover.jpg');
    assert.match(book.license, /Public domain/);
    assert.ok(book.genres.length >= 1);
    assert.match(book.description, /Frankenstein/);
  });

  it('falls back to a derived cover URL and flags copyrighted texts', () => {
    const book = normalizeGutendexBook({
      id: 9,
      title: 'Untitled-ish',
      authors: [],
      languages: ['fr'],
      copyright: true,
      formats: {},
    });
    assert.equal(book.author, 'Unknown');
    assert.equal(book.language, 'French');
    assert.equal(book.cover_url, 'https://www.gutenberg.org/cache/epub/9/pg9.cover.medium.jpg');
    assert.match(book.license, /Copyrighted/);
  });
});
