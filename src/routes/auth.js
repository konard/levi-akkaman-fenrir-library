'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireAuth, signToken } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shape a user row for the client (never expose the password hash).
function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url || null,
    created_at: row.created_at,
  };
}

// POST /api/auth/register — create an account and return a session token.
router.post('/register', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (name.length < 1) {
      return res.status(400).json({ error: 'A display name is required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, avatar_url, created_at`,
      [email, passwordHash, name]
    );

    const user = rows[0];
    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    return next(err);
  }
});

// POST /api/auth/login — verify credentials and return a session token.
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    // Compare even when the user is missing to reduce timing differences.
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me — return the currently authenticated user.
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.publicUser = publicUser;
