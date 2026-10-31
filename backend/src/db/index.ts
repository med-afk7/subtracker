import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

// Express is a long-running server, so one node-postgres pool is reused across requests.
// DATABASE_URL is Neon's pooled (-pooler) connection string.
export const pool = new pg.Pool({ connectionString: env.databaseUrl });

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
