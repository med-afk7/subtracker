import type { RequestHandler } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';

// Used by the hosting platform's health checks: healthy only if the database answers
export const getHealth: RequestHandler = async (req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.status(200).json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
  } catch (err) {
    req.log.error({ err }, 'Health check: database unreachable');
    res.status(503).json({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unreachable' },
    });
  }
};
