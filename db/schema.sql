-- Fenrir Library — PostgreSQL schema
-- Safe to run repeatedly: every statement uses IF NOT EXISTS / idempotent guards.

-- ---------------------------------------------------------------------------
-- Users: people who log in by email, with a display name and avatar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Genres: a small controlled vocabulary used for filtering.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genres (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------------
-- Books: the catalogue. `external_id`/`source` let the scraper avoid
-- inserting the same book twice across runs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    author      TEXT NOT NULL DEFAULT 'Unknown',
    description TEXT,
    cover_url   TEXT,
    license     TEXT,
    language    TEXT,
    year        INTEGER,
    source      TEXT,
    source_url  TEXT,
    external_id TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, external_id)
);

-- Many-to-many between books and genres.
CREATE TABLE IF NOT EXISTS book_genres (
    book_id  INTEGER NOT NULL REFERENCES books(id)  ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, genre_id)
);

-- ---------------------------------------------------------------------------
-- Comments: free-text notes left by logged-in users on a book.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id         SERIAL PRIMARY KEY,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Reactions: one row per (book, user, emoji type). A user may pick several
-- different reactions for the same book, but only one of each type.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reactions (
    id         SERIAL PRIMARY KEY,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (book_id, user_id, type)
);

-- ---------------------------------------------------------------------------
-- Indexes that support the common access patterns.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_books_title_lower  ON books (lower(title));
CREATE INDEX IF NOT EXISTS idx_books_author_lower ON books (lower(author));
CREATE INDEX IF NOT EXISTS idx_comments_book      ON comments (book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_book     ON reactions (book_id);
CREATE INDEX IF NOT EXISTS idx_book_genres_genre  ON book_genres (genre_id);
