// Drops every table in the development database and re-applies all migrations.
// Refuses to run unless the checked-out Neon branch (NEON_BRANCH in .env.local) is `dev`.
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import '../src/config/loadEnv.js';

const branch = process.env.NEON_BRANCH;
if (branch !== 'dev') {
  console.error(`Refusing to reset: NEON_BRANCH is "${branch ?? 'unset'}", expected "dev".`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
try {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('CREATE SCHEMA public');
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: path.resolve(import.meta.dirname, '..', 'drizzle'),
  });
  console.log('Development database reset and migrated.');
} finally {
  await pool.end();
}
