'use strict';

const { createApp } = require('./app');
const config = require('./config');
const { pool } = require('./db');

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`📚 Fenrir Library running at http://localhost:${config.port}`);
});

// Graceful shutdown: stop accepting connections, then close the DB pool.
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
