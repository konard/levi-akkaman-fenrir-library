'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

// Extract a bearer token from the Authorization header, if present.
function getToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) return token;
  return null;
}

// Hard requirement: rejects the request with 401 when no valid token.
function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { id: payload.sub, email: payload.email, name: payload.name };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

// Soft variant: attaches req.user when a valid token is present, but never
// blocks the request. Used by public endpoints that show extra data to
// logged-in users (e.g. which reactions are "mine").
function optionalAuth(req, _res, next) {
  const token = getToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      req.user = { id: payload.sub, email: payload.email, name: payload.name };
    } catch (err) {
      /* ignore — treat as anonymous */
    }
  }
  next();
}

// Sign a session token for a user row.
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = { requireAuth, optionalAuth, signToken };
