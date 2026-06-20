'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const bookRoutes = require('./routes/books');
const genreRoutes = require('./routes/genres');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve the static front-end (and uploaded avatars) from /public.
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // Lightweight health check, handy for Docker / load balancers / tests.
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/books', bookRoutes);
  app.use('/api/genres', genreRoutes);

  // Unknown API routes return JSON 404 (never the HTML index).
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // Centralised error handler — keeps route code free of try/catch noise.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };
