'use strict';

const express = require('express');
const { query } = require('../db');

const router = express.Router();

// GET /api/genres — every genre plus how many books carry it.
// Only genres that actually have books are returned, sorted by popularity.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT g.id, g.name, g.slug, count(bg.book_id)::int AS book_count
         FROM genres g
         JOIN book_genres bg ON bg.genre_id = g.id
        GROUP BY g.id
       HAVING count(bg.book_id) > 0
        ORDER BY book_count DESC, g.name ASC`
    );
    return res.json({ genres: rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
