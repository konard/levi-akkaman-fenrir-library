'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { publicUser } = require('./auth');

const router = express.Router();

// --- Avatar uploads --------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || '.img';
    // Deterministic-ish unique name: user id + high-res timestamp.
    const unique = `${req.user.id}-${process.hrtime.bigint()}`;
    cb(null, `avatar-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Only PNG, JPEG, GIF or WEBP images are allowed.'));
  },
});

// PUT /api/users/me — update display name and/or avatar URL.
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const updates = [];
    const values = [];
    let i = 1;

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 1) {
        return res.status(400).json({ error: 'Display name cannot be empty.' });
      }
      updates.push(`name = $${i++}`);
      values.push(name);
    }

    if (req.body.avatar_url !== undefined) {
      const avatar = req.body.avatar_url === null ? null : String(req.body.avatar_url).trim();
      updates.push(`avatar_url = $${i++}`);
      values.push(avatar || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update. Provide a name or avatar_url.' });
    }

    values.push(req.user.id);
    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}
       RETURNING id, email, name, avatar_url, created_at`,
      values
    );
    return res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/users/me/avatar — upload an image file as the new avatar.
router.post('/me/avatar', requireAuth, (req, res, next) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file was uploaded (field name: "avatar").' });
    }
    try {
      const avatarUrl = `/uploads/${req.file.filename}`;
      const { rows } = await query(
        `UPDATE users SET avatar_url = $1 WHERE id = $2
         RETURNING id, email, name, avatar_url, created_at`,
        [avatarUrl, req.user.id]
      );
      return res.json({ user: publicUser(rows[0]) });
    } catch (e) {
      return next(e);
    }
  });
});

module.exports = router;
