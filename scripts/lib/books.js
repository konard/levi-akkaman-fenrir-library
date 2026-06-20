'use strict';

// Shared book-import helpers used by the scraper and the test suite.
// Nothing here touches the network — `scrape.js` does the fetching and hands
// already-normalised book objects to `importBooks`.

const { pool } = require('../../src/db');

// Turn a human genre label into a URL/identifier-friendly slug.
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Ordered keyword → canonical genre rules. A book may match several.
const GENRE_RULES = [
  [/science[ -]?fiction/, 'Science Fiction'],
  [/fantasy|fairy/, 'Fantasy'],
  [/adventure/, 'Adventure'],
  [/detective|mystery|crime/, 'Mystery & Detective'],
  [/love stories|romance/, 'Romance'],
  [/horror|ghost|vampire/, 'Horror'],
  [/gothic/, 'Gothic'],
  [/historical fiction/, 'Historical'],
  [/poetry|poems/, 'Poetry'],
  [/drama|plays/, 'Drama'],
  [/philosophy/, 'Philosophy'],
  [/biography|autobiography/, 'Biography'],
  [/humor|humour|satire|comic/, 'Humor'],
  [/short stories/, 'Short Stories'],
  [/juvenile|children/, 'Children'],
  [/history/, 'History'],
  [/science/, 'Science'],
  [/fiction/, 'Fiction'],
];

// Derive a list of {name, slug} genres from Gutendex subjects/bookshelves.
function deriveGenres(subjects = [], bookshelves = [], title = '') {
  const haystack = [...subjects, ...bookshelves, title].join(' | ').toLowerCase();
  const names = [];
  for (const [re, name] of GENRE_RULES) {
    if (re.test(haystack) && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) names.push('General');
  // Keep it focused — at most four genres per book.
  return names.slice(0, 4).map((name) => ({ name, slug: slugify(name) }));
}

const LANGUAGE_NAMES = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
  pt: 'Portuguese', ru: 'Russian', nl: 'Dutch', la: 'Latin', el: 'Greek',
  zh: 'Chinese', ja: 'Japanese', fi: 'Finnish', sv: 'Swedish', hu: 'Hungarian',
};

// "Carroll, Lewis" → "Lewis Carroll"; joins up to two authors with " & ".
function formatAuthors(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return 'Unknown';
  const names = authors.slice(0, 2).map((a) => {
    const raw = (a && a.name) || '';
    if (raw.includes(',')) {
      const [last, first] = raw.split(',').map((s) => s.trim());
      return first ? `${first} ${last}` : last;
    }
    return raw;
  });
  return names.filter(Boolean).join(' & ') || 'Unknown';
}

// Compose a readable description from the metadata Gutendex provides.
function buildDescription(raw, author, languageName) {
  const parts = [`${raw.title} by ${author}.`];
  if (Array.isArray(raw.bookshelves) && raw.bookshelves.length) {
    const shelves = raw.bookshelves
      .map((s) => s.replace(/^Browsing: /, ''))
      .slice(0, 3)
      .join(', ');
    parts.push(`Featured in ${shelves}.`);
  }
  if (Array.isArray(raw.subjects) && raw.subjects.length) {
    const themes = raw.subjects
      .map((s) => s.split(' -- ').join(' — '))
      .slice(0, 3)
      .join('; ');
    parts.push(`Themes: ${themes}.`);
  }
  const downloads = raw.download_count
    ? `, downloaded ${Number(raw.download_count).toLocaleString('en-US')} times`
    : '';
  parts.push(`A public-domain ${languageName} text from Project Gutenberg${downloads}.`);
  return parts.join(' ');
}

// Convert one raw Gutendex result into our normalised book shape.
function normalizeGutendexBook(raw) {
  const author = formatAuthors(raw.authors);
  const langCode = (raw.languages && raw.languages[0]) || 'en';
  const languageName = LANGUAGE_NAMES[langCode] || langCode;
  const cover =
    (raw.formats && raw.formats['image/jpeg']) ||
    `https://www.gutenberg.org/cache/epub/${raw.id}/pg${raw.id}.cover.medium.jpg`;

  return {
    title: raw.title || 'Untitled',
    author,
    description: buildDescription(raw, author, languageName),
    cover_url: cover,
    license: raw.copyright === true ? 'Copyrighted — see source' : 'Public domain (Project Gutenberg)',
    language: languageName,
    year: null, // Gutendex does not expose an original publication year.
    source: 'gutenberg',
    source_url: `https://www.gutenberg.org/ebooks/${raw.id}`,
    external_id: String(raw.id),
    genres: deriveGenres(raw.subjects, raw.bookshelves, raw.title),
  };
}

// Insert (or refresh) a single normalised book and link its genres.
async function upsertBook(client, book) {
  const { rows } = await client.query(
    `INSERT INTO books (title, author, description, cover_url, license, language, year, source, source_url, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (source, external_id) DO UPDATE SET
       title       = EXCLUDED.title,
       author      = EXCLUDED.author,
       description = EXCLUDED.description,
       cover_url   = EXCLUDED.cover_url,
       license     = EXCLUDED.license,
       language    = EXCLUDED.language,
       year        = EXCLUDED.year,
       source_url  = EXCLUDED.source_url
     RETURNING id, (xmax = 0) AS inserted`,
    [
      book.title, book.author, book.description, book.cover_url, book.license,
      book.language, book.year, book.source || 'manual', book.source_url, book.external_id,
    ]
  );
  const bookId = rows[0].id;
  const wasInserted = rows[0].inserted;

  for (const g of book.genres || []) {
    const name = g.name;
    const slug = g.slug || slugify(name);
    const genreRes = await client.query(
      `INSERT INTO genres (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name, slug]
    );
    await client.query(
      'INSERT INTO book_genres (book_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [bookId, genreRes.rows[0].id]
    );
  }
  return { bookId, wasInserted };
}

// Import an array of normalised books. Resilient: a single bad row is logged
// and skipped rather than aborting the whole batch.
async function importBooks(books) {
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  try {
    for (const book of books) {
      try {
        const { wasInserted } = await upsertBook(client, book);
        if (wasInserted) inserted += 1;
        else updated += 1;
      } catch (err) {
        failed += 1;
        console.warn(`  ! Skipped "${book.title}": ${err.message}`);
      }
    }
  } finally {
    client.release();
  }
  return { processed: books.length, inserted, updated, failed };
}

module.exports = {
  slugify,
  deriveGenres,
  formatAuthors,
  normalizeGutendexBook,
  upsertBook,
  importBooks,
};
