import path from 'node:path';
import dotenv from 'dotenv';

// Neon-managed vars (DATABASE_URL, DATABASE_URL_UNPOOLED) live in the repo root's
// .env.local, written by `neon env pull`; app settings (JWT_SECRET, ...) live in backend/.env.
// dotenv never overrides, so variables already set in the real environment always win
// (the test setup relies on this to point the app at the test database).
const backendDir = path.resolve(import.meta.dirname, '..', '..');

dotenv.config({
  path: [path.join(backendDir, '..', '.env.local'), path.join(backendDir, '.env')],
  quiet: true,
});
