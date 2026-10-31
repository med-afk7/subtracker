import { sql } from 'drizzle-orm';
import { db } from '../../src/db/index.js';

// Users cascade to sessions, email tokens and subscriptions
export async function resetDatabase() {
  await db.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`);
}
