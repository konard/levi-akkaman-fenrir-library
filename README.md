# 📚 Fenrir Library

A full-stack **online library** for public-domain books. Browse a catalogue of
classics, **search by title, author or genre**, open a dedicated page for every
book, **log in with your email**, customise your **profile** (display name and
avatar), and join the conversation with **comments and reactions**.

Built with the requested stack — **HTML, CSS, JavaScript, Node.js/Express and
PostgreSQL** — and a built-in scraper that pulls real books from
[Project Gutenberg](https://www.gutenberg.org/) (via the
[Gutendex](https://gutendex.com/) API).

| Home (search & browse) | Book page (reactions & comments) | Profile |
| --- | --- | --- |
| ![Home page](docs/screenshots/home.png) | ![Book page](docs/screenshots/book.png) | ![Profile page](docs/screenshots/profile.png) |

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start (Docker, one command)](#quick-start-docker-one-command)
- [Manual setup tutorial](#manual-setup-tutorial)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Get the code & install dependencies](#2-get-the-code--install-dependencies)
  - [3. Raise the database](#3-raise-the-database)
  - [4. Configure the environment](#4-configure-the-environment)
  - [5. Create the tables](#5-create-the-tables)
  - [6. Import some books](#6-import-some-books)
  - [7. Start the website](#7-start-the-website)
- [Configuration reference](#configuration-reference)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Running the tests](#running-the-tests)
- [Deployment & embedding](#deployment--embedding)
- [License & credits](#license--credits)

---

## Features

- 🔎 **Search & browse** — full-text-ish search by title/author, filter by genre
  chips, sort by newest / title / author / most-loved, with pagination.
- 📖 **A page per book** — cover, title, author, description, license, language,
  year and a link to read or download the original on Project Gutenberg.
- 👤 **Email accounts** — register and log in with an email + password (hashed
  with bcrypt, sessions via JSON Web Tokens).
- 🪪 **Profiles** — change your display name and set an avatar, either by
  uploading an image or pasting an image URL.
- 💬 **Comments** — leave comments on any book and delete your own.
- ❤️ **Reactions** — toggle 👍 / ❤️ / 😄 / 😮 / 😢 reactions on each book.
- 🤖 **Book scraper** — import real public-domain books from Project Gutenberg,
  with an **offline seed** so the site works with zero network access.
- 🎨 **Beautiful, responsive design** — a warm "reading room" theme in plain
  HTML/CSS/JS, no front-end framework required.

## Tech stack

| Layer | Technology |
| --- | --- |
| Front-end | Hand-written **HTML, CSS, JavaScript** (no framework) |
| Back-end | **Node.js** + **Express** (REST API) |
| Database | **PostgreSQL** (via the `pg` driver) |
| Auth | **JWT** (`jsonwebtoken`) + **bcrypt** (`bcryptjs`) |
| Uploads | **multer** (avatar images) |
| Tests | **node:test** + **supertest** |
| Tooling | Docker / Docker Compose, GitHub Actions CI |

---

## Quick start (Docker, one command)

If you have Docker installed, this builds the app, starts PostgreSQL, applies
the schema, imports the bundled books and serves the site:

```bash
docker compose up --build
```

Then open **<http://localhost:3000>**. That's it. 🎉

To stop and remove everything (including the database volume):

```bash
docker compose down -v
```

---

## Manual setup tutorial

Prefer to run things yourself? Follow these steps.

### 1. Prerequisites

- **Node.js 18+** and npm — <https://nodejs.org/>
- **PostgreSQL 13+** — either installed natively, or run via Docker (below).

### 2. Get the code & install dependencies

```bash
git clone https://github.com/levi-akkaman/fenrir-library.git
cd fenrir-library
npm install
```

### 3. Raise the database

You need a running PostgreSQL server and an empty database for the app.

**Option A — Docker (recommended, no local install):**

```bash
# Starts PostgreSQL 16 on localhost:5432 with user/password/db all "fenrir".
npm run db:up
```

This uses the `db` service from `docker-compose.yml`. Stop it later with
`npm run db:down`.

**Option B — an existing PostgreSQL install:**

```bash
# Create a user and a database (adjust names to taste).
createuser fenrir --pwprompt          # set a password when asked
createdb fenrir_library --owner fenrir
```

### 4. Configure the environment

Copy the example file and edit it to match your database:

```bash
cp .env.example .env
```

The defaults already match the Docker database from step 3. The most important
settings are `DATABASE_URL` (or the discrete `PG*` variables) and `JWT_SECRET`.
See the [configuration reference](#configuration-reference) for everything.

> 🔐 **In production, set `JWT_SECRET` to a long random string.** You can
> generate one with:
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 5. Create the tables

```bash
npm run migrate
```

This applies `db/schema.sql` (users, genres, books, comments, reactions …).
It is idempotent — safe to run more than once.

### 6. Import some books

```bash
# Fetch popular public-domain books from Project Gutenberg:
npm run scrape

# …or import the bundled offline dataset (no network needed):
npm run scrape -- --offline
```

`npm run scrape` automatically falls back to the bundled dataset
(`db/seed-books.json`) if the catalogue API can't be reached, so you always end
up with a populated library. Control how many books are fetched with
`SCRAPE_LIMIT`.

### 7. Start the website

```bash
npm start          # production-style start
# or
npm run dev        # auto-restart on file changes (node --watch)
```

Open **<http://localhost:3000>** and enjoy your library.

---

## Configuration reference

All configuration is read from environment variables (loaded from `.env` in
development). See [`.env.example`](.env.example).

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port the server listens on. |
| `DATABASE_URL` | — | Full PostgreSQL connection string. Takes precedence over the `PG*` variables. |
| `PGHOST` | `localhost` | Database host (used when `DATABASE_URL` is unset). |
| `PGPORT` | `5432` | Database port. |
| `PGUSER` | `fenrir` | Database user. |
| `PGPASSWORD` | `fenrir` | Database password. |
| `PGDATABASE` | `fenrir_library` | Database name. |
| `PGSSL` | `false` | Set to `true` for managed databases that require SSL. |
| `JWT_SECRET` | `change-me-…` | **Change in production.** Secret used to sign session tokens. |
| `JWT_EXPIRES_IN` | `7d` | How long a login session stays valid. |
| `SCRAPE_LIMIT` | `48` | How many books `npm run scrape` imports per run. |
| `GUTENDEX_URL` | `https://gutendex.com/books` | Catalogue API used by the scraper. |

---

## API reference

All endpoints are prefixed with `/api`. Authenticated routes expect an
`Authorization: Bearer <token>` header (the token is returned by register/login).

| Method | Endpoint | Auth | Description |
| --- | --- | :---: | --- |
| `GET` | `/api/health` | — | Liveness probe (`{ status: "ok" }`). |
| `POST` | `/api/auth/register` | — | Create an account; returns `{ token, user }`. |
| `POST` | `/api/auth/login` | — | Log in; returns `{ token, user }`. |
| `GET` | `/api/auth/me` | ✅ | The current user. |
| `PUT` | `/api/users/me` | ✅ | Update `name` and/or `avatar_url`. |
| `POST` | `/api/users/me/avatar` | ✅ | Upload an avatar image (multipart field `avatar`). |
| `GET` | `/api/books` | — | List books. Query: `search`, `genre`, `sort` (`newest`\|`title`\|`author`\|`popular`), `page`, `limit`. |
| `GET` | `/api/books/:id` | optional | A single book + reaction summary. |
| `GET` | `/api/books/:id/comments` | — | Comments for a book (newest first). |
| `POST` | `/api/books/:id/comments` | ✅ | Add a comment (`{ body }`). |
| `DELETE` | `/api/books/:id/comments/:commentId` | ✅ | Delete your own comment. |
| `GET` | `/api/books/:id/reactions` | optional | Reaction counts (+ your own). |
| `POST` | `/api/books/:id/reactions` | ✅ | Toggle a reaction (`{ type }`: `like`\|`love`\|`funny`\|`wow`\|`sad`). |
| `GET` | `/api/genres` | — | Genres with book counts. |

**Example — search for "alice" and react to a book:**

```bash
# Search
curl "http://localhost:3000/api/books?search=alice"

# Register and capture the token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","name":"Me","password":"secret123"}' | \
  node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# Love book #1
curl -X POST http://localhost:3000/api/books/1/reactions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"love"}'
```

---

## Project structure

```
fenrir-library/
├── db/
│   ├── schema.sql          # PostgreSQL schema (tables + indexes)
│   └── seed-books.json     # Offline dataset (16 real public-domain books)
├── public/                 # Static front-end (served by Express)
│   ├── index.html          # Home: search, genre chips, book grid
│   ├── book.html           # A single book page
│   ├── login/register/profile.html
│   ├── css/styles.css      # The "reading room" design system
│   └── js/                 # api.js, ui.js + one script per page
├── scripts/
│   ├── migrate.js          # Applies db/schema.sql
│   ├── scrape.js           # Imports books (Gutendex, with offline fallback)
│   └── lib/books.js        # Normalisation + idempotent upsert helpers
├── src/
│   ├── server.js           # HTTP entrypoint (graceful shutdown)
│   ├── app.js              # Express app wiring
│   ├── config.js           # Environment-driven config
│   ├── db.js               # Shared pg connection pool
│   ├── middleware/auth.js  # JWT auth (require/optional) + token signing
│   └── routes/             # auth, users, books, genres
├── test/                   # node:test + supertest
├── docker-compose.yml      # db + app services
├── Dockerfile
└── .env.example
```

---

## Running the tests

The test suite runs against a **real PostgreSQL database** that it resets to a
known state before each test. As a safeguard, it refuses to run unless the
target database name contains `test` (override with `ALLOW_DB_RESET=1`).

```bash
# Create a dedicated test database once (using the Docker db from `npm run db:up`):
docker exec -i $(docker compose ps -q db) createdb -U fenrir fenrir_library_test

# Run the tests against it:
DATABASE_URL=postgres://fenrir:fenrir@localhost:5432/fenrir_library_test npm test
```

Continuous integration runs the same suite on Node 18 and 20 against a
throwaway PostgreSQL service — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Deployment & embedding

The app is a single Node process that serves both the JSON API and the static
front-end, so deploying it is straightforward.

**Build & run the Docker image:**

```bash
docker build -t fenrir-library .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://USER:PASS@HOST:5432/DBNAME \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") \
  -e PGSSL=true \
  fenrir-library
```

On first boot against a fresh database, run the migration and an import once
(the Compose file does this automatically):

```bash
docker run --rm -e DATABASE_URL=… fenrir-library npm run migrate
docker run --rm -e DATABASE_URL=… fenrir-library npm run scrape -- --offline
```

**Production checklist**

- Set a strong, unique **`JWT_SECRET`**.
- Point **`DATABASE_URL`** at your managed PostgreSQL and set **`PGSSL=true`** if
  it requires TLS.
- Put the app behind a reverse proxy (nginx/Caddy) for TLS termination and to
  serve `/uploads` and static assets efficiently.
- Persist the `public/uploads` directory (uploaded avatars) with a volume.

**Embedding the catalogue elsewhere**

Because the front-end talks to the API over plain `fetch`, you can embed the
library in another site two ways:

- **iframe** the running site:
  `<iframe src="https://your-library.example.com" style="width:100%;height:80vh;border:0"></iframe>`
- **Reuse the API** directly from your own pages — the endpoints in the
  [API reference](#api-reference) are CORS-enabled, so a script on another
  origin can call e.g. `GET /api/books?genre=fantasy` and render the results
  however you like.

---

## License & credits

Released into the public domain under the [Unlicense](LICENSE).

Book metadata and covers are courtesy of
[Project Gutenberg](https://www.gutenberg.org/) via the
[Gutendex](https://gutendex.com/) API. All bundled books are in the public
domain.
