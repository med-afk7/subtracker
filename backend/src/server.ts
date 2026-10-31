import app from './app.js';
import { env } from './config/env.js';
import { pool } from './db/index.js';
import { logger } from './lib/logger.js';

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, 'API server listening');
});

// Hosting platforms send SIGTERM before replacing an instance: stop accepting requests,
// let in-flight ones finish, then close the database pool
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
