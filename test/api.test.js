'use strict';

// End-to-end API tests. They run against a real PostgreSQL database (reset to
// the bundled seed before every test) using supertest to drive the Express app.

const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, resetDatabase, closePool, uniqueEmail } = require('./helpers');

// Register a fresh user and return { token, user, password }.
async function register(overrides = {}) {
  const payload = {
    email: overrides.email || uniqueEmail(),
    name: overrides.name || 'Test Reader',
    password: overrides.password || 'secret123',
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, password: payload.password };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

// Grab the id of the first seeded book (handy for generic tests).
async function firstBookId() {
  const res = await request(app).get('/api/books');
  return res.body.books[0].id;
}

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await closePool();
});

describe('health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });
});

describe('auth', () => {
  it('registers a user and returns a token without leaking the password hash', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, name: 'Ada Lovelace', password: 'secret123' });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.token, 'string');
    assert.equal(res.body.user.email, email.toLowerCase());
    assert.equal(res.body.user.name, 'Ada Lovelace');
    assert.equal(res.body.user.avatar_url, null);
    assert.ok(!('password_hash' in res.body.user));
  });

  it('lowercases the email and rejects a duplicate', async () => {
    const email = uniqueEmail();
    const first = await request(app)
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), name: 'A', password: 'secret123' });
    assert.equal(first.status, 201);
    assert.equal(first.body.user.email, email.toLowerCase());

    const dup = await request(app)
      .post('/api/auth/register')
      .send({ email, name: 'B', password: 'secret123' });
    assert.equal(dup.status, 409);
  });

  it('validates email, name and password', async () => {
    const bad = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', name: 'X', password: 'secret123' });
    assert.equal(bad.status, 400);

    const shortPw = await request(app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), name: 'X', password: '123' });
    assert.equal(shortPw.status, 400);

    const noName = await request(app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), name: '   ', password: 'secret123' });
    assert.equal(noName.status, 400);
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    const { user, password } = await register();

    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password });
    assert.equal(ok.status, 200);
    assert.equal(typeof ok.body.token, 'string');
    assert.equal(ok.body.user.email, user.email);

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'nope-nope' });
    assert.equal(wrong.status, 401);

    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: 'whatever' });
    assert.equal(unknown.status, 401);
  });

  it('returns the current user from /me and guards it', async () => {
    const { token, user } = await register();

    const me = await request(app).get('/api/auth/me').set(auth(token));
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, user.id);

    const anon = await request(app).get('/api/auth/me');
    assert.equal(anon.status, 401);

    const bad = await request(app).get('/api/auth/me').set(auth('garbage.token.here'));
    assert.equal(bad.status, 401);
  });
});

