import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit compiles this file to CommonJS (no import.meta), so paths are relative
// to the backend folder, where the npm db:* scripts run. Mirrors src/config/loadEnv.ts.
dotenv.config({ path: ['../.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Migrations need a direct connection; the pooled one (PgBouncer) breaks session-level DDL
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '' },
});
