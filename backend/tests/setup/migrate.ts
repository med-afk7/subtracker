import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { loadTestEnv } from './testEnv.js';

// Vitest global setup: rebuild the test database from an empty schema on every run,
// which also proves the migrations work from scratch
export default async function setup() {
  const pool = new pg.Pool({ connectionString: loadTestEnv() });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await pool.query('CREATE SCHEMA public');
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: path.resolve(import.meta.dirname, '..', '..', 'drizzle'),
    });
  } finally {
    await pool.end();
  }
}
