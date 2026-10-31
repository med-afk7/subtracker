// Production migrations: `node dist/db/migrate.js` (npm run migrate:prod). Uses drizzle-orm's
// runtime migrator, so the server doesn't need dev tools like drizzle-kit installed. Applies
// only migrations that haven't run yet, inside a transaction; safe to run on every deploy.
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import '../config/loadEnv.js';

// DDL needs a direct connection; the pooled one (PgBouncer, transaction mode) can break it
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  // src/db -> backend/drizzle, and the same from dist/db once compiled
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: path.resolve(import.meta.dirname, '..', '..', 'drizzle'),
  });
  console.log('Migrations are up to date.');
} finally {
  await pool.end();
}
