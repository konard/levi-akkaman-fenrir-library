'use strict';

const express = require('express');
const { query } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// The fixed set of reactions the UI offers. Keep in sync with public/js.
const REACTION_TYPES = ['like', 'love', 'funny', 'wow', 'sad'];

const SORTS = {
  newest: 'b.created_at DESC, b.id DESC',
  title: 'lower(b.title) ASC',
  author: 'lower(b.author) ASC',
  popular: 'reaction_count DESC, b.created_at DESC',
};

// Parse a positive integer route/query value, returning null when invalid.
function toId(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Build the shared WHERE clause (and its parameters) for list + count queries.
function buildFilters({ search, genre }) {
  const clauses = [];
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    clauses.push(`(b.title ILIKE $${params.length} OR b.author ILIKE $${params.length})`);
  }
  if (genre && genre.trim()) {
    params.push(genre.trim());
    clauses.push(
      `EXISTS (SELECT 1 FROM book_genres bg JOIN genres g ON g.id = bg.genre_id
                WHERE bg.book_id = b.id AND (g.slug = $${params.length} OR g.name ILIKE $${params.length}))`
    );
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

// Aggregate reaction counts for a book, plus the caller's own reactions.
async function reactionSummary(bookId, userId) {
  const { rows } = await query(
    'SELECT type, count(*)::int AS count FROM reactions WHERE book_id = $1 GROUP BY type',
    [bookId]
  );
  const counts = {};
  for (const type of REACTION_TYPES) counts[type] = 0;
  let total = 0;
  for (const r of rows) {
    if (counts[r.type] !== undefined) counts[r.type] = r.count;
    total += r.count;
  }

  let mine = [];
  if (userId) {
    const res = await query(
      'SELECT type FROM reactions WHERE book_id = $1 AND user_id = $2',
      [bookId, userId]
    );
    mine = res.rows.map((r) => r.type);
  }
  return { counts, total, mine };
}

// GET /api/books — search, filter by genre, sort and paginate.
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, toId(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, toId(req.query.limit) || 24));
    const offset = (page - 1) * limit;
    const orderBy = SORTS[req.query.sort] || SORTS.newest;

    const { where, params } = buildFilters(req.query);

    const countResult = await query(
      `SELECT count(*)::int AS total FROM books b ${where}`,
      params
    );
    const total = countResult.rows[0].total;

    const listParams = params.slice();
    listParams.push(limit, offset);
    const { rows } = await query(
      `SELECT b.id, b.title, b.author, b.description, b.cover_url, b.license,
              b.language, b.year, b.source, b.source_url,
              COALESCE((SELECT array_agg(g.name ORDER BY g.name)
                          FROM book_genres bg JOIN genres g ON g.id = bg.genre_id
                         WHERE bg.book_id = b.id), '{}') AS genres,
              (SELECT count(*)::int FROM comments c  WHERE c.book_id = b.id) AS comment_count,
              (SELECT count(*)::int FROM reactions r WHERE r.book_id = b.id) AS reaction_count
         FROM books b
         ${where}
        ORDER BY ${orderBy}
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    return res.json({
      books: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/books/:id — full details for a single book.
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid book id.' });

    const { rows } = await query(
      `SELECT b.*,
              COALESCE((SELECT array_agg(g.name ORDER BY g.name)
                          FROM book_genres bg JOIN genres g ON g.id = bg.genre_id
                         WHERE bg.book_id = b.id), '{}') AS genres,
              (SELECT count(*)::int FROM comments c WHERE c.book_id = b.id) AS comment_count
         FROM books b WHERE b.id = $1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Book not found.' });

    const reactions = await reactionSummary(id, req.user && req.user.id);
    return res.json({ book: rows[0], reactions });
  } catch (err) {
    return next(err);
  }
});

// GET /api/books/:id/comments — newest first.
router.get('/:id/comments', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid book id.' });

    const { rows } = await query(
      `SELECT c.id, c.body, c.created_at,
              u.id AS user_id, u.name AS user_name, u.avatar_url AS user_avatar
         FROM comments c
         JOIN users u ON u.id = c.user_id
        WHERE c.book_id = $1
        ORDER BY c.created_at DESC`,
      [id]
    );
    return res.json({ comments: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /api/books/:id/comments — add a comment (auth required).
router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid book id.' });

    const body = String(req.body.body || '').trim();
    if (body.length < 1) return res.status(400).json({ error: 'Comment cannot be empty.' });
    if (body.length > 2000) return res.status(400).json({ error: 'Comment is too long (max 2000 characters).' });

    const exists = await query('SELECT 1 FROM books WHERE id = $1', [id]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Book not found.' });

    const { rows } = await query(
      `INSERT INTO comments (book_id, user_id, body) VALUES ($1, $2, $3)
       RETURNING id, body, created_at, user_id`,
      [id, req.user.id, body]
    );
    const comment = {
      ...rows[0],
      user_name: req.user.name,
      user_avatar: null,
    };
    // Fetch the avatar so the freshly added comment renders consistently.
    const u = await query('SELECT name, avatar_url FROM users WHERE id = $1', [req.user.id]);
    if (u.rows[0]) {
      comment.user_name = u.rows[0].name;
      comment.user_avatar = u.rows[0].avatar_url;
    }
    return res.status(201).json({ comment });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/books/:id/comments/:commentId — remove your own comment.
router.delete('/:id/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const commentId = toId(req.params.commentId);
    if (!commentId) return res.status(400).json({ error: 'Invalid comment id.' });

    const { rowCount } = await query(
      'DELETE FROM comments WHERE id = $1 AND user_id = $2',
      [commentId, req.user.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Comment not found or not yours to delete.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// GET /api/books/:id/reactions — counts + the caller's own reactions.
router.get('/:id/reactions', optionalAuth, async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid book id.' });
    const reactions = await reactionSummary(id, req.user && req.user.id);
    return res.json({ reactions });
  } catch (err) {
    return next(err);
  }
});

// POST /api/books/:id/reactions — toggle a reaction (auth required).
router.post('/:id/reactions', requireAuth, async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid book id.' });

    const type = String(req.body.type || '').trim().toLowerCase();
    if (!REACTION_TYPES.includes(type)) {
      return res.status(400).json({ error: `Reaction must be one of: ${REACTION_TYPES.join(', ')}.` });
    }

    const exists = await query('SELECT 1 FROM books WHERE id = $1', [id]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Book not found.' });

    // Toggle: delete if present, otherwise insert.
    const del = await query(
      'DELETE FROM reactions WHERE book_id = $1 AND user_id = $2 AND type = $3',
      [id, req.user.id, type]
    );
    let active;
    if (del.rowCount > 0) {
      active = false;
    } else {
      await query(
        'INSERT INTO reactions (book_id, user_id, type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [id, req.user.id, type]
      );
      active = true;
    }

    const reactions = await reactionSummary(id, req.user.id);
    return res.json({ active, reactions });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.REACTION_TYPES = REACTION_TYPES;