describe('books', () => {
  it('lists books with pagination metadata', async () => {
    const res = await request(app).get('/api/books');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.books));
    assert.ok(res.body.books.length > 0);
    assert.equal(res.body.pagination.page, 1);
    assert.equal(res.body.pagination.limit, 24);
    assert.ok(res.body.pagination.total >= res.body.books.length);
    // Each book carries its genres and aggregate counts.
    const book = res.body.books[0];
    assert.ok(Array.isArray(book.genres));
    assert.equal(typeof book.comment_count, 'number');
    assert.equal(typeof book.reaction_count, 'number');
  });

  it('paginates with page and limit', async () => {
    const res = await request(app).get('/api/books').query({ limit: 5, page: 2 });
    assert.equal(res.status, 200);
    assert.ok(res.body.books.length <= 5);
    assert.equal(res.body.pagination.page, 2);
    assert.equal(res.body.pagination.limit, 5);
  });

  it('searches by title', async () => {
    const res = await request(app).get('/api/books').query({ search: 'alice' });
    assert.equal(res.status, 200);
    assert.ok(res.body.books.length >= 1);
    assert.ok(res.body.books.every((b) => /alice/i.test(`${b.title} ${b.author}`)));
  });

  it('searches by author', async () => {
    const res = await request(app).get('/api/books').query({ search: 'shelley' });
    assert.equal(res.status, 200);
    assert.ok(res.body.books.length >= 1);
    assert.ok(res.body.books.every((b) => /shelley/i.test(`${b.title} ${b.author}`)));
  });

  it('filters by genre slug', async () => {
    const res = await request(app).get('/api/books').query({ genre: 'gothic' });
    assert.equal(res.status, 200);
    assert.ok(res.body.books.length >= 1);
    // Every returned book genuinely belongs to the requested genre.
    assert.ok(res.body.books.every((b) => b.genres.includes('Gothic')));
  });

  it('sorts by title A–Z', async () => {
    const res = await request(app).get('/api/books').query({ sort: 'title', limit: 60 });
    assert.equal(res.status, 200);
    const titles = res.body.books.map((b) => b.title.toLowerCase());
    const sorted = [...titles].sort();
    assert.deepEqual(titles, sorted);
  });

  it('returns a single book with genres and a reaction summary', async () => {
    const id = await firstBookId();
    const res = await request(app).get(`/api/books/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.book.id, id);
    assert.ok(Array.isArray(res.body.book.genres));
    assert.equal(typeof res.body.reactions.total, 'number');
    assert.ok(res.body.reactions.counts);
    assert.deepEqual(res.body.reactions.mine, []);
  });

  it('404s for a missing book and 400s for a bad id', async () => {
    const missing = await request(app).get('/api/books/99999999');
    assert.equal(missing.status, 404);

    const bad = await request(app).get('/api/books/not-a-number');
    assert.equal(bad.status, 400);
  });
});

describe('genres', () => {
  it('lists genres with positive book counts', async () => {
    const res = await request(app).get('/api/genres');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.genres));
    assert.ok(res.body.genres.length >= 1);
    for (const g of res.body.genres) {
      assert.equal(typeof g.name, 'string');
      assert.equal(typeof g.slug, 'string');
      assert.ok(g.book_count > 0);
    }
  });
});

describe('comments', () => {
  it('requires auth and a non-empty body', async () => {
    const id = await firstBookId();

    const anon = await request(app).post(`/api/books/${id}/comments`).send({ body: 'hi' });
    assert.equal(anon.status, 401);

    const { token } = await register();
    const empty = await request(app)
      .post(`/api/books/${id}/comments`)
      .set(auth(token))
      .send({ body: '   ' });
    assert.equal(empty.status, 400);
  });

  it('creates, lists and deletes a comment', async () => {
    const id = await firstBookId();
    const { token, user } = await register();

    const created = await request(app)
      .post(`/api/books/${id}/comments`)
      .set(auth(token))
      .send({ body: 'A timeless classic.' });
    assert.equal(created.status, 201);
    assert.equal(created.body.comment.body, 'A timeless classic.');
    assert.equal(created.body.comment.user_name, user.name);

    const listed = await request(app).get(`/api/books/${id}/comments`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.comments.length, 1);
    assert.equal(listed.body.comments[0].user_id, user.id);

    const commentId = created.body.comment.id;
    const removed = await request(app)
      .delete(`/api/books/${id}/comments/${commentId}`)
      .set(auth(token));
    assert.equal(removed.status, 200);

    const after = await request(app).get(`/api/books/${id}/comments`);
    assert.equal(after.body.comments.length, 0);
  });

  it("won't let a user delete someone else's comment", async () => {
    const id = await firstBookId();
    const alice = await register();
    const bob = await register();

    const created = await request(app)
      .post(`/api/books/${id}/comments`)
      .set(auth(alice.token))
      .send({ body: 'Mine, not yours.' });
    const commentId = created.body.comment.id;

    const attempt = await request(app)
      .delete(`/api/books/${id}/comments/${commentId}`)
      .set(auth(bob.token));
    assert.equal(attempt.status, 404);

    // Still there.
    const listed = await request(app).get(`/api/books/${id}/comments`);
    assert.equal(listed.body.comments.length, 1);
  });
});

describe('reactions', () => {
  it('requires auth and a valid type', async () => {
    const id = await firstBookId();

    const anon = await request(app).post(`/api/books/${id}/reactions`).send({ type: 'love' });
    assert.equal(anon.status, 401);

    const { token } = await register();
    const bad = await request(app)
      .post(`/api/books/${id}/reactions`)
      .set(auth(token))
      .send({ type: 'rage' });
    assert.equal(bad.status, 400);
  });

  it('toggles a reaction on and off', async () => {
    const id = await firstBookId();
    const { token } = await register();

    const on = await request(app)
      .post(`/api/books/${id}/reactions`)
      .set(auth(token))
      .send({ type: 'love' });
    assert.equal(on.status, 200);
    assert.equal(on.body.active, true);
    assert.equal(on.body.reactions.counts.love, 1);
    assert.equal(on.body.reactions.total, 1);
    assert.ok(on.body.reactions.mine.includes('love'));

    const off = await request(app)
      .post(`/api/books/${id}/reactions`)
      .set(auth(token))
      .send({ type: 'love' });
    assert.equal(off.status, 200);
    assert.equal(off.body.active, false);
    assert.equal(off.body.reactions.counts.love, 0);
    assert.equal(off.body.reactions.total, 0);
    assert.ok(!off.body.reactions.mine.includes('love'));
  });

  it('counts distinct reaction types independently', async () => {
    const id = await firstBookId();
    const { token } = await register();

    await request(app).post(`/api/books/${id}/reactions`).set(auth(token)).send({ type: 'like' });
    const res = await request(app)
      .post(`/api/books/${id}/reactions`)
      .set(auth(token))
      .send({ type: 'wow' });

    assert.equal(res.body.reactions.counts.like, 1);
    assert.equal(res.body.reactions.counts.wow, 1);
    assert.equal(res.body.reactions.total, 2);
  });
});

describe('profile', () => {
  it('guards profile updates', async () => {
    const res = await request(app).put('/api/users/me').send({ name: 'Nobody' });
    assert.equal(res.status, 401);
  });

  it('updates the display name', async () => {
    const { token } = await register();
    const res = await request(app)
      .put('/api/users/me')
      .set(auth(token))
      .send({ name: 'Grace Hopper' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'Grace Hopper');
  });

  it('sets and clears the avatar URL', async () => {
    const { token } = await register();

    const set = await request(app)
      .put('/api/users/me')
      .set(auth(token))
      .send({ avatar_url: 'https://example.com/me.png' });
    assert.equal(set.status, 200);
    assert.equal(set.body.user.avatar_url, 'https://example.com/me.png');

    const clear = await request(app)
      .put('/api/users/me')
      .set(auth(token))
      .send({ avatar_url: null });
    assert.equal(clear.status, 200);
    assert.equal(clear.body.user.avatar_url, null);
  });

  it('rejects an empty name and an empty update', async () => {
    const { token } = await register();

    const emptyName = await request(app)
      .put('/api/users/me')
      .set(auth(token))
      .send({ name: '   ' });
    assert.equal(emptyName.status, 400);

    const nothing = await request(app).put('/api/users/me').set(auth(token)).send({});
    assert.equal(nothing.status, 400);
  });
});
